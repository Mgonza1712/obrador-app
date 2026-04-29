# Decisión: Unificación del flujo de scan y eliminación de source_channel

**Fecha:** 2026-04-29  
**Estado:** Implementada

## Contexto

El sistema tenía dos canales de entrada de documentos desde el scanner web:

1. **`recepcion_anonima`** — Flujo original: operario accede a `/recepcion/[token]` con un QR, adjunta a un pedido o no, sube el documento.
2. **`scan`** — Flujo nuevo: mismo operario, misma URL (migrada a `/scan/[token]`), mismo proceso.

El campo `source_channel` viajaba a través de todo el pipeline (route.ts → n8n Scanner Intake → n8n Core Extractor → FastAPI `ExtractionRequest`) como metadata. Su único uso era en un nodo IF de n8n (`¿Recepción Anónima?`) que condicionaba si se pasaban `order_id` y `venue_id` al core extractor — lo que era incorrecto para el nuevo flujo unificado.

## Decisión

Eliminar `source_channel` del pipeline de scan completo.

**Razones:**
1. El campo nunca llegaba a Supabase — no había columna `source_channel` en `erp_documents` ni en ninguna tabla del dominio de compras.
2. El único consumidor (el IF de n8n) fue reemplazado por un `¿Con Pedido?` basado en `order_id notEmpty` — semánticamente correcto y sin depender del canal de origen.
3. Un único canal de scan simplifica el código y elimina surface de bugs (como el bug crítico donde cambiar `source` a `'scan'` rompía el passthrough de `order_id`/`venue_id` porque `isRecepcion` era `false`).
4. Si en el futuro se añaden nuevos canales de entrada (email, API externa), el campo correcto para distinguirlos es el que ya existe en `erp_channel_accounts.channel`, no un campo ad-hoc en el pipeline de extracción.

## Alternativas descartadas

- **Mantener `source_channel` con valor fijo `'scan'`:** Sin consumidores reales, solo añade ruido. Descartado.
- **Guardar `source_channel` en `erp_documents`:** No aporta valor de negocio ahora. Si se necesitara analytics de canal en el futuro, el campo `extraction_log_id` ya traza el origen.

## Consecuencias

- El campo `source_channel` ya no existe en `ExtractionRequest` (FastAPI), en el payload de n8n Scanner Intake, ni en el Core Extractor.
- El nodo `¿Recepción Anónima?` en n8n Extraction Callback fue renombrado a `¿Con Pedido?` y su condición cambió de `source_channel === 'recepcion_anonima'` a `order_id notEmpty`. Este nodo sigue siendo necesario porque no todo scan tiene un pedido asociado (scans libres desde UploadDropZone o "escanear sin pedido").
- La ruta `/recepcion/[token]` se mantiene como redirect permanente hacia `/scan/[token]` para no romper QRs existentes.
