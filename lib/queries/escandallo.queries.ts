import type { SupabaseClient } from "@supabase/supabase-js";
import type { IngredientOption } from "@/lib/types/escandallo.types";

export async function getIngredientOptions(
  supabase: SupabaseClient,
  tenantId: string
): Promise<IngredientOption[]> {
  // Fuente 1: Materias primas — left join con erp_master_items (nullable)
  const { data: components, error: compError } = await supabase
    .from("components")
    .select(
      `
      id,
      name,
      unit,
      current_cogs,
      master_item_id,
      erp_master_items (
        id,
        official_name,
        base_unit,
        category
      )
    `
    )
    .eq("tenant_id", tenantId)
    .order("name");

  if (compError) console.error("Error fetching components:", compError);

  // Fuente 2: Sub-recetas activas del mismo tenant
  const { data: subAssemblies, error: asmError } = await supabase
    .from("assemblies")
    .select("id, title, yield_unit, cogs")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("title");

  if (asmError) console.error("Error fetching sub-assemblies:", asmError);

  const componentOptions: IngredientOption[] = (components ?? []).map((c) => {
    // erp_master_items puede ser objeto o array según cómo devuelva Supabase el select
    const mi = Array.isArray(c.erp_master_items)
      ? c.erp_master_items[0]
      : c.erp_master_items;
    return {
      type: "component" as const,
      id: c.id,
      name: c.name,
      officialName: mi?.official_name ?? c.name,
      unit: c.unit ?? mi?.base_unit ?? "ud",
      baseUnit: mi?.base_unit ?? c.unit ?? "ud",
      unitCost: c.current_cogs ?? 0,
      category: mi?.category ?? "Otros",
    };
  });

  const subAssemblyOptions: IngredientOption[] = (subAssemblies ?? []).map(
    (a) => ({
      type: "sub_assembly" as const,
      id: a.id,
      name: a.title,
      officialName: a.title,
      unit: a.yield_unit ?? "ud",
      baseUnit: a.yield_unit ?? "ud",
      unitCost: a.cogs ?? 0,
      category: "Sub-receta",
    })
  );

  return [...componentOptions, ...subAssemblyOptions];
}
