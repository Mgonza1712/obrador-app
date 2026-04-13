# AGENTS.md

Este repo usa contexto persistente en archivos versionados. Si trabajas como agente o copiloto, lee esto en este orden:

1. `README.md`
2. `CLAUDE.md`
3. La documentación de dominio o integración relevante en `docs/`
4. Si existe, el archivo activo en `docs/changes/`

## Fuente de verdad

- `README.md` explica qué es el proyecto y dónde mirar.
- `CLAUDE.md` contiene reglas operativas, invariantes y convenciones que no se deben romper.
- `docs/domain/*` documenta reglas de negocio y modelos mentales del producto.
- `docs/integrations/*` documenta límites entre sistemas externos.
- `docs/changes/*` describe cambios grandes o en curso.
- `docs/decisions/*` registra decisiones duraderas.
- `docs/handoffs/*` registra estado temporal o sesiones incompletas.

## Flujo recomendado para agentes

- Antes de cambiar código, identifica qué documento es canónico para el área afectada.
- Si cambias una regla de negocio, arquitectura, integración o workflow, actualiza la doc canónica correspondiente en el mismo trabajo.
- Si el cambio es grande o ambiguo, crea o actualiza un archivo en `docs/changes/`.
- Si dejas trabajo a medias, crea un handoff corto en `docs/handoffs/`.

## Builder y Reviewer

- Usa un agente principal para implementar.
- Usa un reviewer o sidecar para revisar riesgos, contratos y pruebas.
- Evita que dos agentes editen la misma zona al mismo tiempo.

## Supabase y Notion

- Usa `Supabase MCP` para verificar tablas, funciones, tipos y relaciones reales.
- Usa `Notion MCP` para rescatar contexto histórico y migrarlo al repo.
- No trates Notion como fuente canónica final. El repo debe terminar conteniendo la versión estable del contexto.
