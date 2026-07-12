const rawBackendUrl =
  import.meta.env.VITE_BACKEND_URL || import.meta.env.REACT_APP_BACKEND_URL || "";

const productionBackendUrl =
  typeof window !== "undefined" && window.location.hostname === "spm-preguntas.vercel.app"
    ? "https://spm-back.vercel.app"
    : "";

export const BACKEND_URL = (rawBackendUrl || productionBackendUrl).replace(/\/$/, "");
export const API_BASE_URL = `${BACKEND_URL}/api`;
