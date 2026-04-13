# obrador-app

Web app de `Pizca` para operación interna: revisión de documentos, catálogo, documentos históricos, escandallos y alertas financieras.

## Qué es este repo

Este repositorio contiene la app `Next.js` desplegada en `Vercel`. La app actúa como interfaz operativa sobre el pipeline formado por:

- canales de entrada de documentos
- `n8n` como orquestador
- extractor `FastAPI` en el repo `pizca-server`
- `Supabase` como base de datos, auth y storage

## Stack principal

- `Next.js` App Router + `TypeScript`
- `Supabase`
- `Tailwind CSS v4`
- `shadcn/ui`
- despliegue en `Vercel`

## Comandos útiles

```bash
npm run dev
npm run build
npm run lint
npx supabase gen types typescript --project-id anszcyixjopxnskpxewg --schema public > database.types.ts
```

## Contexto del proyecto

Antes de tocar lógica o UI relevante, lee en este orden:

1. `CLAUDE.md`
2. `AGENTS.md`
3. `docs/README.md`
4. la documentación de dominio o integración que corresponda

## Documentación del repo

- `CLAUDE.md`: reglas e invariantes del proyecto
- `AGENTS.md`: flujo compartido para agentes
- `docs/architecture.md`: mapa del sistema
- `docs/domain/`: negocio y semántica
- `docs/integrations/`: Supabase y pipeline externo
- `docs/runbooks/`: desarrollo y despliegue
- `docs/changes/`: especificaciones de cambios
- `docs/decisions/`: decisiones duraderas
- `docs/handoffs/`: estado temporal de sesiones

## OpenCode y Cursor

La configuración compartida para OpenCode está en `opencode.json`.

- agente de documentación: `.opencode/agents/docs.md`
- skill de documentación: `.opencode/skills/documentation-system/SKILL.md`
- rules de Cursor: `.cursor/rules/`
- MCPs compartidos de Cursor: `.cursor/mcp.json`

Guía de setup: `docs/setup/opencode-cursor.md`
