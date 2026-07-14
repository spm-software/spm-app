import io
import zipfile
from datetime import datetime, timedelta, timezone


def auth_get(client, path, headers, **kwargs):
    return client.get(path, headers=headers, **kwargs)


def auth_post(client, path, headers, **kwargs):
    return client.post(path, headers=headers, **kwargs)


def auth_put(client, path, headers, **kwargs):
    return client.put(path, headers=headers, **kwargs)


def auth_delete(client, path, headers, **kwargs):
    return client.delete(path, headers=headers, **kwargs)


def test_jwt_middleware_requires_token(client):
    response = client.get("/api/settings")
    assert response.status_code == 401
    assert response.json()["detail"] == "Falta token de autenticación"


def test_settings_default_and_update(client, auth_headers):
    response = auth_get(client, "/api/settings", auth_headers)
    assert response.status_code == 200
    assert response.json()["num_programs"] == 4

    response = auth_put(
        client,
        "/api/settings",
        auth_headers,
        json={"num_programs": 3, "max_questions_per_user_per_program": 1, "llm_provider": "gpt-4o-mini"},
    )
    assert response.status_code == 200
    assert response.json()["num_programs"] == 3
    assert response.json()["max_questions_per_user_per_program"] == 1


def test_stats_and_reserve_endpoint_count_valid_reserve_questions(client, auth_headers, fake_db):
    fake_db.programs.docs.extend([
        {"id": "program-1", "batch_id": "batch-1", "name": "Programa 01", "number": 1, "is_reserve": False},
        {"id": "reserve-1", "batch_id": "batch-1", "name": "Reserva", "number": 2, "is_reserve": True},
    ])
    fake_db.questions.docs.extend([
        {
            "id": "q-included",
            "youtube_username": "@ana",
            "original_text": "Pregunta incluida",
            "program_id": "program-1",
            "is_greeting": False,
            "is_duplicate": False,
            "clasificacion": "pregunta",
            "created_at": "2026-06-01T10:00:00+00:00",
        },
        {
            "id": "q-reserve",
            "youtube_username": "@ana",
            "original_text": "Pregunta en reserva",
            "program_id": "reserve-1",
            "is_greeting": False,
            "is_duplicate": False,
            "clasificacion": "pregunta",
            "created_at": "2026-06-01T11:00:00+00:00",
        },
        {
            "id": "q-reserve-duplicate",
            "youtube_username": "@ana",
            "original_text": "Duplicada en reserva",
            "program_id": "reserve-1",
            "is_greeting": False,
            "is_duplicate": True,
            "clasificacion": "pregunta",
            "created_at": "2026-06-01T12:00:00+00:00",
        },
    ])

    stats = auth_get(client, "/api/stats", auth_headers)
    assert stats.status_code == 200
    assert stats.json()["reserve_questions"] == 1

    reserve = auth_get(client, "/api/questions/reserve", auth_headers)
    assert reserve.status_code == 200
    assert [q["id"] for q in reserve.json()] == ["q-reserve"]


def test_allowed_emails_are_normalized_deduped_listed_and_deleted(client, auth_headers):
    response = auth_post(client, "/api/allowed-emails", auth_headers, json={"email": " User@Example.COM "})
    assert response.status_code == 200
    created = response.json()
    assert created["email"] == "user@example.com"

    duplicate = auth_post(client, "/api/allowed-emails", auth_headers, json={"email": "user@example.com"})
    assert duplicate.status_code == 200
    assert duplicate.json()["id"] == created["id"]

    listed = auth_get(client, "/api/allowed-emails", auth_headers)
    assert listed.status_code == 200
    assert [item["email"] for item in listed.json()] == ["admin@example.com", "user@example.com"]

    deleted = auth_delete(client, f"/api/allowed-emails/{created['id']}", auth_headers)
    assert deleted.status_code == 200
    assert auth_delete(client, "/api/allowed-emails/missing", auth_headers).status_code == 404


def test_user_mapping_create_updates_and_delete(client, auth_headers, fake_db):
    created = auth_post(client, "/api/users", auth_headers, json={"youtube_username": "@ana", "real_name": "Ana"}).json()
    assert created["real_name"] == "Ana"

    updated = auth_post(client, "/api/users", auth_headers, json={"youtube_username": "@ana", "real_name": "Ana Lopez"}).json()
    assert updated["id"] == created["id"]
    assert updated["real_name"] == "Ana Lopez"

    fake_db.questions.docs.append({
        "id": "q-ana",
        "youtube_username": "@ana",
        "real_name": "Ana Lopez",
        "real_name_confirmed": False,
        "original_text": "Pregunta de Ana",
    })
    edited = auth_put(
        client,
        f"/api/users/{created['id']}",
        auth_headers,
        json={"youtube_username": "ana-canal", "real_name": "Ana Confirmada"},
    )
    assert edited.status_code == 200
    assert edited.json()["youtube_username"] == "@ana-canal"
    assert edited.json()["real_name"] == "Ana Confirmada"
    assert fake_db.questions.docs[0]["youtube_username"] == "@ana-canal"
    assert fake_db.questions.docs[0]["real_name"] == "Ana Confirmada"
    assert fake_db.questions.docs[0]["real_name_confirmed"] is True

    listed = auth_get(client, "/api/users", auth_headers).json()
    assert len(listed) == 1
    assert auth_delete(client, f"/api/users/{created['id']}", auth_headers).status_code == 200


def test_questions_create_update_confirm_and_delete(client, auth_headers, fake_db):
    auth_post(client, "/api/users", auth_headers, json={"youtube_username": "@ana", "real_name": "Ana Real"})

    created = auth_post(
        client,
        "/api/questions",
        auth_headers,
        json={"youtube_username": "@ana", "original_text": "Hola<br>¿Qué es la fe &amp; la gracia?"},
    )
    assert created.status_code == 200
    question = created.json()
    assert question["real_name"] == "Ana Real"
    assert question["real_name_confirmed"] is True
    assert question["original_text"] == "Hola ¿Qué es la fe & la gracia?"

    sibling = auth_post(
        client,
        "/api/questions",
        auth_headers,
        json={"youtube_username": "ANA", "original_text": "¿Otra pregunta de Ana?"},
    )
    assert sibling.status_code == 200
    assert sibling.json()["real_name"] == "Ana Real"
    assert sibling.json()["real_name_confirmed"] is True

    updated = auth_put(
        client,
        f"/api/questions/{question['id']}",
        auth_headers,
        json={"real_name": "Ana Confirmada", "corrected_text": "¿Qué es la fe?", "is_corrected": True},
    )
    assert updated.status_code == 200
    assert updated.json()["real_name"] == "Ana Confirmada"
    assert fake_db.user_mappings.docs[0]["real_name"] == "Ana Confirmada"
    sibling_after_update = next(q for q in fake_db.questions.docs if q["id"] == sibling.json()["id"])
    assert sibling_after_update["real_name"] == "Ana Confirmada"
    assert sibling_after_update["real_name_confirmed"] is True

    confirmed = auth_post(client, f"/api/questions/{question['id']}/confirm-name", auth_headers)
    assert confirmed.status_code == 200
    assert confirmed.json()["real_name"] == "Ana Confirmada"

    deleted = auth_delete(client, f"/api/questions/{question['id']}", auth_headers)
    assert deleted.status_code == 200
    assert auth_delete(client, f"/api/questions/{question['id']}", auth_headers).status_code == 404


def test_import_search_batch_info_and_batch_update(client, auth_headers):
    imported = auth_post(
        client,
        "/api/questions/import",
        auth_headers,
        json={"raw_text": "@ana ¿Qué significa gracia?\n\n@luis ¿Qué significa fe?"},
    )
    assert imported.status_code == 200
    batch_id = imported.json()["batch_id"]
    question_id = imported.json()["questions"][0]["id"]

    updated_batch = auth_put(
        client,
        f"/api/batches/{batch_id}",
        auth_headers,
        json={"name": "Lote junio", "created_at": "2026-06-01T10:00:00Z"},
    )
    assert updated_batch.status_code == 200
    assert updated_batch.json()["name"] == "Lote junio"

    by_id = auth_get(client, f"/api/questions/by-id/{question_id}", auth_headers)
    assert by_id.status_code == 200
    assert by_id.json()["batch_name"] == "Lote junio"

    search = auth_get(client, "/api/questions/search", auth_headers, params={"q": "gracia"})
    assert search.status_code == 200
    assert search.json()["count"] == 1
    assert search.json()["results"][0]["batch_name"] == "Lote junio"

    batches = auth_get(client, "/api/batches", auth_headers)
    assert batches.status_code == 200
    assert batches.json()[0]["is_classified"] is False


def test_import_normalizes_blank_lines_inside_questions(client, auth_headers):
    imported = auth_post(
        client,
        "/api/questions/import",
        auth_headers,
        json={
            "raw_text": (
                "@ana Primera línea de la pregunta.<br><br>\n"
                "Segunda línea tras una línea en blanco.\n\n"
                "@luis Otra pregunta."
            )
        },
    )
    assert imported.status_code == 200
    questions = imported.json()["questions"]
    assert questions[0]["original_text"] == "Primera línea de la pregunta. Segunda línea tras una línea en blanco."
    assert "\n" not in questions[0]["original_text"]


def test_update_names_confirms_existing_stored_name(client, auth_headers, fake_db):
    fake_db.user_mappings.docs.append({
        "id": "user-ana",
        "youtube_username": "@ana",
        "real_name": "Ana Real",
    })
    fake_db.import_batches.docs.append({
        "id": "batch-names",
        "created_at": "2026-06-01T10:00:00+00:00",
        "question_count": 1,
        "is_distributed": False,
        "num_programs": 4,
    })
    fake_db.questions.docs.append({
        "id": "q-ana",
        "youtube_username": "ANA",
        "real_name": "Ana",
        "real_name_confirmed": False,
        "original_text": "Pregunta",
        "import_batch_id": "batch-names",
        "clasificacion": "pregunta",
        "is_greeting": False,
        "is_duplicate": False,
    })

    listed = auth_get(client, "/api/questions", auth_headers, params={"batch_id": "batch-names"})
    assert listed.status_code == 200
    assert listed.json()[0]["real_name"] == "Ana Real"
    assert listed.json()[0]["real_name_confirmed"] is True
    assert fake_db.questions.docs[0]["real_name_confirmed"] is False

    response = auth_post(client, "/api/questions/update-names/batch-names", auth_headers)
    assert response.status_code == 200
    assert response.json()["updated_count"] == 1
    assert fake_db.questions.docs[0]["real_name_confirmed"] is True
    assert fake_db.questions.docs[0]["real_name"] == "Ana Real"


def test_blocked_comments_skip_youtube_import_and_remove_existing(client, auth_headers):
    existing = auth_post(
        client,
        "/api/questions",
        auth_headers,
        json={"youtube_username": "@spam", "original_text": "Saludos pastor Samuel Perez Millos Dios Soberano lo proteja y bendiga"},
    )
    assert existing.status_code == 200

    blocked = auth_post(
        client,
        "/api/comentarios-bloqueados",
        auth_headers,
        json={
            "youtube_username": "@spam",
            "texto_referencia": "Saludos pastor Samuel Perez Millos Dios Soberano lo proteja y bendiga",
            "motivo": "repetido",
        },
    )
    assert blocked.status_code == 200
    assert auth_get(client, "/api/questions", auth_headers).json() == []

    imported = auth_post(
        client,
        "/api/youtube/import-comments",
        auth_headers,
        json={
            "comments": [
                {"comment_id": "yt1", "youtube_username": "@spam", "text": "Saludos pastor Samuel Perez Millos Dios Soberano lo proteja y bendiga"},
                {"comment_id": "yt2", "youtube_username": "@ana", "text": "¿Qué significa gracia?"},
            ]
        },
    )
    assert imported.status_code == 200
    assert imported.json()["blocked_count"] == 1
    assert imported.json()["questions_imported"] == 1


def test_youtube_import_anchor_tracks_latest_processed_comment(client, auth_headers, fake_db):
    first_comment = {
        "comment_id": "yt-comment-1",
        "youtube_username": "@ana",
        "raw_username": "Ana",
        "text": "Primera pregunta nueva",
        "video_id": "video-1",
        "video_title": "Video uno",
        "published_at": "2026-07-10T10:00:00Z",
    }

    imported = auth_post(
        client,
        "/api/youtube/import-comments",
        auth_headers,
        json={
            "comments": [first_comment],
            "batch_name": "16/06 al 30/06",
            "batch_created_at": "2026-06-30",
        },
    )
    assert imported.status_code == 200
    assert imported.json()["questions_imported"] == 1
    assert imported.json()["last_anchor"]["comment_id"] == "yt-comment-1"
    assert imported.json()["last_anchor"]["raw_text"] == "Primera pregunta nueva"
    assert fake_db.import_batches.docs[0]["name"] == "16/06 al 30/06"
    assert fake_db.import_batches.docs[0]["created_at"].startswith("2026-06-30")

    duplicate_with_later_date = {
        **first_comment,
        "text": "Primera pregunta nueva editada",
        "published_at": "2026-07-12T10:00:00Z",
    }
    updated = auth_post(
        client,
        "/api/youtube/import-comments",
        auth_headers,
        json={"comments": [duplicate_with_later_date]},
    )
    assert updated.status_code == 200
    assert updated.json()["questions_imported"] == 0
    assert updated.json()["questions_updated"] == 1
    assert updated.json()["last_anchor"]["comment_id"] == "yt-comment-1"
    assert updated.json()["last_anchor"]["raw_text"] == "Primera pregunta nueva editada"
    assert updated.json()["last_anchor"]["comment_published_at"] == "2026-07-12T10:00:00Z"

    anchor = auth_get(client, "/api/youtube/last-import-anchor", auth_headers)
    assert anchor.status_code == 200
    assert anchor.json()["last_anchor"]["comment_id"] == "yt-comment-1"


def test_youtube_import_anchor_ignores_comments_outside_selected_range(client, auth_headers):
    in_range_first = {
        "comment_id": "yt-june-16",
        "youtube_username": "@ana",
        "raw_username": "Ana",
        "text": "Primera del rango",
        "video_id": "video-1",
        "video_title": "Video uno",
        "published_at": "2026-06-16T08:00:00Z",
    }
    in_range_last = {
        "comment_id": "yt-june-30",
        "youtube_username": "@luis",
        "raw_username": "Luis",
        "text": "Última del rango",
        "video_id": "video-1",
        "video_title": "Video uno",
        "published_at": "2026-06-30T22:30:00Z",
    }
    out_of_range = {
        "comment_id": "yt-july-06",
        "youtube_username": "@marta",
        "raw_username": "Marta",
        "text": "No debe ser ancla",
        "video_id": "video-1",
        "video_title": "Video uno",
        "published_at": "2026-07-06T12:28:00Z",
    }

    imported = auth_post(
        client,
        "/api/youtube/import-comments",
        auth_headers,
        json={
            "comments": [out_of_range, in_range_last, in_range_first],
            "fecha_desde": "2026-06-16",
            "fecha_hasta": "2026-06-30",
            "batch_name": "16/06 al 30/06",
            "batch_created_at": "2026-06-30",
        },
    )

    assert imported.status_code == 200
    assert imported.json()["questions_imported"] == 2
    assert imported.json()["last_anchor"]["comment_id"] == "yt-june-30"
    assert imported.json()["last_anchor"]["raw_text"] == "Última del rango"
    assert imported.json()["last_anchor"]["comment_published_at"] == "2026-06-30T22:30:00Z"


def test_duplicate_detection_in_batch_and_history(client, auth_headers, fake_db):
    now = datetime.now(timezone.utc).isoformat()
    fake_db.import_batches.docs.extend([
        {"id": "history", "name": "Historial", "created_at": now, "question_count": 1, "is_distributed": False, "num_programs": 4},
        {"id": "current", "name": "Actual", "created_at": now, "question_count": 2, "is_distributed": False, "num_programs": 4},
    ])
    fake_db.questions.docs.extend([
        {"id": "h1", "youtube_username": "@ana", "real_name": "Ana", "original_text": "Que significa la gracia de Dios", "is_greeting": False, "is_duplicate": False, "created_at": now, "import_batch_id": "history"},
        {"id": "c1", "youtube_username": "@ana", "real_name": "Ana", "original_text": "Que significa la gracia de Dios", "is_greeting": False, "is_duplicate": False, "created_at": now, "import_batch_id": "current"},
        {"id": "c2", "youtube_username": "@luis", "real_name": "Luis", "original_text": "Puede explicar el calendario de publicaciones", "is_greeting": False, "is_duplicate": False, "created_at": now, "import_batch_id": "current"},
    ])

    response = auth_post(client, "/api/questions/check-duplicates/current", auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["duplicates_count"] == 1
    assert data["duplicates"][0]["type"] == "in_history"
    assert data["duplicates"][0]["original_question"]["batch_name"] == "Historial"
    assert fake_db.questions.docs[1]["is_duplicate"] is True


def test_distribution_move_export_and_clear(client, auth_headers):
    imported = auth_post(
        client,
        "/api/questions/import",
        auth_headers,
        json={"raw_text": "@ana ¿Pregunta uno?\n\n@ana ¿Pregunta dos?\n\n@ana ¿Pregunta tres?"},
    )
    batch_id = imported.json()["batch_id"]
    imported_questions = auth_get(client, "/api/questions", auth_headers, params={"batch_id": batch_id}).json()
    for question in imported_questions:
        auth_put(
            client,
            f"/api/questions/{question['id']}",
            auth_headers,
            json={"clasificacion": "pregunta", "is_greeting": False},
        )
    auth_put(client, "/api/settings", auth_headers, json={"max_questions_per_user_per_program": 1})

    distributed = auth_post(client, "/api/programs/distribute", auth_headers, json={"batch_id": batch_id, "num_programs": 2})
    assert distributed.status_code == 200
    assert distributed.json()["programs_created"] == 3
    assert distributed.json()["distribution"]["Reserva"] == 1

    programs = auth_get(client, "/api/programs", auth_headers, params={"batch_id": batch_id}).json()
    normal_program = next(program for program in programs if not program["is_reserve"])
    reserve = next(program for program in programs if program["is_reserve"])
    reserve_question = next(q for q in auth_get(client, "/api/questions", auth_headers, params={"batch_id": batch_id}).json() if q["program_id"] == reserve["id"])

    auth_put(client, "/api/settings", auth_headers, json={"max_questions_per_user_per_program": 2})
    moved = auth_post(client, f"/api/questions/{reserve_question['id']}/move", auth_headers, json={"target_program_id": normal_program["id"]})
    assert moved.status_code == 200
    assert moved.json()["target_program"] == normal_program["name"]

    exported = auth_get(client, f"/api/programs/{normal_program['id']}/export", auth_headers)
    assert exported.status_code == 200
    assert "Ana" in exported.json()["content"]

    png_export = auth_get(client, f"/api/programs/{normal_program['id']}/export-png", auth_headers)
    assert png_export.status_code == 200
    assert png_export.headers["content-type"].startswith("application/zip")
    archive = zipfile.ZipFile(io.BytesIO(png_export.content))
    png_names = archive.namelist()
    assert len(png_names) == normal_program["question_count"] + 1
    assert png_names[0].endswith(".png")
    assert archive.read(png_names[0]).startswith(b"\x89PNG")

    png_preview = auth_get(client, f"/api/programs/{normal_program['id']}/export-png-preview", auth_headers)
    assert png_preview.status_code == 200
    preview_data = png_preview.json()
    assert preview_data["question_count"] == normal_program["question_count"] + 1
    assert preview_data["previews"][0]["image"].startswith("data:image/png;base64,")

    all_exports = auth_get(client, f"/api/batches/{batch_id}/export-all", auth_headers)
    assert all_exports.status_code == 200
    assert len(all_exports.json()["exports"]) == 3

    cleared = auth_delete(client, f"/api/programs/clear/{batch_id}", auth_headers)
    assert cleared.status_code == 200


def test_distribution_excludes_confirmed_duplicates(client, auth_headers):
    imported = auth_post(
        client,
        "/api/questions/import",
        auth_headers,
        json={"raw_text": "@ana ¿Pregunta uno?\n\n@bea ¿Pregunta dos?\n\n@carlos ¿Pregunta duplicada?"},
    )
    batch_id = imported.json()["batch_id"]
    imported_questions = auth_get(client, "/api/questions", auth_headers, params={"batch_id": batch_id}).json()

    duplicate_question = imported_questions[-1]
    for question in imported_questions:
        payload = {"clasificacion": "pregunta", "is_greeting": False}
        if question["id"] == duplicate_question["id"]:
            payload["is_duplicate"] = True
        updated = auth_put(client, f"/api/questions/{question['id']}", auth_headers, json=payload)
        assert updated.status_code == 200

    auth_put(client, "/api/settings", auth_headers, json={"max_questions_per_user_per_program": 10})
    distributed = auth_post(client, "/api/programs/distribute", auth_headers, json={"batch_id": batch_id, "num_programs": 2})
    assert distributed.status_code == 200

    programs = auth_get(client, "/api/programs", auth_headers, params={"batch_id": batch_id}).json()
    normal_programs = [program for program in programs if not program["is_reserve"]]
    reserve = next(program for program in programs if program["is_reserve"])
    assert sum(program["question_count"] for program in normal_programs) == 2
    assert reserve["question_count"] == 0

    questions = auth_get(client, "/api/questions", auth_headers, params={"batch_id": batch_id}).json()
    duplicate_after_distribution = next(question for question in questions if question["id"] == duplicate_question["id"])
    assert duplicate_after_distribution.get("program_id") is None


def test_cleanup_stats_questions_batches_and_full_cleanup(client, auth_headers, fake_db):
    old = (datetime.now(timezone.utc) - timedelta(days=40)).isoformat()
    recent = datetime.now(timezone.utc).isoformat()
    fake_db.import_batches.docs.extend([
        {"id": "old-batch", "created_at": old, "question_count": 1},
        {"id": "new-batch", "created_at": recent, "question_count": 1},
    ])
    fake_db.questions.docs.extend([
        {"id": "old-q", "original_text": "old", "created_at": old, "import_batch_id": "old-batch", "is_greeting": False},
        {"id": "new-q", "original_text": "new", "created_at": recent, "import_batch_id": "new-batch", "is_greeting": False},
    ])
    fake_db.programs.docs.append({"id": "p-old", "batch_id": "old-batch", "name": "Programa 01", "number": 1, "created_at": old})

    stats = auth_get(client, "/api/cleanup/stats", auth_headers)
    assert stats.status_code == 200
    assert stats.json()["30_days"]["questions"] == 1

    cleanup_questions = auth_delete(client, "/api/cleanup/questions", auth_headers, params={"days": 30})
    assert cleanup_questions.status_code == 200
    assert cleanup_questions.json()["deleted_questions"] == 1

    cleanup_batches = auth_delete(client, "/api/cleanup/batches", auth_headers, params={"days": 30})
    assert cleanup_batches.status_code == 200
    assert cleanup_batches.json()["deleted_batches"] == 1

    full = auth_delete(client, "/api/cleanup/all", auth_headers)
    assert full.status_code == 200
    assert full.json()["deleted_questions"] == 1
