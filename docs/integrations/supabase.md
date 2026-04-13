# Supabase

## Objetivo

Documentar el uso de Supabase en `obrador-app`: clientes (browser/server), multi-tenancy (RLS), tablas y funciones principales del dominio de documentos/catálogo, y prácticas seguras para cambios.

## Fuentes verificadas

- Repo:
  - `lib/supabase/client.ts`
  - `lib/supabase/server.ts`
  - server actions que leen/escriben tablas `erp_*`
- Supabase MCP:
  - schema `public` (tablas/columnas/RLS policies)
  - función `public.procesar_factura_completa_v4`
  - vistas `vw_*`

Fecha de verificación: 2026-04-09.

## Clientes Supabase en este repo

### Browser client

Archivo: `lib/supabase/client.ts`

- Usa `createBrowserClient<Database>` de `@supabase/ssr`.
- Requiere env vars:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Server client

Archivo: `lib/supabase/server.ts`

- Usa `createServerClient<Database>` de `@supabase/ssr`.
- Usa cookies (`next/headers`) para propagar sesión.
- **Exporta `createClient()`** (este nombre se usa en server actions y server components).

## Multi-tenancy y RLS

### Modelo

- La mayoría de tablas de negocio se aíslan por `tenant_id` (directo o vía joins).
- Las políticas observadas usan la función `auth_tenant_id()`.

Políticas verificadas (ejemplos):

- `erp_documents`: `tenant_id = auth_tenant_id()`
- `erp_purchase_lines`: existe un `erp_documents d` tal que `d.id = erp_purchase_lines.document_id` y `d.tenant_id = auth_tenant_id()`
- `erp_item_aliases` y `erp_price_history`: isolation vía `erp_master_items.tenant_id`

### Tablas con RLS habilitado (verificado)

- `erp_documents`
- `erp_purchase_lines`
- `erp_master_items`
- `erp_item_aliases`
- `erp_price_history`
- `erp_providers`
- `erp_venues`

### Tablas relevantes con RLS deshabilitado (verificado)

Estas tablas existen y **NO** tienen RLS habilitado (al 2026-04-09):

- `erp_channel_accounts` (resolución de tenant desde canal; usado por n8n)
- `extraction_logs` (telemetría del extractor)
- `extraction_corrections` (dataset de correcciones humanas)

Implicación: cualquier acceso a estas tablas debe hacerse con cuidado (idealmente restringido por rol/credenciales fuera de RLS).

## Tablas principales (documentos, líneas, catálogo, precios)

### Documentos — `erp_documents`

Campos relevantes (resumen):

- Identidad/relaciones: `id`, `tenant_id`, `venue_id`, `provider_id`
- Cabecera: `doc_type`, `document_date`, `document_number`, `total_amount`
- Archivo: `drive_url` (se usa para firmar URL de bucket `facturas` en la app)
- Estado: `status`
- IA: `ai_interpretation` (JSONB)

Conciliación (factura resumen ↔ albaranes):

- `parent_invoice_id` (self-FK; albarán apunta a factura resumen)
- `referenced_delivery_notes` (text[])
- `reconciliation_status` (`pending|matched|mismatch|manual` o NULL)
- `reconciliation_delta` (numeric)

### Líneas de compra — `erp_purchase_lines`

Campos relevantes (resumen):

- Relación: `document_id`, `master_item_id`
- Cantidades y precios: `quantity`, `unit_price`, `line_total_cost` (SIN IVA)
- Control revisión: `review_status` (`auto_approved|pending_review|reviewed|skipped`)
- IVA: `iva_percent`
- Envases/depósitos: `is_envase_retornable`
- IA: `ai_interpretation` (JSONB)

### Catálogo — `erp_master_items` y `erp_item_aliases`

- `erp_master_items`: producto maestro por tenant (`official_name`, `category`, `base_unit`).
- `erp_item_aliases`: mapea `raw_name` por proveedor a un `master_item_id` e incluye packaging:
  - `formato_compra`
  - `envases_por_formato`
  - `contenido_por_envase`

### Price history — `erp_price_history`

Campos relevantes:

- Keys: `master_item_id`, `provider_id`, `venue_id`
- Precio: `unit_price` (SIN IVA)
- Costes derivados:
  - `cost_per_packaged_unit`
  - `cost_per_base_unit`
- Estado: `status` (ver check constraint en BD; incluye `active|archived|quote|inactive|disputed`)
- Preferencia: `is_preferred`
- Trazabilidad: `effective_date`, `created_at`, `document_id` (puede ser NULL)

## Funciones SQL relevantes

### `procesar_factura_completa_v4`

Firma verificada:

```sql
public.procesar_factura_completa_v4(
  p_tenant_id uuid,
  p_json_payload jsonb,
  p_file_url text
) returns jsonb
language plpgsql
security definer
```

Qué hace (resumen):

- normaliza `doc_type` (`Factura`, `Albaran`, `Presupuesto`, `Factura Resumen`)
- crea proveedor si no existe
- resuelve `venue_id` considerando:
  - `doc_type`
  - `erp_providers.shared_pricing`
  - `documento.local_receptor`
- deduplicación por `provider_id + document_number` (excepto `Presupuesto`)
- inserta `erp_documents`
- inserta `erp_purchase_lines` y decide `review_status`:
  - usa threshold dinámico por proveedor: `erp_providers.price_confidence_threshold` (default 0.90)
  - `review_reasons` típicos: `low_price_confidence`, `new_product`
  - `is_envase_retornable=true` → auto-approved y no genera catálogo/precios
- inserta/archiva `erp_price_history` para líneas `auto_approved` con precio > 0
- actualiza `erp_documents.status` a `approved` si no hay líneas pendientes; si no `pending`
- soporta “Factura Resumen”: intenta conciliar albaranes por `document_number` y vincula con `parent_invoice_id`

Versiones anteriores observadas en BD:

- `procesar_factura_completa_v3(p_tenant_name text, p_json_payload jsonb, p_file_url text)`
- `procesar_factura_completa(p_tenant_name text, p_json_payload jsonb, p_file_url text, p_modo text)`

## Triggers

Al 2026-04-09, no se encontraron triggers declarados en `information_schema.triggers` para:

- `erp_documents`, `erp_purchase_lines`, `erp_master_items`, `erp_item_aliases`, `erp_price_history`

Si se agregan triggers en el futuro, documentarlos acá porque impactan idempotencia y side effects.

## Vistas `vw_*` (uso por automatización/bots)

Vistas verificadas en `public`:

- `vw_catalogo_precios` (usada por un AI Agent en n8n)
- `vw_dashboard_inflacion`
- `vw_dashboard_top_platos`
- `vw_menu_bot`

## Storage

Bucket observado desde la app:

- `facturas`

La app genera Signed URLs (1h) a partir de `drive_url` (ver `app/actions/documents.ts`).

## Tipos TypeScript (database.types.ts)

El repo contiene `database.types.ts` y se regenera con:

```bash
npx supabase gen types typescript --project-id anszcyixjopxnskpxewg --schema public > database.types.ts
```

## Uso seguro de Supabase MCP

- Para **leer** estado real: `supabase_list_tables(verbose=true)` y `supabase_execute_sql(select ...)`.
- Para **cambios DDL**: usar `supabase_apply_migration` (no `execute_sql`).
- Al documentar algo como “verdad”, indicar si fue verificado en:
  - repo
  - Supabase MCP
  - n8n MCP
