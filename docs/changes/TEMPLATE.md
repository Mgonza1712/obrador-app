# Cambio: <titulo>

## Objetivo

Describe qué se quiere cambiar y por qué.
Cambiar la forma en que se procesan los documentos.
Matching de aliases — ahora se pasa toda la lista de aliases conocidos al prompt. Con 50 proveedores y 200+ productos cada uno, eso no escala. RAG con pgvector (ya disponible en Supabase) buscaría los 20 aliases más similares semánticamente al nombre que viene en el documento. Reduce tokens y mejora precisión. Implementar cuando el catálogo supere ~300 items por proveedor.

Deduplicación de master items — en lugar de pasar toda la lista de EXISTING_MASTER_ITEMS al prompt, vector search encuentra los 10 más parecidos. Mismo problema, misma solución.

cado. No se que otros cambios teniamos pendientes.
No se si deberiamos hacer mas pruebas respecto a los modelos o no.

En algun momento, antes de salir a produccion seguro vamos a tener que retocar cosas porque deberiamos hacer una prueba masiva de unos 100 documentos.

Hay alguna otra tecnologia que no hayamos explorado y sea de valor? RAG?
Déjame revisar el estado real del código antes de darte el resumen.

Grep "gpt-4o-mini|header_model|extraction_model|asyncio|Semaphore" (in c:\Users\maxii\OneDrive\Escritorio\WeScaleOps\pizca-server\pizca-extractor\services\extractor.py)
76 lines of output
Grep "build_sql_payload|SqlPayload|class SqlDocumento" (in c:\Users\maxii\OneDrive\Escritorio\WeScaleOps\pizca-server\pizca-extractor\services\extractor.py)
12 lines of output
Tengo el estado completo. Te lo doy todo organizado.

Estado actual del código
Ya implementado ✅

Cambio	Estado
gpt-4o-mini en header (visión y texto)	✅
Docling text path para PDFs	✅
has_collapsed_table_cells() + fallback a visión	✅ recién hecho
Fix _reconcile_price() — bug Campofrío	✅ recién hecho
SqlPayload + build_sql_payload()	✅
Pendiente ❌

Cambio	Prioridad
Semáforo en producción para Docling (evitar contención con múltiples docs simultáneos)	Media — no urgente con la carga actual
Validar sql_payload vs. adapter JS de n8n en 5 facturas reales	Alta — antes de pasar n8n a pass-through
Actualizar CLAUDE.md de pizca-server	Baja
Modelo en producción — ya está decidido por el código
El routing ya está implementado:

PDF texto (digital o escaneado normal) → Docling → gpt-4o-mini ✅
PDF con celdas colapsadas (fallback) → visión → gpt-4o ✅
Foto móvil → visión → gpt-4o ✅
No hay nada que cambiar. No tiene sentido añadir Gemini en producción ahora — añade una segunda API key, otra dependencia, y solo lo probamos con 3 documentos.

¿Más pruebas de modelos?
No. Ya sabemos lo que necesitamos:

El texto path con gpt-4o-mini funciona bien (4/5 en Dispevi, el fallo de Campofrío ahora está corregido en reconcile_price)
El fallback a visión cubre los PDFs problemáticos
Los Gemma 4 tuvieron muchos 429 errors en OpenRouter — no son fiables como alternativa ahora mismo
La prueba masiva de 100 documentos la hacés en producción controlada (primeras semanas con el cliente), no ahora. Tenés el panel de revisión exactamente para eso.

¿RAG y otras tecnologías?
RAG — sí, pero no todavía. Es la siguiente evolución natural y tiene dos aplicaciones concretas:

Matching de aliases — ahora se pasa toda la lista de aliases conocidos al prompt. Con 50 proveedores y 200+ productos cada uno, eso no escala. RAG con pgvector (ya disponible en Supabase) buscaría los 20 aliases más similares semánticamente al nombre que viene en el documento. Reduce tokens y mejora precisión. Implementar cuando el catálogo supere ~300 items por proveedor.

Deduplicación de master items — en lugar de pasar toda la lista de EXISTING_MASTER_ITEMS al prompt, vector search encuentra los 10 más parecidos. Mismo problema, misma solución.

Otras tecnologías con valor real:

Structured outputs de OpenAI — en lugar de json_object (que puede fallar el schema), pasar el JSON schema exacto que querés. Elimina los errores de parseo. Esfuerzo bajo, ganancia en robustez. Válido cuando se estabilice el schema del extractor.

Fine-tuning — a futuro, cuando tengas 300+ correcciones reales en extraction_corrections, se puede hacer fine-tuning de gpt-4o-mini. Resultado: modelo más barato y más preciso para tu sector específico (hostelería española). Horizonte: 6-12 meses.

AWS Textract / Google Document AI — servicios especializados en facturas. Alternativa a Docling para la parte de OCR/tablas. No aportan nada que Docling no haga ya; descartarlos por ahora.

## Alcance

- Qué entra
- Qué no entra

## Impacto esperado

- UI
- reglas de negocio
- base de datos
- integraciones

## Riesgos

- Riesgos de regresión
- Riesgos de datos o semántica

## Aceptación

- Criterios concretos para dar el cambio por válido
