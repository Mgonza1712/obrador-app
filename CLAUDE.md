# CLAUDE.md

This file provides strict guidance to Claude Code (claude.ai/code) when working with the "Obrador App" repository.

## 1. Project Overview
**Pizca** (formerly Obrador App) — SaaS ERP gastronómico multi-tenant para gestión financiera, compras automatizadas por IA y coste de escandallos en tiempo real. Desarrollado por WeScaleOps. Cliente actual: Grupo 78 Sabores (3 locales: Biergarten by 78, Cafeseamos, 78 Sabores y Copas).

### Commands
```bash
npm run dev       # Start dev server (uses Turbopack)
npm run build     # Production build
npm run start     # Start production server
npm run lint      # Run ESLint
```

## 2. Tech Stack & Architecture

### Web App (este repo)
- **Framework:** Next.js (App Router, React Server Components) + TypeScript
- **Backend/DB:** Supabase (PostgreSQL, Auth, Storage) — proyecto: `anszcyixjopxnskpxewg`, región: `eu-west-1`
  - Browser client: `lib/supabase/client.ts`
  - Server client: `lib/supabase/server.ts` — exporta `createClient` (no `createServerClient`)
- **Styling:** Tailwind CSS v4 (OKLCH color system, dark mode)
- **UI Components:** shadcn/ui (new-york style) + Lucide Icons
- **Deploy:** Vercel (automático desde rama `main` del repo `Mgonza1712/obrador-app`)

### Servidor Oracle (infraestructura separada)
- **Automatización:** n8n (orquestador de triggers e integraciones)
- **Extractor de documentos:** microservicio FastAPI en `~/pizca-server/pizca-extractor/` — puerto 8001
- **Mensajería:** Evolution API (WhatsApp)
- **Reverse proxy:** Caddy
- **Repo del servidor:** `github.com/Mgonza1712/pizca-server` (privado)
- Deploy automático vía GitHub Actions al hacer push a `main`

## 3. Route Structure

### Core ERP (Dashboard)
```
app/(dashboard)/                    — Layout principal del dashboard
app/(dashboard)/escandallos/        — Motor financiero de costes. CRUD de platos y sub-recetas
app/(dashboard)/documentos/         — Historial y conciliación de facturas/albaranes
app/(dashboard)/catalogo/           — Catálogo activo con proveedor preferido por producto
app/(dashboard)/proveedores/        — Gestión de proveedores, métricas y fusión de duplicados
app/(dashboard)/alertas-rentabilidad/ — Panel de notificaciones financieras
app/admin/revision/                 — UI de control humano para facturas que la IA no aprobó
```

### V1 / Legacy (a migrar)
```
app/recetario/   — (Legacy) Calculadora de escalado. Migrar a usar assemblies
app/fichas/      — (Legacy) SOPs visuales. Migrar a usar assemblies
```

### Auth
```
app/login/ + app/auth/callback/  — Supabase auth flow. Middlewares protegen rutas y validan JWTs
```

## 4. Database Schema & Multi-Tenancy

### Multi-tenancy & RLS
**CRÍTICO:** RLS está HABILITADO en todas las tablas de negocio.
- Todos los datos están filtrados por `tenant_id` (vinculado a `erp_tenants`)
- Los perfiles (`profiles`) vinculan `auth.users` a un `tenant_id` y `venue_id`
- El cliente autenticado de Supabase pasa el JWT automáticamente — PostgreSQL filtra invisiblemente
- Las Server Actions DEBEN ejecutarse con el cliente servidor autenticado (`createClient` de `lib/supabase/server.ts`)

### Dominio: Compras & Catálogo
```
erp_documents        — Cabeceras de facturas/albaranes/presupuestos
erp_purchase_lines   — Líneas de cada documento
erp_master_items     — Catálogo único de materias primas
                       base_unit válidos: 'ml', 'g', 'ud'
                       category válidos: 'Bebidas Alcohólicas', 'Bebidas Sin Alcohol',
                       'Alimentos Secos', 'Alimentos Frescos', 'Lácteos',
                       'Limpieza', 'Descartables', 'Otros'
erp_item_aliases     — Diccionario de nombres/formatos por proveedor para cada master_item
                       Campos: raw_name, provider_id, master_item_id, unidad_precio,
                       unidades_por_pack, cantidad_por_unidad, conversion_multiplier, formato
erp_price_history    — Historial inmutable de precios
                       status válidos: 'active', 'archived', 'quote', 'inactive'
                       'quote' = cotización recibida, sin compra real (para comparativas)
erp_providers        — channel válidos: 'email', 'whatsapp', 'telegram', 'telefono'
                       is_trusted: activa auto-aprobación si todos los items tienen alias
extraction_logs      — Registro de cada documento procesado por el extractor FastAPI
extraction_corrections — Correcciones humanas sobre lo que infirió el LLM (dataset futuro)
```

### Dominio: Escandallos (Motor Financiero)
```
assemblies           — Platos, sub-recetas o preparaciones finales
bom_lines            — Ingredientes. FK mutuamente excluyentes:
                       component_id (materia prima) XOR sub_assembly_id (sub-receta)
                       Usa waste_pct para merma individual, display_quantity/display_unit para UI
components           — Puente entre un master_item y el tenant
unit_conversions     — Tabla de conversiones para normalizar unidades
cost_alerts          — Alertas de inflación y margen
```

### Lógica de venue por tipo de documento
- **Presupuesto/Cotización** → siempre Sede Central (venue genérico)
- **Albarán** → detectar `local_receptor` (shared_pricing NO aplica)
- **Factura** → si `shared_pricing=true` → Sede Central; si `false` → detectar `local_receptor`

## 5. Backend Business Rules (NO RE-IMPLEMENTAR EN FRONTEND)

### Escandallos — Cálculo de Costes en Cascada (COGS)
**NUNCA calcules matemáticas en el frontend.** PostgreSQL maneja todo via Triggers y Funciones Recursivas:
- Cuando se aprueba un precio en `erp_price_history`, un trigger recalcula el coste en cascada de todos los `assemblies` afectados
- PostgreSQL normaliza unidades automáticamente (1 kg → 1000 g)
- El coste final (`cogs`) y margen (`margin_pct`) se leen de `assemblies` o vistas SQL (`assemblies_with_financials`)
- **Precio para escandallos:** usar el último precio activo por `effective_date`, NO el del proveedor preferido

### Módulo de Compras — Flujo de ingesta
La función RPC `procesar_factura_completa` maneja la entrada de documentos:
- `draft` → va a revisión humana (`app/admin/revision/`)
- `auto` → se aprueba sola si `is_trusted=true` Y todos los items tienen alias en `erp_item_aliases`
- Si hay productos nuevos → fuerza `draft` independientemente de `is_trusted`

### Extractor FastAPI (nuevo en Fase 2B)
El endpoint `POST http://[servidor]:8001/extract` recibe un PDF/imagen en base64 y devuelve JSON con scores de confianza. Pipeline de dos pasos:
1. GPT-4o extrae fielmente (sin inferir)
2. Matching contra `erp_item_aliases` → si hay alias, normalización sin LLM; si no, LLM infiere y guarda alias nuevo

**IMPORTANTE:** el extractor crea `erp_master_items` y `erp_item_aliases` directamente. El panel de revisión en `app/admin/revision/` debe mostrar items con `needs_review: true` del response del extractor.

### Storage (Documentos Seguros)
El bucket `facturas` en Supabase S3 es PRIVADO.
Para mostrar un PDF/imagen NUNCA uses la URL pública. Usa la Server Action `getSecureDocumentUrl` (usa `createSignedUrl` válida por 1 hora) antes de renderizar el iframe/img.

## 6. Frontend Conventions & UX Rules

- **Server Actions First:** Mutations deben ir por `app/actions/` usando `"use server"`. Usar Zod para validación antes de tocar Supabase.
- **UI Feedback (Toasts):** Siempre usar try/catch en server actions y mostrar mensajes con `sonner` o shadcn's `<Toaster />` (verde = éxito, rojo = error).
- **Loading States (Suspense):** Cada ruta DEBE tener `loading.tsx` con skeleton loaders. Usar `useTransition` o `isPending` en todos los botones de submit (deshabilitarlos mientras se guarda).
- **Relational Data (Combobox):** Para seleccionar relaciones (Proveedores, Productos, Ingredientes), usar ESTRICTAMENTE shadcn's `<Command>` + `<Popover>` (patrón Combobox). NUNCA usar `<select>` nativo para listas grandes.
- **Debouncing:** En filtros client-side (Data Tables), hacer debounce del input antes de actualizar URL search params para no spamear la DB.

## 7. Cómo mantener este archivo actualizado

Este archivo debe actualizarse al final de cada sesión de trabajo importante. El proceso:
1. En Claude.ai (claude.ai/chat), al terminar una sesión, pedirle que genere un CLAUDE.md actualizado
2. Claude Code lo aplica en VS Code con el contenido nuevo
3. GitHub Desktop hace commit: `docs: update CLAUDE.md — [fecha]`
4. Push a main → Vercel hace deploy automático

**Criterio para actualizar:** cambios en schema de DB, nuevas rutas, nuevas Server Actions, nuevas reglas de negocio, cambios en la arquitectura general.