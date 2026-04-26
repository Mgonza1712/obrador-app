# Plan de Fases MC — Modulo de Compras Rediseñado

**Fecha:** 2026-04-23 (actualizado 2026-04-27)
**Estado:** MC-1 COMPLETA. MC-2 COMPLETA. MC-3 COMPLETA + fixes post-sesion. Proximo: MC-4.

### Fixes post-MC-3 (2026-04-27)
- **pg_cron**: `process_scheduled_orders()` + `compute_next_run_at()` instaladas en Supabase. Cron job activo cada minuto (job id 1). Requiere: `CRON_SECRET` en Vercel env + actualizar `erp_app_settings.cron_secret`.
- **`/api/cron/send-orders`**: nuevo endpoint que recibe `order_ids`/`template_ids` desde pg_net, maneja split por proveedor y pedidos recurrentes.
- **Scanner integrado en RecepcionClient**: reemplaza input simple con CameraCapture+PerspectiveEditor embebidos. "Escanear sin pedido" ahora abre el scanner inline (no redirige a /scan).
- **`erp_app_settings`**: tabla nueva para configuracion interna (app_base_url = obrador.wescaleops.com, cron_secret = pendiente de configurar).
**Referencia:** `docs/decisions/2026-04-23-modulo-compras-completo.md`

---

## Dependencias entre fases

```
MC-1 (Roles + Schema) ─────────────────────┐
    │                                        │
MC-2 (Ciclo pedido ampliado)                 │
    │                                        │
MC-3 (Recepcion anonima) ←──────────────────┘
    │
MC-4 (Matching pedido↔documento + discrepancias)
    │
MC-5 (Canales: email/manual/duplicados/conciliacion)
    │
MC-6 (Precios: agreed + comparacion + IVA)
    │
MC-7 (Tickets: modo parcial + gastos varios)
    │
MC-8 (Catalogo global cross-tenant)
    │
MC-9 (Dashboard por rol + scoring proveedores)
    │
MC-10 (Bot WPP: vistas + notificaciones)
    │
MC-11 (Extractor: hints + descuentos + mejoras)
```

---

## MC-1: Roles, Permisos y Schema Base

### Objetivo
Establecer la base de datos para todo lo demas: roles granulares, relacion pedido↔documento, nuevos status de precio.

### Tareas

**1a. Migracion Supabase:**
```sql
-- Tabla de permisos por local+sector
CREATE TABLE user_venue_sectors (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  venue_id UUID REFERENCES erp_venues(id),
  sector TEXT CHECK (sector IN ('cocina','barra','salon','todos')),
  PRIMARY KEY (user_id, venue_id, sector)
);

-- Relacion N:M pedido↔documento
CREATE TABLE erp_order_documents (
  order_id UUID REFERENCES erp_purchase_orders(id),
  document_id UUID REFERENCES erp_documents(id),
  match_score NUMERIC,
  linked_by TEXT DEFAULT 'auto',
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (order_id, document_id)
);

-- Nuevos campos en tablas existentes
ALTER TABLE erp_purchase_orders 
  ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'pending'
    CHECK (delivery_status IN ('pending','partially_delivered','delivered','invoiced')),
  ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES erp_venues(id),
  ADD COLUMN IF NOT EXISTS sector TEXT;

ALTER TABLE erp_documents
  ADD COLUMN IF NOT EXISTS assigned_reviewer_id UUID REFERENCES profiles(id);

-- Status 'agreed' ya es texto libre en erp_price_history, no requiere ALTER
-- Campo valid_until para precios pactados
ALTER TABLE erp_price_history
  ADD COLUMN IF NOT EXISTS valid_until DATE;
```

**1b. RLS para nuevas tablas y campos:**
- `user_venue_sectors`: usuario solo ve sus propias filas
- `erp_order_documents`: hereda RLS de erp_purchase_orders
- Pedidos filtrados por venue_id + sector segun user_venue_sectors del usuario

**1c. Actualizar UI `/admin/usuarios`:**
- Agregar seccion "Locales y sectores" al form de usuario
- Checkboxes: por cada local, seleccionar sectores
- Guardar en `user_venue_sectors`

**1d. Regenerar database.types.ts**

### Entregable
- Schema listo para todas las fases siguientes
- Admin puede asignar locales+sectores a usuarios
- Types actualizados

### Verificacion
- Crear usuario buyer con cocina en Biergarten + barra en Cafeseamos
- Verificar que RLS filtra correctamente

---

## MC-2: Ciclo de Vida del Pedido Ampliado

### Objetivo
Extender el modulo de pedidos existente con: delivery tracking, entregas parciales, cancelacion, modificacion post-envio.

### Tareas

**2a. Server Actions nuevos en `app/actions/pedidos.ts`:**
```typescript
// Registrar recepcion (parcial o total)
registerDelivery(orderId, { received_lines: [{line_id, qty_received, notes}], photo_url, observations })

// Cancelar lineas pendientes
cancelPendingLines(orderId, lineIds[])

// Modificar pedido enviado
amendOrder(orderId, changes: { added: [], removed: [], modified: [] })
// → genera mensaje de actualizacion al proveedor
```

**2b. UI `/pedidos/[id]` — ampliacion:**
- Badge de delivery_status (pending → partially_delivered → delivered)
- Por cada linea: columna "Qty recibida" (se puebla desde recepciones)
- Lineas pendientes de entrega resaltadas
- Boton "Cancelar lineas pendientes" (con confirmacion)
- Boton "Modificar pedido" (solo si status=sent)

**2c. Notificaciones:**
- Lineas pendientes > N dias → notificacion al comprador via WPP/app

### Entregable
- Pedidos con tracking de entrega completo
- Entregas parciales visibles en la UI

### Verificacion
- Crear pedido con 5 lineas → enviar → registrar recepcion de 3 → ver 2 pendientes
- Cancelar 1 linea pendiente → verificar que queda 1 pendiente
- Modificar pedido enviado → verificar mensaje de actualizacion

---

## MC-3: Recepcion Anonima

### Objetivo
Ruta publica `/recepcion/[venue_token]` accesible sin login via QR del local.

### Tareas

**3a. Generar venue_token:**
- Columna `reception_token UUID DEFAULT gen_random_uuid()` en `erp_venues`
- API route para validar token y devolver venue_id

**3b. Ruta `/recepcion/[token]/page.tsx`:**
- Validar token → obtener venue_id
- Listar pedidos pendientes de entrega del venue (agrupados por proveedor)
- Boton "Recibir" por pedido → pantalla de recepcion
- Boton "Escanear documento sin pedido" → abre scanner con venue pre-seleccionado

**3c. Pantalla de recepcion:**
- Vista informativa del pedido (productos, cantidades pedidas — solo lectura)
- Campo "Foto del albaran" (camara o archivo)
- Campo "Observaciones" (texto libre)
- Boton "Confirmar recepcion"
- Link "No llego albaran → registrar cantidades manualmente" → campos de qty
- Selector tipo de documento: [Albaran] [Factura] [Ticket] [No se]

**3d. Al confirmar:**
- Subir foto al storage de Supabase
- Crear registro de recepcion (`erp_order_receipts` o actualizar orden)
- Enviar foto al extractor (async) con hint del pedido
- Actualizar `delivery_status` del pedido

**3e. Seguridad:**
- Token es UUID no predecible
- Solo expone: pedidos pendientes del venue, productos, cantidades
- No expone: precios, catalogo, otros venues, datos de usuarios

### Entregable
- QR del local funcional
- Cualquiera puede registrar recepcion sin usuario
- Foto del albaran se procesa automaticamente

### Verificacion
- Escanear QR → ver pedidos pendientes → confirmar recepcion con foto → verificar que extractor procesa

---

## MC-4: Matching Pedido↔Documento + Discrepancias

### Objetivo
Cuando el extractor procesa un albaran, vincularlo automaticamente al pedido y generar reporte de discrepancias.

### Tareas

**4a. Logica de matching (en SQL o server action):**
```
matchOrderToDocument(document_id, provider_id):
  1. Buscar pedidos con status IN ('sent','partially_delivered') del mismo provider_id
  2. Por cada pedido: calcular score = lineas_que_matchean / total_lineas_albaran
  3. Si score > 0.5 → vincular (INSERT erp_order_documents)
  4. Si multiples pedidos matchean → vincular al de mayor score
  5. Si ninguno > 0.5 → no vincular (documento sin pedido)
```

**4b. Reporte de discrepancias (server action + vista):**
```typescript
generateDiscrepancyReport(order_id, document_id):
  // Comparar lineas del pedido vs lineas del documento
  // Producir:
  //   - Lineas OK (qty pedida = qty en albaran)
  //   - Lineas con diferencia (qty pedida != qty en albaran)
  //   - Lineas no pedidas (en albaran pero no en pedido)
  //   - Lineas no entregadas (en pedido pero no en albaran)
```

**4c. UI de discrepancias en `/pedidos/[id]`:**
- Tab "Discrepancias" visible cuando hay documento vinculado
- Tabla con: producto, qty pedida, qty albaran, diferencia, notas del receptor
- Botones: "Reclamar al proveedor" (→ genera mensaje) / "Aceptar diferencia"

**4d. Integrar con extractor:**
- Despues de que SQL v4 procesa un documento, ejecutar matchOrderToDocument
- Si hay match, actualizar delivery_status del pedido

### Entregable
- Vinculacion automatica documento↔pedido
- Reporte de discrepancias visible
- Accion de reclamo disponible

### Verificacion
- Pedido de 5 productos → albaran con 4 (1 faltante) + 1 extra → verificar discrepancias correctas

---

## MC-5: Canales de Entrada (Email/Manual/Duplicados/Conciliacion)

### Objetivo
Unificar el comportamiento para documentos que llegan por cualquier canal.

### Tareas

**5a. Check de duplicados:**
- Antes de procesar: buscar en erp_documents por `document_number + provider_id + rango fecha (+-5 dias)`
- Si duplicado: guardar PDF como `drive_url_improved` en el documento existente, no reprocesar
- Badge en UI: "Version PDF disponible" con opcion "Re-extraer desde PDF"

**5b. Carga manual de documentos:**
- Boton "Subir documento" en `/documentos`
- Form: archivo (PDF/imagen), proveedor (combobox opcional), tipo (albaran/factura/ticket/presupuesto/no se)
- Al subir: envia al extractor con hints de proveedor y tipo
- El usuario que sube queda como `uploaded_by`

**5c. Conciliacion facturas mejorada:**
- Cascada: 1) match por document_number exacto, 2) proveedor+fecha+importe aprox, 3) manual
- UI en `/documentos/[id]`: si factura sin conciliar, mostrar albaranes candidatos con score
- Boton "Vincular" para conciliacion manual

**5d. Matching con pedidos para TODOS los canales:**
- Email, WPP, manual, scan: todos pasan por matchOrderToDocument despues de extraccion
- El canal de origen se guarda en erp_documents (ya existe campo para esto)

### Entregable
- Documentos por cualquier canal se procesan uniformemente
- Duplicados detectados
- Conciliacion mejorada con fallbacks
- Carga manual funcional

### Verificacion
- Subir PDF manual → verificar extraccion + match pedido
- Enviar mismo albaran por email y por scan → verificar deteccion de duplicado
- Factura con 3 albaranes → verificar conciliacion cascada

---

## MC-6: Precios (agreed + comparacion + IVA)

### Objetivo
Implementar status `agreed`, comparacion pactado vs real, tabla de IVAs por categoria.

### Tareas

**6a. Flujo de activacion de presupuesto actualizado:**
- Al activar un presupuesto: crear `price_history status='agreed'` (NO active)
- Opcionalmente: crear tambien un `active` con el mismo precio (si quiere usarlo YA para escandallos)
- Campo `valid_until` editable en la UI

**6b. Vista `vw_precio_pactado_vs_real`:**
- Comparar active (is_preferred) vs agreed del mismo producto+proveedor
- Columna variacion_pct
- Flag "EXPIRADO" si valid_until < today

**6c. Alertas de sobrecargo:**
- Cuando se crea un price_history active: comparar contra agreed del mismo producto+proveedor
- Si variacion > 5%: crear alerta (reusar cost_alerts o nueva tabla)
- Notificacion al admin/owner

**6d. Edicion manual de precios pactados desde catalogo:**
- En `/catalogo/[id]`: boton "Registrar precio pactado"
- Form: proveedor, precio, valid_until
- Crea price_history status='agreed'

**6e. Tabla de IVAs por categoria:**
- Config en `erp_tenant_config` o tabla separada
- Valores default para mercado espanol (4%, 10%, 21%)
- Usada como fallback por el extractor y la UI de tickets

**6f. UI revision: precio extraido editable + referencias:**
- Mostrar precio del LLM como valor editable (aunque confidence baja)
- Debajo: ultimo precio active + precio agreed como referencia

### Entregable
- Presupuestos generan agreed
- Comparacion pactado vs real funcional
- Alertas de sobrecargo
- IVA por categoria configurado

### Verificacion
- Activar presupuesto → verificar agreed creado
- Procesar factura del mismo proveedor con precio mas alto → verificar alerta
- Editar precio pactado manualmente → verificar que aparece en comparacion

---

## MC-7: Tickets (Modo Parcial + Gastos Varios)

### Objetivo
Procesamiento inteligente de tickets de supermercado con seleccion parcial de lineas.

### Tareas

**7a. Deteccion de tipo ticket:**
- Si el usuario selecciono "Ticket" al escanear → flag `is_ticket=true` en el payload
- Si el extractor detecta `doc_type='Ticket'` → mismo flag

**7b. Pantalla de seleccion parcial:**
- Ruta: `/documentos/[id]/clasificar` (visible solo para tickets)
- Tabla con todas las lineas extraidas
- Pre-seleccion: lineas con match en catalogo = seleccionadas
- Cada linea: checkbox + raw_name + precio (con IVA) + match status
- Selector de categoria para "Gastos varios" (las no seleccionadas)
- Validacion: suma de todas las lineas vs total del ticket

**7c. Server action `classifyTicketLines`:**
- Lineas seleccionadas → procesamiento normal (catalogo, precios sin IVA, escandallos)
- Lineas no seleccionadas → una sola purchase_line "Gastos varios" con:
  - unit_price = suma con IVA
  - ai_interpretation: { is_aggregated: true, includes_iva: true, category, source_lines: [...] }
  - review_status = 'auto_approved' (no va a revision)

**7d. Calculo de IVA para lineas de catalogo:**
- Prioridad: letra del ticket (extraida por LLM) > categoria del producto > 10% default
- precio_sin_iva = precio_ticket / (1 + iva_rate/100)

**7e. Descuentos promocionales:**
- LLM extrae lineas de descuento y las asocia al producto anterior
- El precio final (con descuento) se guarda como active
- Metadata: { is_promotional: true, list_price: X, discount: Y }

### Entregable
- Tickets procesados con seleccion inteligente
- Gastos varios registrados sin friccion
- Precios sin IVA correctos para escandallos

### Verificacion
- Ticket con 10 lineas (3 con match) → verificar pre-seleccion → confirmar → 3 en catalogo + 1 gastos varios
- Ticket con descuento promo → verificar precio final correcto

---

## MC-8: Catalogo Global Cross-Tenant

### Objetivo
Tabla compartida de formatos por proveedor que reduce friccion de onboarding.

### Tareas

**8a. Crear tabla `global_provider_products`:**
- Fuera del schema del tenant (sin tenant_id)
- Campos: provider_tax_id, provider_name_norm, raw_name, formato completo, suggested_name, category, base_unit, confirmation_count
- Indice trigram para fuzzy matching
- Sin RLS (acceso solo desde service role / server actions)

**8b. Alimentar desde confirmaciones:**
- Al aprobar un documento en revision (approveDocument): UPSERT en global_provider_products
- Al auto-aprobar desde catalogo global: incrementar confirmation_count

**8c. Consumir en extraccion:**
- SQL v4: si no hay alias match en el tenant, buscar en global_provider_products
- Si match encontrado: auto-crear master_item + alias + price_history → auto_approved
- Si no: new_product → revision

**8d. UI de gestion (solo admin WeScaleOps, no clientes):**
- Pagina interna para ver/editar el catalogo global
- Filtros por proveedor, categoria
- Editar formato si hay error

### Entregable
- Catalogo global alimentandose con cada confirmacion
- Nuevos tenants con proveedores conocidos: ~80% auto-approved

### Verificacion
- Tenant A confirma producto X de proveedor Y → verificar entrada en global
- Tenant B recibe producto X del mismo proveedor → verificar auto-approve

---

## MC-9: Dashboard por Rol + Scoring Proveedores

### Objetivo
Home dinamica con metricas relevantes por rol. Scoring de cumplimiento de proveedores.

### Tareas

**9a. Vista `vw_scoring_proveedores`:**
- Entregas a tiempo %
- Pedidos completos %
- Discrepancias de precio (count ultimo mes)
- Productos devueltos %
- Score general (media ponderada)

**9b. Dashboard components:**
- `DashboardBuyer`: pedidos en borrador, pendientes de entrega, alertas de stock
- `DashboardAdmin`: docs en revision, precios subidos, conciliaciones pendientes
- `DashboardOwner`: KPIs financieros, scoring proveedores, food cost teorico

**9c. Home `/` refactored:**
- Detectar rol del usuario
- Renderizar dashboard correspondiente
- Owner: tabs para cambiar entre vistas

### Entregable
- Home con metricas relevantes por rol
- Scoring de proveedores visible

### Verificacion
- Login como buyer → ver dashboard de pedidos
- Login como owner → ver dashboard completo con scoring

---

## MC-10: Bot WPP (Text-to-SQL + Notificaciones)

### Objetivo
Adaptar el bot WPP al nuevo modelo: hub de notificaciones + consultas flexibles via Text-to-SQL con GPT-4o-mini.

### Decisiones de arquitectura (2026-04-24)
- **Text-to-SQL** en vez de vistas hardcodeadas — el LLM genera SQL contra el schema real
- **GPT-4o-mini** para consultas SQL (barato, rapido, suficiente). GPT-4o se reserva para extractor
- **Sin LangChain, LlamaIndex ni RAG** — tool calling nativo o text-to-sql directo con API OpenAI
- **Sin self-hosting de LLMs** — sin GPU en Oracle server, API es mas cost-effective a esta escala
- **n8n solo como trigger + envio** — la inteligencia del bot vive en pizca-extractor

### Tareas

**10a. Endpoint POST /bot/query en pizca-extractor:**
```python
# Recibe: { tenant_id, user_message, conversation_history }
# System prompt incluye:
#   - Schema de tablas relevantes (erp_documents, erp_purchase_orders, 
#     erp_price_history, erp_providers, erp_master_items, etc.)
#   - 10-15 few-shot examples de queries comunes
#   - Reglas: LIMIT 100, filtrar siempre por tenant_id, solo SELECT
# GPT-4o-mini genera SQL → se ejecuta con rol read-only → formatea respuesta
```

**10b. Rol Postgres read-only para el bot:**
```sql
CREATE ROLE pizca_bot_readonly LOGIN PASSWORD '...';
GRANT USAGE ON SCHEMA public TO pizca_bot_readonly;
GRANT SELECT ON erp_documents, erp_purchase_orders, erp_purchase_lines,
  erp_purchase_order_lines, erp_providers, erp_master_items, erp_item_aliases,
  erp_price_history, erp_order_documents, user_venue_sectors, erp_venues
  TO pizca_bot_readonly;
-- RLS sigue activo: filtra por tenant_id automaticamente
-- Statement timeout: SET statement_timeout = '5s';
```

**10c. Actualizar n8n bot flow:**
- Foto recibida → link al scanner (no procesar inline)
- PDF recibido → procesar + responder resumen + link al documento
- Texto "quiero pedir" → link a /pedidos/new
- Cualquier otra consulta → POST /bot/query → respuesta inline
- n8n solo rutea, no decide — la clasificacion de intent la hace el LLM

**10d. Notificaciones del sistema via bot:**
- Producto nuevo en revision → notificar admin
- Discrepancia en entrega → notificar comprador
- Precio pactado expirado → notificar admin
- Pedido pendiente > N dias → notificar comprador

### Entregable
- Bot WPP con consultas flexibles (cualquier pregunta sobre datos)
- Endpoint /bot/query en pizca-extractor con GPT-4o-mini
- Rol read-only con guardrails de seguridad
- Notificaciones del sistema via WPP

### Verificacion
- Preguntar al bot "cuanto gastamos en Makro este mes" → SQL correcto → respuesta
- Preguntar algo NO previsto "cuantos albaranes llegaron esta semana" → respuesta correcta
- Enviar foto al bot → recibir link al scanner
- Verificar que el bot NO puede modificar datos (intento de INSERT → rechazado)

---

## MC-11: Extractor (Hints + Descuentos + Mejoras)

### Objetivo
Mejorar el extractor con hints del pedido, extraccion de descuentos, y mejor manejo de tickets.

### Tareas

**11a. Hint del pedido en prompt:**
- Si hay pedido pendiente del proveedor, incluir lineas en el prompt
- Prioridad de matching: pedido > aliases proveedor > catalogo general > nuevo

**11b. Extraccion de descuentos:**
- Regla en prompt: lineas tipo "PROMO X" o "-0.50" se asocian al producto anterior
- Output: precio_final = precio - descuento

**11c. Extraccion de IVA en tickets:**
- Regla en prompt: extraer letra/codigo de IVA por linea si visible
- Extraer iva_footer con desglose

**11d. Tipo de documento como hint:**
- Si el usuario selecciono tipo, pasarlo al extractor
- El extractor lo usa para ajustar el prompt (no para saltear inferencia)

**11e. Referencia a catalogo global:**
- El extractor puede consultar global_provider_products para sugerir matches
- Solo sugerencia — la decision de auto-approve es de SQL v4

### Entregable
- Extraccion mas precisa con contexto del pedido
- Descuentos promocionales correctamente extraidos
- Tickets mejor procesados

### Verificacion
- Albaran de proveedor con pedido pendiente → verificar mejor accuracy
- Ticket con descuento PROMO → verificar precio final correcto

---

## Gaps (integrados en fases)

| Gap | Implementado en |
|-----|-----------------|
| Devoluciones/notas de credito | MC-5 (agregar doc_type 'Nota de Credito') |
| Correccion errores post-aprobacion | MC-6 (edicion formato en catalogo → recalculo) |
| Cancelacion pedido enviado | MC-2 (amendOrder) |
| Vigencia precios pactados | MC-6 (valid_until) |
| Flujos nuevos de datos | MC-4 + MC-8 |

---

## Estimacion de sesiones

| Fase | Sesiones estimadas | Prerequisito |
|------|-------------------|--------------|
| MC-1 | ~~1~~ COMPLETA (2026-04-23) | — |
| MC-2 | ~~1-2~~ COMPLETA (2026-04-24/26) | MC-1 |
| MC-3 | ~~1-2~~ COMPLETA (2026-04-26) | MC-1 |
| MC-4 | 1 | MC-2, MC-3 |
| MC-5 | 1-2 | MC-4 |
| MC-6 | 1-2 | MC-1 |
| MC-7 | 1 | MC-6 |
| MC-8 | 1-2 | MC-1 |
| MC-9 | 1 | MC-4 |
| MC-10 | 1 | MC-9 |
| MC-11 | 1-2 | MC-4, MC-7, MC-8 |
| **Total** | **11-17 sesiones** | |

MC-6 y MC-8 pueden hacerse en paralelo con MC-2/MC-3/MC-4 (no dependen entre si).

---

## Regla de trabajo por sesion

1. Leer memoria (estado del plan)
2. Leer este doc (tareas de la fase)
3. Leer docs de dominio relevantes
4. Implementar
5. Testear
6. Actualizar memoria con avance
7. Actualizar docs de dominio si hubo cambios de schema/proceso
