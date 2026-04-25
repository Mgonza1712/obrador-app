# Decisiones: MC-2 Pedidos Web — Venue Selector + Email Multi-tenant

**Fecha:** 2026-04-25
**Estado:** Implementado y deployado
**Participantes:** Maxi (founder), Claude Code

---

## Contexto

MC-2 cubre la creación y envío de pedidos desde la app web. En esta sesión se definieron e implementaron las decisiones de arquitectura de email multi-tenant y el selector de local por pedido.

---

## Decisiones

### D1 — Email de envío es por local (venue), no por tenant

**Decisión:** `email_from`, `email_from_name` y `reply_to_email` viven en `erp_venues`, no en `erp_tenants`.

**Motivo:** Un grupo restaurantero puede tener múltiples locales con dominios distintos (biergarten.com, cafeseamos.com). El proveedor que recibe el email tiene que saber qué local le está pidiendo. Un email centralizado del grupo no da ese contexto.

**Consecuencia:** Cada venue tiene que tener su dominio verificado en la cuenta Resend de WeScaleOps.

---

### D2 — Resend API en vez de SMTP para envío de email

**Decisión:** El nodo `emailSend` de n8n (SMTP estático) fue reemplazado por un HTTP Request a `POST https://api.resend.com/emails`.

**Motivo:** SMTP solo permite un sender estático. Resend permite `from` dinámico — un solo API key sirve para todos los dominios verificados. Soluciona el problema multi-tenant sin duplicar workflows ni credenciales.

**Variable de entorno requerida:** `RESEND_API_KEY` en el docker-compose de n8n.

---

### D3 — El campo `reply_to` es el email de recepción de respuestas del proveedor

**Decisión:** Se agrega `reply_to_email` a `erp_venues`. Se incluye como header `reply_to` en la llamada a Resend.

**Motivo:** El `email_from` es un noreply en el dominio del local. Para que el proveedor pueda responder (confirmaciones, preguntas), el reply tiene que ir a un buzón real que el cliente lee (típicamente su Gmail o un email con reenvío vía ImprovMX).

**Si `reply_to_email` es null:** el proveedor puede responder al email (irá al noreply, que no tiene buzón), o contactar por WhatsApp según el cuerpo del email.

---

### D4 — Notas de aclaraciones son por proveedor (JSONB), no globales

**Decisión:** `provider_notes` es un campo JSONB en `erp_purchase_orders` con estructura `{ "provider_uuid": "texto de nota" }`.

**Motivo:** Un borrador puede tener líneas de múltiples proveedores. Una nota global iría a todos. Las aclaraciones son específicas por proveedor (ej: "sin sustitutos" para uno, "entregar antes de las 10" para otro).

**Auto-save:** las notas se guardan onBlur (al salir del textarea), no con un botón explícito, para minimizar fricción.

---

### D5 — El selector de local es editable en borradores, readonly en enviados

**Decisión:**
- En `/pedidos/new`: dropdown si hay múltiples venues, pre-seleccionado al `venue_id` del perfil del usuario.
- En `/pedidos/[id]` (borrador): dropdown debajo del número de pedido, auto-guarda al cambiar.
- En `/pedidos/[id]` (enviado): texto readonly con el nombre del venue.

**Motivo:** Una vez enviado, cambiar el venue no tiene sentido (el email ya salió del sender correcto). En borrador, el comprador puede haber empezado el pedido en el venue equivocado.

---

### D6 — Separar por proveedor (tijera) es opcional, no forzado

**Decisión:** El botón de separar aparece solo si hay ≥2 proveedores en el borrador. Al enviar sin separar, n8n igual manda mensajes individuales a cada proveedor.

**Motivo:** La mayoría de los pedidos tendrán 1 proveedor. Para multi-proveedor, la separación tiene valor si se quiere tracking de entrega independiente por proveedor. No tiene sentido forzarla como paso obligatorio.

---

### D7 — Gmail no es viable para `email_from` con Resend

**Decisión:** No se puede enviar desde @gmail.com con Resend. Para clientes que solo tienen Gmail, las opciones son:
1. (Recomendado) Usar el dominio de su web para el email de pedidos
2. SMTP de Gmail con App Password (500 emails/día, más frágil)
3. Usar el dominio de WeScaleOps como sender intermediario

**Para Grupo 78 Sabores:** van a verificar sus dominios en Resend. Mientras tanto, se usa `noreply@wescaleops.com` para testing.

---

## Schema changes

```sql
-- Migration: 20260424_tenant_email_config.sql (aplicada pero luego superada)
ALTER TABLE erp_tenants ADD COLUMN email_from TEXT, ADD COLUMN email_from_name TEXT;

-- Migration: 20260425_venue_email_config.sql (la definitiva)
ALTER TABLE erp_venues
  ADD COLUMN email_from      TEXT,
  ADD COLUMN email_from_name TEXT,
  ADD COLUMN reply_to_email  TEXT;
```

Nota: `erp_tenants.email_from` quedó en la DB pero no se usa — el sistema lee de `erp_venues`.

---

## Flujo de envío resumido

```
sendOrder(orderId)
  → fetch order.venue_id
  → fetch venue: email_from, email_from_name, reply_to_email
  → POST webhook n8n: { order_id, provider_notes, email_from, email_from_name, reply_to_email }
      → n8n agrupa líneas por proveedor
      → por cada proveedor:
          WA  → Evolution API (instancia ordering del tenant)
          email → Resend API (from = venue, reply_to = venue.reply_to_email)
      → PATCH order status = 'sent'
```
