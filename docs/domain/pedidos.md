# Módulo de Pedidos — Comportamiento y Diseño

**Última actualización:** 2026-04-25
**Estado:** MC-2 completo (pedidos web + envío multicanal)

---

## 1. Qué es este módulo

El módulo de pedidos gestiona el ciclo completo de compra a proveedores:

```
Borrador → (Aprobación) → Enviado → Recepción → Entregado → Facturado
```

Los pedidos se pueden crear desde:
- La app web (`/pedidos/new`)
- El bot de WhatsApp (responde con link a `/pedidos/new`)
- Recurrencia automática (plantillas con cron)

---

## 2. Estructura de datos clave

```
erp_purchase_orders
  id, tenant_id, venue_id, status, delivery_status
  source_channel: 'web' | 'whatsapp' | 'internal'
  provider_notes: JSONB          -- notas por proveedor, keyed by provider_id UUID
  is_template, recurrence_cron   -- para pedidos recurrentes
  sent_at, scheduled_for

erp_purchase_order_lines
  order_id, provider_id, master_item_id
  raw_text, quantity, unit
  is_matched, estimated_unit_price

erp_venues
  id, tenant_id, name, type
  email_from, email_from_name    -- config de Resend por local
  reply_to_email                 -- a dónde van las respuestas de proveedores
```

---

## 3. Estados del pedido

| Estado | Descripción |
|---|---|
| `draft` | Borrador — editable. El comprador puede añadir/quitar líneas, cambiar proveedor, agregar notas. |
| `sent` | Enviado — readonly. El sistema envió los mensajes a proveedores. |
| `cancelled` | Cancelado — readonly. |

**delivery_status** (solo relevante una vez sent):

| Estado | Descripción |
|---|---|
| `pending` | Sin recepción registrada |
| `partially_delivered` | Al menos una línea recibida, pero no todas |
| `delivered` | Todas las líneas activas recibidas |
| `invoiced` | Factura conciliada |

---

## 4. Selector de local (venue)

### Comportamiento en `/pedidos/new`

- La página fetcha los venues del tenant + el `venue_id` del perfil del usuario logueado.
- Si el tenant tiene **1 solo venue**: se muestra como label readonly (no editable).
- Si hay **múltiples venues**: se muestra un dropdown pre-seleccionado al venue del perfil del usuario. El comprador puede cambiarlo antes de crear el pedido.
- El `venue_id` se guarda en `erp_purchase_orders` al crear.

### Comportamiento en `/pedidos/[id]`

- En **borrador**: se muestra un dropdown debajo del número de pedido. El usuario puede cambiar el local. Cada cambio se guarda inmediatamente en Supabase via `updateOrderVenue`.
- En **enviado/cancelado**: se muestra el nombre del local como texto readonly.

### Por qué importa el venue en pedidos

El `venue_id` determina:
1. **Desde qué email se envía el pedido** — `erp_venues.email_from` y `email_from_name`
2. **A dónde van las respuestas del proveedor** — `erp_venues.reply_to_email`
3. **Qué local hizo el pedido** — para reportes y recepción por local

---

## 5. Notas por proveedor (provider_notes)

### Por qué es JSONB por proveedor y no un campo de texto único

Un mismo pedido puede tener líneas de múltiples proveedores. Si hubiera un solo campo de notas, la misma nota iría a todos los proveedores. La nota tiene que ser específica por proveedor.

### Estructura

```json
{
  "uuid-proveedor-1": "Traer todo antes de las 10",
  "uuid-proveedor-2": "Sin sustitutos, si no hay Estrella avisar antes"
}
```

Clave especial `"__none__"` para líneas sin proveedor asignado.

### UX

- En la vista de detalle del pedido (borrador), debajo de cada "card" de proveedor aparece un textarea de aclaraciones.
- Al perder el foco (onBlur), se guarda automáticamente via `updateProviderNotes`.
- En pedidos enviados, si hay nota se muestra como texto readonly.

### En el envío

`sendOrder` pasa `provider_notes` al webhook de n8n. El workflow aplica la nota correcta a cada proveedor: en el cuerpo del email HTML y en el mensaje de WhatsApp del proveedor correspondiente.

---

## 6. Separar por proveedor (tijera)

### Cuándo aparece

El botón "Separar por proveedor" (ícono de tijeras) solo se muestra en borradores que tienen líneas de **2 o más proveedores distintos**.

### Qué hace

`splitOrderByProvider` crea N pedidos hijos (uno por proveedor), cada uno con:
- Las líneas del proveedor correspondiente
- La nota de ese proveedor copiada desde `provider_notes`
- El mismo `venue_id` y `tenant_id` del pedido original

Luego elimina el pedido original y redirige a `/pedidos`.

### Cuándo usarlo

Es **opcional**. Si el comprador simplemente envía el pedido sin separar, n8n igual envía un mensaje separado a cada proveedor (con su nota correspondiente), pero en la DB queda un solo registro.

Usar la tijera tiene sentido cuando se quiere:
- Tracking individual de entrega por proveedor
- Cancelar o modificar solo el pedido de un proveedor específico
- Numeración/referencia separada por proveedor

---

## 7. Envío de pedidos

### Arquitectura general

```
Click "Enviar pedido"
        │
        ▼
sendOrder() [Server Action]
  1. Fetch order.venue_id
  2. Fetch erp_venues: email_from, email_from_name, reply_to_email
  3. POST webhook n8n con:
     { order_id, provider_notes, email_from, email_from_name, reply_to_email }
        │
        ▼
n8n "Pizca - Send Order" (workflow 7xOudvNe4SrRp1dv)
  1. Fetch líneas con join a erp_providers
  2. Agrupar líneas por provider_id
  3. Para cada proveedor:
     - Si canal = 'whatsapp' → Evolution API
     - Si canal = 'email'    → Resend API
     - Si otro canal         → (loop, sin acción automática)
  4. PATCH erp_purchase_orders → status='sent'
  5. Respond webhook → { success: true }
        │
        ▼
sendOrder() recibe response
  Belt & suspenders: también marca sent en Supabase desde Next.js
  revalidatePath('/pedidos') + revalidatePath('/pedidos/[id]')
```

### Email por venue (Resend API)

Cada venue tiene configurado:
- `email_from`: dirección de envío (ej: `pedidos@biergarten.com`)
- `email_from_name`: nombre que ve el proveedor (ej: `Biergarten by 78`)
- `reply_to_email`: a dónde va la respuesta del proveedor (ej: `grupo78@gmail.com`)

En n8n, el campo `from` de Resend se arma como: `"Biergarten by 78 <pedidos@biergarten.com>"`.

**Requisito:** el dominio de `email_from` debe estar verificado en la cuenta de Resend de WeScaleOps (un solo API key sirve para todos los dominios verificados).

**Fallback si `email_from` es null:** el email no se envía correctamente. El operario ve el error en la respuesta del webhook.

### WhatsApp por venue

El canal de WhatsApp no depende del venue — usa la instancia Evolution API de la account (evolution_ordering_instance en erp_tenants). Se envía desde la instancia de ordering del tenant.

---

## 8. Añadir productos al borrador (AddProductsPanel)

Disponible en la vista de detalle de un pedido en borrador (parte inferior).

### Modos

**Del catálogo:**
- Busca en `erp_master_items` por nombre
- Muestra precios activos por proveedor (chip por proveedor, marcado el preferido con ⭐)
- Si no hay precios en catálogo → muestra dropdown de proveedores para asignar igual
- El formato se auto-completa desde `erp_item_aliases` (proveedor-específico)

**Texto libre:**
- Campo de descripción libre
- Proveedor opcional
- Útil para productos no catalogados o pedidos informales

---

## 9. Recepción de pedidos

Disponible una vez que el pedido está en estado `sent`.

- Se accede desde la vista de detalle, botón "Registrar recepción"
- El operario ingresa cantidades recibidas por línea
- El sistema calcula `delivery_status` automáticamente:
  - Todas completas → `delivered`
  - Parciales → `partially_delivered`
  - Ninguna → `pending`

También accessible desde el QR permanente por local (`/recepcion/{venue_token}`) que muestra todos los pedidos pendientes de entrega del local.

---

## 10. Programación y plantillas

- Un pedido puede marcarse como `is_template = true`
- Con `recurrence_cron` define la frecuencia (ej. `0 9 * * 1` = cada lunes a las 9)
- `next_run_at` se calcula al guardar la plantilla
- Al ejecutarse, crea un nuevo pedido draft copiando las líneas de la plantilla

---

## 11. Acciones disponibles en la UI

| Acción | Disponible en | Efecto |
|---|---|---|
| Añadir línea | Borrador | Agrega línea via AddProductsPanel |
| Eliminar línea | Borrador | Borra línea de la DB |
| Cambiar cantidad | Borrador | Actualiza línea |
| Cambiar local | Borrador | Actualiza `venue_id` del pedido |
| Notas por proveedor | Borrador | Guarda en `provider_notes` JSONB |
| Separar por proveedor | Borrador (≥2 proveedores) | Crea N pedidos hijos, borra original |
| Enviar pedido | Borrador | Dispara webhook n8n |
| Marcar como enviado | Borrador | Marca `sent` sin enviar mensajes |
| Cancelar pedido | Borrador | Marca `cancelled` |
| Registrar recepción | Enviado | Actualiza `qty_received` por línea |
| Cancelar líneas pendientes | Enviado, parcial | Marca líneas como `is_cancelled` |
