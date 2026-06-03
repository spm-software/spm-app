# SPM Frontend

Frontend React del gestor Q&A, construido con Vite y pnpm.

## Requisitos

- Node.js 22 o superior
- pnpm 11.5.1 mediante Corepack

```bash
corepack enable
corepack prepare pnpm@11.5.1 --activate
pnpm install
```

## Variables de entorno

La app lee `VITE_BACKEND_URL` y mantiene `REACT_APP_BACKEND_URL` como fallback para compatibilidad con el `.env` anterior.

```bash
VITE_BACKEND_URL=http://localhost:8000
```

## Scripts

```bash
pnpm dev
pnpm build
pnpm preview
pnpm test:e2e
pnpm test:e2e:ui
```

Los tests E2E usan Playwright y mockean las rutas `/api`, por lo que no requieren Mongo, Google OAuth ni YouTube.
