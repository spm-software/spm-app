# Gestor de Preguntas Q&A - YouTube

## Problema Original
Administración de un canal de YouTube de preguntas y respuestas. Cada 15 días se recopilan comentarios, se limpian (eliminando saludos), se corrigen gramaticalmente, se detectan duplicados, y se distribuyen en 4-5 programas siguiendo reglas específicas:
- Máximo 2 preguntas por persona por programa
- Orden cronológico
- Excedentes van a Reserva
- Asociar @usernames con nombres reales

## User Personas
- **Creador de contenido YouTube**: Gestiona canal Q&A quincenal, necesita organizar preguntas de la comunidad

## Requisitos Core (Estáticos)
1. Importar comentarios en formato @usuario texto
2. Corrección gramatical con IA (OpenAI/Claude/Gemini)
3. Detección de duplicados (en lote y en historial 30 días)
4. Distribución automática en programas
5. Mapeo de usernames a nombres reales
6. Exportación a TXT con formato específico

## Implementado (Enero 2026)

### Backend (FastAPI + MongoDB)
- ✅ API REST completa con endpoints /api/*
- ✅ Modelos: Question, UserMapping, Program, ImportBatch, Settings
- ✅ Importación y parseo de comentarios
- ✅ Corrección con IA (emergentintegrations + OpenAI GPT-5.2)
- ✅ Detección de duplicados
- ✅ Distribución en programas con reglas
- ✅ Exportación TXT

### Frontend (React + Tailwind + Shadcn)
- ✅ Dashboard con estadísticas
- ✅ Importador de comentarios
- ✅ Editor con corrección IA
- ✅ Distribuidor de programas
- ✅ Gestión de usuarios
- ✅ Exportador TXT
- ✅ Configuración

### Integraciones
- ✅ OpenAI GPT-5.2 (via Emergent LLM Key)
- ✅ MongoDB para persistencia
- 📋 YouTube API (credenciales guardadas, integración pendiente)

## Backlog Priorizado

### P0 (Crítico)
- Ninguno pendiente

### P1 (Importante)
- Integración directa con YouTube API para obtener comentarios automáticamente
- Autenticación OAuth con YouTube

### P2 (Mejoras)
- Cambiar proveedor IA desde la UI
- Historial de programas anteriores navegable
- Estadísticas de usuarios más frecuentes
- Notificaciones de nuevos comentarios

## Próximas Tareas
1. Implementar conexión OAuth con YouTube para obtener comentarios directamente
2. Añadir filtros avanzados en el Editor
3. Permitir reorganizar manualmente preguntas entre programas
