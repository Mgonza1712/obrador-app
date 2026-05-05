# Decisión: Matching programático de productos contra catálogo maestro

**Fecha:** 2026-05-04  
**Estado:** Implementado (commit `70ff7c4` en pizca-server, 2026-05-04)  
**Área:** pizca-extractor (`services/extractor.py` + prompts `extraction_normalization_v4*.txt`)

---

## Contexto

El extractor usa una llamada LLM (gpt-4o) para determinar si un producto sin alias conocido
ya existe en el catálogo bajo otro nombre (`is_existing_master: true/false`) y, si es así,
sugerir el `master_item_id` correcto (`suggested_master_item_id`).

Esta evaluación semántica depende de que el LLM compare el nombre del producto contra una lista
de `{id, official_name}` inyectada en el prompt (`{{EXISTING_MASTER_ITEMS}}`).

### Por qué falló en producción

El albaran A8716 (Frutas y Verduras Pepa, 2026-05-03) demostró el problema:
todos los productos fueron marcados `is_existing_master: false` aunque existían en el catálogo.
Causas identificadas:

1. **Instrucción ambigua**: el prompt dice "mismo producto con *distinto* nombre". Para
   "Tomate Rama" → "Tomate Rama" el LLM razona que no es un nombre distinto, por tanto no aplica.

2. **Carga cognitiva acumulada**: el LLM hace extracción fiel + normalización de 7+ productos
   simultáneamente. Añadir la comparación contra un catálogo de 100+ items en la misma llamada
   degrada la calidad de todos los trabajos.

3. **Riesgo de alucinación**: `suggested_master_item_id` es un UUID que el LLM debe copiar de
   la lista inyectada. Bajo carga cognitiva puede transcribir un UUID incorrecto o inexistente.
   El sistema lo usaría sin validación en la función SQL para Presupuestos (Cases B/C).

4. **No determinista**: el mismo documento puede producir resultados distintos entre llamadas.

### Impacto en Presupuestos

Para Albaranes y Facturas existe un safety net: el panel de revisión (`page.tsx`) hace una
búsqueda directa en `erp_item_aliases` al cargar, y puede recuperar el `master_item_id` aunque
el extractor haya fallado. Para Presupuestos, si `is_existing_master: false` en todos los
productos, el operario ve N fichas de "Producto nuevo" aunque la mayoría ya exista en catálogo —
la peor experiencia posible para una cotización de proveedor nuevo o semestral.

---

## Decisión

**Mover la evaluación de `is_existing_master` del LLM a un paso programático determinista**
que se ejecuta en Python tras la llamada LLM, sin coste adicional de tokens ni tiempo
significativo.

### Cambios en `extractor.py`

**1. Ampliar `get_master_items()` para incluir `base_unit` y `category`:**
```python
result = supabase.table("erp_master_items") \
    .select("id, official_name, base_unit, category") \
    .eq("tenant_id", tenant_id) \
    .execute()
```

**2. Nueva función `find_existing_master_item()`:**

Combina dos métricas de similitud de texto, ambas deben pasar:
- `token_set_ratio ≥ 90`: detecta que "zanahoria fina" contiene "zanahoria"
- `fuzz.ratio ≥ 70`: filtra falsos positivos entre productos con mismo género pero
  distinta variedad ("naranja zumo" ≠ "naranja valencia")

Compara primero el `official_name` normalizado por el LLM (threshold 90/70), y si no
encuentra match, reintenta con el `raw_name` del documento (threshold 90/70, misma lógica).

Retorna `(is_existing: bool, master_item_id: str | None, master_item_data: dict | None)`.

**3. Nueva función `apply_programmatic_master_matching()`:**

Para cada ítem con `alias_match=false` y `is_envase_retornable=false`:
- Ejecuta `find_existing_master_item()`
- Sobreescribe `is_existing_master` y `suggested_master_item_id` con el resultado
- Si hay match: sobreescribe también `base_unit` y `categoria` con los valores del
  catálogo (autoritativos, validados previamente por operario)
- Los campos de packaging (`formato_compra`, `envases_por_formato`, `contenido_por_envase`)
  NO se sobreescriben — provienen del documento vía LLM y son específicos del proveedor

Se llama en `extract_document()` después de `match_items_in_memory()`, antes de
`build_sql_payload()`.

### Cambios en los prompts (`v4` y `v4_text`)

- **Eliminar** `{{EXISTING_MASTER_ITEMS}}` del prompt y su instrucción explicativa
- **Eliminar** la sección `### is_existing_master / suggested_master_item_id` del prompt
- **Eliminar** `is_existing_master` y `suggested_master_item_id` del formato de respuesta JSON

Ahorro estimado: ~1.500 tokens de prompt por extracción para un catálogo de 100 productos.
La simplificación mejora el foco del LLM en extracción fiel y normalización de nombres.

---

## Comportamiento esperado tras el cambio

| Caso | Antes | Después |
|---|---|---|
| Producto con alias del proveedor | `alias_match: true`, auto-aprobado | Sin cambio |
| Producto sin alias, existe en catálogo con nombre similar | LLM puede fallar → `is_existing_master: false` | Programático detecta → `is_existing_master: true`, UUID garantizado |
| Producto sin alias, genuinamente nuevo | `is_existing_master: false` | Sin cambio |
| `base_unit` / `categoria` de producto encontrado | LLM los infiere (puede errar) | Tomados del catálogo (autoritativos) |
| `formato_compra`, `envases_por_formato`, `contenido_por_envase` | LLM los infiere del documento | Sin cambio — siguen viniendo del LLM porque son por proveedor |

---

## Por qué el LLM sigue infiriendo packaging aunque luego se encuentre el master item

El catálogo maestro (`erp_master_items`) guarda `base_unit` y `category`, pero **no el packaging**.
El packaging (`formato_compra`, `envases_por_formato`, `contenido_por_envase`) vive en el alias
(`erp_item_aliases`), que es por proveedor.

Cuando se crea un alias nuevo para un proveedor (Case B de la función SQL para Presupuestos),
esos campos de packaging son necesarios y solo el documento del proveedor los contiene.
Si el LLM no los infiere en la única llamada, sería necesaria una segunda llamada para los
productos genuinamente nuevos — mayor costo y latencia.

---

## Cuatro niveles de resolución resultantes (de mayor a menor autonomía)

```
1. Alias del proveedor (extractor, paso 4)       → alias_match=true, auto-aprobado
2. Match programático vs catálogo (extractor, paso 5 nuevo) → is_existing_master=true, Case B/C SQL
3. Auto-mapper del panel de revisión (page.tsx)  → busca en erp_item_aliases al cargar la página
4. Operario (revisión manual)                    → último recurso
```

Para Albaranes/Facturas existen los cuatro niveles. Para Presupuestos los niveles 2 y 4
son los críticos: el nivel 2 programático es lo que garantiza que una cotización con productos
del catálogo no genere N fichas de "producto nuevo".

---

## Riesgos y mitigaciones

**Falso positivo (asigna master item incorrecto):** Producto cuyo nombre comparte palabras clave
con otro producto del catálogo. El operario lo ve en revisión y puede corregirlo. La corrección
queda registrada como alias correcto — el error ocurre como máximo una vez por producto.
Probabilidad baja con el combinado token_set_ratio ≥ 90 AND fuzz.ratio ≥ 70.

**Falso negativo (no detecta un producto que sí existe):** Naming muy divergente entre el
documento y el catálogo. En ese caso el comportamiento es igual al actual — el operario lo
vincula manualmente. No hay regresión respecto al estado actual.

**Catálogo vacío o muy pequeño:** Si `get_master_items()` retorna una lista pequeña, el matching
tiene poca superficie — funcionará bien para los productos que sí están, sin falsos positivos.

---

## Criterios de aceptación (cuando se implemente)

- Para un documento cuyo proveedor no se resuelve (known_aliases vacío), los productos
  presentes en `erp_master_items` con nombre similar reciben `is_existing_master=true` y
  un `suggested_master_item_id` UUID válido verificable en la BD.
- Para productos genuinamente nuevos, `is_existing_master=false` y `suggested_master_item_id=null`.
- `base_unit` y `categoria` de un producto con match provienen del `erp_master_items` correspondiente,
  no de la inferencia del LLM.
- Los campos de packaging siguen proviniendo del LLM (no se sobreescriben desde el catálogo).
- El log imprime `🎯 Match programático: '<raw_name>' → '<official_name>' (score=N)` para cada match.
- Sin regresión en el caso nominal (proveedor resuelto + aliases conocidos → alias_match correcto).
- Los prompts `v4` y `v4_text` no incluyen `{{EXISTING_MASTER_ITEMS}}` ni instrucciones de
  `is_existing_master`.
