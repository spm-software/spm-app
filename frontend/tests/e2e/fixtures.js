export const testUser = {
  id: "user-1",
  email: "tester@example.com",
  name: "Usuario Test",
  picture: "",
};

export const batches = [
  {
    id: "batch-1",
    name: "Importacion junio",
    created_at: "2026-06-01T10:00:00.000Z",
    question_count: 2,
    preguntas_confirmadas: 1,
    is_classified: true,
    is_distributed: true,
    num_programs: 2,
  },
  {
    id: "batch-2",
    name: "Importacion mayo",
    created_at: "2026-05-15T10:00:00.000Z",
    question_count: 1,
    preguntas_confirmadas: 0,
    is_classified: false,
    is_distributed: false,
  },
];

export const questions = [
  {
    id: "q1",
    youtube_username: "@ana",
    real_name: "Ana Ruiz",
    real_name_confirmed: true,
    original_text: "Como se configura el sistema de puntos?",
    corrected_text: "Como se configura el sistema de puntos?",
    is_corrected: false,
    is_greeting: false,
    is_duplicate: false,
    clasificacion: "pregunta",
    motivo_clasificacion: "Pregunta clara",
    import_batch_id: "batch-1",
    program_id: "program-1",
    order_in_program: 1,
  },
  {
    id: "q2",
    youtube_username: "@pedro",
    real_name: "@pedro",
    real_name_confirmed: false,
    original_text: "Gracias por el video",
    corrected_text: "",
    is_corrected: false,
    is_greeting: false,
    is_duplicate: false,
    clasificacion: "dudoso",
    motivo_clasificacion: "Puede ser saludo",
    import_batch_id: "batch-1",
    program_id: "program-reserve",
    order_in_program: 1,
  },
];

export const programs = [
  {
    id: "program-1",
    batch_id: "batch-1",
    number: 1,
    name: "Programa 1",
    question_count: 1,
    is_reserve: false,
  },
  {
    id: "program-reserve",
    batch_id: "batch-1",
    number: 99,
    name: "Reserva",
    question_count: 1,
    is_reserve: true,
  },
];

export const users = [
  {
    id: "known-user-1",
    youtube_username: "@ana",
    real_name: "Ana Ruiz",
  },
];
