# CLAUDE.md

This file provides strict guidance to Claude Code (claude.ai/code) when working with the "Obrador App" repository.

## 1. Project Overview
**Obrador App** — SaaS ERP gastronómico multi-tenant para gestión financiera, compras automatizadas por IA (n8n) y coste de escandallos en tiempo real. 

### Commands
```bash
npm run dev       # Start dev server (uses Turbopack)
npm run build     # Production build
npm run start     # Start production server
npm run lint      # Run ESLint

2. Tech Stack & Architecture
Framework: Next.js (App Router, React Server Components) + TypeScript.

Backend/DB: Supabase (PostgreSQL, Auth, Storage).

Browser client: lib/supabase/client.ts

Server client: lib/supabase/server.ts

Styling: Tailwind CSS v4 (OKLCH color system, dark mode).

UI Components: shadcn/ui (new-york style) + Lucide Icons.

3. Route Structure
Core ERP (Dashboard)
app/(dashboard)/ — Route group sharing the main dashboard layout.

app/(dashboard)/escandallos/ — [NUEVO] Motor financiero de costes. CRUD de platos y sub-recetas.

app/(dashboard)/documentos/ — [NUEVO] Historial y conciliación de facturas/albaranes.

app/(dashboard)/catalogo/ — Catálogo activo con el proveedor preferido para cada producto.

app/(dashboard)/proveedores/ — Gestión de proveedores, métricas y fusión de duplicados.

app/(dashboard)/alertas-rentabilidad/ — Panel de notificaciones financieras.

app/admin/revision/ — UI de control humano para facturas que la IA no pudo aprobar.

V1 / Legacy (To be refactored)
app/recetario/ — (Legacy) Obrador scaling calculator. Must be migrated to use assemblies.

app/fichas/ — (Legacy) Visual SOPs. Must be migrated to use assemblies.

Auth
app/login/ + app/auth/callback/ — Supabase auth flow. Middlewares protect routes and validate JWTs.

4. Database Schema & Multi-Tenancy
Multi-tenancy & RLS (Row Level Security)
CRITICAL: RLS is ENABLED for all business tables.

All data is scoped by tenant_id (linked to erp_tenants).

User profiles (profiles table) link auth.users to a tenant_id and venue_id.

Supabase's authenticated client automatically passes the JWT token; PostgreSQL filters the data invisibly. You rarely need to append WHERE tenant_id = X manually, but server actions MUST be executed with the authenticated server client (createServerClient).

Domain: Compras & Catálogo (Alimentado por n8n)
erp_documents & erp_purchase_lines: Cabeceras e ítems de facturas/albaranes.

erp_master_items: Catálogo único de materias primas. Unidades base válidas: 'ml', 'g', 'ud'. Categorías estrictas (ej. 'Bebidas Alcohólicas', 'Alimentos Secos').

erp_item_aliases: Diccionario de cómo cada proveedor llama/empaqueta a un master_item.

erp_price_history: Historial inmutable de precios. El precio vigente es el que tiene status = 'active'.

erp_providers: channel válidos ('email', 'whatsapp', 'telegram', 'telefono').

Domain: Escandallos (Motor Financiero)
assemblies: Platos, sub-recetas o preparaciones finales.

bom_lines: Los ingredientes. Regla estricta: Tiene dos FK mutuamente excluyentes: component_id (materia prima pura) y sub_assembly_id (sub-recetas). Usa waste_pct para merma individual.

components: Puente entre un master_item y el tenant.

5. Backend Business Rules (DO NOT RE-IMPLEMENT IN FRONTEND)
Escandallos: Cálculo de Costes en Cascada (COGS)
NUNCA CALCULES MATEMÁTICAS EN EL FRONTEND. PostgreSQL se encarga de todo mediante Triggers y Funciones Recursivas:

Cuando n8n aprueba un nuevo precio en erp_price_history, un trigger recalcula el coste en cascada de todos los assemblies afectados.

PostgreSQL normaliza automáticamente unidades (Si el frontend envía 1 'kg', la DB lo multiplica por 1000 'g').

El coste final (cogs) y el margen (margin_pct) se leen directamente de la tabla assemblies o vistas SQL (como assemblies_with_financials).

Módulo de Compras (Flujo n8n)
La función RPC procesar_factura_completa maneja la entrada de facturas desde Telegram:

draft -> Va a revisión humana (app/admin/revision/).

auto -> Se aprueba sola si el proveedor es confiable (is_trusted = true).

Storage (Documentos Seguros)
El bucket facturas en Supabase S3 es PRIVADO.
Para mostrar un documento PDF o Imagen en la App, NUNCA uses la URL pública directa. Usa la Server Action getSecureDocumentUrl (que hace uso de createSignedUrl válida por 1 hora) antes de renderizar el iframe/img.

6. Frontend Conventions & UX Rules
Server Actions First: Mutations must go through app/actions/ using "use server". Use Zod for schema validation before touching Supabase.

UI Feedback (Toasts): Always wrap server actions in try/catch and use sonner or shadcn's <Toaster /> to display success (green) or error (red) messages to the user.

Loading States (Suspense): Every route MUST have a loading.tsx with skeleton loaders. Use useTransition or isPending states on all submit buttons (disable them while saving).

Relational Data (Combobox): When selecting relationships (Providers, Products, Ingredients), STRICTLY use shadcn's <Command> + <Popover> (Combobox pattern) to allow searching. NEVER use native <select> tags for massive lists.

Debouncing: When building client-side filters (e.g., Data Tables), debounce the input before updating URL search params to avoid spamming the database.