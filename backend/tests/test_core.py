import asyncio
from datetime import datetime, timezone

import core


def test_normalize_text_removes_accents_and_lowercases():
    assert core.normalize_text("¿Árbol, NIÑO y Corazón?") == "¿arbol, nino y corazon?"


def test_datetime_serialization_round_trip():
    value = datetime(2026, 1, 2, 3, 4, tzinfo=timezone.utc)
    serialized = core.serialize_datetime(value)
    assert serialized == "2026-01-02T03:04:00+00:00"
    assert core.deserialize_datetime(serialized) == value
    assert core.deserialize_datetime("not-a-date") == "not-a-date"


def test_clean_html_to_plain_text_decodes_entities_and_breaks():
    raw = "Hola&nbsp;<b>Samuel</b><br>Tom &amp; Jerry<br/><i>fin</i>"
    assert core.clean_html_to_plain_text(raw) == "Hola\xa0Samuel\nTom & Jerry\nfin"


def test_greeting_detection_keeps_real_questions():
    assert core.is_greeting("Hola") is True
    assert core.is_greeting("Gracias por el programa") is True
    assert core.is_greeting("Hola pastor, ¿qué significa Romanos 8?") is False
    assert core.is_greeting("¿Puede explicar la parábola del sembrador?") is False


def test_clean_youtube_metadata_removes_noise():
    raw = "• Hace 2 semanas (editado) Se suscribió a tu canal ¿Qué significa gracia?"
    assert core.clean_youtube_metadata(raw) == "¿Qué significa gracia?"


def test_parse_comments_username_format_multiline():
    raw = """
@ana-lopez123 • Hace 2 semanas
¿Qué significa la fe?
Otra línea

@juan Gracias
"""
    comments = core.parse_comments(raw)
    assert comments == [
        {
            "youtube_username": "@ana-lopez123",
            "original_text": "¿Qué significa la fe?\nOtra línea",
            "real_name": None,
        },
        {
            "youtube_username": "@juan",
            "original_text": "Gracias",
            "real_name": None,
        },
    ]


def test_parse_comments_real_name_colon_and_dash_formats():
    comments = core.parse_comments("Ana López: ¿Qué es la gracia?\nJuan Perez - ¿Qué es la fe?")
    assert comments[0]["youtube_username"] == "@ana_lópez"
    assert comments[0]["real_name"] == "Ana López"
    assert comments[0]["original_text"] == "¿Qué es la gracia?\nJuan Perez - ¿Qué es la fe?"


def test_parse_comments_format4_with_blank_sections():
    raw = "\n\n".join(
        [
            "Ana Lopez\n¿Pregunta uno?",
            "Juan Perez\n¿Pregunta dos?\n\ncon detalle",
            "Maria Garcia\n¿Pregunta tres?",
            "Pedro Ruiz\n¿Pregunta cuatro?",
            "Lucia Mora\n¿Pregunta cinco?",
            "Oscar Cano\n¿Pregunta seis?",
            "Elena Diaz\n¿Pregunta siete?",
            "Ramon Gil\n¿Pregunta ocho?",
            "Sofia Mar\n¿Pregunta nueve?",
            "Luis Paz\n¿Pregunta diez?",
            "Clara Sol\n¿Pregunta once?",
            "Nora Rio\n¿Pregunta doce?",
        ]
    )
    comments = core.parse_comments(raw)
    assert len(comments) == 12
    assert comments[0]["real_name"] == "Ana Lopez"
    assert comments[1]["original_text"] == "¿Pregunta dos?\n\ncon detalle"


def test_display_name_extraction_is_stable():
    assert asyncio.run(core.extract_display_name("@ana_lopez123")) == "Ana Lopez"
    assert asyncio.run(core.extract_display_name("@canal-test")) == "Canal Test"


def test_similarity_and_username_normalizers():
    assert core.normalize_username("@User ") == "user"
    assert core.normalize_for_similarity("  Hola\n\nPastor ") == "hola pastor"


def test_resolve_openai_model_aliases_and_custom():
    assert core.resolve_openai_model("openai") == core.DEFAULT_AI_MODEL
    assert core.resolve_openai_model("gpt-4o-mini") == "gpt-4o-mini"
    assert core.resolve_openai_model("custom-model") == "custom-model"
    assert core.resolve_openai_model("") == core.DEFAULT_AI_MODEL
