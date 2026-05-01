# Decisión: Fix de arquitectura del Scanner — Bypass del timeout de Vercel

**Fecha:** 2026-05-01  
**Estado:** Aprobada, pendiente de implementación (P-0)

## Contexto

El scanner PWA sufre errores 504 (Timeout) al enviar documentos escaneados. La cadena síncrona `Vercel API route → n8n Scanner Intake → n8n Core Extractor → FastAPI` supera los 10s que permite Vercel Hobby.

Causa raíz:
- `submit/route.ts` convierte la foto a base64 (~5-8MB) y hace POST síncrono a n8n
- n8n Scanner Intake espera al Core Extractor (`waitForSubWorkflow: true`)
- Core Extractor sube a Storage + llama FastAPI antes de responder
- Total: 18-40s. Vercel Hobby permite 10s.

Además, el frontend tiene un bug: cuando n8n falla y `jobId` es null, `SuccessView` muestra un spinner infinito porque `isPolling = jobStatus === 'polling' || jobStatus === null`.

## Análisis arquitectónico

Se evaluó la hipótesis de sacar a n8n completamente del pipeline de IA. Conclusiones:

1. **La lógica de IA YA está en Python** (pizca-server). n8n es solo orquestación y no hace procesamiento de IA.
2. **`/scan/page.tsx` ya resuelve el problema** — llama a n8n directamente desde el browser (no pasa por Vercel API route), sin problemas de timeout.
3. **No es necesario migrar toda la orquestación** — solo mover el POST pesado fuera de la serverless function.

### Frameworks evaluados

| Framework | Veredicto |
|---|---|
| PydanticAI | No necesario ahora. Ya usamos Pydantic + JSON mode. |
| LangGraph | Prematuro. Pipeline es lineal, sin branching. |
| LlamaIndex | Quizás para MC-10 (bot), si Text-to-SQL directo es insuficiente. |

### Recomendación por workflow n8n

| Workflow | Recomendación | Timing |
|---|---|---|
| Scanner Intake | RETIRAR | Post go-live (Fase 1, con Vercel Pro) |
| Core Extractor | RETIRAR | Post go-live (Fase 1) |
| Extraction Callback | MANTENER | Indefinido |
| Email Intake | MODIFICAR (quitar dep. de Core Extractor) | Post go-live (Fase 2) |
| Send Order | MANTENER | Indefinido |
| WPP Bot | ACTIVAR en MC-10 | Roadmap MC-10 |

## Decisión

### P-0 (pre go-live, implementar ahora)

Dividir `submit/route.ts` en dos responsabilidades:

**A) Vercel API route (server-side, <2s):**
- Validar token → venue
- Validar order pertenece al venue
- Marcar `scan_submitted_at` si hay pedido
- Devolver `{ success: true, venue: { id, name, tenant_id } }`
- **Eliminar**: Storage upload a bucket `albaranes` (n8n ya sube a `facturas`)
- **Eliminar**: POST a n8n (se mueve al cliente)

**B) Cliente (browser, sin timeout de Vercel):**
- Comprimir imagen con `browser-image-compression` (`maxSizeMB: 1, maxWidthOrHeight: 1920`)
- POST directo a `https://n8n.wescaleops.com/webhook/scanner-intake` (como ya hace `/scan/page.tsx`)
- Polling de job_id via `/api/job-status/{jobId}`

**Mejoras adicionales en el frontend:**
- Multiscan: acumular múltiples páginas, compilar a PDF con jsPDF
- Fix SuccessView: `isPolling = jobStatus === 'polling'` (sin `|| null`)
- Error handling: si n8n falla, mostrar "Reintentar" con foto en client state

**Verificación (Fase 0)**
 1. Escanear documento grande (~5MB) desde celular → verificar compresión a <1MB
 2. Verificar que NO da 504 (el POST a n8n sale del browser, no de Vercel)
 3. Probar multiscan: 2+ páginas → se envían como PDF
 4. Si n8n falla: muestra "Error, reintentar" con botón (no spinner infinito)
 5. Verificar en n8n que la ejecución aparece con payload comprimido
 6. Probar flujo con pedido: scan_submitted_at se marca correctamente
 7. Probar flujo sin pedido: documento se procesa normalmente

### Fases post go-live

**Fase 1 (con Vercel Pro):** Scanner → FastAPI directo. Retirar Scanner Intake + Core Extractor de n8n.
**Fase 2:** Email Intake llama FastAPI directo.
**Fase 3:** WPP Bot (MC-10).

## Alternativas descartadas

- **AbortController en route.ts:** Inútil con Hobby (10s timeout). El fetch a n8n tarda 30s+.
- **Migración completa a Python:** Over-engineering para 50 docs/día. n8n aporta valor en async/multi-canal.
- **Adopción de PydanticAI/LangGraph/LlamaIndex:** Prematuro. Stack actual funciona.

## Consecuencias

- `submit/route.ts` ya no llama a n8n — solo valida y persiste estado del pedido
- El POST pesado (base64 del documento) sale del browser directamente a n8n
- n8n Scanner Intake sigue activo y recibe la request del browser (no cambia)
- La compresión client-side reduce payloads de 5-8MB a <1.3MB
- El multiscan permite documentos multi-página (compila a PDF)

## Cuellos de botella identificados

1. **Oracle Server SPOF**: Si pizca-server cae, el pipeline muere. Mitigación: n8n sube a Storage antes de llamar FastAPI.
2. **ThreadPoolExecutor(3)**: Max ~6 docs/min. Suficiente para volumen actual.
3. **Redis sin persistencia**: Jobs en vuelo se pierden si Oracle reinicia. TTL 1h reduce impacto.
4. **n8n CORS**: `allowedOrigins: '*'` permite llamadas desde browser. Si cambia, se rompe.

## Archivos a modificar

- `package.json` — añadir `browser-image-compression`
- `app/api/recepcion/[token]/submit/route.ts` — simplificar (solo validación + pedido)
- `app/recepcion/[token]/_components/RecepcionClient.tsx` — compresión + multiscan + envío directo a n8n + fix SuccessView
