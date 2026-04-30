# Decisión pendiente: Fallback de alias matching a nivel tenant

**Fecha:** 2026-04-30  
**Estado:** Pendiente de implementar

---

## Contexto

El pipeline de alias matching depende de una cadena de 5 pasos. Si el paso 2 (resolver `provider_id`) falla, los pasos 3-5 no tienen datos y todos los productos del documento se tratan como nuevos:

```
1. LLM extrae nombre del proveedor del documento
2. resolve_provider_id() → busca UUID en erp_providers por nombre
3. get_known_aliases(provider_id) → si None, retorna [] inmediatamente
4. LLM recibe KNOWN_ALIASES vacío → alias_match: false en todos
5. match_items_in_memory([], ...) → safety net también vacío
```

El fix de `fuzz.token_set_ratio` (2026-04-30) mitiga el caso más común (variaciones de puntuación como "S.L." vs "SL"), pero no cubre todos los escenarios posibles:

- Proveedor con nombre muy abreviado en el documento vs nombre completo en BD
- Nombre en el documento extraído con error de OCR
- Error transitorio de red al consultar Supabase para `erp_providers`
- Proveedor genuinamente nuevo que tiene productos en común con otro proveedor

En todos estos casos, el sistema degrada silenciosamente a "todo es nuevo", forzando revisión manual innecesaria.

---

## Decisión propuesta

Cuando `resolve_provider_id()` devuelve `None` **y** hay `master_items` conocidos en el tenant, añadir un paso de fallback antes de ir al LLM:

**Buscar en `erp_item_aliases` todos los aliases del tenant sin filtrar por proveedor**, y usar ese conjunto para el matching en memoria.

```python
# Lógica propuesta en get_known_aliases():
if not provider_id:
    # Fallback: buscar aliases de todo el tenant (sin filtro de proveedor)
    result = supabase.table("erp_item_aliases") \
        .select("raw_name, master_item_id") \
        .eq("tenant_id", tenant_id) \
        .execute()
    return result.data or []
```

O como función separada `get_all_tenant_aliases(tenant_id)` llamada explícitamente cuando `resolved_provider_id is None`.

### Comportamiento esperado

| Escenario | Antes del fallback | Con fallback |
|---|---|---|
| Provider resuelto → tiene alias | alias_match correcto | alias_match correcto (sin cambio) |
| Provider NO resuelto → productos con alias en otros proveedores | alias_match: false | alias_match: true (si el raw_name coincide) |
| Provider NO resuelto → productos genuinamente nuevos | alias_match: false | alias_match: false (correcto) |
| Producto existe en aliases de 2 proveedores con distinto master_item_id | N/A | Puede retornar el master_item de otro proveedor — ver riesgos |

### Riesgos

1. **Colisión de nombres:** El mismo `raw_name` puede existir en aliases de distintos proveedores apuntando a distintos `master_item_id`. Sin `provider_id`, se usaría el primero que devuelva la query. Mitigación: la función SQL v4 puede corregir el `master_item_id` con el `provider_id` real cuando lo resuelva.

2. **Falsos positivos:** Un producto de un proveedor nuevo podría hacer match con el alias de otro proveedor que usa el mismo nombre comercial para un producto distinto (ej: "Cerveza Especial" de Mahou vs "Cerveza Especial" de Estrella). Mitigación: la confianza de precio seguiría siendo baja para un proveedor no reconocido, así que la línea quedaría en revisión aunque tenga `alias_match: true`. El impacto real es bajo.

3. **Performance:** En tenants con muchos aliases (>500), la query sin filtro de proveedor es más costosa. Mitigación: añadir índice en `erp_item_aliases(tenant_id)` si no existe.

---

## Alternativas descartadas

- **Bajar el umbral de `FUZZY_MATCH_THRESHOLD` a 70:** Aumenta el riesgo de falsos positivos en el matching de proveedor (ej: "Pepa S.L." matchea con "Pepe S.L." que es otro proveedor). Descartado.
- **Dejar solo el fix de `token_set_ratio`:** Cubre el 90% de los casos pero deja la cadena frágil. Válido como primera iteración; este fallback sería la segunda.

---

## Criterios de aceptación (cuando se implemente)

- Cuando `resolve_provider_id` devuelve `None`, el log imprime `⚠️ Provider no resuelto — usando aliases de todo el tenant (N aliases)`.
- Productos con aliases conocidos en el tenant se marcan `alias_match: true` aunque el proveedor no esté resuelto.
- Productos genuinamente nuevos siguen marcándose `alias_match: false`.
- Sin regresión en el caso nominal (proveedor resuelto correctamente).
