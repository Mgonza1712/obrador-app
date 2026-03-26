---
trigger: always_on
---

### Base de datos — Supabase (anszcyixjopxnskpxewg, eu-west-1)
Sin ORM — queries directas al cliente Supabase.
Browser client: lib/supabase/client.ts | Server client: lib/supabase/server.ts
Usar SIEMPRE el client correcto: browser para 'use client', server para page.tsx y actions.

### Tablas clave
- erp_documents + erp_purchase_lines → revisión de facturas (escritas por n8n)
- assemblies + bom_lines + components → recetario y fichas técnicas
- erp_master_items + erp_price_history → catálogo de precios
- profiles + erp_venues → auth y multi-tenant

### Schema — columnas relevantes por tabla

**erp_venues**
`id, name, tenant_id, type` — type: 'bar' | 'restaurante' | 'cafeteria' | 'generic'

**erp_providers**
`id, tenant_id, name, email, phone, contact_name,`
`channel` ('email'|'whatsapp'|'telegram'|'telefono'),
`notes, is_trusted` (bool, default false), `is_active` (bool, default true),
`shared_pricing` (bool — facturas van a Sede Central), `merged_into` (FK self),
`created_at`

**erp_price_history**
`id, master_item_id, provider_id, venue_id, unit_price, cost_per_base_unit,`
`cost_per_packaged_unit, effective_date, status` ('active'|'archived'),
`is_preferred` (bool, default false — proveedor preferido para ese producto)

**erp_master_items**
`id, tenant_id, official_name, category, base_unit, created_at`

**erp_item_aliases**
`id, provider_id, master_item_id, raw_name, unidad_precio, conversion_multiplier,`
`formato, unidades_por_pack, cantidad_por_unidad`

### Vistas importantes
- **vw_catalogo_precios** — precios activos por producto, join con proveedor y venue.
  Campo `es_proveedor_preferido` (bool) usado por el bot de Telegram para cotizaciones.
  No escribir directamente — es una vista de solo lectura.

### Valores válidos (constraints en DB)
- erp_master_items.base_unit: 'ml' | 'g' | 'ud'
- erp_master_items.category: 'Bebidas Alcohólicas' | 'Bebidas Sin Alcohol' |
  'Alimentos Secos' | 'Alimentos Frescos' | 'Lácteos' | 'Limpieza' | 'Descartables' | 'Otros'
- erp_providers.channel: 'email' | 'whatsapp' | 'telegram' | 'telefono'
- Definir estas listas como constantes exportables en lib/constants.ts

### Multi-tenancy
All data is scoped by `tenant_id` (erp_tenants). User profiles link `auth.users` to `tenant_id` and `venue_id`. Always filter queries by `tenant_id`.
