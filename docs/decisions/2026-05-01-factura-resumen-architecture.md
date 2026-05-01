# ADR: Arquitectura de Facturas Resumen (Conciliación)

**Fecha:** 2026-05-01  
**Estado:** Implementado  
**Fase:** MC-5 (conciliación)

---

## Contexto

Al cargar la primera factura mensual real del cliente (4 albaranes vinculados, sin líneas de producto), el sistema la enviaba al módulo de revisión con cero líneas y un descuadre del 100%, generando una UI rota sin posibilidad de acción.

Raíz del problema: SQL v4 conflaba dos concerns distintos en `erp_documents.status`:
1. "¿Está registrado el documento?" → siempre sí para una factura real
2. "¿Concilian los importes?" → proceso asíncrono independiente

---

## Clasificación de Facturas Resumen

**Tipo A** — Solo referencias de albaranes (sin líneas de producto)
- `items = []`, totales en footer
- Líneas tipo "Nro Albarán 9376 | 17/10/2025"

**Tipo B** — Referencias + detalle de productos
- Extractor detecta `albaranes_vinculados` + items
- Tratamiento: igual que Tipo A (ignorar items, comparar totales contra albaranes)
- Justificación: los albaranes ya fueron validados; re-extraer items introduce ruido sin valor

---

## Decisión

**Regla: Para Facturas Resumen, `status = 'approved'` siempre de forma inmediata.**

El campo `reconciliation_status` gestiona la conciliación por separado:

| reconciliation_status | Significado |
|---|---|
| `pending` | Estado inicial transitorio (se resuelve en la misma transacción) |
| `matched` | Todos los albaranes encontrados + delta ≤ umbral |
| `pending_albaranes` | Algún albarán no encontrado en sistema |
| `mismatch` | Todos encontrados pero delta > umbral |

**Umbral de conciliación:** `GREATEST(0.50€, 1% del total)` — captura redondeos reales.

**Búsqueda fuzzy de albaranes:** sufijo/prefijo ILIKE en número de documento, para manejar variantes como "A9623" en BD vs "9623" en la factura (LLM omite prefijo de letra).

---

## Flujo de re-conciliación automática

Cuando se aprueba un **albarán** en el módulo de revisión:
1. `approveDocument` server action llama `trigger_conciliacion_for_albaran(albaran_id)`
2. Esta función busca Facturas Resumen del mismo proveedor con `reconciliation_status IN ('pending_albaranes', 'mismatch')` que referencien ese número (fuzzy)
3. Para cada coincidencia, llama `intentar_conciliacion(factura_resumen_id)`
4. Si ahora todos los albaranes están presentes y delta ≤ umbral → `reconciliation_status = 'matched'`

No requiere cron ni polling. Es event-driven: el albarán, al aprobarse, desencadena la re-evaluación.

---

## Funciones SQL

- **`intentar_conciliacion(document_id UUID)`** — re-evalúa conciliación de una Factura Resumen
- **`trigger_conciliacion_for_albaran(albaran_id UUID)`** — disparador desde aprobación de albarán
- **`procesar_factura_completa_v4` Rama A** — delega a `intentar_conciliacion` (sin duplicar lógica)

---

## Lo que NO se hizo (y por qué)

- **Notificaciones proactivas** (WPP/email a admin+owner): requiere sistema de notificaciones y conocimiento de perfiles por tenant. Diferido a MC-9/MC-10.
- **Vista de Conciliaciones dedicada**: tabla de gestión de reclamaciones pendientes con estado (reclamado/a la espera). Diferido a post-lanzamiento. Ver `docs/changes/plan-fases-mc.md` → Ideas post-lanzamiento.
- **Mejoras de confianza por campo** (número de factura, fecha): el riesgo de misread existe para cualquier tipo de documento, no solo Facturas Resumen. Diferido a MC-11.

---

## Casos límite aceptados

- **Nota de crédito**: si el proveedor facturó de más, se registra el documento (es un hecho financiero). Cuando llegue la nota de crédito, se procesa como documento separado. La conciliación no cuadra hasta entonces → `mismatch` es el estado correcto, no un error.
- **Falsos positivos en fuzzy match**: "A9623" y "B9623" ambos matchearían ref "9623". En la práctica, dos albaranes del mismo proveedor con igual número numérico pero diferente serie son extremadamente raros. Aceptado.
