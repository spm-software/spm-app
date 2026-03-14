from fastapi import FastAPI, APIRouter, HTTPException, Query
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
from bson import ObjectId

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
    real_name: Optional[str] = None
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

class QuestionCreate(BaseModel):
    youtube_username: str
    original_text: str

class QuestionUpdate(BaseModel):
    original_text: Optional[str] = None
    corrected_text: Optional[str] = None
    is_greeting: Optional[bool] = None
    is_duplicate: Optional[bool] = None
    real_name: Optional[str] = None

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
    common_starts = ['tengo', 'sobre', 'cuando', 'como', 'que', 'cual', 'donde', 'por', 'si', 'en', 'de', 'la', 'el', 'un', 'una', 'mi', 'me']
    def is_name_colon_format(line):
        match = re.match(r'^([A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ\s\.]+?):\s', line.strip())
        if match:
            name_part = match.group(1).strip().lower()
            # Name should be short and not start with common words
            if len(name_part) < 40 and not any(name_part.startswith(w) for w in common_starts):
                return True
        return False
    
    has_colon_names = any(is_name_colon_format(line) for line in lines if line.strip())
    
    if not has_at_usernames and not has_colon_names and len(blank_line_indices) > 2:
        # Use Format 4: Name on one line, text on next lines, separated by blank lines
        return parse_comments_format4(raw_text)
    
    # Original parsing logic for formats 1, 2, 3
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        # Check if line starts with @username
        username_match = re.match(r'^(@[\w\-\.]+)\s*(.*)', line)
        # Check if line starts with "Name:" or "Name -" format
        realname_match = re.match(r'^([A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ\s]+?)(?::|[-–—])\s*(.*)', line)
        
        if username_match:
            # Save previous comment
            if current_identifier and current_text:
                clean_text = clean_youtube_metadata('\n'.join(current_text).strip())
                comments.append({
                    "youtube_username": current_identifier if current_is_username else f"@{current_identifier.lower().replace(' ', '_')}",
                    "original_text": clean_text,
                    "real_name": None if current_is_username else current_identifier
                })
            current_identifier = username_match.group(1)
            current_is_username = True
            rest = username_match.group(2).strip()
            current_text = [rest] if rest else []
        elif realname_match:
            # Save previous comment
            if current_identifier and current_text:
                clean_text = clean_youtube_metadata('\n'.join(current_text).strip())
                comments.append({
                    "youtube_username": current_identifier if current_is_username else f"@{current_identifier.lower().replace(' ', '_')}",
                    "original_text": clean_text,
                    "real_name": None if current_is_username else current_identifier
                })
            current_identifier = realname_match.group(1).strip()
            current_is_username = False
            rest = realname_match.group(2).strip()
            current_text = [rest] if rest else []
        elif current_identifier:
            current_text.append(line)
    
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
    """Parse format where name is alone on a line, followed by question text on next line(s).
    Questions are separated by one or more blank lines.
    
    Example:
    Fue por tu gracia
    Muy amado pastor, hace algunos meses...
    Agradecería mucho su orientación.
    
    
    José Quispe Ascate
    ¿Podemos cantar "Señor, te exaltamos"...
    """
    comments = []
    
    # Split by one or more blank lines (handles both single and double blank lines)
    blocks = re.split(r'\n\s*\n+', raw_text.strip())
    
    for block in blocks:
        block = block.strip()
        if not block:
            continue
        
        lines = block.split('\n')
        if len(lines) < 1:
            continue
            
        # First line should be the name
        first_line = lines[0].strip()
        
        # Skip if first line looks like a question (starts with ¿ or has ? early) or is too long
        if first_line.startswith('¿') or len(first_line) > 100:
            continue
        
        # Check if first line looks like a name (not too long, no question marks, capitalized)
        # Names are typically under 50 chars and don't have question marks
        if '?' in first_line or len(first_line) > 60:
            continue
            
        # Name should start with a capital letter or be a short phrase
        if not first_line[0].isupper() and not first_line[0].isdigit():
            continue
        
        name = first_line
        
        # Rest is the question text
        if len(lines) > 1:
            text = '\n'.join(line.strip() for line in lines[1:]).strip()
        else:
            # Only name, no text - skip this block
            continue
        
        if text:
            clean_text = clean_youtube_metadata(text)
            # Generate a username from the name
            username = '@' + re.sub(r'[^a-záéíóúñA-ZÁÉÍÓÚÑ0-9]', '', name.lower().replace(' ', ''))
            
            comments.append({
                "youtube_username": username,
                "original_text": clean_text,
                "real_name": name
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
        original_text=data.original_text
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
    result = await db.questions.delete_one({"id": question_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Pregunta no encontrada")
    return {"message": "Pregunta eliminada"}

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
            original_text=comment["original_text"],
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
    """Get list of questions to correct (does not correct them, just returns IDs)"""
    questions = await db.questions.find(
        {
            "import_batch_id": batch_id, 
            "is_greeting": {"$ne": True},
            "is_corrected": {"$ne": True}
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

# ----- DUPLICATES -----

@api_router.post("/questions/check-duplicates/{batch_id}")
async def check_duplicates(batch_id: str):
    """Check for duplicate questions in batch and ALL history, accent and case insensitive"""
    questions = await db.questions.find(
        {"import_batch_id": batch_id, "is_greeting": {"$ne": True}},
        {"_id": 0}
    ).to_list(500)
    
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
                            "created_at": q.get("created_at")
                        },
                        "original_question": {
                            "id": original_q["id"],
                            "username": original_q.get("youtube_username"),
                            "real_name": original_q.get("real_name"),
                            "text": original_q.get("corrected_text") or original_q.get("original_text"),
                            "created_at": original_q.get("created_at")
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
                                "created_at": q.get("created_at")
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
    """Update all question names from stored user mappings"""
    questions = await db.questions.find(
        {"import_batch_id": batch_id},
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
    """Distribute questions into programs following the rules"""
    questions = await db.questions.find(
        {
            "import_batch_id": data.batch_id,
            "is_greeting": {"$ne": True},
            "is_duplicate": {"$ne": True}
        },
        {"_id": 0}
    ).sort("created_at", 1).to_list(500)
    
    if not questions:
        raise HTTPException(status_code=400, detail="No hay preguntas para distribuir")
    
    settings = await get_settings()
    max_per_user = settings.max_questions_per_user_per_program
    num_programs = data.num_programs
    
    # Delete existing programs for this batch
    await db.programs.delete_many({"batch_id": data.batch_id})
    
    # Create programs
    programs = []
    for i in range(num_programs):
        program = Program(
            name=f"Programa {i + 1}",
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
    programs.append(reserve)
    
    # Group questions by user
    user_questions: Dict[str, List[dict]] = {}
    for q in questions:
        username = q["youtube_username"]
        if username not in user_questions:
            user_questions[username] = []
        user_questions[username].append(q)
    
    # Track user questions per program
    user_count_per_program: Dict[str, Dict[int, int]] = {u: {} for u in user_questions}
    program_questions: Dict[str, List] = {p.id: [] for p in programs}
    
    # Target questions per program (excluding reserve)
    total_questions = len(questions)
    target_per_program = total_questions // num_programs
    
    # Distribute questions
    for username, user_qs in user_questions.items():
        question_idx = 0
        for q in user_qs:
            assigned = False
            
            # Try to assign to regular programs
            for prog_idx in range(num_programs):
                program = programs[prog_idx]
                
                # Check if user already has max questions in this program
                user_count = user_count_per_program[username].get(prog_idx, 0)
                if user_count >= max_per_user:
                    continue
                
                # Check if program is not too full
                if len(program_questions[program.id]) < target_per_program + 2:
                    # Assign question
                    await db.questions.update_one(
                        {"id": q["id"]},
                        {"$set": {
                            "program_id": program.id,
                            "program_number": program.number,
                            "order_in_program": len(program_questions[program.id]) + 1
                        }}
                    )
                    program_questions[program.id].append(q["id"])
                    user_count_per_program[username][prog_idx] = user_count + 1
                    assigned = True
                    break
            
            # If not assigned, put in reserve
            if not assigned:
                await db.questions.update_one(
                    {"id": q["id"]},
                    {"$set": {
                        "program_id": reserve.id,
                        "program_number": reserve.number,
                        "order_in_program": len(program_questions[reserve.id]) + 1
                    }}
                )
                program_questions[reserve.id].append(q["id"])
            
            question_idx += 1
    
    # Update program question counts
    for program in programs:
        count = len(program_questions[program.id])
        await db.programs.update_one(
            {"id": program.id},
            {"$set": {"question_count": count}}
        )
    
    # Mark batch as distributed
    await db.import_batches.update_one(
        {"id": data.batch_id},
        {"$set": {"is_distributed": True, "num_programs": num_programs}}
    )
    
    return {
        "programs_created": len(programs),
        "distribution": {p.name: len(program_questions[p.id]) for p in programs}
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

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
