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

def parse_comments(raw_text: str) -> List[Dict[str, str]]:
    """Parse raw text into individual comments with usernames or real names
    
    Supported formats:
    - @username Texto del comentario
    - Nombre Real: Texto del comentario
    - Nombre Real - Texto del comentario
    """
    comments = []
    lines = raw_text.strip().split('\n')
    
    current_identifier = None
    current_is_username = False
    current_text = []
    
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
                comments.append({
                    "youtube_username": current_identifier if current_is_username else f"@{current_identifier.lower().replace(' ', '_')}",
                    "original_text": '\n'.join(current_text).strip(),
                    "real_name": None if current_is_username else current_identifier
                })
            current_identifier = username_match.group(1)
            current_is_username = True
            rest = username_match.group(2).strip()
            current_text = [rest] if rest else []
        elif realname_match:
            # Save previous comment
            if current_identifier and current_text:
                comments.append({
                    "youtube_username": current_identifier if current_is_username else f"@{current_identifier.lower().replace(' ', '_')}",
                    "original_text": '\n'.join(current_text).strip(),
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
        comments.append({
            "youtube_username": current_identifier if current_is_username else f"@{current_identifier.lower().replace(' ', '_')}",
            "original_text": '\n'.join(current_text).strip(),
            "real_name": None if current_is_username else current_identifier
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
            system_message="Eres un corrector de textos en español de España. Tu tarea es corregir errores gramaticales, ortográficos y de puntuación, manteniendo el sentido original del texto. No cambies el contenido ni añadas información. Devuelve SOLO el texto corregido sin explicaciones."
        )
        
        if provider == "openai":
            chat.with_model("openai", "gpt-5.2")
        elif provider == "anthropic":
            chat.with_model("anthropic", "claude-sonnet-4-5-20250929")
        elif provider == "gemini":
            chat.with_model("gemini", "gemini-3-flash-preview")
        
        user_message = UserMessage(text=f"Corrige el siguiente texto:\n\n{text}")
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
            text_to_correct = question.get("original_text", "")
            corrected_text = await correct_text_with_ai(text_to_correct, settings.llm_provider)
            
            await db.questions.update_one(
                {"id": qid},
                {"$set": {"corrected_text": corrected_text, "is_corrected": True}}
            )
            corrected.append({"id": qid, "corrected_text": corrected_text})
    
    return {"corrected": corrected}

@api_router.post("/questions/correct-all/{batch_id}")
async def correct_all_questions(batch_id: str):
    """Correct all questions in a batch"""
    questions = await db.questions.find(
        {"import_batch_id": batch_id, "is_greeting": {"$ne": True}},
        {"_id": 0}
    ).to_list(500)
    
    settings = await get_settings()
    corrected = []
    
    for question in questions:
        if not question.get("is_corrected"):
            text_to_correct = question.get("original_text", "")
            corrected_text = await correct_text_with_ai(text_to_correct, settings.llm_provider)
            
            await db.questions.update_one(
                {"id": question["id"]},
                {"$set": {"corrected_text": corrected_text, "is_corrected": True}}
            )
            corrected.append({"id": question["id"], "corrected_text": corrected_text})
    
    return {"corrected_count": len(corrected), "corrected": corrected}

# ----- DUPLICATES -----

@api_router.post("/questions/check-duplicates/{batch_id}")
async def check_duplicates(batch_id: str):
    """Check for duplicate questions in batch and history"""
    questions = await db.questions.find(
        {"import_batch_id": batch_id, "is_greeting": {"$ne": True}},
        {"_id": 0}
    ).to_list(500)
    
    duplicates_found = []
    texts_in_batch = {}
    
    for q in questions:
        text = (q.get("corrected_text") or q.get("original_text", "")).lower().strip()
        
        # Check within batch
        if text in texts_in_batch:
            await db.questions.update_one(
                {"id": q["id"]},
                {"$set": {"is_duplicate": True, "duplicate_of": texts_in_batch[text]}}
            )
            duplicates_found.append({
                "question_id": q["id"],
                "duplicate_of": texts_in_batch[text],
                "type": "in_batch"
            })
        else:
            texts_in_batch[text] = q["id"]
            
            # Check in history
            history_dup = await check_duplicate_in_history(text, q["id"])
            if history_dup:
                await db.questions.update_one(
                    {"id": q["id"]},
                    {"$set": {"is_duplicate": True, "duplicate_of": history_dup["id"]}}
                )
                duplicates_found.append({
                    "question_id": q["id"],
                    "duplicate_of": history_dup["id"],
                    "type": "in_history"
                })
    
    return {"duplicates_count": len(duplicates_found), "duplicates": duplicates_found}

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
