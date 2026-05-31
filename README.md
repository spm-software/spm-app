# SPM

Aplicacion para recopilar, clasificar y distribuir comentarios/preguntas de YouTube.

## Estructura

- `backend`: API FastAPI y conexion a MongoDB.
- `frontend`: aplicacion React.
- `memory`: documentacion original del proyecto.
- `tests`: pruebas automatizadas.

## Variables necesarias

Backend:

- `MONGO_URL`: cadena de conexion de MongoDB.
- `DB_NAME`: nombre de la base de datos.
- `JWT_SECRET`: clave privada para firmar sesiones.
- `ALLOWED_EMAIL`: cuenta Google autorizada para entrar.
- `YOUTUBE_CLIENT_ID`: cliente OAuth de Google/YouTube.
- `YOUTUBE_CLIENT_SECRET`: secreto OAuth de Google/YouTube.
- `CORS_ORIGINS`: URL publica del frontend.
- `EMERGENT_LLM_KEY`: opcional, para funciones con IA si se usan.

Frontend:

- `REACT_APP_BACKEND_URL`: URL publica del backend.

## Despliegue recomendado en Vercel

Crear dos proyectos en Vercel:

1. `spm-backend`, usando la carpeta `backend`.
2. `spm-frontend`, usando la carpeta `frontend`.

Despues de crear el frontend, usar su URL en `CORS_ORIGINS`.
Despues de crear el backend, usar su URL en `REACT_APP_BACKEND_URL`.

## Google OAuth

En Google Cloud, el cliente OAuth debe incluir:

- Origen autorizado: URL del frontend.
- URI de redireccion: `https://TU-FRONTEND/login`.

La app usa `/login` como callback de Google.

## Datos

No subir archivos `.env`, credenciales reales ni JSON privados al repositorio.
