# Cambio: Scanner — Fase 1 & 2, QR, Drag-and-Drop, source_channel cleanup

## Objetivo

Unificar el flujo de recepción de documentos bajo una sola ruta canónica (`/scan/[token]`), eliminar la distinción entre "recepción anónima" y "scan", y añadir una vía alternativa de carga por drag-and-drop desde `/documentos`. Se aprovechó para limpiar el campo `source_channel` que ya no aportaba valor en el pipeline.

## Alcance

### Fase 1 — Scanner PWA (sesiones anteriores)
- Integración de `jscanify` + OpenCV para corrección de perspectiva en foto móvil
- Vista multi-página: captura múltiples hojas, las une en un único documento antes de enviar
- UI de cámara nativa con feedback táctil y preview a pantalla completa

### Fase 2 — Rutas y estructura (esta sesión)

**Ruta canónica `/scan/[token]`**
- Creada `app/scan/[token]/page.tsx` — valida token, carga pedidos pendientes, renderiza `RecepcionClient`
- `app/recepcion/[token]/page.tsx` — ahora solo hace `redirect('/scan/[token]')` para compatibilidad de URLs antiguas
- `app/scan/page.tsx` — detecta query param `?t=TOKEN` (URLs legacy) y hace `router.replace('/scan/TOKEN')`

**QR de recepción movido a `/documentos/qr`**
- Creada `app/(dashboard)/documentos/qr/page.tsx` — reutiliza `QRVenuesPanel`
- Botón "QR de recepción" añadido en la cabecera de `/documentos`
- URLs en `QRVenuesPanel` actualizadas de `/recepcion/TOKEN` a `/scan/TOKEN`
- La sección equivalente en `/admin/configuracion` queda como alias (no se eliminó)

**UploadDropZone en `/documentos`**
- Creado `app/(dashboard)/documentos/_components/UploadDropZone.tsx`
- Drag-and-drop o click para seleccionar PDF/imagen; diálogo para elegir local y asociar pedido (opcional)
- Envía al mismo endpoint `/api/recepcion/[token]/submit` que el scanner físico
- Conectado al pipeline completo: extractor → n8n → SQL → aparece en `/documentos` como cualquier otro documento

### Redis para job store
- `pizca-server/pizca-extractor/main.py` — reemplazado `dict` en memoria por Redis (`redis==5.2.1`)
- Motivo: Uvicorn con `--workers 2` aísla memoria entre procesos; el polling de `/job-status` podía llegar a un worker distinto al que procesó el job y devolver 404
- TTL de 1 hora por job; ping de Redis en startup para validar conectividad

### source_channel cleanup
Ver decisión `docs/decisions/2026-04-29-scan-flow-unification.md`.

Cambios concretos:
- `app/api/recepcion/[token]/submit/route.ts` — eliminado `source: 'scan'` del payload a n8n
- `models/schemas.py` — eliminado campo `source_channel` de `ExtractionRequest`
- `main.py` — eliminado `source_channel` del callback payload a n8n
- n8n Scanner Intake (`Sw13rBM2igPb0xQW`) — eliminado `source_channel: 'scan'` de `Preparar Input Core`
- n8n Core Extractor (`bDJGiYfixmUNZjjv`) — eliminado `source_channel` de `Preparar Binario y Request` y de `Llamar Extractor FastAPI`

## Impacto esperado

- **UI:** `/recepcion/TOKEN` sigue funcionando (redirect transparente). URLs de QR apuntan a `/scan/TOKEN`. Nueva sección de carga manual en `/documentos`.
- **Pipeline:** Sin cambios funcionales; `source_channel` era metadata sin consumidores en Supabase.
- **Base de datos:** Sin migraciones. `erp_purchase_orders.source_channel` es un campo distinto (canal de creación del pedido: `web`/`whatsapp`) y no se tocó.
- **Infra:** Requiere Redis disponible en el servidor del extractor. Variable de entorno `REDIS_URL` (default: `redis://localhost:6379`).

## Riesgos

- **Redis no disponible:** El extractor falla al arrancar (ping en lifespan). Hay que asegurarse de que Redis esté corriendo y que `REDIS_URL` esté configurado en `.env`.
- **URLs de QR existentes:** Los QR ya impresos/compartidos con `/recepcion/TOKEN` siguen funcionando gracias al redirect.

## Aceptación

- `/scan/TOKEN` muestra el scanner correctamente
- `/recepcion/TOKEN` redirige a `/scan/TOKEN`
- `https://obrador.wescaleops.com/scan?t=TOKEN` redirige a `/scan/TOKEN`
- UploadDropZone en `/documentos` carga un PDF y aparece en la lista como documento pendiente
- `/documentos/qr` muestra los QR con URLs `/scan/TOKEN`
- Job enviado desde cualquier canal (scanner físico, UploadDropZone) llega al mismo estado en `/job-status/[jobId]` independientemente del worker que atiende el polling
