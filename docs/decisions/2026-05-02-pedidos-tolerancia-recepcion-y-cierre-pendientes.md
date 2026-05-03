# ADR: Tolerancia de recepción para frescos y cierre de pendientes

**Fecha:** 2026-05-02  
**Estado:** Implementado en app, pendiente de ejecutar migración SQL en Supabase

## Contexto

En recepción de pedidos, el sistema mostraba como pendiente cualquier diferencia exacta entre `quantity` y `qty_received`.

Eso funciona bien para cajas y unidades, pero genera ruido en productos frescos vendidos por peso o volumen. Ejemplo real: pedido `0.5 kg` y entrega `0.42 kg`. Operativamente eso suele ser una entrega válida, no una deuda real del proveedor.

Además, cuando el proveedor ya no va a entregar el resto de una línea parcialmente recibida, el modelo actual solo permite `is_cancelled=true`, que representa toda la línea como cancelada aunque parte de la mercadería sí haya llegado.

## Decisión

### 1. Tolerancia de recepción para frescos

Una línea se considera entregada cuando el faltante restante es menor o igual al `20%` de la cantidad pedida, siempre que:

- la línea esté vinculada a catálogo
- la categoría sea una de:
  - `Frutas y Verduras`
  - `Carnes`
  - `Pescados y Mariscos`
- la unidad represente peso o volumen:
  - `kg`, `g`, `l`, `ml`
  - variantes de texto equivalentes como `Kilogramo`, `Litro`, etc.

Esta tolerancia **no aplica** a productos vendidos por unidad, caja, barril u otros bultos discretos.

Cuando la tolerancia aplica sobre una línea que ya recibió mercadería, el remanente se cierra automáticamente en `qty_cancelled`. No queda solo como regla visual: el sistema lo persiste con `is_cancelled = false` y `cancelled_reason = 'Proveedor no entregara el pendiente'`.

### 2. Cierre de solo el remanente pendiente

Se agrega en `erp_purchase_order_lines`:

- `qty_cancelled numeric not null default 0`
- `cancelled_reason text null`
- `cancelled_at timestamptz null`

Semántica:

- `qty_received` = mercadería efectivamente entregada
- `qty_cancelled` = parte pendiente que ya no se espera recibir
- `is_cancelled=true` queda reservado para cancelación total o líneas sin entrega

Regla UX:

- si la línea no recibió nada y se cancela → `is_cancelled=true`
- si la línea recibió parcialmente y se cierra el resto → se mantiene la línea activa en historial, pero el remanente pasa a `qty_cancelled`

## Alcance técnico

Se actualizó la lógica de app para usar un helper compartido de delivery:

- cálculo de pendiente real: `quantity - qty_received - qty_cancelled`
- cálculo de `delivery_status`
- listado de pendientes en `/scan/[token]`
- recepción manual desde QR
- detalle de pedido
- cierre de pendientes

También se añadió acceso directo a discrepancias desde `/pedidos` cuando existe al menos un documento vinculado, enlazando a `/pedidos/[id]?tab=discrepancias`.

## Consecuencias

- Menos falsos pendientes en verdulería, carnes y pescados
- Mejor representación operativa de parciales reales
- El QR deja de mostrar líneas cuyo remanente fue tolerado o cerrado
- Las líneas toleradas quedan visibles en detalle como `Restante cerrado` sin requerir acción manual
- El historial sigue preservando cuánto llegó y cuánto se dejó de esperar

## Migración hecha

Para que el cambio funcione completo en la base real, se ejecuto esta migración:

- `supabase/migrations/20260502_mc_delivery_cancelled_remainders.sql`

Sin esa migración, la app hubiese intentado leer/escribir columnas que todavía no existen en Supabase.

## No cambios

- No requiere cambios en n8n
- No requiere cambios en el extractor
- No cambia el algoritmo de discrepancias, que sigue siendo on-demand
