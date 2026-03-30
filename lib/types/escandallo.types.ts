import type { Database } from "@/database.types";

// ─── Base row types from DB ───────────────────────────────────────────────────
export type Assembly = Database["public"]["Tables"]["assemblies"]["Row"];
export type BomLine = Database["public"]["Tables"]["bom_lines"]["Row"];
export type Component = Database["public"]["Tables"]["components"]["Row"];
export type CostAlert = Database["public"]["Tables"]["cost_alerts"]["Row"];

// ─── View types ───────────────────────────────────────────────────────────────
export type AssemblyWithFinancials =
  Database["public"]["Views"]["assemblies_with_financials"]["Row"];
export type BomLineExpanded =
  Database["public"]["Views"]["bom_lines_expanded"]["Row"];

// ─── Margin status literal ────────────────────────────────────────────────────
export type MarginStatus = "healthy" | "warning" | "critical" | "no_price";

// ─── Form types ───────────────────────────────────────────────────────────────
export interface AssemblyFormValues {
  title: string;
  category: string | null;
  sale_price: number | null;
  yield_qty: number | null;
  yield_unit: string | null;
  margin_target_pct: number;
  buffer_pct: number;
  notes: string | null;
  is_active: boolean;
  allergens?: string[];
}

export interface TenantConfigFormValues {
  threshold_price_spike_pct: number;
  threshold_cogs_increase_pct: number;
}

export interface BomLineInput {
  ingredientId: string;
  type: "component" | "sub_assembly";
  ingredientBaseUnit: string;
  /** Quantity as entered by the user (display value) */
  quantity: number;
  /** Unit as chosen by the user (display value, e.g. "kg") */
  unit: string;
  wastePct: number;
  sortOrder: number;
}

// ─── Ingredient option for combobox ──────────────────────────────────────────
export interface IngredientOption {
  type: "component" | "sub_assembly";
  id: string;
  name: string;
  officialName: string;
  unit: string;
  baseUnit: string;
  unitCost: number;
  category: string;
}

// ─── Server Action result ─────────────────────────────────────────────────────
export type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };

// ─── Alert types ─────────────────────────────────────────────────────────────
export type AlertType =
  | "ingredient_price_spike"
  | "cogs_increased"
  | "margin_below_target";

export interface CostAlertWithAssembly extends CostAlert {
  assembly_title?: string | null;
}

// ─── Reorder payload ─────────────────────────────────────────────────────────
export interface ReorderPayload {
  id: string;
  sort_order: number;
}
