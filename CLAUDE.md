# CLAUDE.md — obrador-app (Pizca Web App)

Este archivo da contexto completo a Claude Code para trabajar en el repo `obrador-app`.
Última actualización: 2026-04-04.

## 1. Visión General del Proyecto

**Pizca** — SaaS ERP gastronómico multi-tenant para gestión financiera, compras automatizadas por IA y coste de escandallos en tiempo real. Desarrollado por WeScaleOps. Cliente actual: Grupo 78 Sabores (3 locales: Biergarten by 78, Cafeseamos, 78 Sabores y Copas).

### Arquitectura Global (todos los componentes)

```
Canales de entrada (Telegram/WhatsApp/Web/Email)
        │
        ▼
    N8N (orquestador — solo triggers e integraciones, NO lógica de negocio)
        │
        ▼
    pizca-extractor (FastAPI, puerto 8001, servidor Oracle)
    → GPT-4o extrae datos + normaliza productos nuevos
        │
        ▼
    Supabase (PostgreSQL + Auth + Storage)
    → Función procesar_factura_completa_v4 decide auto-aprobación
        │
        ▼
    Pizca Web App (este repo — Next.js en Vercel)
    → Panel de revisión + documentos + catálogo + escandallos
```

### Repos del proyecto
- `Mgonza1712/obrador-app` — Este repo. Web app Next.js → deploy Vercel
- `Mgonza1712/pizca-server` — Extractor FastAPI → deploy Oracle vía GitHub Actions

### Commands
```bash
npm run dev       # Dev server (Turbopack)
npm run build     # Production build
npm run lint      # ESLint
npx supabase gen types typescript --project-id anszcyixjopxnskpxewg --schema public > database.types.ts
```

## 2. Tech Stack

- **Framework:** Next.js (App Router, RSC) + TypeScript
- **Backend/DB:** Supabase — proyecto: `anszcyixjopxnskpxewg`, región: `eu-west-1`
  - Browser client: `lib/supabase/client.ts`
  - Server client: `lib/supabase/server.ts` — exporta `createClient` (NO `createServerClient`)
- **Styling:** Tailwind CSS v4 (OKLCH, dark mode)
- **UI:** shadcn/ui (new-york) + Lucide Icons
- **Deploy:** Vercel automático desde `main`

## 3. Naming Consistency — Variables unificadas entre plataformas

**CRÍTICO:** Estos nombres se usan en TODO el pipeline (prompt LLM, extractor Python, adapter N8N, función SQL, app). Al implementar cambios, respetar siempre esta tabla:

| Variable | Significado | Dónde |
|---|---|---|
| `raw_name` | Nombre textual exacto del documento | Todo el pipeline |
| `official_name` | Nombre normalizado del producto maestro | LLM, erp_master_items |
| `cantidad_comprada` | Cuántos bultos/unidades de compra | Todo el pipeline |
| `precio_unitario` | Precio de UN bulto (sin IVA) | LLM, SQL (unit_price), app |
| `precio_linea` | Total línea = cantidad × precio_unitario (sin IVA) | Adapter calcula, SQL (line_total_cost) |
| `iva_percent` | Porcentaje de IVA (4, 10, 21) | LLM, SQL, app |
| `formato_compra` | Tipo de bulto (Caja, Barril, etc.) | erp_item_aliases, app |
| `envases_por_formato` | Unidades físicas por bulto | erp_item_aliases, app |
| `contenido_por_envase` | Cantidad de ml/g/ud por envase | erp_item_aliases, app |
| `base_unit` | Unidad base (ml, g, ud) | erp_master_items |
| `confidence_precio` | Score 0-1 del LLM | Extractor, SQL, app |

**Nombres que ve el operario en la UI:**
- "Formato de compra" → `formato_compra`
- "Envases por formato" → `envases_por_formato`
- "Contenido por envase" → `contenido_por_envase`

## 4. Database Schema

### Multi-tenancy & RLS

RLS está habilitado en las tablas core del ERP (principalmente `erp_*`) y aísla datos por `tenant_id` (directo o vía joins).

**Excepciones verificadas (sin RLS al 2026-04-09):**

- `erp_channel_accounts` (resolución de `tenant_id` desde canales; usado por n8n)
- `extraction_logs` (telemetría del extractor)
- `extraction_corrections` (dataset de correcciones humanas)

Server Actions usan `createClient` de `lib/supabase/server.ts`.

### Dominio: Compras & Catálogo
```
erp_documents        — Cabeceras. total_amount = total CON IVA del documento
                      Soporta conciliación factura-resumen ↔ albaranes (parent_invoice_id,
                      referenced_delivery_notes, reconciliation_status, reconciliation_delta)
erp_purchase_lines   — Líneas. unit_price = precio unitario SIN IVA, iva_percent por línea
erp_master_items     — Catálogo. base_unit: 'ml'|'g'|'ud'
                       Categorías: 'Cervezas', 'Vinos y Licores', 'Refrescos y Agua',
                       'Café e Infusiones', 'Carnes', 'Pescados y Mariscos',
                       'Frutas y Verduras', 'Lácteos y Huevos', 'Panadería y Bollería',
                       'Congelados', 'Conservas y Salsas', 'Aceites y Condimentos',
                       'Harinas y Cereales', 'Limpieza e Higiene', 'Descartables',
                       'Equipamiento', 'Servicios'
erp_item_aliases     — Diccionario nombre/formato por proveedor
                       Campos: raw_name, provider_id, master_item_id,
                       formato_compra, envases_por_formato, contenido_por_envase
erp_price_history    — Historial precios. unit_price = SIN IVA, iva_percent guardado
                       status: 'active'|'archived'|'quote'|'inactive'|'disputed'
erp_providers        — channel: 'email'|'whatsapp'|'telegram'|'telefono'
extraction_logs      — Metadata de cada extracción
extraction_corrections — Correcciones humanas (dataset para mejora iterativa)
```

### Dominio: Escandallos
```
assemblies           — Platos y sub-recetas. Costes = SIN IVA
bom_lines            — Ingredientes. component_id XOR sub_assembly_id
components           — Puente master_item → tenant
unit_conversions     — Conversiones de unidades
cost_alerts          — Alertas de inflación/margen
```

### Formatos de compra válidos
Caja, Barril, Bidón, Bolsa, Unidad, Kilogramo, Retráctil

### Lógica de venue por tipo de documento
- Presupuesto → siempre Sede Central
- Albarán → detectar local_receptor (shared_pricing NO aplica)
- Factura → si shared_pricing=true → Sede Central; si false → detectar local

## 5. Precios — Semántica

**CRÍTICO: Todo el sistema trabaja con precios SIN IVA internamente.**

- `erp_price_history.unit_price` = precio de 1 bulto SIN IVA
- `erp_purchase_lines.unit_price` = precio unitario SIN IVA
- `erp_purchase_lines.line_total_cost` = cantidad × precio_unitario (SIN IVA)
- `erp_documents.total_amount` = total del documento CON IVA (lo que dice la factura)
- `erp_purchase_lines.iva_percent` = % de IVA de esa línea (4, 10, 21)
- Validación de descuadre: total_documento vs SUM(precio_unitario × cantidad × (1 + iva/100))

Costes calculados en erp_price_history:
- `cost_per_base_unit` = unit_price / (envases_por_formato × contenido_por_envase)
- `cost_per_packaged_unit` = unit_price / envases_por_formato

## 6. Flujo de auto-aprobación (función SQL v4)

```
alias_match=true + confidence_precio ≥ provider.price_confidence_threshold (default 0.90) → auto_approved
alias_match=true + confidence_precio < provider.price_confidence_threshold             → pending_review (low_price_confidence)
alias_match=true + albarán sin precio       → auto_approved
alias_match=false (producto nuevo)           → pending_review (new_product)
```

Notas:

- El threshold es dinámico por proveedor (`erp_providers.price_confidence_threshold`).
- Envases retornables (`is_envase_retornable=true`) se auto-aprueban y no deben generar catálogo ni price_history.
- Existe una rama de **Factura Resumen** en SQL v4: si no hay `items` pero sí `albaranes_vinculados`, intenta auto-conciliar y vincular albaranes (`parent_invoice_id`).

Si TODAS las líneas auto_approved → documento status='approved' (no va a revisión).
Si alguna pending_review → documento status='pending' (va a /admin/revision).

## 7. Panel de revisión — Responsabilidades del Server Action

El Server Action `approveDocument` se encarga de:
- Crear `erp_master_items` nuevos (solo para new_product)
- Crear `erp_item_aliases` nuevos
- Insertar/actualizar `erp_price_history` para líneas reviewed
- En `Presupuesto`, respetar el toggle `activate_prices` (crear `price_history` como `quote` vs `active`)
- Si el operario cambió el precio de una línea auto_approved → actualizar price_history + registrar extraction_correction
- Marcar documento como 'approved'

**IMPORTANTE:** La función SQL v4 ya creó price_history para las líneas auto_approved. El Server Action NO debe duplicar esos inserts — solo actúa sobre líneas que el operario tocó.

## 8. Líneas low_price_confidence — UX
- Resaltar precio con borde naranja y badge "⚠️ Verificar precio"
- Mostrar último precio conocido del proveedor como referencia
- Si variación >5%, mostrar % de cambio
- Producto maestro read-only, no requiere confirmación

## 9. Productos nuevos — Preview visual
Pre-seleccionado (no requiere click "Correcto"). Ejemplo:
"Caja de 24 × 333ml → 16.69€/caja → 0.70€/bot → 2.10€/L"
[✏️ Editar desglose] — solo si quiere corregir los campos detallados

## 10. Caso skip en revisión
- review_status → 'skipped', no bloquea aprobación
- Sin master_item, alias ni price_history
- Completar después en /documentos/[id] con badge "Pendiente de vincular"
- Filtro en /documentos para encontrar documentos con líneas skipped

## 11. Frontend Conventions
- **Server Actions First:** `app/actions/` con `"use server"` + Zod
- **Loading States:** Cada ruta con `loading.tsx`, `useTransition` en botones
- **Combobox:** shadcn `<Command>` + `<Popover>` para listas grandes
- **Debouncing:** En filtros client-side antes de actualizar URL params
- **`database.types.ts` se vuelve stale** — regenerar con el comando de la sección 2

## 12. Route Structure
```
app/(dashboard)/                     — Layout principal
app/(dashboard)/escandallos/         — Motor financiero de costes
app/(dashboard)/documentos/          — Historial y conciliación
app/(dashboard)/catalogo/            — Catálogo con proveedor preferido
app/(dashboard)/proveedores/         — Gestión de proveedores
app/(dashboard)/alertas-rentabilidad/ — Alertas financieras
app/(dashboard)/admin/revision/      — Revisión humana de documentos pendientes
```

## 13. Actualización de este archivo
Actualizar al final de cada sesión importante. Claude.ai genera el contenido, Claude Code lo aplica, GitHub Desktop hace commit `docs: update CLAUDE.md — [fecha]`.

## 14. Sistema de documentación del repo

`CLAUDE.md` sigue siendo el documento principal de reglas e invariantes. La documentación complementaria vive en:

- `AGENTS.md` — flujo compartido para agentes
- `docs/architecture.md` — mapa del sistema
- `docs/domain/` — reglas de negocio por dominio
- `docs/integrations/` — Supabase y pipeline externo
- `docs/runbooks/` — operación y despliegue
- `docs/changes/` — especificaciones de cambios
- `docs/decisions/` — decisiones duraderas
- `docs/handoffs/` — estado temporal de trabajo

### Cuándo leer qué

Antes de empezar cualquier tarea, identifica el área afectada y lee la doc canónica correspondiente:

- Cambios en lógica de negocio (precios, IVA, aprobación, escandallos) → `docs/domain/`
- Cambios en integraciones (Supabase, n8n, extractor) → `docs/integrations/`
- Si existe un archivo activo en `docs/changes/` → leerlo siempre antes de implementar
- Si existe un archivo en `docs/handoffs/` → leerlo para retomar trabajo previo

### Reglas operativas

- Antes de cambiar código, identifica qué documento es canónico para el área afectada y léelo.
- Si cambias una regla de negocio, arquitectura o integración, actualiza la doc canónica correspondiente en el mismo trabajo.
- Si un cambio es grande o ambiguo, crea o actualiza un archivo en `docs/changes/`.
- Si dejas trabajo a medias, crea un handoff corto en `docs/handoffs/`.

### MCPs disponibles

- **Supabase MCP** — úsalo para verificar tablas, funciones, tipos y relaciones reales antes de implementar o documentar algo relacionado con la base de datos. No asumas el schema: verifícalo.
- **Notion MCP** — úsalo para recuperar contexto histórico y decisiones pasadas. No trates Notion como fuente canónica final: migra lo relevante al repo.
