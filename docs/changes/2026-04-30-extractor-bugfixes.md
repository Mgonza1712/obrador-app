# Cambio: Bugfixes E2E extractor — 2026-04-30

## Objetivo

Corregir 5 bugs encontrados en test E2E del pipeline completo, más un fix de visor PDF en la revisión.

---

## Bug 1 — Separadores decimales españoles en el LLM

**Síntoma:** El extractor leía `0,400` como `4` (en lugar de `0.4`). Los documentos españoles usan coma como separador decimal y punto como separador de miles.

**Causa:** El prompt no instruía al LLM sobre esta convención; interpretaba `0,400` como `0` con sufijo `,400`.

**Fix:** Añadida REGLA 9 en ambos prompts del extractor:
- `pizca-server/pizca-extractor/prompts/extraction_normalization_v4.txt`
- `pizca-server/pizca-extractor/prompts/extraction_normalization_v4_text.txt`

Regla:
```
- "0,400" → 0.4   (no 4 ni 400)
- "1.000" → 1000  (punto es separador de miles)
- "1,45"  → 1.45
```

La regla de reconciliación solo aplica a precios, no a cantidades (las cantidades no se reconcilian matemáticamente).

---

## Bug 2 — Observaciones del operario no persistidas

**Síntoma:** Las notas escritas por el operario en el scanner no llegaban a `erp_documents.notes` ni eran visibles en la pantalla de revisión.

**Causa:** El campo `observations` no estaba en `ExtractionRequest` y por tanto nunca viajaba por el pipeline.

**Fix — pipeline completo:**

| Archivo | Cambio |
|---|---|
| `pizca-extractor/models/schemas.py` | `observations: Optional[str]` añadido a `ExtractionRequest`, `ExtractionResult` y `SqlDocumento` |
| `pizca-extractor/services/extractor.py` | `build_sql_payload()` ahora incluye `observations=result.observations` en `SqlDocumento` |
| `pizca-extractor/main.py` | `_do_extract()` asigna `observations=request.observations` al `ExtractionResult` |
| Supabase migration | `ALTER TABLE erp_documents ADD COLUMN IF NOT EXISTS notes TEXT` |
| `procesar_factura_completa_v4` | Declara `v_doc_notes`, lee desde `p_json_payload->'documento'->>'observations'`, lo inserta en ambas ramas (A y B) |
| `app/(dashboard)/admin/revision/[id]/page.tsx` | Query incluye `notes`; se mapea en `DocumentWithRelations` |
| `app/(dashboard)/admin/revision/[id]/types.ts` | `notes: string \| null` añadido a `DocumentWithRelations` |
| `app/(dashboard)/admin/revision/[id]/RevisionClient.tsx` | Banner ámbar visible si `doc.notes` tiene valor |
| `database.types.ts` | Regenerado (`npx supabase gen types`) |

---

## Bug 3 — `extraction_logs.document_id` siempre NULL

**Síntoma:** Todos los registros en `extraction_logs` tenían `document_id = NULL`.

**Causa:** `extraction_log` se crea *antes* de que la función SQL cree el documento; el `document_id` solo existe después del paso SQL que ejecuta n8n.

**Fix:** El endpoint `/job-complete/{job_id}` en `main.py` ahora parchea `extraction_logs.document_id` cuando n8n incluye `extraction_log_id` y `document_id` en el payload:

```python
extraction_log_id = payload.get("extraction_log_id")
document_id = payload.get("document_id")
if extraction_log_id and document_id:
    get_supabase().table("extraction_logs")
        .update({"document_id": document_id})
        .eq("id", extraction_log_id)
        .execute()
```

**Pendiente:** n8n debe incluir `extraction_log_id` en el body del POST a `/job-complete/{job_id}`.

---

## Bug 4 — `extraction_corrections.document_id` vacío + `prompt_version = 'unknown'`

**Síntoma:** Al guardar correcciones en revisión, `document_id` era NULL y `prompt_version` era la string literal `"unknown"`.

**Causas:**
- `document_id` no se pasaba en el insert del server action.
- `prompt_version` no viajaba en cada `SqlLineItem`, así que la función SQL leía `item->>'prompt_version'` como `null` y la columna quedaba con su default `'unknown'`.

**Fix:**
- `app/actions/documentRevision.ts`: añadido `document_id: payload.document.id` al insert de `extraction_corrections`.
- `pizca-extractor/models/schemas.py`: añadido `prompt_version: Optional[str]` a `SqlLineItem`.
- `pizca-extractor/services/extractor.py`: `build_sql_payload()` ahora asigna `prompt_version=result.prompt_version` en cada `SqlLineItem`.

---

## Bug 5 — Alias matching falla por variaciones en nombre de proveedor

**Síntoma:** Productos con aliases conocidos (banana, cebollita) aparecían en revisión como `new_product`. Todos los ítems de un documento tenían `alias_match: false`.

**Causa raíz:** Fallo en cascada originado en `resolve_provider_id()`:

```
"Frutas y Verduras Pepa S.L."  ←  lo que el LLM lee del documento
"Frutas y Verduras Pepa SL"    ←  como está guardado en erp_providers
fuzz.ratio(a, b) ≈ 84          ←  debajo del umbral 88 → devuelve None
→ known_aliases = []            ←  get_known_aliases(None) retorna [] directamente
→ LLM recibe "(ninguno)"        ←  todos los productos marcados alias_match: false
→ match_items_in_memory([])     ←  safety net también vacío
```

**Fix:** `pizca-extractor/services/extractor.py` — reemplazado `fuzz.ratio` por `fuzz.token_set_ratio` en dos lugares:
1. `resolve_provider_id()` — para comparar nombres de proveedores
2. `match_items_in_memory()` — para el fuzzy fallback de alias names

`token_set_ratio` tokeniza, ordena y compara — es robusto ante puntuación, espacios extra y diferencias como "S.L." vs "SL", "y" vs "&".

```python
# Antes (frágil ante puntuación):
score = fuzz.ratio(name_lower, p["name"].lower().strip())

# Después (robusto):
score = fuzz.token_set_ratio(name_lower, p["name"].lower().strip())
```

---

## Bug 6 — Visor PDF/imagen recorta el documento por abajo

**Síntoma:** En `/admin/revision/[id]`, la mitad inferior del documento no era visible en el visor lateral.

**Causa:** El contenedor sticky tenía `h-[calc(100vh-2rem)]` y el card interno usaba `h-full` sin `overflow`. Las imágenes usaban `object-contain` fijo en lugar de fluir.

**Fix:** `app/(dashboard)/admin/revision/[id]/RevisionClient.tsx`:
- Sticky wrapper: `h-[calc(100vh-2rem)]` → `h-[calc(100vh-3rem)]`
- Card: añadido `min-h-[500px]`
- Imagen: envuelta en `<div className="flex-1 overflow-y-auto">` + `h-auto block` (scrollable si el documento es más largo que la ventana)
- iframe: `h-full` → `flex-1` (crece con el flex container en lugar de tener altura fija)

---

## Impacto

- **pizca-server:** Requiere redeploy en Oracle. Cambios en `schemas.py`, `extractor.py`, `main.py`, y ambos prompts.
- **obrador-app:** Deploy automático desde `main`. Cambios en `RevisionClient.tsx`, `page.tsx`, `types.ts`, `documentRevision.ts`.
- **Supabase:** Migración `ADD COLUMN notes` aplicada. `procesar_factura_completa_v4` actualizada.
- **n8n:** Pendiente incluir `extraction_log_id` en POST a `/job-complete/{job_id}`.

## Labels UI renombrados

En la pantalla de revisión (`RevisionClient.tsx`), para reducir confusión operaria:
- "Envases por formato" → **"Piezas por bulto"**
- "Contenido por envase" → **"Contenido por pieza"**

Los nombres de columna en BD y pipeline no cambiaron (`envases_por_formato`, `contenido_por_envase`).
