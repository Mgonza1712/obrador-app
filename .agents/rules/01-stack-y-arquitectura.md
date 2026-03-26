---
trigger: always_on
---

## Architecture

### Stack
- **Next.js** (App Router, React Server Components) + TypeScript
- **Supabase** — database, auth, and server-side SSR client
- **Tailwind CSS v4** with OKLCH color system, dark mode support
- **shadcn/ui** (new-york style) + Lucide icons + Radix UI primitives

### Route Structure
- `app/(dashboard)/` — route group sharing dashboard layout
- `app/recetario/` — recipe management (list, create, detail+calculator)
- `app/fichas/` — service cards / SOPs for kitchen line (list, create, detail)
- `app/admin/revision/` — document revision system
- `app/(dashboard)/proveedores/` — gestión de proveedores (listado, filtros, fusión)
- `app/(dashboard)/proveedores/[id]/` — detalle de proveedor (contacto, productos, historial)
- `app/(dashboard)/catalogo/` — catálogo de compras activo con proveedor preferido
- `app/login/` + `app/auth/callback/` — Supabase auth flow

### Component Conventions
- Path alias `@/*` maps to project root
- `lib/utils.ts` exports `cn()` (clsx + tailwind-merge)
- `utils/normalizeText.ts` — strips Spanish diacritics, converts to title case
- shadcn components live in `components/ui/`
- Server Actions in `app/actions/` use `"use server"` directive with FormData

### Responsive Layout
Sidebar (`components/layout/Sidebar.tsx`) is hidden on mobile; a bottom navigation bar is shown instead. Controlled via CSS in `app/globals.css`.
