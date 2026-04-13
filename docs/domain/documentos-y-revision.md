# Documentos y Revisión

## Objetivo

Documentar el flujo de documentos de compra (facturas/albaranes/presupuestos), la revisión humana en `obrador-app` y las invariantes de estados/semántica.

Este doc describe *comportamiento de negocio* y contratos observables entre:

- la función SQL de ingestión `procesar_factura_completa_v4`
- la UI/Server Actions de `/admin/revision`

## Fuentes verificadas

- Supabase MCP:
  - tablas `erp_documents`, `erp_purchase_lines`, `erp_master_items`, `erp_item_aliases`, `erp_price_history`, `erp_providers`
  - función `public.procesar_factura_completa_v4`
- Repo:
  - `app/actions/documentRevision.ts` (`approveDocument`)
  - `app/(dashboard)/admin/revision/*`

Fecha de verificación: 2026-04-09.

## Invariantes clave (lectura rápida)

- El sistema opera **SIN IVA** internamente para precios/costes por línea y por bulto (ver `CLAUDE.md` → “Precios — Semántica”).
- `erp_documents.total_amount` representa el total del documento **CON IVA** (lo que “dice la factura”).
- La auto-aprobación y la clasificación de líneas a revisar ocurre en SQL v4.

## Modelo mental

- **Documento** (`erp_documents`): cabecera del documento (proveedor, fecha, total, tipo, local).
- **Línea de compra** (`erp_purchase_lines`): un producto/servicio extraído del documento.
- **Producto maestro** (`erp_master_items`): catálogo normalizado por tenant.
- **Alias** (`erp_item_aliases`): cómo llama un proveedor a un producto maestro + packaging.
- **Histórico de precios** (`erp_price_history`): precio por bulto (SIN IVA) y costes derivados.

## Estados de documento (`erp_documents.status`)

En BD el campo es `text` sin constraint; en la app y la función SQL se usan principalmente:

- `pending`: el documento tiene al menos una línea `pending_review` (o requiere conciliación)
- `pending_review`: aparece en UI como variante/legacy (la UI lo contempla)
- `approved`: documento aprobado (ya sea auto-aprobado o tras revisión humana)

> Fuente: UI lista documentos con `.in('status', ['pending', 'pending_review'])` y acciones actualizan a `approved`.

## Estados de línea (`erp_purchase_lines.review_status`)

Verificado por check constraint en BD:

- `auto_approved`: la línea se auto-aceptó (no requirió revisión humana)
- `pending_review`: requiere confirmación/corrección
- `reviewed`: el operario la revisó y confirmó/corrigió
- `skipped`: el operario decidió omitirla (no bloquea aprobación)

Además:

- `is_envase_retornable=true`: línea de depósito/devolución (barriles, botellas, etc.).
  - nunca debe generar `master_item` ni `price_history`

## Auto-aprobación (SQL v4)

La función `procesar_factura_completa_v4` decide `review_status` línea a línea usando:

- `alias_match` (si el extractor encontró alias conocido + `master_item_id`)
- confianza del precio (`confidence_precio`)
- threshold dinámico por proveedor: `erp_providers.price_confidence_threshold` (default 0.90)
- tipo de documento (`Albaran` permite precio 0)

### Reglas (observadas en SQL)

1) **Envases retornables**

- si `is_envase_retornable=true` → insertar línea con `review_status='auto_approved'` y sin catálogo/precios.

2) **Alias match + master_item_id presente**

- `doc_type='Albaran'` y `precio_unitario=0` → `auto_approved`
- si `confidence_precio >= price_confidence_threshold` → `auto_approved`
- si `confidence_precio < price_confidence_threshold` → `pending_review` con `review_reasons=['low_price_confidence']`

3) **Producto nuevo (sin alias match)**

- `pending_review` con `review_reasons=['new_product']`

### Efecto a nivel documento

- si no hay ninguna línea `pending_review` → `erp_documents.status='approved'`
- si hay al menos una línea `pending_review` → `erp_documents.status='pending'`

## Presupuestos y activación de precios

En SQL v4:

- `doc_type='Presupuesto'` → `erp_price_history.status='quote'` cuando se inserta desde auto-aprobación.

En revisión humana (`approveDocument`):

- existe un toggle `activate_prices` para decidir si un presupuesto debe escribir en `price_history` como `active` (si se activa) o `quote` (si no).

## Price history en ingestión vs revisión

### Ingestión automática (SQL v4)

Para líneas `auto_approved` con `unit_price > 0` y `master_item_id`:

- compara con un precio existente `status=active|quote` (según `doc_type`)
- si no existe → inserta precio
- si existe y cambió el `cost_per_base_unit` → archiva el anterior y crea uno nuevo

### Revisión humana (server action `approveDocument`)

Al aprobar:

1) resuelve proveedor (link existing / create / skip)
2) para cada línea:
   - si es línea nueva (agregada manualmente) → crea `erp_purchase_lines`
   - resuelve master item (link existing / create / skip)
   - upsertea alias por proveedor (`erp_item_aliases`) con packaging
   - actualiza la línea y setea `review_status` (`reviewed` o `skipped`; preserva `auto_approved`)
   - inserta/archiva en `erp_price_history` según corresponda (y preferencia)
   - registra `extraction_corrections` si el operario corrigió algo relevante
3) marca el documento como `approved`

> Nota: `approveDocument` intenta evitar duplicar inserts de `price_history` cuando una línea ya estaba auto-aprobada y el precio coincide.

## Skip (líneas omitidas)

Semántica:

- `review_status='skipped'` **no bloquea** la aprobación del documento.
- Una línea skipped puede vincularse posteriormente desde el historial de documentos.

## Caso especial: Factura Resumen (conciliación)

La función SQL v4 soporta “Factura Resumen” cuando no hay items pero sí `albaranes_vinculados`.

Conceptos:

- Un **albarán** es un `erp_documents` con `doc_type='Albaran'`.
- Una **factura resumen** es un `erp_documents` que referencia múltiples albaranes por `document_number`.

Campos:

- `erp_documents.parent_invoice_id` (en el albarán)
- `erp_documents.referenced_delivery_notes` (en la factura resumen)
- `reconciliation_status` + `reconciliation_delta`

Regla:

- si se encuentran todos los albaranes referenciados y el delta ≈ 0 → auto-conciliado y aprobado
- si no → queda pendiente para conciliación manual
