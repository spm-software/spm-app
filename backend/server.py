from fastapi import FastAPI, APIRouter, HTTPException, Query, BackgroundTasks
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import re
import json
import html
from difflib import SequenceMatcher
from bson import ObjectId
import asyncio

# YouTube API imports
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app
app = FastAPI(title="Gestor de Preguntas YouTube")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==================== YOUTUBE OAUTH CONFIG ====================
YOUTUBE_SCOPES = [
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/youtube.force-ssl'
]

# ==================== BACKGROUND TASK STORAGE ====================
# In-memory storage for background task status
# In production, consider using Redis or database storage
background_tasks_status: Dict[str, Dict[str, Any]] = {}

# ==================== MODELS ====================

class UserMapping(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    youtube_username: str  # @username
    real_name: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserMappingCreate(BaseModel):
    youtube_username: str
    real_name: str

class Question(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    youtube_username: str
    youtube_comment_id: Optional[str] = None  # Para deduplicar por ID del comentario de YouTube
    real_name: Optional[str] = None
    real_name_confirmed: bool = False  # True if the real_name was manually confirmed
    original_text: str
    corrected_text: Optional[str] = None
    is_corrected: bool = False
    is_greeting: bool = False
    is_duplicate: bool = False
    duplicate_of: Optional[str] = None
    program_id: Optional[str] = None
    program_number: Optional[int] = None
    order_in_program: Optional[int] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    import_batch_id: Optional[str] = None
    clasificacion: Optional[str] = None  # "pregunta" | "dudoso" | "saludo"
    motivo_clasificacion: Optional[str] = None

class QuestionCreate(BaseModel):
    youtube_username: str
    original_text: str

class QuestionUpdate(BaseModel):
    original_text: Optional[str] = None
    corrected_text: Optional[str] = None
    is_greeting: Optional[bool] = None
    is_duplicate: Optional[bool] = None
    real_name: Optional[str] = None
    clasificacion: Optional[str] = None
    motivo_clasificacion: Optional[str] = None

class Program(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    number: int
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_reserve: bool = False
    is_exported: bool = False
    question_count: int = 0
    batch_id: str

class ProgramCreate(BaseModel):
    name: str
    number: int
    is_reserve: bool = False
    batch_id: str

class ImportBatch(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: Optional[str] = None  # Custom name for the batch
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    question_count: int = 0
    is_distributed: bool = False
    num_programs: int = 4

class Settings(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = "default_settings"
    num_programs: int = 4
    max_questions_per_user_per_program: int = 2
    llm_provider: str = "openai"
    youtube_client_id: Optional[str] = None
    youtube_client_secret: Optional[str] = None
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SettingsUpdate(BaseModel):
    num_programs: Optional[int] = None
    max_questions_per_user_per_program: Optional[int] = None
    llm_provider: Optional[str] = None
    youtube_client_id: Optional[str] = None
    youtube_client_secret: Optional[str] = None

class CommentImport(BaseModel):
    raw_text: str

class DistributeRequest(BaseModel):
    batch_id: str
    num_programs: int = 4

class CorrectionRequest(BaseModel):
    question_ids: List[str]

class YouTubeAuthCallback(BaseModel):
    code: str
    redirect_uri: str

class YouTubeFetchRequest(BaseModel):
    fecha_desde: str  # ISO date string
    fecha_hasta: str  # ISO date string
    empezar_desde_ultimo: bool = False  # Usar anchor guardado como punto de corte
    texto_corte: Optional[str] = None  # Texto del último comentario ya procesado (match manual)

class BlockedComment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    youtube_username: str
    texto_referencia: str
    motivo: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class BlockedCommentCreate(BaseModel):
    youtube_username: str
    texto_referencia: str
    motivo: Optional[str] = None


# ==================== HELPER FUNCTIONS ====================

def serialize_datetime(obj):
    """Convert datetime to ISO string for MongoDB storage"""
    if isinstance(obj, datetime):
        return obj.isoformat()
    return obj

def normalize_text(text: str) -> str:
    """Normalize text for comparison: lowercase and remove accents"""
    import unicodedata
    if not text:
        return ""
    # Convert to lowercase
    text = text.lower()
    # Remove accents using unicode normalization
    # NFD decomposes characters (á -> a + combining accent)
    # Then we filter out the combining characters
    normalized = unicodedata.normalize('NFD', text)
    without_accents = ''.join(c for c in normalized if unicodedata.category(c) != 'Mn')
    return without_accents

def deserialize_datetime(obj):
    """Convert ISO string back to datetime"""
    if isinstance(obj, str):
        try:
            return datetime.fromisoformat(obj)
        except:
            return obj
    return obj

async def get_real_name(youtube_username: str) -> Optional[str]:
    """Get real name from user mapping"""
    mapping = await db.user_mappings.find_one(
        {"youtube_username": youtube_username},
        {"_id": 0}
    )
    if mapping:
        return mapping.get("real_name")
    return None

async def extract_display_name(youtube_username: str) -> str:
    """Extract a display name from YouTube username format"""
    # Remove @ if present
    clean_name = youtube_username.lstrip('@')
    # Try to extract readable parts (remove numbers at end)
    name_parts = re.sub(r'[-_]', ' ', clean_name)
    name_parts = re.sub(r'\d+$', '', name_parts)
    # Capitalize words
    if name_parts.strip():
        return ' '.join(word.capitalize() for word in name_parts.split())
    return clean_name


def is_greeting(text: str) -> bool:
    """Check if the text is likely just a greeting without a real question"""
    if not text:
        return True
    
    text_lower = text.lower().strip()
    
    # Very short texts are likely greetings
    if len(text_lower) < 15:
        return True
    
    # Check for greeting patterns without questions
    greeting_patterns = [
        r'^(hola|buenos días|buenas tardes|buenas noches|saludos|bendiciones)',
        r'^(gracias|muchas gracias|mil gracias)',
        r'^(felicidades|felicitaciones|enhorabuena)',
        r'^(excelente|muy bien|genial|increíble|maravilloso)',
        r'^(dios te bendiga|dios los bendiga|bendiciones)',
        r'^(amen|amén)$',
        r'^(primera|primero|segundo|segundo vez).*!?$',
        r'^(like|me gusta|me encanta).*$',
    ]
    
    for pattern in greeting_patterns:
        if re.match(pattern, text_lower):
            # Check if there's a question mark - if so, not just a greeting
            if '?' in text:
                return False
            # Check if text is long enough to be more than greeting
            if len(text_lower) > 50:
                return False
            return True
    
    # If no question mark and very short, likely a greeting
    if '?' not in text and len(text_lower) < 30:
        # Check for common non-question content
        non_question_starters = ['gracias', 'bendiciones', 'saludos', 'hola', 'amén', 'amen']
        if any(text_lower.startswith(s) for s in non_question_starters):
            return True
    
    return False


def clean_html_to_plain_text(text: str) -> str:
    """Convert YouTube comment HTML into plain text.
    
    - Decodes HTML entities (&quot;, &amp;, &lt;, &gt;, &apos;, &#39;, etc.)
    - Converts <br> / <br/> / <br /> to newlines
    - Strips any remaining HTML tags
    - Collapses 3+ consecutive newlines to max 2
    """
    if not text:
        return text
    
    # 1) Replace <br>, <br/>, <br /> with newline (case-insensitive)
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.IGNORECASE)
    
    # 2) Strip any other HTML tags
    text = re.sub(r'<[^>]+>', '', text)
    
    # 3) Decode HTML entities
    text = html.unescape(text)
    
    # 4) Collapse 3+ newlines into max 2
    text = re.sub(r'\n{3,}', '\n\n', text)
    
    return text.strip()


def _normalize_username(u: str) -> str:
    return (u or "").lstrip('@').strip().lower()


def _normalize_for_similarity(s: str) -> str:
    """Lowercase, collapse whitespace. HTML cleanup is done upstream."""
    return re.sub(r'\s+', ' ', (s or "").strip().lower())


async def is_blocked_comment(youtube_username: str, text: str, threshold: float = 0.80) -> Optional[Dict]:
    """Return the matching blocked-comment doc if this comment should be auto-deleted, else None.
    
    Match requires BOTH:
    - same youtube_username (after normalization: strip @, lowercase)
    - text similarity >= threshold (SequenceMatcher ratio on normalized text)
    """
    user_norm = _normalize_username(youtube_username)
    if not user_norm:
        return None
    
    blocked_docs = await db.comentarios_bloqueados.find(
        {},
        {"_id": 0}
    ).to_list(length=None)
    
    if not blocked_docs:
        return None
    
    text_norm = _normalize_for_similarity(text)
    if not text_norm:
        return None
    
    for doc in blocked_docs:
        if _normalize_username(doc.get("youtube_username")) != user_norm:
            continue
        ref_norm = _normalize_for_similarity(doc.get("texto_referencia", ""))
        if not ref_norm:
            continue
        ratio = SequenceMatcher(None, ref_norm, text_norm).ratio()
        if ratio >= threshold:
            return {**doc, "similarity": round(ratio, 3)}
    return None


async def build_clasificacion_filter(batch_id: str) -> Dict:
    """Return a Mongo filter fragment restricting to 'pregunta' classification.
    
    If no question in the batch has any `clasificacion` set yet (legacy or
    not-yet-classified), return {} so behavior is unchanged.
    """
    any_classified = await db.questions.find_one(
        {"import_batch_id": batch_id, "clasificacion": {"$ne": None}},
        {"_id": 1}
    )
    if any_classified:
        return {"clasificacion": "pregunta"}
    return {}


async def build_clasificacion_filter_no_batch() -> Dict:
    """Same as build_clasificacion_filter but global (all batches).
    
    Used by /programs/distribute which scopes by batch_id inside already.
    Returns {"clasificacion": "pregunta"} if ANY question has a classification,
    else {}.
    """
    any_classified = await db.questions.find_one(
        {"clasificacion": {"$ne": None}},
        {"_id": 1}
    )
    if any_classified:
        return {"clasificacion": "pregunta"}
    return {}



def clean_youtube_metadata(text: str) -> str:
    """Remove YouTube metadata like timestamps from comment text"""
    # Patterns to remove:
    # • Hace X minuto/s, hora/s, día/s, semana/s, mes/es, año/s
    # • X minutes/hours/days/weeks/months/years ago
    # (editado)
    # Se suscribió a tu canal...
    
    # Spanish time units (longer words first to avoid partial matches)
    spanish_units = r'(minutos?|horas?|días?|semanas?|meses|mes|años?)'
    # English time units  
    english_units = r'(minutes?|hours?|days?|weeks?|months?|years?)'
    
    patterns = [
        rf'•\s*Hace\s+\d+\s+{spanish_units}\s*',
        rf'•\s*\d+\s+{english_units}\s+ago\s*',
        rf'^\s*Hace\s+\d+\s+{spanish_units}\s*',
        rf'^\s*\d+\s+{english_units}\s+ago\s*',
        # (editado) / (edited)
        r'\(editado\)',
        r'\(edited\)',
        # Subscription messages
        r'Se suscribió a tu canal de forma pública\s*\([^)]*\)\s*',
        r'Se suscribió a tu canal\s*\([^)]*\)\s*',
        r'Se suscribió a tu canal de forma pública\s*',
        r'Se suscribió a tu canal\s*',
        r'Miembro desde hace\s+\d+\s+{spanish_units}\s*'.format(spanish_units=spanish_units),
        r'Suscriptor desde hace\s+\d+\s+{spanish_units}\s*'.format(spanish_units=spanish_units),
        r'Member for\s+\d+\s+{english_units}\s*'.format(english_units=english_units),
    ]
    
    cleaned = text
    for pattern in patterns:
        cleaned = re.sub(pattern, '', cleaned, flags=re.IGNORECASE | re.MULTILINE)
    
    # Clean up extra whitespace and newlines at the start
    cleaned = re.sub(r'^\s*\n', '', cleaned)
    cleaned = cleaned.strip()
    
    return cleaned

def parse_comments(raw_text: str) -> List[Dict[str, str]]:
    """Parse raw text into individual comments with usernames or real names
    
    Supported formats:
    1. @username Texto del comentario
    2. Nombre Real: Texto del comentario
    3. Nombre Real - Texto del comentario
    4. Nombre Real (solo en línea)
       Texto del comentario en la siguiente línea
       (separados por línea en blanco del siguiente)
    """
    comments = []
    lines = raw_text.strip().split('\n')
    
    current_identifier = None
    current_is_username = False
    current_text = []
    
    # First, try to detect if this is Format 4 (name alone on line, then text, separated by blank lines)
    # Check if we have a pattern of: Name line, text lines, blank line, Name line, text lines...
    blank_line_indices = [i for i, line in enumerate(lines) if not line.strip()]
    
    # Heuristic: if there are many blank lines and text doesn't have @ or : patterns, use Format 4
    has_at_usernames = any(re.match(r'^@[\w\-\.]+', line.strip()) for line in lines if line.strip())
    
    # More strict check for "Name: text" format - name should be short (< 40 chars) and not start with common words
    # Also, the name should not contain words that are typically part of sentences
    common_starts = ['tengo', 'sobre', 'cuando', 'como', 'que', 'cual', 'donde', 'por', 'si', 'en', 'de', 'la', 'el', 'un', 'una', 'mi', 'me', 'pregunta', 'jesucristo', 'dios', 'pastor', 'estimado', 'querido']
    def is_name_colon_format(line):
        match = re.match(r'^([A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ\s\.]+?):\s', line.strip())
        if match:
            name_part = match.group(1).strip().lower()
            # Name should be short (typically 1-4 words, under 40 chars)
            # and not start with common sentence words
            word_count = len(name_part.split())
            if (len(name_part) < 40 and 
                word_count <= 4 and
                not any(name_part.startswith(w) for w in common_starts)):
                return True
        return False
    
    has_colon_names = any(is_name_colon_format(line) for line in lines if line.strip())
    
    # Additional check: if we have many blank lines (more than 10% of total lines), 
    # it's likely Format 4 even if some lines have colons
    blank_ratio = len(blank_line_indices) / len(lines) if lines else 0
    
    if not has_at_usernames and (not has_colon_names or blank_ratio > 0.2) and len(blank_line_indices) > 10:
        # Use Format 4: Name on one line, text on next lines, separated by blank lines
        return parse_comments_format4(raw_text)
    
    # Original parsing logic for formats 1, 2, 3
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        # Check if line starts with @username (this is the PRIMARY format for YouTube comments)
        username_match = re.match(r'^(@[\w\-\.]+)', line)
        
        if username_match:
            # Save previous comment
            if current_identifier and current_text:
                clean_text = clean_youtube_metadata('\n'.join(current_text).strip())
                if clean_text:  # Only save if there's actual text
                    comments.append({
                        "youtube_username": current_identifier if current_is_username else f"@{current_identifier.lower().replace(' ', '_')}",
                        "original_text": clean_text,
                        "real_name": None if current_is_username else current_identifier
                    })
            
            current_identifier = username_match.group(1)
            current_is_username = True
            
            # Get the rest of the line after the username
            rest_of_line = line[len(current_identifier):].strip()
            # Remove timestamp patterns like "• hace 2 semanas" or "(editado)"
            rest_of_line = re.sub(r'^•\s*(hace\s+)?\d+\s*(minutos?|horas?|días?|semanas?|meses?|años?)\s*', '', rest_of_line, flags=re.IGNORECASE)
            rest_of_line = re.sub(r'^\(editado\)\s*', '', rest_of_line, flags=re.IGNORECASE)
            rest_of_line = rest_of_line.strip()
            
            current_text = [rest_of_line] if rest_of_line else []
        
        elif current_identifier:
            # If we have a current user, this line is part of their question
            # (regardless of whether it contains ":" or looks like a name)
            current_text.append(line)
        
        else:
            # No @username format detected, try "Name:" or "Name -" format for legacy support
            realname_match = re.match(r'^([A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ\s\.]+?)(?::|[-–—])\s*(.*)', line)
            if realname_match:
                name_part = realname_match.group(1).strip().lower()
                not_a_name_starters = [
                    'para ', 'por ', 'sobre ', 'según ', 'como ', 'cual ', 'cuando ', 'donde ',
                    'que ', 'si ', 'no ', 'ya ', 'pero ', 'porque ', 'aunque ', 'mientras ',
                    'pregunta', 'respuesta', 'duda', 'consulta', 'comentario',
                ]
                word_count = len(name_part.split())
                is_likely_name = (
                    not any(name_part.startswith(starter) for starter in not_a_name_starters) and
                    len(name_part) < 40 and
                    word_count <= 4
                )
                if is_likely_name:
                    current_identifier = realname_match.group(1).strip()
                    current_is_username = False
                    rest = realname_match.group(2).strip()
                    current_text = [rest] if rest else []
    
    # Save last comment
    if current_identifier and current_text:
        clean_text = clean_youtube_metadata('\n'.join(current_text).strip())
        comments.append({
            "youtube_username": current_identifier if current_is_username else f"@{current_identifier.lower().replace(' ', '_')}",
            "original_text": clean_text,
            "real_name": None if current_is_username else current_identifier
        })
    
    return comments

def parse_comments_format4(raw_text: str) -> List[Dict[str, str]]:
    """Parse format where:
    - Name is on its own line
    - Question text follows on subsequent lines  
    - Blank lines may appear WITHIN questions (for formatting)
    - A NEW NAME after a blank line marks the START of a new question
    
    Key insight: After a blank line, check if next line is a NAME or more text.
    Names are: short, no ?, don't start with ¿, typically 1-4 words, capitalized.
    
    Example:
    Nombre Usuario           <- Name
    Texto de la pregunta     <- Question text
    que puede tener          <- More question text
                             <- Blank line (formatting within question)
    varias líneas.           <- Still same question
                             <- Blank line  
    Otro Usuario             <- NEW NAME = new question starts
    Otra pregunta.           <- Question text
    """
    comments = []
    
    # Remove separator lines like ---
    raw_text = re.sub(r'^-{3,}\s*$', '', raw_text, flags=re.MULTILINE)
    
    lines = raw_text.split('\n')
    
    def is_likely_name(line):
        """Check if a line looks like a person's name"""
        line = line.strip()
        if not line:
            return False
        
        # Names are short (typically under 50 chars)
        if len(line) > 50:
            return False
        
        # Names don't have question marks
        if '?' in line:
            return False
        
        # Names don't start with question openers or bullets
        if line.startswith('¿') or line.startswith('•') or line.startswith('-'):
            return False
        
        # Names start with capital letter
        if not line[0].isupper():
            return False
        
        # Names typically have 1-5 words
        word_count = len(line.split())
        if word_count > 5:
            return False
        
        # Names don't start with common Spanish sentence/question starters
        lower_line = line.lower()
        sentence_starters = [
            'el ', 'la ', 'los ', 'las ', 'un ', 'una ', 'unos ', 'unas ',
            'que ', 'qué ', 'si ', 'no ', 'sí ', 'por ', 'para ', 'con ', 
            'en ', 'es ', 'son ', 'era ', 'fue ', 'pero ', 'porque ', 'ya ',
            'cuando ', 'como ', 'cómo ', 'donde ', 'dónde ', 'cual ', 'cuál ',
            'esto ', 'esta ', 'este ', 'ese ', 'esa ', 'eso ', 'aquel ',
            'mi ', 'mis ', 'su ', 'sus ', 'tu ', 'tus ', 'yo ', 'él ', 'ella ',
            'he ', 'ha ', 'se ', 'me ', 'te ', 'le ', 'lo ', 'hay ',
            'muchos ', 'muchas ', 'algunos ', 'algunas ', 'todos ', 'todas ',
            'gracias', 'bendiciones', 'saludos', 'hola', 'buenos', 'buenas',
            'perdón', 'disculpe', 'estimado', 'querido', 'querida',
            'según ', 'sobre ', 'acerca ', 'respecto ', 'durante ', 'después ',
            'antes ', 'ahora ', 'entonces ', 'además ', 'también ', 'incluso ',
            'creo ', 'pienso ', 'considero ', 'entiendo ', 'leo ', 'leí ',
            'tengo ', 'tiene ', 'tienen ', 'quiero ', 'quisiera ', 'podría ',
            'puede ', 'pueden ', 'debe ', 'deben ', 'sería ', 'serían ',
        ]
        if any(lower_line.startswith(starter) for starter in sentence_starters):
            return False
        
        return True
    
    current_name = None
    current_text_lines = []
    
    i = 0
    while i < len(lines):
        line = lines[i]
        line_stripped = line.strip()
        
        if not line_stripped:
            # Blank line - need to look ahead to see if next non-blank is a name
            # Skip consecutive blank lines
            j = i + 1
            while j < len(lines) and not lines[j].strip():
                j += 1
            
            if j < len(lines):
                next_line = lines[j].strip()
                if is_likely_name(next_line):
                    # Next line is a name = end current question, start new
                    if current_name and current_text_lines:
                        text = '\n'.join(current_text_lines).strip()
                        if text:
                            clean_text = clean_youtube_metadata(text)
                            username = '@' + re.sub(r'[^a-záéíóúñA-ZÁÉÍÓÚÑ0-9]', '', current_name.lower().replace(' ', ''))
                            comments.append({
                                "youtube_username": username,
                                "original_text": clean_text,
                                "real_name": current_name
                            })
                    # Start new question
                    current_name = next_line
                    current_text_lines = []
                    i = j + 1  # Skip to after the name
                    continue
                else:
                    # Next line is more text, blank was just formatting
                    # Add blank line to preserve formatting if we have content
                    if current_text_lines:
                        current_text_lines.append('')
            i += 1
        else:
            # Non-blank line
            if current_name is None:
                # First line of file (no name yet)
                if is_likely_name(line_stripped):
                    current_name = line_stripped
                # else: skip orphan text without a name
            else:
                # Add to current question text
                current_text_lines.append(line_stripped)
            i += 1
    
    # Don't forget the last question
    if current_name and current_text_lines:
        text = '\n'.join(current_text_lines).strip()
        if text:
            clean_text = clean_youtube_metadata(text)
            username = '@' + re.sub(r'[^a-záéíóúñA-ZÁÉÍÓÚÑ0-9]', '', current_name.lower().replace(' ', ''))
            comments.append({
                "youtube_username": username,
                "original_text": clean_text,
                "real_name": current_name
            })
    
    return comments

async def check_duplicate_in_history(text: str, exclude_id: str = None) -> Optional[Dict]:
    """Check if question exists in history (last 30 days)"""
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    
    query = {
        "created_at": {"$gte": cutoff.isoformat()},
        "is_greeting": False
    }
    if exclude_id:
        query["id"] = {"$ne": exclude_id}
    
    # Simple text similarity check
    text_lower = text.lower().strip()
    questions = await db.questions.find(query, {"_id": 0}).to_list(1000)
    
    for q in questions:
        existing_text = (q.get("corrected_text") or q.get("original_text", "")).lower().strip()
        # Check for high similarity (>80% match)
        if text_lower == existing_text:
            return q
        # Check for significant overlap
        if len(text_lower) > 20 and len(existing_text) > 20:
            words1 = set(text_lower.split())
            words2 = set(existing_text.split())
            if words1 and words2:
                overlap = len(words1 & words2) / max(len(words1), len(words2))
                if overlap > 0.8:
                    return q
    return None

# ==================== LLM CORRECTION ====================

async def correct_text_with_ai(text: str, provider: str = "openai") -> str:
    """Correct text grammar using AI"""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        if not api_key:
            logger.warning("No EMERGENT_LLM_KEY found")
            return text
        
        chat = LlmChat(
            api_key=api_key,
            session_id=f"correction-{uuid.uuid4()}",
            system_message="""Instrucciones obligatorias para corregir el texto:

1. Corrige la ortografía, acentuación, signos de puntuación y mayúsculas.
2. No cambies el contenido, el sentido ni la intención de lo que ha escrito la persona.
3. No resumas, no reorganices las ideas y no elimines partes del texto.
4. No inventes información.
5. No pongas fecha de publicación del comentario.
6. No pongas numeración.
7. No uses viñetas.
8. No uses negritas.
9. No uses la arroba @ en los nombres.
10. Después de un signo de interrogación de apertura (¿), la primera letra debe ir siempre en mayúscula.
11. Después de un signo de interrogación de cierre (?), si continúa una nueva frase o pregunta, la primera letra debe ir en mayúscula cuando corresponda.
12. Corrige tildes de nombres propios también, por ejemplo: Ramón, Óscar, Ángela, Iván, etc.
13. No añadas frases de introducción ni de cierre.
14. Elimina la palabra "(editado)" si aparece en el texto.
15. Elimina frases de YouTube como "Se suscribió a tu canal de forma pública", "Se suscribió a tu canal", "Miembro desde hace X", "Suscriptor desde hace X" y similares.
16. Devuélveme SOLO el texto ya corregido.
17. Mantén el contenido intacto, limitándote a corregir ortografía.

Aplica estas preferencias fijas del estilo SPM:
- Si hay dudas de puntuación, corrige lo mínimo necesario para que se lea bien, sin alterar el contenido.
- Respeta el estilo coloquial del autor si lo tiene."""
        )
        
        if provider == "openai":
            chat.with_model("openai", "gpt-5.2")
        elif provider == "anthropic":
            chat.with_model("anthropic", "claude-sonnet-4-5-20250929")
        elif provider == "gemini":
            chat.with_model("gemini", "gemini-3-flash-preview")
        
        user_message = UserMessage(text=text)
        response = await chat.send_message(user_message)
        
        return response.strip() if response else text
    except Exception as e:
        logger.error(f"Error correcting text: {e}")
        return text


async def clasificar_comentarios_con_ia(comentarios: List[Dict], task_id: str = None) -> List[Dict]:
    """Clasifica comentarios en pregunta/dudoso/saludo usando OpenAI.
    
    Input:  [{"id": str, "text": str}, ...]
    Output: [{"id": str, "clasificacion": "pregunta|dudoso|saludo", "motivo": str}, ...]
    
    Si `task_id` se provee y existe en background_tasks_status, actualiza progreso en vivo.
    """
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    
    api_key = os.environ.get('EMERGENT_LLM_KEY')
    if not api_key:
        logger.warning("[Clasificar] No EMERGENT_LLM_KEY")
        return []
    
    SYSTEM_PROMPT = """Eres un clasificador de comentarios de YouTube para un canal en español.
Clasifica cada comentario en: "pregunta", "dudoso" o "saludo".

- "pregunta": contiene una pregunta explícita o implícita sobre el tema del canal
- "dudoso": es un comentario pero no una pregunta clara (opinión, anécdota, sugerencia)
- "saludo": saludo, felicitación, comentario irrelevante, muy corto, spam

Responde SOLO con JSON: [{"id": "...", "clasificacion": "pregunta|dudoso|saludo", "motivo": "..."}]
El motivo debe ser muy corto (máx 10 palabras). No añadas texto antes ni después del JSON."""
    
    results: List[Dict] = []
    BATCH = 20
    valid_labels = {"pregunta", "dudoso", "saludo"}
    total = len(comentarios)
    
    for i in range(0, total, BATCH):
        chunk = comentarios[i:i + BATCH]
        user_payload = "\n".join(
            f'[{c["id"]}] {c["text"][:800]}' for c in chunk
        )
        
        try:
            chat = LlmChat(
                api_key=api_key,
                session_id=f"clasificar-{uuid.uuid4()}",
                system_message=SYSTEM_PROMPT
            )
            chat.with_model("openai", "gpt-5.2")
            response = await chat.send_message(UserMessage(text=user_payload))
            
            if not response:
                continue
            
            cleaned = response.strip()
            if cleaned.startswith("```"):
                cleaned = re.sub(r'^```(?:json)?\s*', '', cleaned)
                cleaned = re.sub(r'\s*```\s*$', '', cleaned)
            start = cleaned.find('[')
            end = cleaned.rfind(']')
            if start != -1 and end != -1 and end > start:
                cleaned = cleaned[start:end + 1]
            
            parsed = json.loads(cleaned)
            if not isinstance(parsed, list):
                continue
            
            for item in parsed:
                if not isinstance(item, dict):
                    continue
                cid = item.get("id")
                label = (item.get("clasificacion") or "").strip().lower()
                motivo = (item.get("motivo") or "").strip()
                if cid and label in valid_labels:
                    results.append({
                        "id": str(cid),
                        "clasificacion": label,
                        "motivo": motivo[:200]
                    })
        except Exception as e:
            logger.error(f"[Clasificar] chunk {i}: {e}")
            continue
        
        # Update progress for background task
        if task_id and task_id in background_tasks_status:
            background_tasks_status[task_id].update({
                "current": min(i + BATCH, total),
                "total": total,
                "classified_so_far": len(results)
            })
    
    logger.info(f"[Clasificar] {len(results)}/{total} classified")
    return results



async def check_duplicates_with_ai_progress(
    questions_to_check: List[Dict], 
    all_questions: List[Dict], 
    current_batch_id: str, 
    model: str = "gpt-5.2",
    task_id: str = None
) -> List[Dict]:
    """Use AI to find semantic duplicates from the SAME USER with progress tracking.
    
    Checks:
    1. Within the current batch (same user, different questions)
    2. Against all historical batches (same user)
    
    Only flags duplicates from the SAME user - different users asking similar questions is NOT a duplicate.
    """
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    
    duplicates_found = []
    processed_pairs = set()  # To avoid checking the same pair twice
    
    # Map model names to provider/model pairs
    model_config = {
        "gpt-5.2": ("openai", "gpt-5.2"),
        "gpt-4o": ("openai", "gpt-4o"),
        "gpt-4o-mini": ("openai", "gpt-4o-mini"),
        "claude-sonnet-4-5": ("anthropic", "claude-sonnet-4-5-20250929"),
        "gemini-3-flash": ("gemini", "gemini-3-flash-preview"),
    }
    
    provider, model_name = model_config.get(model, ("openai", "gpt-5.2"))
    logger.info(f"Using model: {provider}/{model_name}")
    
    def update_progress(current: int, total: int, status: str = "processing", duplicates_so_far: int = 0):
        """Update the task progress in memory"""
        if task_id and task_id in background_tasks_status:
            background_tasks_status[task_id].update({
                "current": current,
                "total": total,
                "status": status,
                "duplicates_found": duplicates_so_far,
                "updated_at": datetime.now(timezone.utc).isoformat()
            })
    
    try:
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        if not api_key:
            logger.warning("No EMERGENT_LLM_KEY found for duplicate check")
            update_progress(0, 0, "error")
            return duplicates_found
        
        # Group ALL questions by normalized user name
        questions_by_user = {}
        for q in all_questions:
            user = normalize_text(q.get("real_name", "") or q.get("youtube_username", ""))
            if user not in questions_by_user:
                questions_by_user[user] = []
            questions_by_user[user].append(q)
        
        # Only process users who have more than one question total
        users_with_multiple = {user: qs for user, qs in questions_by_user.items() if len(qs) > 1}
        logger.info(f"Users with multiple questions: {len(users_with_multiple)}")
        
        # For each question in the current batch, check if the user has multiple questions
        questions_to_process = []
        for new_q in questions_to_check:
            new_user = normalize_text(new_q.get("real_name", "") or new_q.get("youtube_username", ""))
            if new_user in users_with_multiple:
                questions_to_process.append(new_q)
        
        total_to_process = len(questions_to_process)
        logger.info(f"Questions to process with AI: {total_to_process}")
        update_progress(0, total_to_process, "processing")
        
        for idx, new_q in enumerate(questions_to_process):
            new_user = normalize_text(new_q.get("real_name", "") or new_q.get("youtube_username", ""))
            new_text = new_q.get("corrected_text") or new_q.get("original_text", "")
            new_id = new_q["id"]
            
            # Update progress
            update_progress(idx, total_to_process, "processing", len(duplicates_found))
            
            # Get ALL questions from this same user (excluding the current question)
            user_questions = [q for q in questions_by_user.get(new_user, []) if q["id"] != new_id]
            
            if not user_questions:
                continue
            
            # Prepare the comparison prompt with all questions from this user
            history_list = "\n".join([
                f"{i+1}. {(hq.get('corrected_text') or hq.get('original_text', ''))[:250]}"
                for i, hq in enumerate(user_questions[:20])  # Limit to 20 for API efficiency
            ])
            
            # Retry mechanism for transient API errors
            max_retries = 3
            retry_delay = 2
            
            for attempt in range(max_retries):
                try:
                    chat = LlmChat(
                        api_key=api_key,
                        session_id=f"duplicate-check-{uuid.uuid4()}",
                        system_message="""Eres un detector de preguntas duplicadas para un programa de YouTube cristiano.
Tu tarea es identificar si una NUEVA pregunta ya fue hecha antes por el MISMO usuario.

Dos preguntas son DUPLICADAS si:
- Preguntan sobre el MISMO tema específico (ej: ambas sobre "la parábola del sembrador")
- Buscan la MISMA información o explicación
- Son variaciones o reformulaciones de la misma duda

NO son duplicadas si:
- Solo comparten palabras comunes pero preguntan cosas diferentes
- Son del mismo tema general pero preguntas específicas diferentes
- Una es más amplia y otra más específica sobre aspectos distintos

Responde SOLO con los números de las preguntas duplicadas separados por comas, o "NINGUNA" si no hay duplicados.
Ejemplo: "1, 3" o "NINGUNA"
"""
                    )
                    
                    chat.with_model(provider, model_name)
                    
                    user_prompt = f"""NUEVA PREGUNTA de {new_q.get('real_name', 'Usuario')}:
"{new_text}"

OTRAS PREGUNTAS DEL MISMO USUARIO:
{history_list}

¿Cuáles de las preguntas anteriores son duplicadas de la nueva? Responde SOLO números o NINGUNA."""
                    
                    user_message = UserMessage(text=user_prompt)
                    response = await chat.send_message(user_message)
                    response = response.strip().upper() if response else ""
                    break  # Success, exit retry loop
                    
                except Exception as api_error:
                    logger.warning(f"API error on attempt {attempt + 1}/{max_retries}: {api_error}")
                    if attempt < max_retries - 1:
                        await asyncio.sleep(retry_delay * (attempt + 1))
                    else:
                        logger.error(f"Failed after {max_retries} attempts for question {new_id}")
                        response = ""
            
            if response and response != "NINGUNA":
                # Parse the response to get duplicate numbers
                try:
                    numbers = [int(n.strip()) for n in response.replace(".", ",").split(",") if n.strip().isdigit()]
                    for num in numbers:
                        if 1 <= num <= len(user_questions):
                            hist_q = user_questions[num - 1]
                            
                            # Avoid duplicate pairs
                            pair_key = tuple(sorted([new_id, hist_q["id"]]))
                            if pair_key in processed_pairs:
                                continue
                            processed_pairs.add(pair_key)
                            
                            # Determine if it's in same batch or history
                            is_same_batch = hist_q.get("import_batch_id") == current_batch_id
                            
                            # Get batch info for the original question
                            hist_batch = None
                            hist_batch_id = hist_q.get("import_batch_id")
                            if hist_batch_id:
                                hist_batch = await db.import_batches.find_one(
                                    {"id": hist_batch_id},
                                    {"_id": 0, "name": 1, "created_at": 1}
                                )
                                if not hist_batch:
                                    logger.warning(f"Batch not found for id: {hist_batch_id}")
                            
                            # Get batch info for the new question
                            new_batch = None
                            new_batch_id = new_q.get("import_batch_id")
                            if new_batch_id:
                                new_batch = await db.import_batches.find_one(
                                    {"id": new_batch_id},
                                    {"_id": 0, "name": 1, "created_at": 1}
                                )
                            
                            duplicates_found.append({
                                "new_question": {
                                    "id": new_q["id"],
                                    "username": new_q.get("youtube_username"),
                                    "real_name": new_q.get("real_name"),
                                    "text": new_text,
                                    "created_at": new_q.get("created_at"),
                                    "batch_id": new_batch_id,
                                    "batch_name": new_batch.get("name") if new_batch else None,
                                    "batch_date": new_batch.get("created_at") if new_batch else None
                                },
                                "original_question": {
                                    "id": hist_q["id"],
                                    "username": hist_q.get("youtube_username"),
                                    "real_name": hist_q.get("real_name"),
                                    "text": hist_q.get("corrected_text") or hist_q.get("original_text"),
                                    "created_at": hist_q.get("created_at"),
                                    "batch_id": hist_batch_id,
                                    "batch_name": hist_batch.get("name") if hist_batch else None,
                                    "batch_date": hist_batch.get("created_at") if hist_batch else None
                                },
                                "similarity": 100,
                                "type": "ai_same_batch" if is_same_batch else "ai_detected"
                            })
                            
                            # Mark as duplicate in DB
                            await db.questions.update_one(
                                {"id": new_q["id"]},
                                {"$set": {"is_duplicate": True, "duplicate_of": hist_q["id"]}}
                            )
                except Exception as parse_error:
                    logger.error(f"Error parsing AI response: {parse_error}")
        
        # Final progress update
        update_progress(total_to_process, total_to_process, "completed", len(duplicates_found))
                    
    except Exception as e:
        logger.error(f"Error in AI duplicate check: {e}")
        if task_id:
            update_progress(0, 0, "error")
    
    return duplicates_found


async def run_ai_duplicate_check_background(task_id: str, batch_id: str, model: str):
    """Background task to run AI duplicate check"""
    try:
        # Get questions from current batch
        questions = await db.questions.find(
            {"import_batch_id": batch_id, "is_greeting": {"$ne": True}},
            {"_id": 0}
        ).to_list(500)
        
        if not questions:
            background_tasks_status[task_id].update({
                "status": "completed",
                "duplicates_count": 0,
                "duplicates": [],
                "message": "No questions in batch"
            })
            return
        
        # Get ALL questions
        all_questions = await db.questions.find(
            {"is_greeting": {"$ne": True}},
            {"_id": 0}
        ).to_list(10000)
        
        # Run the duplicate check with progress
        duplicates = await check_duplicates_with_ai_progress(
            questions, all_questions, batch_id, model, task_id
        )
        
        # Update final status
        background_tasks_status[task_id].update({
            "status": "completed",
            "duplicates_count": len(duplicates),
            "duplicates": duplicates,
            "questions_checked": len(questions),
            "total_questions": len(all_questions),
            "model_used": model,
            "completed_at": datetime.now(timezone.utc).isoformat()
        })
        
    except Exception as e:
        logger.error(f"Error in background AI duplicate check: {e}")
        background_tasks_status[task_id].update({
            "status": "error",
            "error": str(e)
        })


# Keep the old function for backwards compatibility (synchronous version)
async def check_duplicates_with_ai(questions_to_check: List[Dict], all_questions: List[Dict], current_batch_id: str, model: str = "gpt-5.2") -> List[Dict]:
    """Legacy function - calls the new progress version without task tracking"""
    return await check_duplicates_with_ai_progress(questions_to_check, all_questions, current_batch_id, model, None)

# ==================== API ROUTES ====================

@api_router.get("/")
async def root():
    return {"message": "Gestor de Preguntas YouTube API", "status": "ok"}

# ----- SETTINGS -----

@api_router.get("/settings", response_model=Settings)
async def get_settings():
    settings = await db.settings.find_one({"id": "default_settings"}, {"_id": 0})
    if not settings:
        default = Settings()
        doc = default.model_dump()
        doc['updated_at'] = serialize_datetime(doc['updated_at'])
        await db.settings.insert_one(doc)
        return default
    if isinstance(settings.get('updated_at'), str):
        settings['updated_at'] = deserialize_datetime(settings['updated_at'])
    return Settings(**settings)

@api_router.put("/settings", response_model=Settings)
async def update_settings(update: SettingsUpdate):
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.settings.update_one(
        {"id": "default_settings"},
        {"$set": update_data},
        upsert=True
    )
    return await get_settings()

# ----- USER MAPPINGS -----

@api_router.get("/users", response_model=List[UserMapping])
async def get_user_mappings():
    mappings = await db.user_mappings.find({}, {"_id": 0}).to_list(1000)
    for m in mappings:
        for key in ['created_at', 'updated_at']:
            if isinstance(m.get(key), str):
                m[key] = deserialize_datetime(m[key])
    return mappings

@api_router.post("/users", response_model=UserMapping)
async def create_user_mapping(data: UserMappingCreate):
    # Check if exists
    existing = await db.user_mappings.find_one(
        {"youtube_username": data.youtube_username},
        {"_id": 0}
    )
    if existing:
        # Update existing
        await db.user_mappings.update_one(
            {"youtube_username": data.youtube_username},
            {"$set": {"real_name": data.real_name, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        updated = await db.user_mappings.find_one(
            {"youtube_username": data.youtube_username},
            {"_id": 0}
        )
        return UserMapping(**updated)
    
    mapping = UserMapping(
        youtube_username=data.youtube_username,
        real_name=data.real_name
    )
    doc = mapping.model_dump()
    doc['created_at'] = serialize_datetime(doc['created_at'])
    doc['updated_at'] = serialize_datetime(doc['updated_at'])
    await db.user_mappings.insert_one(doc)
    return mapping

@api_router.delete("/users/{user_id}")
async def delete_user_mapping(user_id: str):
    result = await db.user_mappings.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return {"message": "Usuario eliminado"}


# ----- COMENTARIOS BLOQUEADOS -----

@api_router.get("/comentarios-bloqueados", response_model=List[BlockedComment])
async def list_blocked_comments():
    """List all blocked comments (users/texts that are auto-removed)."""
    docs = await db.comentarios_bloqueados.find(
        {},
        {"_id": 0}
    ).sort("created_at", -1).to_list(length=None)
    return [BlockedComment(**d) for d in docs]


@api_router.post("/comentarios-bloqueados", response_model=BlockedComment)
async def create_blocked_comment(data: BlockedCommentCreate):
    """Add a comment to the blocked list. Deletes any existing matching questions from DB."""
    if not data.youtube_username.strip() or not data.texto_referencia.strip():
        raise HTTPException(status_code=400, detail="youtube_username y texto_referencia son obligatorios")
    
    blocked = BlockedComment(
        youtube_username=data.youtube_username.strip(),
        texto_referencia=clean_html_to_plain_text(data.texto_referencia.strip()),
        motivo=(data.motivo or "").strip() or None
    )
    doc = blocked.model_dump()
    doc['created_at'] = serialize_datetime(doc['created_at'])
    await db.comentarios_bloqueados.insert_one(doc)
    
    # Remove already-imported questions that match this new block rule
    user_norm = _normalize_username(blocked.youtube_username)
    existing = await db.questions.find(
        {},
        {"_id": 0, "id": 1, "youtube_username": 1, "original_text": 1, "corrected_text": 1}
    ).to_list(length=None)
    removed_ids: List[str] = []
    for q in existing:
        if _normalize_username(q.get("youtube_username", "")) != user_norm:
            continue
        q_text = (q.get("corrected_text") or q.get("original_text") or "").strip()
        if not q_text:
            continue
        ratio = SequenceMatcher(
            None,
            _normalize_for_similarity(blocked.texto_referencia),
            _normalize_for_similarity(q_text)
        ).ratio()
        if ratio >= 0.80:
            removed_ids.append(q["id"])
    if removed_ids:
        await db.questions.delete_many({"id": {"$in": removed_ids}})
        logger.info(f"[BlockedComment] new rule removed {len(removed_ids)} existing questions")
    
    return blocked


@api_router.delete("/comentarios-bloqueados/{blocked_id}")
async def delete_blocked_comment(blocked_id: str):
    """Remove a comment from the blocked list (does not restore previously deleted questions)."""
    result = await db.comentarios_bloqueados.delete_one({"id": blocked_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Entrada no encontrada")
    return {"message": "Entrada eliminada de la lista negra"}


# ----- QUESTIONS -----

@api_router.get("/questions", response_model=List[Question])
async def get_questions(
    batch_id: Optional[str] = None,
    program_id: Optional[str] = None,
    include_greetings: bool = False
):
    query = {}
    if batch_id:
        query["import_batch_id"] = batch_id
    if program_id:
        query["program_id"] = program_id
    if not include_greetings:
        query["is_greeting"] = {"$ne": True}
    
    questions = await db.questions.find(query, {"_id": 0}).sort("created_at", 1).to_list(2000)
    for q in questions:
        if isinstance(q.get('created_at'), str):
            q['created_at'] = deserialize_datetime(q['created_at'])
    return questions

@api_router.post("/questions", response_model=Question)
async def create_question(data: QuestionCreate):
    real_name = await get_real_name(data.youtube_username)
    if not real_name:
        real_name = await extract_display_name(data.youtube_username)
    
    question = Question(
        youtube_username=data.youtube_username,
        real_name=real_name,
        original_text=clean_html_to_plain_text(data.original_text)
    )
    doc = question.model_dump()
    doc['created_at'] = serialize_datetime(doc['created_at'])
    await db.questions.insert_one(doc)
    return question

@api_router.put("/questions/{question_id}", response_model=Question)
async def update_question(question_id: str, update: QuestionUpdate):
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    
    # If updating real_name, also save to user_mappings for future use
    if "real_name" in update_data and update_data["real_name"]:
        question = await db.questions.find_one({"id": question_id}, {"_id": 0})
        if question and question.get("youtube_username"):
            # Create or update user mapping
            existing = await db.user_mappings.find_one(
                {"youtube_username": question["youtube_username"]},
                {"_id": 0}
            )
            if existing:
                await db.user_mappings.update_one(
                    {"youtube_username": question["youtube_username"]},
                    {"$set": {"real_name": update_data["real_name"], "updated_at": datetime.now(timezone.utc).isoformat()}}
                )
            else:
                new_mapping = UserMapping(
                    youtube_username=question["youtube_username"],
                    real_name=update_data["real_name"]
                )
                doc = new_mapping.model_dump()
                doc['created_at'] = serialize_datetime(doc['created_at'])
                doc['updated_at'] = serialize_datetime(doc['updated_at'])
                await db.user_mappings.insert_one(doc)
    
    if update_data:
        await db.questions.update_one(
            {"id": question_id},
            {"$set": update_data}
        )
    
    question = await db.questions.find_one({"id": question_id}, {"_id": 0})
    if not question:
        raise HTTPException(status_code=404, detail="Pregunta no encontrada")
    
    if isinstance(question.get('created_at'), str):
        question['created_at'] = deserialize_datetime(question['created_at'])
    return Question(**question)

@api_router.delete("/questions/{question_id}")
async def delete_question(question_id: str):
    # First get the question to know its batch
    question = await db.questions.find_one({"id": question_id})
    if not question:
        raise HTTPException(status_code=404, detail="Pregunta no encontrada")
    
    batch_id = question.get("import_batch_id")
    
    # Delete the question
    result = await db.questions.delete_one({"id": question_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Pregunta no encontrada")
    
    # Update the batch question count
    if batch_id:
        # Count remaining questions in batch
        remaining = await db.questions.count_documents({"import_batch_id": batch_id})
        await db.import_batches.update_one(
            {"id": batch_id},
            {"$set": {"question_count": remaining}}
        )
    
    # Also clean up any questions that reference this as duplicate_of
    await db.questions.update_many(
        {"duplicate_of": question_id},
        {"$set": {"is_duplicate": False, "duplicate_of": None}}
    )
    
    return {"message": "Pregunta eliminada", "remaining_in_batch": remaining if batch_id else 0}


@api_router.get("/questions/by-id/{question_id}")
async def get_question_by_id(question_id: str):
    """Get a single question by its ID"""
    question = await db.questions.find_one({"id": question_id}, {"_id": 0})
    if not question:
        raise HTTPException(status_code=404, detail="Pregunta no encontrada")
    
    # Add batch info if available
    if question.get("import_batch_id"):
        batch = await db.import_batches.find_one(
            {"id": question["import_batch_id"]},
            {"_id": 0, "name": 1, "created_at": 1}
        )
        if batch:
            question["batch_name"] = batch.get("name")
            question["batch_date"] = batch.get("created_at")
    
    return question


@api_router.post("/questions/{question_id}/confirm-name")
async def confirm_question_name(question_id: str):
    """Confirm that the real_name is correct (even if it matches username)"""
    question = await db.questions.find_one({"id": question_id}, {"_id": 0})
    if not question:
        raise HTTPException(status_code=404, detail="Pregunta no encontrada")
    
    await db.questions.update_one(
        {"id": question_id},
        {"$set": {"real_name_confirmed": True}}
    )
    
    return {"message": "Nombre confirmado", "real_name": question.get("real_name")}


@api_router.post("/questions/clean-orphan-duplicates")
async def clean_orphan_duplicates():
    """Remove is_duplicate flag from questions whose original was deleted"""
    # Find all questions marked as duplicates
    duplicates = await db.questions.find(
        {"is_duplicate": True, "duplicate_of": {"$ne": None}},
        {"_id": 0, "id": 1, "duplicate_of": 1}
    ).to_list(1000)
    
    cleaned = 0
    for dup in duplicates:
        # Check if the original question exists
        original = await db.questions.find_one({"id": dup["duplicate_of"]})
        if not original:
            # Original was deleted, clean the flag
            await db.questions.update_one(
                {"id": dup["id"]},
                {"$set": {"is_duplicate": False, "duplicate_of": None}}
            )
            cleaned += 1
    
    return {"cleaned": cleaned, "message": f"Se limpiaron {cleaned} duplicados huérfanos"}

# ----- IMPORT -----

@api_router.post("/questions/import")
async def import_comments(data: CommentImport):
    """Import raw comments text and parse into questions"""
    comments = parse_comments(data.raw_text)
    
    if not comments:
        raise HTTPException(status_code=400, detail="No se encontraron comentarios válidos")
    
    # Create import batch
    batch = ImportBatch(question_count=len(comments))
    batch_doc = batch.model_dump()
    batch_doc['created_at'] = serialize_datetime(batch_doc['created_at'])
    await db.import_batches.insert_one(batch_doc)
    
    questions_created = []
    for comment in comments:
        # Check if real_name came from parsing
        real_name = comment.get("real_name")
        if not real_name:
            real_name = await get_real_name(comment["youtube_username"])
        if not real_name:
            real_name = await extract_display_name(comment["youtube_username"])
        
        question = Question(
            youtube_username=comment["youtube_username"],
            real_name=real_name,
            original_text=clean_html_to_plain_text(comment["original_text"]),
            import_batch_id=batch.id
        )
        doc = question.model_dump()
        doc['created_at'] = serialize_datetime(doc['created_at'])
        await db.questions.insert_one(doc)
        questions_created.append(question)
    
    return {
        "batch_id": batch.id,
        "questions_imported": len(questions_created),
        "questions": questions_created
    }

# ----- CORRECTION -----

@api_router.post("/questions/correct")
async def correct_questions(data: CorrectionRequest):
    """Correct selected questions using AI"""
    settings = await get_settings()
    corrected = []
    
    for qid in data.question_ids:
        question = await db.questions.find_one({"id": qid}, {"_id": 0})
        if question:
            # First, update real_name from user mappings if available
            stored_name = await get_real_name(question.get("youtube_username", ""))
            if stored_name and stored_name != question.get("real_name"):
                await db.questions.update_one(
                    {"id": qid},
                    {"$set": {"real_name": stored_name}}
                )
            
            text_to_correct = question.get("original_text", "")
            corrected_text = await correct_text_with_ai(text_to_correct, settings.llm_provider)
            
            await db.questions.update_one(
                {"id": qid},
                {"$set": {"corrected_text": corrected_text, "is_corrected": True}}
            )
            corrected.append({"id": qid, "corrected_text": corrected_text, "real_name": stored_name})
    
    return {"corrected": corrected}

@api_router.post("/questions/correct-all/{batch_id}")
async def correct_all_questions(batch_id: str):
    """Get list of questions to correct (does not correct them, just returns IDs).
    
    Only operates on questions classified as 'pregunta' (or all, if none in the
    batch has been classified yet).
    """
    clasif_filter = await build_clasificacion_filter(batch_id)
    questions = await db.questions.find(
        {
            "import_batch_id": batch_id,
            "is_greeting": {"$ne": True},
            "is_corrected": {"$ne": True},
            **clasif_filter
        },
        {"_id": 0, "id": 1, "youtube_username": 1}
    ).to_list(500)
    
    # Update real names from mappings for all questions
    for question in questions:
        stored_name = await get_real_name(question.get("youtube_username", ""))
        if stored_name:
            await db.questions.update_one(
                {"id": question["id"]},
                {"$set": {"real_name": stored_name}}
            )
    
    return {
        "total_to_correct": len(questions),
        "question_ids": [q["id"] for q in questions]
    }

@api_router.post("/questions/correct-batch")
async def correct_batch_questions(data: CorrectionRequest):
    """Correct a small batch of questions (for progress tracking)"""
    settings = await get_settings()
    corrected = []
    errors = []
    
    for qid in data.question_ids:
        try:
            question = await db.questions.find_one({"id": qid}, {"_id": 0})
            if question and not question.get("is_corrected"):
                # Update real_name from user mappings if available
                stored_name = await get_real_name(question.get("youtube_username", ""))
                if stored_name and stored_name != question.get("real_name"):
                    await db.questions.update_one(
                        {"id": qid},
                        {"$set": {"real_name": stored_name}}
                    )
                
                text_to_correct = question.get("original_text", "")
                corrected_text = await correct_text_with_ai(text_to_correct, settings.llm_provider)
                
                await db.questions.update_one(
                    {"id": qid},
                    {"$set": {"corrected_text": corrected_text, "is_corrected": True}}
                )
                corrected.append({"id": qid, "corrected_text": corrected_text})
        except Exception as e:
            errors.append({"id": qid, "error": str(e)})
    
    return {"corrected": corrected, "errors": errors}


# ----- CLASIFICACIÓN -----

async def run_clasificacion_background(task_id: str, batch_id: str):
    """Background runner for AI classification with progress tracking."""
    try:
        background_tasks_status[task_id]["status"] = "running"
        
        questions = await db.questions.find(
            {"import_batch_id": batch_id},
            {"_id": 0, "id": 1, "youtube_username": 1, "original_text": 1, "corrected_text": 1}
        ).to_list(length=None)
        
        # First, remove any questions that match the blocked list (same user + similar text)
        blocked_removed = 0
        remaining_questions = []
        for q in questions:
            text_for_check = (q.get("corrected_text") or q.get("original_text") or "").strip()
            if text_for_check and await is_blocked_comment(q.get("youtube_username", ""), text_for_check):
                await db.questions.delete_one({"id": q["id"]})
                blocked_removed += 1
                continue
            remaining_questions.append(q)
        
        if blocked_removed:
            logger.info(f"[Clasificar] removed {blocked_removed} blocked comments before classification")
        
        comentarios = [
            {"id": q["id"], "text": (q.get("corrected_text") or q.get("original_text") or "").strip()}
            for q in remaining_questions
            if (q.get("corrected_text") or q.get("original_text") or "").strip()
        ]
        
        background_tasks_status[task_id].update({
            "current": 0,
            "total": len(comentarios)
        })
        
        results = await clasificar_comentarios_con_ia(comentarios, task_id=task_id)
        
        # Apply classifications to DB
        counts = {"pregunta": 0, "dudoso": 0, "saludo": 0}
        classified_count = 0
        for r in results:
            upd = await db.questions.update_one(
                {"id": r["id"]},
                {"$set": {
                    "clasificacion": r["clasificacion"],
                    "motivo_clasificacion": r["motivo"]
                }}
            )
            if upd.modified_count > 0:
                classified_count += 1
                counts[r["clasificacion"]] = counts.get(r["clasificacion"], 0) + 1
        
        background_tasks_status[task_id].update({
            "status": "completed",
            "current": len(comentarios),
            "total": len(comentarios),
            "classified_count": classified_count,
            "counts": counts,
            "completed_at": datetime.now(timezone.utc).isoformat()
        })
    except Exception as e:
        logger.error(f"[Clasificar] background error: {e}")
        background_tasks_status[task_id].update({
            "status": "error",
            "error": str(e),
            "completed_at": datetime.now(timezone.utc).isoformat()
        })


@api_router.post("/questions/clasificar/{batch_id}")
async def clasificar_batch(batch_id: str):
    """Inicia una tarea en background para clasificar todas las preguntas del lote.
    
    Devuelve un task_id. Usa GET /api/questions/clasificar/status/{task_id} para el progreso.
    """
    # Pre-check: batch must have questions
    total = await db.questions.count_documents({"import_batch_id": batch_id})
    if total == 0:
        return {"classified_count": 0, "total": 0, "message": "No hay preguntas en este lote"}
    
    task_id = str(uuid.uuid4())
    background_tasks_status[task_id] = {
        "task_id": task_id,
        "batch_id": batch_id,
        "status": "starting",
        "current": 0,
        "total": total,
        "started_at": datetime.now(timezone.utc).isoformat()
    }
    
    asyncio.create_task(run_clasificacion_background(task_id, batch_id))
    
    return {
        "task_id": task_id,
        "status": "started",
        "total": total,
        "message": "Clasificación iniciada. Usa /api/questions/clasificar/status/{task_id} para ver el progreso."
    }


@api_router.get("/questions/clasificar/status/{task_id}")
async def get_clasificacion_status(task_id: str):
    """Get status and progress of a background classification task."""
    if task_id not in background_tasks_status:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    
    task = background_tasks_status[task_id]
    
    percentage = 0
    if task.get("total", 0) > 0:
        percentage = round((task.get("current", 0) / task["total"]) * 100)
    
    return {
        "task_id": task_id,
        "status": task.get("status", "unknown"),
        "current": task.get("current", 0),
        "total": task.get("total", 0),
        "percentage": percentage,
        "classified_so_far": task.get("classified_so_far", 0),
        "classified_count": task.get("classified_count"),
        "counts": task.get("counts"),
        "started_at": task.get("started_at"),
        "completed_at": task.get("completed_at"),
        "error": task.get("error")
    }


@api_router.delete("/questions/clasificar/status/{task_id}")
async def cleanup_clasificacion_task(task_id: str):
    """Clean up a completed classification task from memory."""
    if task_id in background_tasks_status:
        del background_tasks_status[task_id]
        return {"message": "Tarea eliminada"}
    raise HTTPException(status_code=404, detail="Tarea no encontrada")


# ----- DUPLICATES -----

@api_router.post("/questions/check-duplicates/{batch_id}")
async def check_duplicates(batch_id: str):
    """Check for duplicate questions in batch and ALL history, accent and case insensitive"""
    questions = await db.questions.find(
        {"import_batch_id": batch_id, "is_greeting": {"$ne": True}},
        {"_id": 0}
    ).to_list(500)
    
    # Get current batch info for the "new" questions
    current_batch = await db.import_batches.find_one(
        {"id": batch_id},
        {"_id": 0, "name": 1, "created_at": 1}
    )
    current_batch_name = current_batch.get("name") if current_batch else None
    current_batch_date = current_batch.get("created_at") if current_batch else None
    
    duplicates_found = []
    texts_in_batch = {}  # normalized_text -> question_id
    
    for q in questions:
        text = q.get("corrected_text") or q.get("original_text", "")
        text_normalized = normalize_text(text)
        text_words = set(text_normalized.split())
        
        # Check within batch
        found_in_batch = False
        for existing_norm, existing_id in texts_in_batch.items():
            existing_words = set(existing_norm.split())
            if text_words and existing_words:
                overlap = len(text_words & existing_words) / max(len(text_words), len(existing_words))
                if overlap > 0.6 or text_normalized == existing_norm:  # Lowered threshold to 60%
                    # Get original question details
                    original_q = await db.questions.find_one({"id": existing_id}, {"_id": 0})
                    duplicates_found.append({
                        "new_question": {
                            "id": q["id"],
                            "username": q.get("youtube_username"),
                            "real_name": q.get("real_name"),
                            "text": q.get("corrected_text") or q.get("original_text"),
                            "created_at": q.get("created_at"),
                            "batch_id": batch_id,
                            "batch_name": current_batch_name,
                            "batch_date": current_batch_date
                        },
                        "original_question": {
                            "id": original_q["id"],
                            "username": original_q.get("youtube_username"),
                            "real_name": original_q.get("real_name"),
                            "text": original_q.get("corrected_text") or original_q.get("original_text"),
                            "created_at": original_q.get("created_at"),
                            "batch_id": batch_id,
                            "batch_name": current_batch_name,
                            "batch_date": current_batch_date
                        },
                        "similarity": round(overlap * 100),
                        "type": "in_batch"
                    })
                    await db.questions.update_one(
                        {"id": q["id"]},
                        {"$set": {"is_duplicate": True, "duplicate_of": existing_id}}
                    )
                    found_in_batch = True
                    break
        
        if not found_in_batch:
            texts_in_batch[text_normalized] = q["id"]
            
            # Check in ALL history (no date limit), excluding current batch
            history_questions = await db.questions.find(
                {
                    "is_greeting": {"$ne": True},
                    "import_batch_id": {"$ne": batch_id},
                    "id": {"$ne": q["id"]}
                },
                {"_id": 0}
            ).to_list(5000)
            
            for hist_q in history_questions:
                hist_text = hist_q.get("corrected_text") or hist_q.get("original_text", "")
                hist_normalized = normalize_text(hist_text)
                hist_words = set(hist_normalized.split())
                
                if text_words and hist_words:
                    overlap = len(text_words & hist_words) / max(len(text_words), len(hist_words))
                    if overlap > 0.6 or text_normalized == hist_normalized:  # Lowered threshold to 60%
                        # Get batch info for the historical question
                        hist_batch = None
                        if hist_q.get("import_batch_id"):
                            hist_batch = await db.import_batches.find_one(
                                {"id": hist_q["import_batch_id"]},
                                {"_id": 0, "name": 1, "created_at": 1}
                            )
                        
                        duplicates_found.append({
                            "new_question": {
                                "id": q["id"],
                                "username": q.get("youtube_username"),
                                "real_name": q.get("real_name"),
                                "text": q.get("corrected_text") or q.get("original_text"),
                                "created_at": q.get("created_at"),
                                "batch_id": batch_id,
                                "batch_name": current_batch_name,
                                "batch_date": current_batch_date
                            },
                            "original_question": {
                                "id": hist_q["id"],
                                "username": hist_q.get("youtube_username"),
                                "real_name": hist_q.get("real_name"),
                                "text": hist_q.get("corrected_text") or hist_q.get("original_text"),
                                "created_at": hist_q.get("created_at"),
                                "batch_id": hist_q.get("import_batch_id"),
                                "batch_name": hist_batch.get("name") if hist_batch else None,
                                "batch_date": hist_batch.get("created_at") if hist_batch else None
                            },
                            "similarity": round(overlap * 100),
                            "type": "in_history"
                        })
                        await db.questions.update_one(
                            {"id": q["id"]},
                            {"$set": {"is_duplicate": True, "duplicate_of": hist_q["id"]}}
                        )
                        break
    
    return {"duplicates_count": len(duplicates_found), "duplicates": duplicates_found}


class DuplicateCheckRequest(BaseModel):
    model: Optional[str] = "gpt-5.2"


@api_router.post("/questions/check-duplicates-ai-start/{batch_id}")
async def start_ai_duplicate_check(batch_id: str, request: DuplicateCheckRequest = DuplicateCheckRequest()):
    """Start an AI duplicate check as a background task.
    
    Returns a task_id that can be used to poll for progress and results.
    This avoids timeouts for large batches.
    """
    # Create task ID
    task_id = str(uuid.uuid4())
    
    # Initialize task status
    background_tasks_status[task_id] = {
        "task_id": task_id,
        "batch_id": batch_id,
        "model": request.model,
        "status": "starting",
        "current": 0,
        "total": 0,
        "duplicates_found": 0,
        "started_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Start the background task
    asyncio.create_task(run_ai_duplicate_check_background(task_id, batch_id, request.model))
    
    return {
        "task_id": task_id,
        "status": "started",
        "message": "Búsqueda de duplicados iniciada. Usa /api/duplicates/status/{task_id} para ver el progreso."
    }


@api_router.get("/duplicates/status/{task_id}")
async def get_duplicate_check_status(task_id: str):
    """Get the status and progress of a background AI duplicate check task."""
    if task_id not in background_tasks_status:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    
    task = background_tasks_status[task_id]
    
    # Calculate percentage
    percentage = 0
    if task.get("total", 0) > 0:
        percentage = round((task.get("current", 0) / task["total"]) * 100)
    
    return {
        "task_id": task_id,
        "status": task.get("status", "unknown"),
        "current": task.get("current", 0),
        "total": task.get("total", 0),
        "percentage": percentage,
        "duplicates_found": task.get("duplicates_found", 0),
        "duplicates_count": task.get("duplicates_count"),
        "duplicates": task.get("duplicates"),
        "model_used": task.get("model"),
        "started_at": task.get("started_at"),
        "completed_at": task.get("completed_at"),
        "error": task.get("error")
    }


@api_router.delete("/duplicates/status/{task_id}")
async def cleanup_duplicate_check_task(task_id: str):
    """Clean up a completed task from memory."""
    if task_id in background_tasks_status:
        del background_tasks_status[task_id]
        return {"message": "Tarea eliminada"}
    raise HTTPException(status_code=404, detail="Tarea no encontrada")


@api_router.post("/duplicates/cleanup-orphans")
async def cleanup_orphan_duplicates():
    """Clean up duplicate flags that point to non-existent questions."""
    # Get all questions
    all_questions = await db.questions.find({}, {"_id": 0, "id": 1}).to_list(10000)
    all_ids = {q["id"] for q in all_questions}
    
    # Find duplicates with invalid references
    duplicates = await db.questions.find(
        {"is_duplicate": True, "duplicate_of": {"$ne": None}},
        {"_id": 0, "id": 1, "duplicate_of": 1}
    ).to_list(10000)
    
    orphans_fixed = 0
    for dup in duplicates:
        if dup.get("duplicate_of") and dup["duplicate_of"] not in all_ids:
            await db.questions.update_one(
                {"id": dup["id"]},
                {"$set": {"is_duplicate": False, "duplicate_of": None}}
            )
            orphans_fixed += 1
            logger.info(f"Cleaned orphan duplicate: {dup['id']} -> {dup['duplicate_of']}")
    
    return {
        "message": f"Limpieza completada",
        "orphans_fixed": orphans_fixed
    }


@api_router.post("/questions/check-duplicates-ai/{batch_id}")
async def check_duplicates_ai(batch_id: str, request: DuplicateCheckRequest = DuplicateCheckRequest()):
    """Check for duplicate questions using AI semantic comparison (synchronous version).
    
    Note: For large batches, use /questions/check-duplicates-ai-start/{batch_id} instead
    to avoid timeouts.
    
    Only compares questions from the SAME USER:
    - Within the current batch
    - Against all historical batches
    
    Different users asking similar questions is NOT considered a duplicate.
    """
    
    # Get questions from current batch
    questions = await db.questions.find(
        {"import_batch_id": batch_id, "is_greeting": {"$ne": True}},
        {"_id": 0}
    ).to_list(500)
    
    if not questions:
        return {"duplicates_count": 0, "duplicates": [], "message": "No questions in batch"}
    
    # Get ALL questions (including current batch for within-batch comparison)
    all_questions = await db.questions.find(
        {"is_greeting": {"$ne": True}},
        {"_id": 0}
    ).to_list(10000)
    
    # Use AI to find duplicates (same user only)
    duplicates = await check_duplicates_with_ai(questions, all_questions, batch_id, request.model)
    
    return {
        "duplicates_count": len(duplicates),
        "duplicates": duplicates,
        "questions_checked": len(questions),
        "total_questions": len(all_questions),
        "model_used": request.model
    }

@api_router.put("/questions/{question_id}/clear-duplicate")
async def clear_duplicate_flag(question_id: str):
    """Remove duplicate flag from a question"""
    await db.questions.update_one(
        {"id": question_id},
        {"$set": {"is_duplicate": False, "duplicate_of": None}}
    )
    return {"message": "Duplicate flag cleared"}

@api_router.post("/questions/update-names/{batch_id}")
async def update_names_from_mappings(batch_id: str):
    """Update all question names from stored user mappings.
    
    Only operates on questions classified as 'pregunta' (or all, if none in the
    batch has been classified yet).
    """
    clasif_filter = await build_clasificacion_filter(batch_id)
    questions = await db.questions.find(
        {"import_batch_id": batch_id, **clasif_filter},
        {"_id": 0}
    ).to_list(500)
    
    updated = 0
    for question in questions:
        stored_name = await get_real_name(question.get("youtube_username", ""))
        if stored_name and stored_name != question.get("real_name"):
            await db.questions.update_one(
                {"id": question["id"]},
                {"$set": {"real_name": stored_name}}
            )
            updated += 1
    
    return {"updated_count": updated}

@api_router.get("/questions/search")
async def search_all_questions(q: str = Query(..., min_length=2)):
    """Search all questions in the system by text - case and accent insensitive"""
    # Normalize the search query
    search_normalized = normalize_text(q)
    
    # Get all questions (we'll filter in Python for accent-insensitive search)
    all_questions = await db.questions.find(
        {"is_greeting": {"$ne": True}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(5000)
    
    # Filter questions that match the normalized search
    results = []
    for question in all_questions:
        # Normalize all searchable fields
        original_norm = normalize_text(question.get("original_text", ""))
        corrected_norm = normalize_text(question.get("corrected_text", ""))
        name_norm = normalize_text(question.get("real_name", ""))
        username_norm = normalize_text(question.get("youtube_username", ""))
        
        # Check if search term is in any field
        if (search_normalized in original_norm or 
            search_normalized in corrected_norm or 
            search_normalized in name_norm or 
            search_normalized in username_norm):
            results.append(question)
            
        # Limit results
        if len(results) >= 100:
            break
    
    # Add batch info to each question
    for q in results:
        if q.get("import_batch_id"):
            batch = await db.import_batches.find_one(
                {"id": q["import_batch_id"]},
                {"_id": 0, "created_at": 1, "name": 1}
            )
            if batch:
                q["batch_date"] = batch.get("created_at")
                q["batch_name"] = batch.get("name")
    
    return {"results": results, "count": len(results)}

# ----- PROGRAMS -----

@api_router.get("/programs", response_model=List[Program])
async def get_programs(batch_id: Optional[str] = None):
    query = {}
    if batch_id:
        query["batch_id"] = batch_id
    programs = await db.programs.find(query, {"_id": 0}).sort("number", 1).to_list(100)
    for p in programs:
        if isinstance(p.get('created_at'), str):
            p['created_at'] = deserialize_datetime(p['created_at'])
    return programs

@api_router.post("/programs/distribute")
async def distribute_questions(data: DistributeRequest):
    """Distribute questions into programs following the rules:
    1. Maintain chronological order
    2. Max 2 questions per user per program
    3. Equal distribution between programs
    4. Ángela Silva special rule: max 2 per program, never opens a program
    5. Excess goes to Reserva
    """
    clasif_filter = await build_clasificacion_filter(data.batch_id)
    questions = await db.questions.find(
        {
            "import_batch_id": data.batch_id,
            "is_greeting": {"$ne": True},
            "is_duplicate": {"$ne": True},
            **clasif_filter
        },
        {"_id": 0}
    ).sort("created_at", 1).to_list(1000)
    
    if not questions:
        raise HTTPException(status_code=400, detail="No hay preguntas para distribuir")
    
    settings = await get_settings()
    max_per_user = settings.max_questions_per_user_per_program  # Default 2
    num_programs = data.num_programs
    
    # Delete existing programs for this batch
    await db.programs.delete_many({"batch_id": data.batch_id})
    
    # Reset all question assignments for this batch
    await db.questions.update_many(
        {"import_batch_id": data.batch_id},
        {"$set": {"program_id": None, "program_number": None, "order_in_program": None}}
    )
    
    # Create programs
    programs = []
    for i in range(num_programs):
        program = Program(
            name=f"Programa {str(i + 1).zfill(2)}",
            number=i + 1,
            batch_id=data.batch_id
        )
        doc = program.model_dump()
        doc['created_at'] = serialize_datetime(doc['created_at'])
        await db.programs.insert_one(doc)
        programs.append(program)
    
    # Create reserve program
    reserve = Program(
        name="Reserva",
        number=num_programs + 1,
        is_reserve=True,
        batch_id=data.batch_id
    )
    reserve_doc = reserve.model_dump()
    reserve_doc['created_at'] = serialize_datetime(reserve_doc['created_at'])
    await db.programs.insert_one(reserve_doc)
    
    # Calculate target questions per program (for equity)
    total_questions = len(questions)
    base_per_program = total_questions // num_programs
    remainder = total_questions % num_programs
    
    # Create target limits for each program (distribute remainder)
    program_limits = []
    for i in range(num_programs):
        limit = base_per_program + (1 if i < remainder else 0)
        program_limits.append(limit)
    
    logger.info(f"Distributing {total_questions} questions into {num_programs} programs")
    logger.info(f"Target per program: {program_limits}")
    
    # Track state
    user_count_per_program: Dict[str, Dict[int, int]] = {}  # username -> {program_idx: count}
    program_questions: List[List[dict]] = [[] for _ in range(num_programs)]  # Questions assigned to each program
    reserve_questions: List[dict] = []
    
    # Special users that need placement rules (in the middle of the block)
    special_users = {"ángela silva", "angela silva"}  # Normalized names
    
    def normalize_name(name: str) -> str:
        if not name:
            return ""
        return name.lower().strip()
    
    def get_user_key(q: dict) -> str:
        """Get normalized user identifier for a question"""
        return normalize_name(q.get("real_name") or q.get("youtube_username", ""))
    
    def is_special_user(q: dict) -> bool:
        """Check if question is from a special user (Ángela Silva)"""
        user = get_user_key(q)
        return any(special in user for special in special_users)
    
    # First pass: Distribute normal questions (not special users)
    # We'll insert special user questions in the middle later
    normal_questions = []
    special_user_questions = []
    
    for q in questions:
        if is_special_user(q):
            special_user_questions.append(q)
        else:
            normal_questions.append(q)
    
    logger.info(f"Normal questions: {len(normal_questions)}, Special user questions: {len(special_user_questions)}")
    
    # Distribute normal questions maintaining chronological order
    current_program = 0
    
    for q in normal_questions:
        user_key = get_user_key(q)
        if user_key not in user_count_per_program:
            user_count_per_program[user_key] = {}
        
        assigned = False
        attempts = 0
        start_program = current_program
        
        while attempts < num_programs:
            prog_idx = current_program
            user_count = user_count_per_program[user_key].get(prog_idx, 0)
            current_count = len(program_questions[prog_idx])
            
            # Check if user can have more questions in this program
            # and program is not at capacity
            if user_count < max_per_user and current_count < program_limits[prog_idx]:
                program_questions[prog_idx].append(q)
                user_count_per_program[user_key][prog_idx] = user_count + 1
                assigned = True
                
                # Move to next program for round-robin distribution
                current_program = (current_program + 1) % num_programs
                break
            
            # Try next program
            current_program = (current_program + 1) % num_programs
            attempts += 1
        
        if not assigned:
            reserve_questions.append(q)
    
    # Now insert special user questions in the middle of each program block
    # Only if there are already questions in the program
    for q in special_user_questions:
        user_key = get_user_key(q)
        if user_key not in user_count_per_program:
            user_count_per_program[user_key] = {}
        
        assigned = False
        
        # Try each program
        for prog_idx in range(num_programs):
            user_count = user_count_per_program[user_key].get(prog_idx, 0)
            current_count = len(program_questions[prog_idx])
            
            # Check limits (2 per user per program, and room in program)
            # Also require at least 2 questions already in program to avoid opening
            if user_count < max_per_user and current_count < program_limits[prog_idx]:
                # Insert in the middle of the program, but NEVER at position 0
                if current_count >= 2:
                    # Insert approximately in the middle
                    insert_pos = current_count // 2
                    # Make sure we're not at position 0
                    insert_pos = max(1, insert_pos)
                else:
                    # If program has fewer than 2 questions, append at the end
                    # This ensures Ángela doesn't open the program
                    insert_pos = current_count
                
                program_questions[prog_idx].insert(insert_pos, q)
                user_count_per_program[user_key][prog_idx] = user_count + 1
                assigned = True
                break
        
        if not assigned:
            reserve_questions.append(q)
    
    # Now save all assignments to database
    for prog_idx, prog_qs in enumerate(program_questions):
        program = programs[prog_idx]
        for order, q in enumerate(prog_qs, 1):
            await db.questions.update_one(
                {"id": q["id"]},
                {"$set": {
                    "program_id": program.id,
                    "program_number": program.number,
                    "order_in_program": order
                }}
            )
    
    # Save reserve questions
    for order, q in enumerate(reserve_questions, 1):
        await db.questions.update_one(
            {"id": q["id"]},
            {"$set": {
                "program_id": reserve.id,
                "program_number": reserve.number,
                "order_in_program": order
            }}
        )
    
    # Update program question counts
    for prog_idx, program in enumerate(programs):
        count = len(program_questions[prog_idx])
        await db.programs.update_one(
            {"id": program.id},
            {"$set": {"question_count": count}}
        )
    
    # Update reserve count
    await db.programs.update_one(
        {"id": reserve.id},
        {"$set": {"question_count": len(reserve_questions)}}
    )
    
    # Mark batch as distributed
    await db.import_batches.update_one(
        {"id": data.batch_id},
        {"$set": {"is_distributed": True, "num_programs": num_programs}}
    )
    
    # Build distribution summary
    distribution = {programs[i].name: len(program_questions[i]) for i in range(num_programs)}
    distribution["Reserva"] = len(reserve_questions)
    
    logger.info(f"Distribution complete: {distribution}")
    
    return {
        "programs_created": num_programs + 1,  # Including reserve
        "distribution": distribution
    }


@api_router.delete("/programs/clear/{batch_id}")
async def clear_distribution(batch_id: str):
    """Clear all distribution for a batch - delete programs and reset question assignments"""
    # Delete all programs for this batch
    result = await db.programs.delete_many({"batch_id": batch_id})
    programs_deleted = result.deleted_count
    
    # Reset all question assignments for this batch
    await db.questions.update_many(
        {"import_batch_id": batch_id},
        {"$set": {"program_id": None, "program_number": None, "order_in_program": None}}
    )
    
    # Mark batch as not distributed
    await db.import_batches.update_one(
        {"id": batch_id},
        {"$set": {"is_distributed": False, "num_programs": None}}
    )
    
    logger.info(f"Cleared distribution for batch {batch_id}: {programs_deleted} programs deleted")
    
    return {
        "message": "Distribución eliminada",
        "programs_deleted": programs_deleted
    }


# ----- EXPORT -----

@api_router.get("/programs/{program_id}/export")
async def export_program(program_id: str):
    """Export program to TXT format"""
    program = await db.programs.find_one({"id": program_id}, {"_id": 0})
    if not program:
        raise HTTPException(status_code=404, detail="Programa no encontrado")
    
    questions = await db.questions.find(
        {"program_id": program_id},
        {"_id": 0}
    ).sort("order_in_program", 1).to_list(100)
    
    # Generate TXT
    lines = []
    for q in questions:
        name = q.get("real_name") or q.get("youtube_username", "Desconocido")
        text = q.get("corrected_text") or q.get("original_text", "")
        
        lines.append(name)
        lines.append(text)
        lines.append("")
        lines.append("")
    
    txt_content = "\n".join(lines)
    
    # Mark as exported
    await db.programs.update_one(
        {"id": program_id},
        {"$set": {"is_exported": True}}
    )
    
    return {
        "program_name": program["name"],
        "question_count": len(questions),
        "content": txt_content
    }

@api_router.get("/batches/{batch_id}/export-all")
async def export_all_programs(batch_id: str):
    """Export all programs from a batch"""
    programs = await db.programs.find(
        {"batch_id": batch_id},
        {"_id": 0}
    ).sort("number", 1).to_list(20)
    
    exports = []
    for program in programs:
        export = await export_program(program["id"])
        exports.append(export)
    
    return {"exports": exports}

# ----- BATCHES -----

@api_router.get("/batches")
async def get_batches():
    """Get all import batches"""
    batches = await db.import_batches.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)
    for b in batches:
        if isinstance(b.get('created_at'), str):
            b['created_at'] = deserialize_datetime(b['created_at'])
    return batches

@api_router.delete("/batches/{batch_id}")
async def delete_batch(batch_id: str):
    """Delete a batch and all its questions and programs"""
    await db.questions.delete_many({"import_batch_id": batch_id})
    await db.programs.delete_many({"batch_id": batch_id})
    result = await db.import_batches.delete_one({"id": batch_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Lote no encontrado")
    
    return {"message": "Lote eliminado"}

class BatchUpdate(BaseModel):
    name: Optional[str] = None
    created_at: Optional[str] = None

@api_router.put("/batches/{batch_id}")
async def update_batch(batch_id: str, update: BatchUpdate):
    """Update batch details like name and date"""
    update_data = {}
    
    if update.name is not None:
        update_data['name'] = update.name if update.name.strip() else None
    
    if update.created_at:
        # Parse the date string and convert to ISO format
        try:
            parsed_date = datetime.fromisoformat(update.created_at.replace('Z', '+00:00'))
            update_data['created_at'] = parsed_date.isoformat()
        except:
            update_data['created_at'] = update.created_at
    
    if update_data:
        result = await db.import_batches.update_one(
            {"id": batch_id},
            {"$set": update_data}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Lote no encontrado")
    
    batch = await db.import_batches.find_one({"id": batch_id}, {"_id": 0})
    return batch

# ----- STATS -----

@api_router.get("/stats")
async def get_stats():
    """Get dashboard statistics"""
    total_questions = await db.questions.count_documents({"is_greeting": {"$ne": True}})
    total_users = len(await db.user_mappings.distinct("youtube_username"))
    total_batches = await db.import_batches.count_documents({})
    
    # Last 30 days
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    recent_questions = await db.questions.count_documents({
        "created_at": {"$gte": cutoff.isoformat()},
        "is_greeting": {"$ne": True}
    })
    
    return {
        "total_questions": total_questions,
        "total_users": total_users,
        "total_batches": total_batches,
        "recent_questions": recent_questions
    }

# ----- CLEANUP -----

@api_router.get("/cleanup/stats")
async def get_cleanup_stats():
    """Get statistics for cleanup options"""
    now = datetime.now(timezone.utc)
    
    # Count questions by age
    stats = {}
    periods = [
        ("7_days", 7),
        ("15_days", 15),
        ("30_days", 30),
        ("60_days", 60),
        ("90_days", 90),
    ]
    
    for name, days in periods:
        cutoff = (now - timedelta(days=days)).isoformat()
        count = await db.questions.count_documents({
            "created_at": {"$lt": cutoff}
        })
        batch_count = await db.import_batches.count_documents({
            "created_at": {"$lt": cutoff}
        })
        stats[name] = {"questions": count, "batches": batch_count}
    
    # Total counts
    stats["total_questions"] = await db.questions.count_documents({})
    stats["total_batches"] = await db.import_batches.count_documents({})
    stats["total_programs"] = await db.programs.count_documents({})
    stats["total_users"] = await db.user_mappings.count_documents({})
    
    return stats

@api_router.delete("/cleanup/questions")
async def cleanup_old_questions(days: int = Query(..., ge=1, le=365)):
    """Delete questions older than specified days"""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    
    # Get affected batch IDs
    old_questions = await db.questions.find(
        {"created_at": {"$lt": cutoff}},
        {"import_batch_id": 1, "_id": 0}
    ).to_list(10000)
    
    affected_batch_ids = set(q.get("import_batch_id") for q in old_questions if q.get("import_batch_id"))
    
    # Delete old questions
    result = await db.questions.delete_many({"created_at": {"$lt": cutoff}})
    deleted_questions = result.deleted_count
    
    # Delete programs for affected batches that now have no questions
    deleted_programs = 0
    for batch_id in affected_batch_ids:
        remaining = await db.questions.count_documents({"import_batch_id": batch_id})
        if remaining == 0:
            prog_result = await db.programs.delete_many({"batch_id": batch_id})
            deleted_programs += prog_result.deleted_count
    
    return {
        "deleted_questions": deleted_questions,
        "deleted_programs": deleted_programs,
        "cutoff_date": cutoff
    }

@api_router.delete("/cleanup/batches")
async def cleanup_old_batches(days: int = Query(..., ge=1, le=365)):
    """Delete batches and their questions older than specified days"""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    
    # Find old batches
    old_batches = await db.import_batches.find(
        {"created_at": {"$lt": cutoff}},
        {"id": 1, "_id": 0}
    ).to_list(1000)
    
    batch_ids = [b["id"] for b in old_batches]
    
    # Delete questions for these batches
    questions_result = await db.questions.delete_many({"import_batch_id": {"$in": batch_ids}})
    
    # Delete programs for these batches
    programs_result = await db.programs.delete_many({"batch_id": {"$in": batch_ids}})
    
    # Delete the batches
    batches_result = await db.import_batches.delete_many({"created_at": {"$lt": cutoff}})
    
    return {
        "deleted_batches": batches_result.deleted_count,
        "deleted_questions": questions_result.deleted_count,
        "deleted_programs": programs_result.deleted_count,
        "cutoff_date": cutoff
    }


@api_router.get("/backup")
async def create_backup():
    """Create a complete backup of all data in JSON format"""
    from fastapi.responses import JSONResponse
    
    # Get all data from all collections
    questions = await db.questions.find({}, {"_id": 0}).to_list(10000)
    batches = await db.import_batches.find({}, {"_id": 0}).to_list(1000)
    programs = await db.programs.find({}, {"_id": 0}).to_list(1000)
    users = await db.users.find({}, {"_id": 0}).to_list(10000)
    settings = await db.settings.find({}, {"_id": 0}).to_list(10)
    
    # Create backup object
    backup = {
        "backup_date": datetime.now(timezone.utc).isoformat(),
        "version": "1.0",
        "data": {
            "questions": questions,
            "batches": batches,
            "programs": programs,
            "users": users,
            "settings": settings
        },
        "counts": {
            "questions": len(questions),
            "batches": len(batches),
            "programs": len(programs),
            "users": len(users)
        }
    }
    
    return JSONResponse(
        content=backup,
        headers={
            "Content-Disposition": f"attachment; filename=backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        }
    )


@api_router.post("/restore")
async def restore_backup(backup_data: dict):
    """Restore data from a backup file.
    
    WARNING: This will REPLACE all existing data!
    """
    if "data" not in backup_data:
        raise HTTPException(status_code=400, detail="Formato de backup inválido")
    
    data = backup_data["data"]
    restored = {}
    
    try:
        # Restore questions
        if "questions" in data and data["questions"]:
            await db.questions.delete_many({})
            await db.questions.insert_many(data["questions"])
            restored["questions"] = len(data["questions"])
        
        # Restore batches
        if "batches" in data and data["batches"]:
            await db.import_batches.delete_many({})
            await db.import_batches.insert_many(data["batches"])
            restored["batches"] = len(data["batches"])
        
        # Restore programs
        if "programs" in data and data["programs"]:
            await db.programs.delete_many({})
            await db.programs.insert_many(data["programs"])
            restored["programs"] = len(data["programs"])
        
        # Restore users
        if "users" in data and data["users"]:
            await db.users.delete_many({})
            await db.users.insert_many(data["users"])
            restored["users"] = len(data["users"])
        
        # Restore settings
        if "settings" in data and data["settings"]:
            await db.settings.delete_many({})
            await db.settings.insert_many(data["settings"])
            restored["settings"] = len(data["settings"])
        
        return {
            "message": "Backup restaurado exitosamente",
            "restored": restored
        }
    except Exception as e:
        logger.error(f"Error restoring backup: {e}")
        raise HTTPException(status_code=500, detail=f"Error al restaurar: {str(e)}")


@api_router.delete("/cleanup/all")
async def cleanup_all_data():
    """Delete ALL data from the database (use with caution)"""
    questions = await db.questions.delete_many({})
    programs = await db.programs.delete_many({})
    batches = await db.import_batches.delete_many({})
    # Keep user mappings as they are reusable
    
    return {
        "deleted_questions": questions.deleted_count,
        "deleted_programs": programs.deleted_count,
        "deleted_batches": batches.deleted_count,
        "message": "Todos los datos eliminados (usuarios conservados)"
    }


# ==================== YOUTUBE INTEGRATION ====================

def get_youtube_oauth_flow(redirect_uri: str):
    """Create OAuth flow for YouTube authentication"""
    settings = asyncio.get_event_loop().run_until_complete(get_settings())
    
    if not settings.youtube_client_id or not settings.youtube_client_secret:
        raise HTTPException(
            status_code=400, 
            detail="YouTube credentials not configured. Go to Settings to add them."
        )
    
    client_config = {
        "web": {
            "client_id": settings.youtube_client_id,
            "client_secret": settings.youtube_client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [redirect_uri]
        }
    }
    
    flow = Flow.from_client_config(
        client_config,
        scopes=YOUTUBE_SCOPES,
        redirect_uri=redirect_uri
    )
    
    return flow


@api_router.get("/youtube/auth-status")
async def youtube_auth_status():
    """Check if user is authenticated with YouTube"""
    # Check if we have valid tokens stored
    token_doc = await db.youtube_tokens.find_one({"type": "user_token"})
    
    if not token_doc:
        logger.info("[YouTube OAuth] auth-status: no token doc in DB")
        return {"authenticated": False, "message": "No token found"}
    
    # Check if token is expired (robust against naive datetimes from legacy docs)
    expiry = token_doc.get("expiry")
    is_expired = False
    if expiry:
        try:
            expiry_dt = datetime.fromisoformat(expiry) if isinstance(expiry, str) else expiry
            if expiry_dt.tzinfo is None:
                expiry_dt = expiry_dt.replace(tzinfo=timezone.utc)
            is_expired = expiry_dt < datetime.now(timezone.utc)
        except Exception as e:
            logger.warning(f"[YouTube OAuth] auth-status: could not parse expiry={expiry!r}: {e}")
            is_expired = False
    
    if is_expired:
        if token_doc.get("refresh_token"):
            logger.info("[YouTube OAuth] auth-status: token expired but has refresh_token -> still authenticated")
            return {
                "authenticated": True,
                "needs_refresh": True,
                "account_email": token_doc.get("account_email"),
                "channel_title": token_doc.get("channel_title")
            }
        logger.info("[YouTube OAuth] auth-status: token expired and NO refresh_token -> authenticated=False")
        return {"authenticated": False, "message": "Token expired"}
    
    logger.info(
        f"[YouTube OAuth] auth-status: authenticated=True channel={token_doc.get('channel_title')} "
        f"email={token_doc.get('account_email')} has_refresh={bool(token_doc.get('refresh_token'))}"
    )
    
    # Get last import anchor (raw, unmodified reference for next cutoff)
    last_anchor = await db.youtube_last_imported.find_one(
        {"type": "last_anchor"},
        {"_id": 0}
    )
    
    return {
        "authenticated": True,
        "account_email": token_doc.get("account_email"),
        "channel_title": token_doc.get("channel_title"),
        "last_anchor": last_anchor  # None if no import yet
    }


@api_router.get("/youtube/auth-url")
async def youtube_get_auth_url(redirect_uri: str):
    """Generate YouTube OAuth authorization URL"""
    settings = await get_settings()
    
    if not settings.youtube_client_id or not settings.youtube_client_secret:
        raise HTTPException(
            status_code=400, 
            detail="Configura las credenciales de YouTube en Ajustes primero"
        )
    
    client_config = {
        "web": {
            "client_id": settings.youtube_client_id,
            "client_secret": settings.youtube_client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [redirect_uri]
        }
    }
    
    flow = Flow.from_client_config(
        client_config,
        scopes=YOUTUBE_SCOPES,
        redirect_uri=redirect_uri,
        autogenerate_code_verifier=False
    )
    
    auth_url, state = flow.authorization_url(
        access_type='offline',
        prompt='consent select_account',
        include_granted_scopes='true'
    )
    
    logger.info(f"[YouTube OAuth] Generated auth URL with redirect_uri={redirect_uri}, state={state}")
    
    # Store state for later verification
    await db.youtube_oauth_states.insert_one({
        "state": state,
        "redirect_uri": redirect_uri,
        "created_at": datetime.now(timezone.utc)
    })
    
    return {"auth_url": auth_url, "state": state}


@api_router.post("/youtube/callback")
async def youtube_oauth_callback(data: YouTubeAuthCallback):
    """Handle OAuth callback and store tokens"""
    settings = await get_settings()
    
    if not settings.youtube_client_id or not settings.youtube_client_secret:
        raise HTTPException(status_code=400, detail="YouTube credentials not configured")
    
    client_config = {
        "web": {
            "client_id": settings.youtube_client_id,
            "client_secret": settings.youtube_client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [data.redirect_uri]
        }
    }
    
    try:
        flow = Flow.from_client_config(
            client_config,
            scopes=YOUTUBE_SCOPES,
            redirect_uri=data.redirect_uri,
            autogenerate_code_verifier=False
        )
        
        flow.fetch_token(code=data.code)
        credentials = flow.credentials
        
        # Get channel info to identify the account
        youtube = build('youtube', 'v3', credentials=credentials, cache_discovery=False)
        channels_response = youtube.channels().list(
            part='snippet',
            mine=True
        ).execute()
        
        channel_title = None
        account_email = None
        if channels_response.get('items'):
            channel_title = channels_response['items'][0]['snippet'].get('title')
        
        # Try to get user info from Google
        try:
            from google.oauth2 import id_token
            from google.auth.transport import requests
            # Get user email from token info
            token_info_url = f"https://oauth2.googleapis.com/tokeninfo?access_token={credentials.token}"
            import urllib.request
            with urllib.request.urlopen(token_info_url) as response:
                import json
                token_info = json.loads(response.read().decode())
                account_email = token_info.get('email')
        except Exception as e:
            logger.warning(f"Could not get email from token: {e}")
        
        # Normalize expiry to UTC-aware ISO string.
        # google-auth returns credentials.expiry as naive UTC datetime.
        expiry_iso = None
        if credentials.expiry:
            exp = credentials.expiry
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            expiry_iso = exp.isoformat()
        
        # Store tokens in MongoDB
        token_data = {
            "type": "user_token",
            "token": credentials.token,
            "refresh_token": credentials.refresh_token,
            "token_uri": credentials.token_uri,
            "client_id": credentials.client_id,
            "client_secret": credentials.client_secret,
            "scopes": list(credentials.scopes) if credentials.scopes else [],
            "expiry": expiry_iso,
            "account_email": account_email,
            "channel_title": channel_title,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        # Upsert the token
        await db.youtube_tokens.update_one(
            {"type": "user_token"},
            {"$set": token_data},
            upsert=True
        )
        
        logger.info(
            f"[YouTube OAuth] Token stored. channel={channel_title} email={account_email} "
            f"has_refresh_token={bool(credentials.refresh_token)} expiry={expiry_iso}"
        )
        
        return {
            "success": True, 
            "message": "YouTube conectado exitosamente",
            "channel_title": channel_title,
            "account_email": account_email
        }
        
    except Exception as e:
        logger.error(f"OAuth callback error: {e}")
        raise HTTPException(status_code=400, detail=f"Error de autenticación: {str(e)}")


async def get_youtube_service():
    """Get authenticated YouTube service"""
    token_doc = await db.youtube_tokens.find_one({"type": "user_token"})
    
    if not token_doc:
        logger.warning("[YouTube OAuth] get_youtube_service: no token doc in DB")
        raise HTTPException(status_code=401, detail="YouTube no conectado")
    
    logger.info(
        f"[YouTube OAuth] get_youtube_service: loaded token "
        f"channel={token_doc.get('channel_title')} has_refresh={bool(token_doc.get('refresh_token'))}"
    )
    
    # Parse expiry robustly (support both naive legacy and aware)
    expiry_dt = None
    expiry_raw = token_doc.get("expiry")
    if expiry_raw:
        try:
            expiry_dt = datetime.fromisoformat(expiry_raw) if isinstance(expiry_raw, str) else expiry_raw
            # google-auth Credentials expects a naive UTC datetime for expiry
            if expiry_dt.tzinfo is not None:
                expiry_dt = expiry_dt.astimezone(timezone.utc).replace(tzinfo=None)
        except Exception as e:
            logger.warning(f"[YouTube OAuth] could not parse stored expiry={expiry_raw!r}: {e}")
            expiry_dt = None
    
    credentials = Credentials(
        token=token_doc["token"],
        refresh_token=token_doc.get("refresh_token"),
        token_uri=token_doc.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id=token_doc.get("client_id"),
        client_secret=token_doc.get("client_secret"),
        scopes=token_doc.get("scopes", []),
        expiry=expiry_dt,
    )
    
    # Refresh if expired
    if credentials.expired:
        if not credentials.refresh_token:
            logger.warning("[YouTube OAuth] token expired and NO refresh_token stored -> need reconnect")
            raise HTTPException(
                status_code=401,
                detail="Token de YouTube expirado y sin refresh_token. Vuelve a conectar la cuenta en Configuración."
            )
        from google.auth.transport.requests import Request
        logger.info("[YouTube OAuth] token expired, refreshing...")
        credentials.refresh(Request())
        
        new_expiry_iso = None
        if credentials.expiry:
            exp = credentials.expiry if credentials.expiry.tzinfo else credentials.expiry.replace(tzinfo=timezone.utc)
            new_expiry_iso = exp.isoformat()
        
        # Update stored token
        await db.youtube_tokens.update_one(
            {"type": "user_token"},
            {"$set": {
                "token": credentials.token,
                "expiry": new_expiry_iso,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        logger.info(f"[YouTube OAuth] token refreshed, new expiry={new_expiry_iso}")
    
    return build('youtube', 'v3', credentials=credentials, cache_discovery=False)


@api_router.post("/youtube/fetch-comments")
async def youtube_fetch_comments(request: YouTubeFetchRequest):
    """Fetch comments from YouTube channel videos within date range"""
    try:
        youtube = await get_youtube_service()
        
        # Parse dates
        fecha_desde = datetime.fromisoformat(request.fecha_desde.replace('Z', '+00:00'))
        fecha_hasta = datetime.fromisoformat(request.fecha_hasta.replace('Z', '+00:00'))
        
        # Add time to make it end of day
        fecha_hasta = fecha_hasta.replace(hour=23, minute=59, second=59)
        
        # Ensure UTC-aware, then format as RFC 3339 with Z suffix for YouTube API
        if fecha_desde.tzinfo is None:
            fecha_desde = fecha_desde.replace(tzinfo=timezone.utc)
        else:
            fecha_desde = fecha_desde.astimezone(timezone.utc)
        if fecha_hasta.tzinfo is None:
            fecha_hasta = fecha_hasta.replace(tzinfo=timezone.utc)
        else:
            fecha_hasta = fecha_hasta.astimezone(timezone.utc)
        
        published_after = fecha_desde.strftime('%Y-%m-%dT%H:%M:%SZ')
        published_before = fecha_hasta.strftime('%Y-%m-%dT%H:%M:%SZ')
        
        logger.info(f"[YouTube] Fetching videos publishedAfter={published_after} publishedBefore={published_before}")
        
        # Get authenticated user's channel
        channels_response = youtube.channels().list(
            part='id,snippet',
            mine=True
        ).execute()
        
        if not channels_response.get('items'):
            raise HTTPException(status_code=404, detail="No se encontró tu canal de YouTube")
        
        channel_id = channels_response['items'][0]['id']
        channel_title = channels_response['items'][0]['snippet']['title']
        logger.info(f"Found channel: {channel_title} ({channel_id})")
        
        # Get videos from the channel within date range
        videos = []
        next_page_token = None
        
        while True:
            search_response = youtube.search().list(
                part='id,snippet',
                channelId=channel_id,
                type='video',
                publishedAfter=published_after,
                publishedBefore=published_before,
                maxResults=50,
                pageToken=next_page_token,
                order='date'
            ).execute()
            
            for item in search_response.get('items', []):
                videos.append({
                    'id': item['id']['videoId'],
                    'title': item['snippet']['title'],
                    'published_at': item['snippet']['publishedAt']
                })
            
            next_page_token = search_response.get('nextPageToken')
            if not next_page_token:
                break
        
        logger.info(f"Found {len(videos)} videos in date range")
        
        # Resolve cutoff: ONLY manual `texto_corte` is honored (explicit user action).
        # The stored anchor is NOT used as automatic cutoff — date range always prevails.
        # Deduplication of already-imported comments is handled at DB level by youtube_comment_id.
        cutoff_text_normalized = None
        
        def _normalize_for_match(s: str) -> str:
            if not s:
                return ""
            stripped = re.sub(r'<[^>]+>', ' ', s)
            stripped = re.sub(r'\s+', ' ', stripped).strip().lower()
            return stripped
        
        if request.texto_corte and request.texto_corte.strip():
            cutoff_text_normalized = _normalize_for_match(request.texto_corte)
            logger.info(f"[YouTube] Using manual text cutoff (normalized len={len(cutoff_text_normalized)})")
        elif request.empezar_desde_ultimo:
            logger.info("[YouTube] empezar_desde_ultimo=True IGNORED — date range always prevails, dedup handled by comment_id")
        
        # Fetch comments for each video
        all_comments = []
        greetings_filtered = 0
        stop_fetching = False
        
        for video in videos:
            if stop_fetching:
                break
                
            logger.info(f"Fetching comments for video: {video['title']}")
            next_page_token = None
            
            while True:
                if stop_fetching:
                    break
                    
                try:
                    comments_response = youtube.commentThreads().list(
                        part='snippet',
                        videoId=video['id'],
                        maxResults=100,
                        pageToken=next_page_token,
                        order='time'  # API only supports newest-first; we reverse later
                    ).execute()
                    
                    for item in comments_response.get('items', []):
                        comment = item['snippet']['topLevelComment']['snippet']
                        comment_id = item['id']
                        
                        username = comment.get('authorDisplayName', '')
                        text = comment.get('textDisplay', '')
                        
                        # Cutoff ONLY by manual text match (explicit user action)
                        if cutoff_text_normalized:
                            normalized_comment = _normalize_for_match(text)
                            if (normalized_comment == cutoff_text_normalized or
                                (len(cutoff_text_normalized) >= 10 and cutoff_text_normalized in normalized_comment)):
                                logger.info(f"[YouTube] Found cutoff by text match: {comment_id}")
                                stop_fetching = True
                                break
                        
                        # Filter greetings using existing function
                        if is_greeting(text):
                            greetings_filtered += 1
                            continue
                        
                        all_comments.append({
                            'comment_id': comment_id,
                            'youtube_username': f"@{username.replace('@', '')}",
                            'raw_username': username,  # exact value from YouTube
                            'text': text,
                            'video_id': video['id'],
                            'video_title': video['title'],
                            'published_at': comment.get('publishedAt'),
                            'author_channel_id': comment.get('authorChannelId', {}).get('value')
                        })
                    
                    next_page_token = comments_response.get('nextPageToken')
                    if not next_page_token:
                        break
                        
                except HttpError as e:
                    if 'commentsDisabled' in str(e):
                        logger.info(f"Comments disabled for video: {video['title']}")
                        break
                    raise
        
        logger.info(f"Total comments fetched: {len(all_comments)}, greetings filtered: {greetings_filtered}")
        
        # Save last-imported anchor (RAW, unmodified) and import history if we have comments
        if all_comments:
            # all_comments is newest-first (from YouTube API order='time').
            # The newest = the anchor for next import.
            newest_comment = all_comments[0]
            
            anchor_doc = {
                "type": "last_anchor",
                "comment_id": newest_comment['comment_id'],
                "raw_text": newest_comment['text'],              # EXACT text from YouTube
                "raw_username": newest_comment['raw_username'],  # EXACT username from YouTube
                "comment_published_at": newest_comment['published_at'],  # EXACT date from YouTube
                "imported_at": datetime.now(timezone.utc).isoformat(),
                "video_id": newest_comment['video_id'],
                "video_title": newest_comment['video_title']
            }
            
            # Upsert single "last_anchor" document — overwrites previous on each import
            await db.youtube_last_imported.update_one(
                {"type": "last_anchor"},
                {"$set": anchor_doc},
                upsert=True
            )
            logger.info(
                f"[YouTube] Saved last_anchor: id={anchor_doc['comment_id']} "
                f"user={anchor_doc['raw_username']} date={anchor_doc['comment_published_at']}"
            )
            
            # Also keep history log
            await db.youtube_imports.insert_one({
                "created_at": datetime.now(timezone.utc),
                "fecha_desde": fecha_desde,
                "fecha_hasta": fecha_hasta,
                "videos_count": len(videos),
                "comments_count": len(all_comments),
                "greetings_filtered": greetings_filtered,
                "last_comment_id": newest_comment['comment_id'],
                "last_comment_text": newest_comment['text'],
                "channel_id": channel_id,
                "channel_title": channel_title
            })
        
        # Reverse to oldest→newest for the caller (UI/import pipeline)
        all_comments.reverse()
        
        return {
            "success": True,
            "channel": channel_title,
            "videos_count": len(videos),
            "comments_count": len(all_comments),
            "greetings_filtered": greetings_filtered,
            "comments": all_comments,
            "last_comment_id": all_comments[-1]['comment_id'] if all_comments else None
        }
        
    except HttpError as e:
        logger.error(f"YouTube API error: {e}")
        if 'quotaExceeded' in str(e):
            raise HTTPException(status_code=429, detail="Cuota de API de YouTube excedida")
        raise HTTPException(status_code=400, detail=f"Error de API de YouTube: {str(e)}")
    except Exception as e:
        logger.error(f"Error fetching comments: {e}")
        raise HTTPException(status_code=500, detail=f"Error al obtener comentarios: {str(e)}")


class YouTubeImportCommentsRequest(BaseModel):
    comments: List[Dict]


@api_router.post("/youtube/import-comments")
async def youtube_import_comments(request: YouTubeImportCommentsRequest):
    """Import a list of YouTube comments into the DB, deduplicating by youtube_comment_id.
    
    For each comment:
    - If a Question with the same youtube_comment_id already exists → update text + username (keeps existing clasificacion, corrections, real_name, batch_id).
    - If not → create a new Question inside a fresh import batch.
    
    Only returns a batch_id if at least one NEW question was created.
    """
    if not request.comments:
        return {"batch_id": None, "questions_imported": 0, "questions_updated": 0, "total": 0}
    
    now = datetime.now(timezone.utc)
    batch_id: Optional[str] = None
    batch_doc: Optional[Dict] = None
    
    imported_count = 0
    updated_count = 0
    blocked_count = 0
    
    for c in request.comments:
        yt_id = c.get("comment_id")
        if not yt_id:
            continue
        
        text = clean_html_to_plain_text((c.get("text") or "").strip())
        username = c.get("youtube_username") or ""
        if not text or not username:
            continue
        
        # Skip blocked comments entirely (same user + similar text)
        blocked_match = await is_blocked_comment(username, text)
        if blocked_match:
            blocked_count += 1
            logger.info(
                f"[BlockedComment] Skipped import: user={username} yt_id={yt_id} "
                f"similarity={blocked_match.get('similarity')} motivo={blocked_match.get('motivo')!r}"
            )
            # If it somehow already exists in DB (from a previous import), remove it
            await db.questions.delete_one({"youtube_comment_id": yt_id})
            continue
        
        existing = await db.questions.find_one(
            {"youtube_comment_id": yt_id},
            {"_id": 0, "id": 1}
        )
        
        if existing:
            await db.questions.update_one(
                {"youtube_comment_id": yt_id},
                {"$set": {
                    "original_text": text,
                    "youtube_username": username
                }}
            )
            updated_count += 1
        else:
            # Lazy-create the batch on first new question
            if batch_id is None:
                batch = ImportBatch(question_count=0)
                batch_id = batch.id
                batch_doc = batch.model_dump()
                batch_doc['created_at'] = serialize_datetime(batch_doc['created_at'])
                await db.import_batches.insert_one(batch_doc)
            
            real_name = await get_real_name(username)
            if not real_name:
                real_name = await extract_display_name(username)
            
            question = Question(
                youtube_username=username,
                youtube_comment_id=yt_id,
                real_name=real_name,
                original_text=text,
                import_batch_id=batch_id
            )
            doc = question.model_dump()
            doc['created_at'] = serialize_datetime(doc['created_at'])
            await db.questions.insert_one(doc)
            imported_count += 1
    
    # Update batch question_count if a batch was created
    if batch_id and imported_count > 0:
        await db.import_batches.update_one(
            {"id": batch_id},
            {"$set": {"question_count": imported_count}}
        )
    
    logger.info(
        f"[YouTube] import-comments: {imported_count} new, {updated_count} updated, "
        f"{blocked_count} blocked (batch_id={batch_id})"
    )
    
    return {
        "batch_id": batch_id,
        "questions_imported": imported_count,
        "questions_updated": updated_count,
        "blocked_count": blocked_count,
        "total": imported_count + updated_count
    }



@api_router.delete("/youtube/disconnect")
async def youtube_disconnect():
    """Disconnect YouTube account"""
    await db.youtube_tokens.delete_many({"type": "user_token"})
    return {"success": True, "message": "YouTube desconectado"}


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def seed_default_blocked_comments():
    """Seed the blocked-comments collection with the default entry if not present."""
    DEFAULT_BLOCKED = {
        "youtube_username": "@allenvarelamontenegro9329",
        "texto_referencia": "Saludos pastor Samuel Perez Millos Dios Soberano lo proteja y bendiga",
        "motivo": "Comentario recurrente semanal"
    }
    try:
        existing = await db.comentarios_bloqueados.find_one(
            {"youtube_username": DEFAULT_BLOCKED["youtube_username"]}
        )
        if not existing:
            doc = BlockedComment(**DEFAULT_BLOCKED).model_dump()
            doc['created_at'] = serialize_datetime(doc['created_at'])
            await db.comentarios_bloqueados.insert_one(doc)
            logger.info(f"[BlockedComment] seeded default entry for {DEFAULT_BLOCKED['youtube_username']}")
    except Exception as e:
        logger.error(f"[BlockedComment] seed failed: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
