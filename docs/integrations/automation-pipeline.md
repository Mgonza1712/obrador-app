# Pipeline de Automatización (Documentos de compra)

## Objetivo

Documentar el flujo entre canales de entrada → `n8n` → extractor `FastAPI` → función SQL en Supabase → revisión humana en `obrador-app`.

Este documento es el contrato *entre sistemas*. La semántica de negocio (precios SIN IVA, estados, etc.) está en `docs/domain/documentos-y-revision.md` y las invariantes globales en `CLAUDE.md`.

## Fuentes verificadas

- n8n MCP:
  - workflows activos listados
  - details verificados solo para workflows con `availableInMCP=true`
- Supabase MCP:
  - función `public.procesar_factura_completa_v4(p_tenant_id uuid, p_json_payload jsonb, p_file_url text)`
  - tablas `erp_*`, `extraction_*`, `erp_channel_accounts`
  - vista `vw_catalogo_precios`

Fecha de verificación: 2026-04-09. Última actualización: 2026-04-30 (observations, prompt_version, extraction_log patch, alias matching fix).

## Workflows n8n (estado actual)

| ID | Nombre | Rol |
|----|--------|-----|
| `Sw13rBM2igPb0xQW` | Pizca - Scanner Intake | Valida token, llama Core Extractor, responde `{job_id}` |
| `bDJGiYfixmUNZjjv` | Pizca - Core Extractor | Sub-workflow: sube PDF a Storage, llama FastAPI `/extract`, retorna `{job_id}` |
| `w7IIm2Mojb3v0pm7` | Pizca - Extraction Callback | Recibe resultado de FastAPI, ejecuta SQL v4, llama `/job-complete/{job_id}` |
| `D5ul7ov1pTHnpQlb` | Pizca - WPP Doc Intake | Canal WhatsApp — pendiente migración a async |

## Paso a paso: ingestión de un documento (flujo async — desde 2026-04-17)

### 0) Resolver multi-tenancy desde el canal

Fuente: tabla Supabase `erp_channel_accounts` (RLS deshabilitado).

- Input típico: `channel='scanner'` + `account_id=<token>`
- Output: `tenant_id`

**Invariante:** `tenant_id` se determina antes de llamar al extractor o al SQL v4.

### 1) Obtener archivo y persistir en Storage

- n8n (Core Extractor): sube el binario a Supabase Storage (bucket `facturas`), obtiene `filename`.
- `drive_url` en `erp_documents` es el nombre del archivo en storage.
- `app/actions/documents.ts` genera Signed URL desde `supabase.storage.from('facturas')` usando el último segmento de `drive_url`.

### 2) Llamar al extractor FastAPI (async)

- Endpoint: `POST http://172.17.0.1:8001/extract`
- Body: `{document_base64, document_type, tenant_id, filename, is_image, observations?}`
- **Respuesta inmediata** (<1s): `{status: “processing”, job_id: “<uuid>”}`

`observations` es el campo de notas del operario introducido en el scanner. Viaja por el pipeline hasta `erp_documents.notes`.

El extractor procesa en background (ThreadPoolExecutor, hasta 3 en paralelo) y llama al callback de n8n al terminar.

#### Pipeline interno del extractor (`services/extractor.py`)

El extractor ejecuta 5 pasos en cadena. Los pasos 3-5 dependen del resultado del paso 2:

```
1. Extraer cabecera (gpt-4o-mini, 1ª página / primeros 500 chars Markdown)
   → obtener proveedor_nombre y tipo_documento
2. resolve_provider_id() → busca UUID en erp_providers por nombre
   → usa fuzz.token_set_ratio (robusto ante “S.L.” vs “SL”, “&” vs “y”)
   → si falla → known_aliases = [] → todos los ítems aparecen como nuevos (fallo en cascada)
3. get_known_aliases(provider_id) → aliases de ese proveedor desde erp_item_aliases
4. Llamada principal (gpt-4o) → extracción + normalización con aliases como contexto
5. match_items_in_memory() → safety net post-LLM, re-chequea matches por fuzzy
```

**Vulnerabilidad conocida:** Si el proveedor no se resuelve, `known_aliases = []` y todos los ítems se tratan como nuevos. Ver decisión pendiente `docs/decisions/2026-04-30-alias-fallback-tenant.md`.

### 3) Polling desde el scanner PWA

- El scanner recibe `{job_id}` y hace polling cada 5s a `/api/job-status/{jobId}` (Next.js API route que proxea a FastAPI `GET /job-status/{job_id}`).
- Timeout: 3 minutos (36 polls).
- Estados posibles: `processing` → `extracted` → `success | duplicate | failed`

### 4) Callback de FastAPI a n8n

Cuando termina la extracción, FastAPI hace `POST N8N_CALLBACK_URL` con:
```json
{
  “job_id”: “...”,
  “tenant_id”: “...”,
  “filename”: “scan_xxx.pdf”,
  “sql_payload”: { “documento”: {...}, “items”: [...] },
  ...resto del ExtractionResult...
}
```

El `sql_payload` lo construye `build_sql_payload()` en `pizca-server/services/extractor.py`. Estructura canónica:

```json
{
  “documento”: {
    “proveedor_nombre”: “...”,
    “fecha”: “YYYY-MM-DD”,
    “numero_documento”: “...”,
    “total_documento”: 123.45,
    “local_receptor”: “...”,
    “tipo_documento”: “Factura | Albaran | Presupuesto | Factura Resumen”,
    “albaranes_vinculados”: [],
    “iva_footer”: [{“tipo_iva”: 10, “base”: 72.03, “cuota”: 7.20}],
    “observations”: “texto libre del operario o null”
  },
  “items”: [
    {
      “raw_name”: “...”,
      “cantidad_comprada”: 1.0,
      “precio_unitario”: 12.50,
      “precio_linea”: 12.50,
      “iva_percent”: 10.0,
      “alias_match”: true,
      “master_item_id”: “uuid”,
      “prompt_version”: “v4-text”,
      ...
    }
  ]
}
```

Notas:
- `precio_unitario` y `precio_linea` son **SIN IVA**.
- `iva_footer` se extrae del pie del documento (más fiable que inferencia por línea).
- `observations` llega desde el campo de notas del scanner; la función SQL lo persiste en `erp_documents.notes`.
- `prompt_version` viaja en cada ítem individual; la función SQL lo lee con `item->>'prompt_version'`.
- La estructura canónica de `SqlPayload` vive en `pizca-server/pizca-extractor/models/schemas.py`.

### 5) Ejecutar función SQL v4 en Supabase

Firma verificada:

```sql
public.procesar_factura_completa_v4(
  p_tenant_id uuid,
  p_json_payload jsonb,
  p_file_url text
) returns jsonb
security definer
```

Efectos principales (ver `docs/integrations/supabase.md` y `docs/domain/documentos-y-revision.md`):

- inserta/actualiza `erp_providers` si el proveedor no existía
- resuelve `venue_id` (según `doc_type`, `shared_pricing` y `local_receptor`)
- deduplicación por (`provider_id`, `document_number`) para docs no-presupuesto
- inserta `erp_documents` y `erp_purchase_lines`
- decide `erp_purchase_lines.review_status`:
  - `auto_approved` vs `pending_review`
  - marca `review_reasons` en `ai_interpretation`
- crea entradas en `erp_price_history` para líneas `auto_approved` con precio > 0
- setea `erp_documents.status='approved'` si ninguna línea requiere revisión, si no `pending`

### 5b) Notificar completion al extractor (`/job-complete/{job_id}`)

n8n llama al endpoint `POST /job-complete/{job_id}` del extractor con:
```json
{
  "status": "success | duplicate | failed",
  "document_id": "uuid del erp_document creado",
  "extraction_log_id": "uuid del extraction_log de este job",
  "auto_approval": true,
  "message": "...",
  "error": null
}
```

El extractor actualiza el job en Redis (para el polling del scanner) **y** parchea `extraction_logs.document_id` usando `extraction_log_id` + `document_id`. Esto resuelve el problema de que `extraction_logs.document_id` siempre era NULL (el log se crea antes del documento SQL).

**Requisito en n8n:** El workflow "Pizca - Extraction Callback" debe incluir `extraction_log_id` (que viaja en el `ExtractionResult` del callback de FastAPI) en el body del POST a `/job-complete`.

### 6) Notificar resultado

En el pipeline observado, n8n notifica por Telegram:

- duplicado (`status='duplicate'`)
- success + `auto_approval=true` (aprobado automáticamente)
- success + `auto_approval=false` (pendiente de revisión en la web)

## Caso especial: “Factura Resumen” (conciliación con albaranes)

La función v4 tiene una rama especial cuando:

- `items` está vacío **y**
- `documento.albaranes_vinculados` trae uno o más números

Efecto:

- inserta la factura resumen en `erp_documents` con `referenced_delivery_notes` y `reconciliation_status`
- busca albaranes existentes (`doc_type='Albaran'`, mismo proveedor, `parent_invoice_id IS NULL`) cuyo `document_number` esté en `referenced_delivery_notes`
- calcula `reconciliation_delta = total_factura - suma_albaranes`
- si encuentra todos y el delta ≈ 0:
  - marca la factura como `approved`
  - marca `reconciliation_status='matched'`
  - vincula albaranes con `parent_invoice_id=<factura_resumen_id>`
- si no:
  - deja la factura en estado de conciliación pendiente/mismatch (requiere intervención)

## Principios y guardrails

- `n8n` orquesta; la lógica de auto-aprobación y persistencia debe vivir en:
  - `procesar_factura_completa_v4` (ingestión)
  - server actions de `obrador-app` (revisión humana)
- No romper naming canónico (ver tabla en `CLAUDE.md`).
