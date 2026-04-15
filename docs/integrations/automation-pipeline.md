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

Fecha de verificación: 2026-04-09. Última actualización: 2026-04-14 (adapter movido al extractor).

## Workflows n8n (estado observado)

### Workflows activos (según n8n MCP)

- `Error trigger bot Asistente Compras` (activo) — alertas ante errores

Otros workflows activos existen, pero **no estaban accesibles vía MCP** (n8n devuelve: “Workflow is not available in MCP”). Por lo tanto, no se documentan aquí como “fuente de verdad” del pipeline.

### Workflows relevantes (según el grafo de nodos)

- `78 Sabores - Bot catalogo compras` (inactivo, pero con pipeline completo)
  - descarga archivo Telegram
  - guarda PDF en Storage (bucket `facturas`)
  - resuelve `tenant_id` desde canal
  - llama extractor FastAPI
  - adapta payload al contrato SQL v4
  - ejecuta `procesar_factura_completa_v4`
  - notifica duplicados / resultado de extracción

## Paso a paso: ingestión de un documento (ruta “PDF”)

### 0) Resolver multi-tenancy desde el canal

Fuente: tabla Supabase `erp_channel_accounts` (RLS deshabilitado).

- Input típico: `channel='telegram'` + `account_id=<chat_id>`
- Output: `tenant_id`

**Invariante:** `tenant_id` se determina antes de llamar al extractor o al SQL v4.

### 1) Obtener archivo desde el canal

- n8n descarga el binario (ej. Telegram `file_id`).

### 2) Persistir archivo en Storage y construir `file_url`

En este sistema, “file_url” es el **identificador/nombre del archivo en storage** (no necesariamente una URL pública).

Verificado en `obrador-app`: `app/actions/documents.ts` genera Signed URL desde `supabase.storage.from('facturas')` usando el último segmento de `drive_url`.

### 3) Llamar al extractor FastAPI

- Endpoint observado en n8n: `POST http://172.17.0.1:8001/extract`
- Body observado: JSON con `document_base64`, `document_type` (auto/factura/albaran/presupuesto), `tenant_id`, `filename`, `is_image`.

**Responsabilidad del extractor:** leer el documento y devolver un JSON de extracción+normalización (con confidences).

### 4) Adaptar el JSON del extractor al contrato de `procesar_factura_completa_v4`

**El extractor ya incluye el campo `sql_payload` en su respuesta.** El nodo n8n "Adapter Extractor → SQL v4" es ahora un pass-through:

```javascript
return [{ json: $json.sql_payload }];
```

El payload `sql_payload` lo construye `build_sql_payload()` en `pizca-server/services/extractor.py`. Su estructura (claves canónicas; nombres exactos importan):

```json
{
  "documento": {
    "proveedor_nombre": "...",
    "fecha": "YYYY-MM-DD",
    "numero_documento": "...",
    "total_documento": 123.45,
    "local_receptor": "...",
    "tipo_documento": "Factura | Albaran | Presupuesto | Factura Resumen",
    "albaranes_vinculados": ["<numero_albaran>"]
  },
  "items": [
    {
      "raw_name": "...",
      "cantidad_comprada": 1,
      "precio_unitario": 10.00,
      "precio_linea": 10.00,
      "iva_percent": 10,
      "confidence_precio": 0.93,
      "confidence_cantidad": 0.90,
      "alias_match": true,
      "master_item_id": "<uuid>",
      "is_envase_retornable": false,
      "official_name": "...",
      "base_unit": "ud|g|ml",
      "formato_compra": "Caja|...",
      "envases_por_formato": 24,
      "contenido_por_envase": 330,
      "categoria": "...",
      "is_existing_master": false,
      "suggested_master_item_id": null,
      "modelo_llm": "...",
      "unidad_tal_como_aparece": "...",
      "needs_review": true,
      "review_reasons": ["low_price_confidence|new_product"]
    }
  ]
}
```

Notas:

- `precio_unitario` y `precio_linea` son **SIN IVA** (ver invariantes en `CLAUDE.md`).
- `precio_linea` se calcula en el extractor: `round(cantidad_comprada × precio_unitario, 4)`.
- La función SQL también recalcula costes derivados (`cost_per_base_unit`, etc.) usando envases/contenido.
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
