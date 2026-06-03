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
- `INITIAL_ALLOWED_EMAILS`: emails Google iniciales para poblar la coleccion `allowed_emails` en MongoDB. Separar varios con comas. La autorizacion real se comprueba contra la base de datos.
- `YOUTUBE_CLIENT_ID`: cliente OAuth de Google/YouTube.
- `YOUTUBE_CLIENT_SECRET`: secreto OAuth de Google/YouTube.
- `CORS_ORIGINS`: URL publica del frontend.
- `OPENAI_API_KEY`: clave de OpenAI para correccion, clasificacion y deteccion de duplicados con IA.
- `AI_MODEL`: modelo de OpenAI usado por defecto. Recomendado: `gpt-5.4-mini`.

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

## Acceso autorizado

La app autoriza usuarios leyendo la coleccion `allowed_emails` de MongoDB. En local puedes arrancar con:

```env
INITIAL_ALLOWED_EMAILS=tu-email@gmail.com
```

Al iniciar el backend, esos correos se insertan en `allowed_emails` si no existen. Despues puedes gestionar la lista desde la API autenticada:

- `GET /api/allowed-emails`
- `POST /api/allowed-emails` con `{ "email": "nuevo@gmail.com" }`
- `DELETE /api/allowed-emails/{id}`

## Desarrollo local con Docker

Para probar siempre en local usa Docker Compose:

```bash
docker compose up -d --build
```

Servicios:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`
- MongoDB: interno en Docker como `mongodb://mongo:27017`

El backend carga `backend/.env` y el frontend carga `frontend/.env`. El codigo se monta como volumen, asi que los cambios en `backend/` y `frontend/` se reflejan en caliente. El frontend usa un volumen Docker para `/app/node_modules`.

Comandos utiles:

```bash
docker compose ps
docker compose logs -f backend frontend
docker compose down
```
