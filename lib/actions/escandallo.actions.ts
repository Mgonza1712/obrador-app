"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { normalizeQuantity } from "@/lib/utils/unit-conversion";
import type {
  ActionResult,
  AssemblyFormValues,
  BomLineInput,
  ReorderPayload,
  TenantConfigFormValues,
} from "@/lib/types/escandallo.types";

// ─── Zod schemas ──────────────────────────────────────────────────────────────
const AssemblySchema = z.object({
  title: z.string().min(1, "El nombre es obligatorio"),
  category: z.string().nullable().optional(),
  sale_price: z.number().positive().nullable().optional(),
  yield_qty: z.number().positive().nullable().optional(),
  yield_unit: z.string().nullable().optional(),
  margin_target_pct: z.number().min(0).max(100).default(65),
  buffer_pct: z.number().min(0).max(20).default(5),
  notes: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
  allergens: z.array(z.string()).default([]),
});

const TenantConfigSchema = z.object({
  threshold_price_spike_pct: z.number().min(0).max(100),
  threshold_cogs_increase_pct: z.number().min(0).max(100),
});

const BomLineSchema = z.object({
  ingredientId: z.string().uuid(),
  type: z.enum(["component", "sub_assembly"]),
  ingredientBaseUnit: z.string(),
  quantity: z.number().positive("La cantidad debe ser mayor que 0"),
  unit: z.string(),
  wastePct: z.number().min(0).max(100).default(0),
  sortOrder: z.number().int().default(0),
});

// ─── Helper: get tenant_id from session ──────────────────────────────────────
async function getAuthTenantId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error("No autenticado");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.tenant_id) throw new Error("Perfil no encontrado");
  return profile.tenant_id;
}

// ─── Assembly actions ─────────────────────────────────────────────────────────
export async function createAssembly(
  formData: AssemblyFormValues
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = AssemblySchema.safeParse(formData);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }

    const tenantId = await getAuthTenantId();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("assemblies")
      .insert({ ...parsed.data, tenant_id: tenantId })
      .select("id")
      .single();

    if (error) return { success: false, error: error.message };

    revalidatePath("/escandallos");
    return { success: true, data: { id: data.id } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Error desconocido" };
  }
}

export async function updateAssembly(
  id: string,
  formData: AssemblyFormValues
): Promise<ActionResult> {
  try {
    const parsed = AssemblySchema.safeParse(formData);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }

    const tenantId = await getAuthTenantId();
    const supabase = await createClient();

    const { error } = await supabase
      .from("assemblies")
      .update(parsed.data)
      .eq("id", id)
      .eq("tenant_id", tenantId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/escandallos");
    revalidatePath(`/escandallos/${id}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Error desconocido" };
  }
}

export async function deleteAssembly(id: string): Promise<ActionResult> {
  try {
    const tenantId = await getAuthTenantId();
    const supabase = await createClient();

    const { error } = await supabase
      .from("assemblies")
      .delete()
      .eq("id", id)
      .eq("tenant_id", tenantId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/escandallos");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Error desconocido" };
  }
}

// ─── BOM Line actions ─────────────────────────────────────────────────────────
export async function addBomLine(
  assemblyId: string,
  input: BomLineInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = BomLineSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }

    // Normalize display quantity → base unit for the COGS trigger
    let normalizedQty: number;
    let normalizedUnit: string;
    try {
      ({ normalizedQty, normalizedUnit } = normalizeQuantity(
        parsed.data.quantity,
        parsed.data.unit,
        parsed.data.ingredientBaseUnit
      ));
    } catch (convErr) {
      return {
        success: false,
        error: convErr instanceof Error ? convErr.message : "Error de conversión de unidades",
      };
    }

    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("bom_lines")
      .insert({
        assembly_id:      assemblyId,
        component_id:     parsed.data.type === "component"    ? parsed.data.ingredientId : null,
        sub_assembly_id:  parsed.data.type === "sub_assembly" ? parsed.data.ingredientId : null,
        quantity:         normalizedQty,
        unit:             normalizedUnit,
        display_quantity: parsed.data.quantity,
        display_unit:     parsed.data.unit,
        waste_pct:        parsed.data.wastePct,
        sort_order:       parsed.data.sortOrder,
      })
      .select("id")
      .single();

    if (error) return { success: false, error: error.message };

    revalidatePath(`/escandallos/${assemblyId}`);
    revalidatePath("/escandallos");
    return { success: true, data: { id: data.id } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Error desconocido" };
  }
}

export async function updateBomLine(
  lineId: string,
  data: { quantity?: number; unit?: string; display_quantity?: number; display_unit?: string; waste_pct?: number }
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("bom_lines")
      .update(data)
      .eq("id", lineId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/escandallos");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Error desconocido" };
  }
}

export async function deleteBomLine(lineId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("bom_lines")
      .delete()
      .eq("id", lineId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/escandallos");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Error desconocido" };
  }
}

export async function reorderBomLines(
  lines: ReorderPayload[]
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const updates = lines.map(({ id, sort_order }) =>
      supabase.from("bom_lines").update({ sort_order }).eq("id", id)
    );
    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    if (failed?.error) return { success: false, error: failed.error.message };

    revalidatePath("/escandallos");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Error desconocido" };
  }
}

// ─── Alert actions ────────────────────────────────────────────────────────────
export async function markAlertAsRead(alertId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("cost_alerts")
      .update({ is_read: true })
      .eq("id", alertId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/alertas-rentabilidad");
    revalidatePath("/escandallos");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Error desconocido" };
  }
}

// ─── Tenant config actions ────────────────────────────────────────────────────
export async function upsertTenantConfig(
  formData: TenantConfigFormValues
): Promise<ActionResult> {
  try {
    const parsed = TenantConfigSchema.safeParse(formData);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
    }

    const tenantId = await getAuthTenantId();
    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("erp_tenant_config")
      .upsert(
        {
          tenant_id: tenantId,
          threshold_price_spike_pct: parsed.data.threshold_price_spike_pct,
          threshold_cogs_increase_pct: parsed.data.threshold_cogs_increase_pct,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id" }
      );

    if (error) return { success: false, error: error.message };

    revalidatePath("/alertas-rentabilidad");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Error desconocido" };
  }
}

// tenantId param kept for API compatibility; actual scope enforced via session
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function markAllAlertsAsRead(_tenantId: string): Promise<ActionResult> {
  try {
    const authTenantId = await getAuthTenantId();
    const supabase = await createClient();
    const { error } = await supabase
      .from("cost_alerts")
      .update({ is_read: true })
      .eq("tenant_id", authTenantId)
      .eq("is_read", false);

    if (error) return { success: false, error: error.message };

    revalidatePath("/alertas-rentabilidad");
    revalidatePath("/escandallos");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Error desconocido" };
  }
}
