import server


def auth_post(client, path, headers, **kwargs):
    return client.post(path, headers=headers, **kwargs)


def test_classification_job_resumes_only_missing_questions(client, auth_headers, fake_db, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    fake_db.questions.docs.extend([
        {
            "id": "q1",
            "import_batch_id": "batch-1",
            "youtube_username": "@ana",
            "original_text": "¿Pregunta uno?",
        },
        {
            "id": "q2",
            "import_batch_id": "batch-1",
            "youtube_username": "@bea",
            "original_text": "¿Pregunta dos?",
        },
    ])
    calls = []

    async def partial_then_complete(comments, task_id=None, model=None):
        calls.append([comment["id"] for comment in comments])
        selected = comments[:1] if len(calls) == 1 else comments
        return [
            {"id": comment["id"], "clasificacion": "pregunta", "motivo": "Es una pregunta"}
            for comment in selected
        ]

    monkeypatch.setattr(server, "clasificar_comentarios_con_ia", partial_then_complete)

    created = auth_post(
        client,
        "/api/ai-jobs/create/classification/batch-1",
        auth_headers,
        json={"model": "gpt-5.4-mini"},
    )
    assert created.status_code == 200
    job_id = created.json()["id"]
    assert "question_ids" not in created.json()

    first_run = auth_post(client, f"/api/ai-jobs/{job_id}/run", auth_headers)
    assert first_run.status_code == 200
    assert first_run.json()["status"] == "error"
    assert first_run.json()["current"] == 1
    assert fake_db.questions.docs[0]["clasificacion"] == "pregunta"
    assert "clasificacion" not in fake_db.questions.docs[1]

    resumed = auth_post(
        client,
        "/api/ai-jobs/create/classification/batch-1",
        auth_headers,
        json={"model": "gpt-5.6-terra"},
    )
    assert resumed.json()["id"] == job_id
    assert resumed.json()["model"] == "gpt-5.4-mini"

    second_run = auth_post(client, f"/api/ai-jobs/{job_id}/run", auth_headers)
    assert second_run.status_code == 200
    assert second_run.json()["status"] == "completed"
    assert second_run.json()["current"] == 2
    assert second_run.json()["result"]["classified_count"] == 2
    assert calls == [["q1", "q2"], ["q2"]]


def test_correction_job_does_not_repeat_persisted_progress(client, auth_headers, fake_db, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    fake_db.questions.docs.extend([
        {
            "id": "q1",
            "import_batch_id": "batch-1",
            "youtube_username": "@ana",
            "original_text": "Pregunta uno",
            "corrected_text": "Pregunta uno.",
            "is_corrected": True,
        },
        {
            "id": "q2",
            "import_batch_id": "batch-1",
            "youtube_username": "@bea",
            "original_text": "Pregunta dos",
            "is_corrected": False,
        },
    ])
    fake_db.ai_jobs.docs.append({
        "id": "job-correction",
        "type": "correction",
        "batch_id": "batch-1",
        "model": "gpt-5.6-luna",
        "force": True,
        "status": "error",
        "current": 1,
        "total": 2,
        "question_ids": ["q1", "q2"],
        "processed_ids": ["q1"],
        "result": {"corrected_count": 1, "skipped_count": 0},
        "error": "interrupted",
        "lease_token": None,
        "lease_expires_at": None,
        "lease_version": 1,
    })
    corrected_texts = []

    async def fake_correct(text, model):
        corrected_texts.append((text, model))
        return f"{text}."

    monkeypatch.setattr(server, "correct_text_with_ai", fake_correct)

    response = auth_post(client, "/api/ai-jobs/job-correction/run", auth_headers)

    assert response.status_code == 200
    assert response.json()["status"] == "completed"
    assert response.json()["result"]["corrected_count"] == 2
    assert corrected_texts == [("Pregunta dos", "gpt-5.6-luna")]
    assert fake_db.questions.docs[1]["corrected_text"] == "Pregunta dos."


def test_running_job_is_returned_without_starting_a_second_worker(client, auth_headers, fake_db):
    future = "2999-01-01T00:00:00+00:00"
    fake_db.ai_jobs.docs.append({
        "id": "job-running",
        "type": "duplicates",
        "batch_id": "batch-1",
        "model": "gpt-5.6-terra",
        "force": False,
        "status": "running",
        "current": 3,
        "total": 10,
        "question_ids": [f"q{i}" for i in range(10)],
        "processed_ids": ["q0", "q1", "q2"],
        "result": {"duplicates_found": 1},
        "lease_token": "worker-a",
        "lease_expires_at": future,
        "lease_version": 1,
    })

    response = auth_post(client, "/api/ai-jobs/job-running/run", auth_headers)

    assert response.status_code == 200
    assert response.json()["status"] == "running"
    assert response.json()["current"] == 3
    assert response.json()["can_resume"] is False
    assert fake_db.ai_jobs.docs[0]["lease_token"] == "worker-a"


def test_duplicate_job_does_not_mark_both_sides_of_the_same_pair(client, auth_headers, fake_db, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    fake_db.questions.docs.extend([
        {
            "id": "q1",
            "import_batch_id": "batch-1",
            "youtube_username": "@ana",
            "real_name": "Ana",
            "original_text": "¿Qué significa este pasaje?",
            "is_greeting": False,
        },
        {
            "id": "q2",
            "import_batch_id": "batch-1",
            "youtube_username": "@ana",
            "real_name": "Ana",
            "original_text": "¿Cuál es el significado de este pasaje?",
            "is_greeting": False,
        },
    ])

    async def always_first(*args, **kwargs):
        return "1"

    monkeypatch.setattr(server, "call_openai_text", always_first)

    created = auth_post(
        client,
        "/api/ai-jobs/create/duplicates/batch-1",
        auth_headers,
        json={"model": "gpt-5.6-terra"},
    )
    result = auth_post(client, f"/api/ai-jobs/{created.json()['id']}/run", auth_headers)

    assert result.status_code == 200
    assert result.json()["status"] == "completed"
    assert result.json()["result"]["duplicates_found"] == 1
    duplicate_questions = [question for question in fake_db.questions.docs if question.get("is_duplicate")]
    assert len(duplicate_questions) == 1
    assert duplicate_questions[0]["duplicate_of"] in {"q1", "q2"}
