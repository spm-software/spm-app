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
3. Detección de duplicados (en lote y en historial, del **mismo usuario**)
4. Distribución automática en programas
5. Mapeo de usernames a nombres reales
6. Exportación a TXT con formato específico

## Implementado

### Backend (FastAPI + MongoDB)
- ✅ API REST completa con endpoints /api/*
- ✅ Modelos: Question, UserMapping, Program, ImportBatch, Settings
- ✅ Importación y parseo de comentarios (múltiples formatos)
- ✅ Corrección con IA (emergentintegrations + OpenAI GPT-5.2)
- ✅ Detección de duplicados (rápida + IA semántica)
- ✅ **Sistema de tareas en segundo plano** para búsqueda AI con progreso
- ✅ **Retry automático** para errores transitorios de API
- ✅ Distribución en programas con reglas
- ✅ Exportación TXT
- ✅ Edición de nombres/fechas de lotes

### Frontend (React + Tailwind + Shadcn)
- ✅ Dashboard con estadísticas y lotes editables
- ✅ Importador de comentarios
- ✅ Editor con corrección IA
- ✅ Búsqueda de duplicados con IA (selector de modelo)
- ✅ **Barra de progreso en tiempo real** para búsqueda AI
- ✅ Modal de comparación de duplicados (con lote de origen correcto)
- ✅ Filtro para ver solo duplicados
- ✅ Campos editables (username, nombre, texto)
- ✅ Distribuidor de programas
- ✅ Gestión de usuarios
- ✅ Exportador TXT
- ✅ Configuración

### Integraciones
- ✅ OpenAI GPT-5.2, GPT-4o (via Emergent LLM Key)
- ✅ Claude Sonnet 4.5 (via Emergent LLM Key)
- ✅ Gemini 3 Flash (via Emergent LLM Key)
- ✅ MongoDB para persistencia
- 📋 YouTube API (credenciales guardadas, integración pendiente)

## Últimas Actualizaciones (15 Marzo 2026)
- ✅ **Bug corregido**: Modal de comparación de duplicados mostraba "Desconocido" como lote de origen
- ✅ **Nueva funcionalidad**: Sistema de progreso con polling para búsqueda AI de duplicados
  - Endpoint `/api/questions/check-duplicates-ai-start/{batch_id}` inicia tarea en segundo plano
  - Endpoint `/api/duplicates/status/{task_id}` permite consultar progreso
  - Barra de progreso visual en el frontend
  - Muestra porcentaje, preguntas procesadas y duplicados encontrados en tiempo real
- ✅ **Mejora**: Retry automático (3 intentos) para errores transitorios de API de OpenAI

## Backlog Priorizado

### P0 (Crítico)
- Ninguno pendiente

### P1 (Importante)
- Integración directa con YouTube API para obtener comentarios automáticamente

### P2 (Mejoras)
- Refactorizar Editor.jsx en componentes más pequeños
- Refactorizar server.py en múltiples routers
- Paso de formateo AI durante la exportación
- Historial de programas anteriores navegable
- Estadísticas de usuarios más frecuentes

## Próximas Tareas
1. Integración OAuth con YouTube para comentarios directos
2. Refactorizar código para mejor mantenibilidad
