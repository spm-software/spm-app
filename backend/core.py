import html
import os
import re
import unicodedata
from datetime import datetime
from typing import Dict, List, Optional


DEFAULT_AI_MODEL = os.environ.get("AI_MODEL", "gpt-5.4-mini")

OPENAI_MODEL_ALIASES = {
    "openai": DEFAULT_AI_MODEL,
    "gpt-5.4-mini": "gpt-5.4-mini",
    "gpt-5.4": "gpt-5.4",
    "gpt-5.2": "gpt-5.2",
    "gpt-4o": "gpt-4o",
    "gpt-4o-mini": "gpt-4o-mini",
}


def serialize_datetime(obj):
    if isinstance(obj, datetime):
        return obj.isoformat()
    return obj


def deserialize_datetime(obj):
    if isinstance(obj, str):
        try:
            return datetime.fromisoformat(obj)
        except ValueError:
            return obj
    return obj


def normalize_text(text: str) -> str:
    if not text:
        return ""
    normalized = unicodedata.normalize("NFD", text.lower())
    return "".join(c for c in normalized if unicodedata.category(c) != "Mn")


async def extract_display_name(youtube_username: str) -> str:
    clean_name = youtube_username.lstrip("@")
    name_parts = re.sub(r"[-_]", " ", clean_name)
    name_parts = re.sub(r"\d+$", "", name_parts)
    if name_parts.strip():
        return " ".join(word.capitalize() for word in name_parts.split())
    return clean_name


def is_greeting(text: str) -> bool:
    if not text:
        return True

    text_lower = text.lower().strip()
    if len(text_lower) < 15:
        return True

    greeting_patterns = [
        r"^(hola|buenos días|buenas tardes|buenas noches|saludos|bendiciones)",
        r"^(gracias|muchas gracias|mil gracias)",
        r"^(felicidades|felicitaciones|enhorabuena)",
        r"^(excelente|muy bien|genial|increíble|maravilloso)",
        r"^(dios te bendiga|dios los bendiga|bendiciones)",
        r"^(amen|amén)$",
        r"^(primera|primero|segundo|segundo vez).*!?$",
        r"^(like|me gusta|me encanta).*$",
    ]

    for pattern in greeting_patterns:
        if re.match(pattern, text_lower):
            if "?" in text:
                return False
            if len(text_lower) > 50:
                return False
            return True

    if "?" not in text and len(text_lower) < 30:
        starters = ["gracias", "bendiciones", "saludos", "hola", "amén", "amen"]
        if any(text_lower.startswith(s) for s in starters):
            return True

    return False


def clean_html_to_plain_text(text: str) -> str:
    if not text:
        return text

    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def normalize_username(username: str) -> str:
    return (username or "").lstrip("@").strip().lower()


def normalize_for_similarity(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def clean_youtube_metadata(text: str) -> str:
    spanish_units = r"(minutos?|horas?|días?|semanas?|meses|mes|años?)"
    english_units = r"(minutes?|hours?|days?|weeks?|months?|years?)"

    patterns = [
        rf"•\s*Hace\s+\d+\s+{spanish_units}\s*",
        rf"•\s*\d+\s+{english_units}\s+ago\s*",
        rf"^\s*Hace\s+\d+\s+{spanish_units}\s*",
        rf"^\s*\d+\s+{english_units}\s+ago\s*",
        r"\(editado\)",
        r"\(edited\)",
        r"Se suscribió a tu canal de forma pública\s*\([^)]*\)\s*",
        r"Se suscribió a tu canal\s*\([^)]*\)\s*",
        r"Se suscribió a tu canal de forma pública\s*",
        r"Se suscribió a tu canal\s*",
        r"Miembro desde hace\s+\d+\s+{spanish_units}\s*".format(spanish_units=spanish_units),
        r"Suscriptor desde hace\s+\d+\s+{spanish_units}\s*".format(spanish_units=spanish_units),
        r"Member for\s+\d+\s+{english_units}\s*".format(english_units=english_units),
    ]

    cleaned = text
    for pattern in patterns:
        cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE | re.MULTILINE)

    return re.sub(r"^\s*\n", "", cleaned).strip()


def parse_comments(raw_text: str) -> List[Dict[str, Optional[str]]]:
    comments = []
    lines = raw_text.strip().split("\n")

    current_identifier = None
    current_is_username = False
    current_text = []

    blank_line_indices = [i for i, line in enumerate(lines) if not line.strip()]
    has_at_usernames = any(re.match(r"^@[\w\-\.]+", line.strip()) for line in lines if line.strip())

    common_starts = [
        "tengo", "sobre", "cuando", "como", "que", "cual", "donde", "por",
        "si", "en", "de", "la", "el", "un", "una", "mi", "me", "pregunta",
        "jesucristo", "dios", "pastor", "estimado", "querido",
    ]

    def is_name_colon_format(line):
        match = re.match(r"^([A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ\s\.]+?):\s", line.strip())
        if not match:
            return False
        name_part = match.group(1).strip().lower()
        return (
            len(name_part) < 40
            and len(name_part.split()) <= 4
            and not any(name_part.startswith(w) for w in common_starts)
        )

    has_colon_names = any(is_name_colon_format(line) for line in lines if line.strip())
    blank_ratio = len(blank_line_indices) / len(lines) if lines else 0

    if not has_at_usernames and (not has_colon_names or blank_ratio > 0.2) and len(blank_line_indices) > 10:
        return parse_comments_format4(raw_text)

    for line in lines:
        line = line.strip()
        if not line:
            continue

        username_match = re.match(r"^(@[\w\-\.]+)", line)

        if username_match:
            if current_identifier and current_text:
                clean_text = clean_youtube_metadata("\n".join(current_text).strip())
                if clean_text:
                    comments.append({
                        "youtube_username": current_identifier if current_is_username else f"@{current_identifier.lower().replace(' ', '_')}",
                        "original_text": clean_text,
                        "real_name": None if current_is_username else current_identifier,
                    })

            current_identifier = username_match.group(1)
            current_is_username = True
            rest_of_line = line[len(current_identifier):].strip()
            rest_of_line = re.sub(
                r"^•\s*(hace\s+)?\d+\s*(minutos?|horas?|días?|semanas?|meses?|años?)\s*",
                "",
                rest_of_line,
                flags=re.IGNORECASE,
            )
            rest_of_line = re.sub(r"^\(editado\)\s*", "", rest_of_line, flags=re.IGNORECASE)
            current_text = [rest_of_line.strip()] if rest_of_line.strip() else []
        elif current_identifier:
            current_text.append(line)
        else:
            realname_match = re.match(r"^([A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ\s\.]+?)(?::|[-–—])\s*(.*)", line)
            if realname_match:
                name_part = realname_match.group(1).strip().lower()
                not_a_name_starters = [
                    "para ", "por ", "sobre ", "según ", "como ", "cual ", "cuando ", "donde ",
                    "que ", "si ", "no ", "ya ", "pero ", "porque ", "aunque ", "mientras ",
                    "pregunta", "respuesta", "duda", "consulta", "comentario",
                ]
                if (
                    not any(name_part.startswith(starter) for starter in not_a_name_starters)
                    and len(name_part) < 40
                    and len(name_part.split()) <= 4
                ):
                    current_identifier = realname_match.group(1).strip()
                    current_is_username = False
                    rest = realname_match.group(2).strip()
                    current_text = [rest] if rest else []

    if current_identifier and current_text:
        clean_text = clean_youtube_metadata("\n".join(current_text).strip())
        comments.append({
            "youtube_username": current_identifier if current_is_username else f"@{current_identifier.lower().replace(' ', '_')}",
            "original_text": clean_text,
            "real_name": None if current_is_username else current_identifier,
        })

    return comments


def parse_comments_format4(raw_text: str) -> List[Dict[str, str]]:
    comments = []
    raw_text = re.sub(r"^-{3,}\s*$", "", raw_text, flags=re.MULTILINE)
    lines = raw_text.split("\n")

    def is_likely_name(line):
        line = line.strip()
        if not line or len(line) > 50 or "?" in line:
            return False
        if line.startswith("¿") or line.startswith("•") or line.startswith("-"):
            return False
        if not line[0].isupper() or len(line.split()) > 5:
            return False

        lower_line = line.lower()
        sentence_starters = [
            "el ", "la ", "los ", "las ", "un ", "una ", "unos ", "unas ",
            "que ", "qué ", "si ", "no ", "sí ", "por ", "para ", "con ",
            "en ", "es ", "son ", "era ", "fue ", "pero ", "porque ", "ya ",
            "cuando ", "como ", "cómo ", "donde ", "dónde ", "cual ", "cuál ",
            "esto ", "esta ", "este ", "ese ", "esa ", "eso ", "aquel ",
            "mi ", "mis ", "su ", "sus ", "tu ", "tus ", "yo ", "él ", "ella ",
            "he ", "ha ", "se ", "me ", "te ", "le ", "lo ", "hay ",
            "muchos ", "muchas ", "algunos ", "algunas ", "todos ", "todas ",
            "gracias", "bendiciones", "saludos", "hola", "buenos", "buenas",
            "perdón", "disculpe", "estimado", "querido", "querida",
            "según ", "sobre ", "acerca ", "respecto ", "durante ", "después ",
            "antes ", "ahora ", "entonces ", "además ", "también ", "incluso ",
            "creo ", "pienso ", "considero ", "entiendo ", "leo ", "leí ",
            "tengo ", "tiene ", "tienen ", "quiero ", "quisiera ", "podría ",
            "puede ", "pueden ", "debe ", "deben ", "sería ", "serían ",
        ]
        return not any(lower_line.startswith(starter) for starter in sentence_starters)

    current_name = None
    current_text_lines = []
    i = 0

    while i < len(lines):
        line_stripped = lines[i].strip()

        if not line_stripped:
            j = i + 1
            while j < len(lines) and not lines[j].strip():
                j += 1

            if j < len(lines) and is_likely_name(lines[j].strip()):
                if current_name and current_text_lines:
                    text = "\n".join(current_text_lines).strip()
                    if text:
                        comments.append(_format_name_comment(current_name, text))
                current_name = lines[j].strip()
                current_text_lines = []
                i = j + 1
                continue
            if current_text_lines:
                current_text_lines.append("")
            i += 1
            continue

        if current_name is None:
            if is_likely_name(line_stripped):
                current_name = line_stripped
        else:
            current_text_lines.append(line_stripped)
        i += 1

    if current_name and current_text_lines:
        text = "\n".join(current_text_lines).strip()
        if text:
            comments.append(_format_name_comment(current_name, text))

    return comments


def _format_name_comment(name: str, text: str) -> Dict[str, str]:
    username = "@" + re.sub(r"[^a-záéíóúñA-ZÁÉÍÓÚÑ0-9]", "", name.lower().replace(" ", ""))
    return {
        "youtube_username": username,
        "original_text": clean_youtube_metadata(text),
        "real_name": name,
    }


def resolve_openai_model(model: Optional[str] = None) -> str:
    candidate = (model or "").strip()
    return OPENAI_MODEL_ALIASES.get(candidate, candidate or DEFAULT_AI_MODEL)
