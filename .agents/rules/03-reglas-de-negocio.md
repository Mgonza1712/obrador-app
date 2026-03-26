---
trigger: always_on
---

### Módulo de compras — función procesar_factura_completa
Función RPC de Postgres que procesa las facturas extraídas por la IA (n8n la llama).

Parámetro `p_modo`:
- `'draft'` (default) — crea el documento en estado 'pending', requiere revisión manual
- `'auto'` — aprueba automáticamente si el proveedor es confiable y no hay productos nuevos

Lógica de venue por tipo de documento:
- `factura` + proveedor con `shared_pricing = true` → venue = Sede Central
- `albaran` → venue = local receptor (extraído del documento)
- Fallback: venue del tenant principal

Protección contra precio 0 en albaranes: si `unit_price = 0`, la función no actualiza
`erp_price_history` (los albaranes no tienen precio real, solo cantidades).

### Impacto cruzado importante
erp_documents y erp_purchase_lines las escribe n8n (bot Telegram).
Cualquier cambio en esas tablas o su lógica debe coordinarse con el workflow de n8n.