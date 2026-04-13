# Catálogo y Precios

## Objetivo

Documentar la relación entre:

- catálogo maestro (`erp_master_items`)
- diccionario por proveedor (`erp_item_aliases`)
- histórico de precios (`erp_price_history`)

y las invariantes de **precios/costes SIN IVA**.

Este doc cubre el dominio de catálogo y pricing; el flujo de ingestión/revisión de documentos está en `docs/domain/documentos-y-revision.md`.

## Fuentes verificadas

- Supabase MCP (schema `public`): tablas y columnas `erp_master_items`, `erp_item_aliases`, `erp_price_history`, vista `vw_catalogo_precios`.
- Repo: server actions que actualizan alias y price history (principalmente `app/actions/documentRevision.ts` y `app/(dashboard)/documentos/_actions.ts`).

Fecha de verificación: 2026-04-09.

## Invariantes (críticas)

1) **Precios y costes se almacenan SIN IVA**

- `erp_price_history.unit_price` = precio de 1 bulto/formato de compra **SIN IVA**.
- `erp_purchase_lines.unit_price` y `line_total_cost` también son **SIN IVA**.

2) **La unidad base (`base_unit`) es una de**: `ml | g | ud`.

- `contenido_por_envase` debe estar expresado en esa unidad base.
- Para `ud`, lo habitual es `envases_por_formato=1` y `contenido_por_envase=1`.

3) **Packaging vive en el alias** (por proveedor)

- `formato_compra` (Caja, Barril, etc.)
- `envases_por_formato`
- `contenido_por_envase`

## Conceptos

### Producto maestro (`erp_master_items`)

Un producto “canónico” del tenant.

- Identificado por `id` (uuid).
- Nombre normalizado: `official_name`.
- Clasificación: `category`.
- Unidad base: `base_unit` (`ml|g|ud`).

### Alias por proveedor (`erp_item_aliases`)

Representa cómo aparece un producto en los documentos de un proveedor (`raw_name`) y a qué producto maestro se vincula.

Incluye el desglose de packaging necesario para convertir “precio por bulto” a costes comparables:

- `formato_compra`: tipo de bulto (texto)
- `envases_por_formato`: cuántos envases individuales trae el bulto
- `contenido_por_envase`: cantidad por envase (en la `base_unit` del producto maestro)

### Price history (`erp_price_history`)

Registra precios por **(producto maestro, proveedor, venue)** a lo largo del tiempo.

- `unit_price`: precio por bulto (SIN IVA)
- `effective_date`: fecha efectiva (típicamente la del documento)
- `status`:
  - `active`: precio vigente derivado de compra real
  - `archived`: precio anterior desplazado por uno nuevo
  - `quote`: cotización/presupuesto (no compra real) o precio no activado
  - `inactive`: precios fuera de uso
  - `disputed`: precio discutido / en revisión (existe en BD)

## Cálculos de coste (derivados)

`erp_price_history` almacena dos métricas derivadas (ambas SIN IVA):

- `cost_per_packaged_unit` = `unit_price / envases_por_formato`
- `cost_per_base_unit` = `unit_price / (envases_por_formato * contenido_por_envase)`

Estas métricas permiten:

- comparar el mismo producto en distintos formatos
- comparar precios entre proveedores de forma homogénea

### Normalización a “€/L o €/kg” en `vw_catalogo_precios`

La vista `public.vw_catalogo_precios` (verificada) expone `precio_por_litro_kg` como:

```sql
precio_por_litro_kg = cost_per_base_unit * 1000
```

Interpretación:

- Si `base_unit='ml'` → multiplica para pasar de “por ml” a “por litro”.
- Si `base_unit='g'` → multiplica para pasar de “por g” a “por kg”.
- Si `base_unit='ud'` → esta columna no representa litros/kg; debe usarse `precio_botella_o_unidad`.

## Cómo se puebla y actualiza el catálogo/precios

### 1) Ingestión automática desde documentos (SQL v4)

En el flujo estándar, `procesar_factura_completa_v4`:

- crea/usa `erp_master_items` cuando el extractor ya entrega `master_item_id` (producto conocido)
- inserta líneas en `erp_purchase_lines`
- para líneas `auto_approved` con precio, inserta/archiva `erp_price_history` (status `active` o `quote` según `doc_type`)

### 2) Revisión humana (panel `/admin/revision`)

Al aprobar un documento, `approveDocument`:

- vincula líneas a `erp_master_items` (link existing o create)
- upsertea `erp_item_aliases` para “aprender” el `raw_name` del proveedor + packaging
- inserta/archiva `erp_price_history` si el operario confirmó/corrigió un precio
- respeta presupuestos:
  - si `activate_prices=false` → escribe `quote`
  - si `activate_prices=true` → escribe `active`

### 3) Edición posterior en historial de documentos (`/documentos`)

Existe una acción de guardado que, cuando cambia el precio de una línea, puede:

- archivar el `active` actual en `erp_price_history`
- insertar un nuevo `active` con:
  - `document_id` (trazabilidad)
  - costes derivados calculados desde alias
- registrar `extraction_corrections` si la IA propuso un precio diferente

## Proveedor preferido (`is_preferred`)

El sistema marca un proveedor como “preferido” por producto (para compras habituales).

Reglas observables (por comportamiento de server actions):

- `is_preferred` vive en `erp_price_history` (por fila de precio).
- cuando se marca un precio como preferido, se desmarca el resto de proveedores para ese `master_item_id` (por `status`, típicamente `active` o `quote`).
- si se inserta el **primer** precio de un producto (para ese `status`), puede auto-marcarse como preferido.

> Nota: el contrato exacto “1 preferido por producto” depende de cómo se consulten/limpien filas históricas; mantener esta intención como invariante de UX.

## Vista `vw_catalogo_precios` (para bots/consultas)

La vista verificada `public.vw_catalogo_precios` expone:

- `producto`, `categoria`
- `nombre_en_factura` (alias/raw_name)
- `proveedor`, `local`
- `tipo_bulto`, `unidades_por_bulto`, `tamano_unidad_ml_g`
- `precio_bulto`, `precio_botella_o_unidad`, `precio_por_litro_kg`
- `unidad_medida_base`, `fecha_actualizacion`, `es_proveedor_preferido`

Filtro de la vista (verificado):

- solo precios `erp_price_history.status='active'`
- solo proveedores activos (`erp_providers.is_active=true`)

## Notas / puntos a confirmar

- **Schema mismatch detectado:** en Supabase, `erp_item_aliases` NO tiene columna `conversion_multiplier` (verificado en `information_schema.columns`).
  - Sin embargo, hay código que intenta escribir ese campo al upsertear alias.
  - Si el sistema está funcionando en producción, puede haber divergencia entre el schema consultado por MCP y el esperado por la app, o el código no está ejecutando esa rama.
  - Acción recomendada: confirmar el schema real del proyecto y/o ajustar el payload/DB (fuera del alcance de este doc).
