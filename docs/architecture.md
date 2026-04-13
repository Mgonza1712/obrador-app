# Arquitectura

## Objetivo

Describir (a alto nivel) cómo se conectan `obrador-app`, `Supabase`, `n8n` y el extractor `FastAPI` del repo `pizca-server`.

> Nota: las reglas/invariantes globales del producto viven en `CLAUDE.md`. Este doc es el mapa entre sistemas y límites de responsabilidad.

## Fuentes verificadas

- Repo (`/app`, `/lib/supabase/*`, `docs/*`)
- Supabase MCP (schema `public`, tablas/policies/función `procesar_factura_completa_v4`)
- n8n MCP (workflows listados; details solo para workflows con MCP habilitado)

Fecha de verificación: 2026-04-09. Última actualización: 2026-04-13 (Docling + sql_payload).

## Vista general (componentes)

```text
Canales de entrada (Telegram/WhatsApp/Email/Web)
        |
        v
      n8n  (orquestación e integraciones; NO lógica de negocio)
        |
        v
Extractor (FastAPI en pizca-server, puerto 8001)
  RUTA IMAGEN (fotos de móvil):
    - GPT-4o-mini visión → cabecera
    - GPT-4o visión → extracción + normalización completa

  RUTA PDF (digitales y escaneados):
    - Docling → PDF a texto Markdown (OCR automático si escaneado)
    - GPT-4o-mini texto → cabecera + extracción + normalización (sin visión, más económico)

  - Devuelve JSON con campo sql_payload listo para la función SQL
        |
        v
      n8n  (usa $json.sql_payload directamente — adapter ya no transforma)
        |
        v
Supabase (Postgres + Auth + Storage)
  - función SQL: procesar_factura_completa_v4
  - RLS por tenant_id en tablas de negocio
  - storage bucket: facturas (PDFs)
        |
        v
obrador-app (Next.js en Vercel)
  - revisión humana (/admin/revision)
  - documentos históricos (/documentos)
  - catálogo y precios (/catalogo)
  - escandallos (/escandallos)
```

## Límites y responsabilidades (qué hace cada sistema)

### n8n (orquestador)

Responsable de:

- recibir documentos desde canales (ej. Telegram)
- descargar/gestionar el binario del archivo
- resolver `tenant_id` desde el canal (tabla `erp_channel_accounts` en Supabase)
- llamar al extractor FastAPI
- leer `$json.sql_payload` de la respuesta del extractor (ya no transforma — el adapter vive en pizca-server)
- ejecutar la función SQL de ingestión en Supabase
- notificar resultado (éxito, duplicado, pendiente de revisión)
- alertar ante fallos (workflow de error)

NO debe:

- decidir reglas de auto-aprobación (eso vive en la función SQL v4 + configuraciones en BD)
- mutar el modelo de negocio “por fuera” de la función/acciones server de la app

### Extractor (FastAPI en `pizca-server`)

Responsable de:

- OCR/lectura del documento (Docling para PDFs, visión directa para fotos)
- extracción de cabecera + líneas
- normalización (campos canónicos compartidos: ver `CLAUDE.md` → “Naming Consistency”)
- incluir scores de confianza (ej. `confidence_precio`)
- construir `sql_payload` — payload plano listo para `procesar_factura_completa_v4` (adapter previamente en n8n)

Routing interno:
- `is_image=true` → GPT-4o-mini (cabecera) + GPT-4o (extracción) vía visión
- `is_image=false` → Docling (texto Markdown) + GPT-4o-mini (cabecera + extracción) sin visión

### Supabase

Responsable de:

- persistencia canónica de documentos, líneas, catálogo y precios
- multi-tenancy con RLS (políticas por `tenant_id` o por joins a tablas con `tenant_id`)
- almacenamiento de PDFs en bucket `facturas` (en la app se generan Signed URLs)
- ejecución de la lógica de ingestión y auto-aprobación en SQL (`procesar_factura_completa_v4`)

### obrador-app (este repo)

Responsable de:

- UX de revisión humana de documentos pendientes
- edición posterior (documentos históricos)
- mantenimiento del catálogo (vincular líneas → producto maestro; alias por proveedor)
- escritura de `erp_price_history` cuando un operario confirma/corrige

## Repos y despliegue (límites)

- `obrador-app` (este repo): Next.js (Vercel)
- `pizca-server`: extractor FastAPI (infra fuera de este repo)
- `n8n`: infra fuera de este repo
- Supabase: Postgres + Auth + Storage (fuente de verdad de datos)

## Documentación relacionada

- Integración del pipeline: `docs/integrations/automation-pipeline.md`
- Supabase (RLS, tablas, funciones): `docs/integrations/supabase.md`
- Dominio de documentos y revisión: `docs/domain/documentos-y-revision.md`
