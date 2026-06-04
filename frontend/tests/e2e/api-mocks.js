import { batches, programs, questions, testUser, users } from "./fixtures";

const json = (route, body, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

export async function mockCoreApi(page, options = {}) {
  const state = {
    authenticated: options.authenticated ?? true,
    batches: structuredClone(batches),
    programs: structuredClone(programs),
    questions: structuredClone(questions),
    users: structuredClone(users),
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const path = url.pathname;

    if (method === "GET" && path === "/api/auth/me") {
      return state.authenticated
        ? json(route, testUser)
        : json(route, { detail: "Unauthorized" }, 401);
    }

    if (method === "GET" && path === "/api/auth/google-url") {
      return json(route, { auth_url: "http://127.0.0.1:3000/login?oauth-started=1" });
    }

    if (method === "POST" && path === "/api/auth/google-callback") {
      state.authenticated = true;
      return json(route, { token: "jwt-from-google", user: testUser });
    }

    if (method === "GET" && path === "/api/stats") {
      const reserveProgramIds = state.programs
        .filter((program) => program.is_reserve)
        .map((program) => program.id);
      return json(route, {
        total_questions: 12,
        total_users: 4,
        total_batches: state.batches.length,
        recent_questions: 7,
        reserve_questions: state.questions.filter((question) =>
          reserveProgramIds.includes(question.program_id)
        ).length,
      });
    }

    if (method === "GET" && path === "/api/batches") {
      return json(route, state.batches);
    }

    if (method === "PUT" && path.startsWith("/api/batches/")) {
      const batchId = path.split("/").at(-1);
      const payload = request.postDataJSON();
      state.batches = state.batches.map((batch) =>
        batch.id === batchId ? { ...batch, ...payload } : batch,
      );
      return json(route, state.batches.find((batch) => batch.id === batchId));
    }

    if (method === "DELETE" && path.startsWith("/api/batches/")) {
      const batchId = path.split("/").at(-1);
      state.batches = state.batches.filter((batch) => batch.id !== batchId);
      return json(route, { ok: true });
    }

    if (method === "GET" && path === "/api/youtube/auth-status") {
      return json(route, {
        authenticated: true,
        account_email: "youtube@example.com",
        last_anchor: {
          raw_text: "Ultimo comentario importado",
          raw_username: "@ana",
          comment_published_at: "2026-06-01T09:00:00.000Z",
        },
      });
    }

    if (method === "POST" && path === "/api/youtube/fetch-comments") {
      return json(route, {
        channel: "Canal SPM",
        videos_count: 2,
        comments_count: 1,
        greetings_filtered: 0,
        comments: [{ id: "yt-1", text: "Pregunta desde YouTube" }],
      });
    }

    if (method === "POST" && path === "/api/youtube/import-comments") {
      return json(route, {
        batch_id: "batch-youtube",
        questions_imported: 1,
        questions_updated: 0,
      });
    }

    if (method === "POST" && path === "/api/questions/import") {
      return json(route, {
        batch_id: "batch-imported",
        questions_imported: 4,
      });
    }

    if (method === "GET" && path === "/api/questions") {
      const batchId = url.searchParams.get("batch_id");
      return json(
        route,
        batchId
          ? state.questions.filter((question) => question.import_batch_id === batchId)
          : state.questions,
      );
    }

    if (method === "GET" && path === "/api/questions/reserve") {
      const reserveProgramIds = state.programs
        .filter((program) => program.is_reserve)
        .map((program) => program.id);
      return json(
        route,
        state.questions.filter((question) => reserveProgramIds.includes(question.program_id)),
      );
    }

    if (method === "PUT" && path.match(/^\/api\/questions\/[^/]+$/)) {
      const questionId = path.split("/").at(-1);
      const payload = request.postDataJSON();
      state.questions = state.questions.map((question) =>
        question.id === questionId ? { ...question, ...payload } : question,
      );
      return json(route, state.questions.find((question) => question.id === questionId));
    }

    if (method === "POST" && path.match(/^\/api\/questions\/[^/]+\/confirm-name$/)) {
      const questionId = path.split("/").at(-2);
      state.questions = state.questions.map((question) =>
        question.id === questionId ? { ...question, real_name_confirmed: true } : question,
      );
      return json(route, { ok: true });
    }

    if (method === "POST" && path === "/api/questions/update-names/batch-1") {
      return json(route, { updated_count: 1 });
    }

    if (method === "POST" && path === "/api/questions/confirm-derived-names/batch-1") {
      return json(route, { confirmed_count: 1 });
    }

    if (method === "POST" && path === "/api/questions/check-duplicates/batch-1") {
      return json(route, { duplicates: [], duplicates_count: 0 });
    }

    if (method === "POST" && path === "/api/questions/correct-all/batch-1") {
      return json(route, { question_ids: ["q1"] });
    }

    if (method === "POST" && path === "/api/questions/correct-batch") {
      return json(route, { corrected: ["q1"], errors: [] });
    }

    if (method === "POST" && path === "/api/questions/correct") {
      return json(route, { corrected: ["q1"], errors: [] });
    }

    if (method === "DELETE" && path.match(/^\/api\/questions\/[^/]+$/)) {
      const questionId = path.split("/").at(-1);
      state.questions = state.questions.filter((question) => question.id !== questionId);
      return json(route, { ok: true });
    }

    if (method === "GET" && path === "/api/programs") {
      return json(route, state.programs);
    }

    if (method === "POST" && path === "/api/programs/distribute") {
      return json(route, { programs_created: 2 });
    }

    if (method === "GET" && path.match(/^\/api\/programs\/[^/]+\/export$/)) {
      return json(route, {
        program_number: 1,
        content: "Programa 1\n\nAna Ruiz: Como se configura el sistema de puntos?",
      });
    }

    if (method === "GET" && path.match(/^\/api\/batches\/[^/]+\/export-all$/)) {
      return json(route, {
        content: "Todos los programas exportados",
      });
    }

    if (method === "GET" && path === "/api/users") {
      return json(route, state.users);
    }

    if (method === "POST" && path === "/api/users") {
      const payload = request.postDataJSON();
      const user = { id: `known-user-${state.users.length + 1}`, ...payload };
      state.users.push(user);
      return json(route, user);
    }

    if (method === "DELETE" && path.startsWith("/api/users/")) {
      const userId = path.split("/").at(-1);
      state.users = state.users.filter((user) => user.id !== userId);
      return json(route, { ok: true });
    }

    if (method === "GET" && path === "/api/settings") {
      return json(route, {
        num_programs: 4,
        max_questions_per_user_per_program: 2,
        llm_provider: "gpt-5.4-mini",
        youtube_client_id: "client-id",
        youtube_client_secret: "client-secret",
      });
    }

    if (method === "PUT" && path === "/api/settings") {
      return json(route, request.postDataJSON());
    }

    if (method === "GET" && path === "/api/cleanup/stats") {
      return json(route, { old_questions: 0, old_batches: 0 });
    }

    if (method === "GET" && path === "/api/comentarios-bloqueados") {
      return json(route, []);
    }

    return json(route, {});
  });
}

export async function authenticate(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("spm_jwt", "test-token");
  });
}
