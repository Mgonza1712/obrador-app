"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2, ArrowUp, ArrowDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import IngredientCombobox from "./IngredientCombobox";
import {
  addBomLine,
  updateBomLine,
  deleteBomLine,
  reorderBomLines,
} from "@/lib/actions/escandallo.actions";
import { getCompatibleUnits, normalizeQuantity, UNIT_CONVERSIONS } from "@/lib/utils/unit-conversion";
import type { BomLineExpanded, IngredientOption } from "@/lib/types/escandallo.types";

interface Props {
  assemblyId: string;
  initialLines: BomLineExpanded[];
  ingredientOptions: IngredientOption[];
  onIngredientAdded?: (name: string) => void;
}

// Extend BomLineExpanded with display fields (added in last migration, may not be in types yet)
interface LocalLine extends BomLineExpanded {
  _localId: string;
  _pending?: boolean;
  display_quantity?: number | null;
  display_unit?: string | null;
}

let localIdCounter = 0;
function newLocalId() {
  return `local-${++localIdCounter}`;
}

export default function BomLineEditor({
  assemblyId,
  initialLines,
  ingredientOptions,
  onIngredientAdded,
}: Props) {
  const [lines, setLines] = useState<LocalLine[]>(
    initialLines.map((l) => ({
      ...l,
      _localId: l.id ?? newLocalId(),
      // display_quantity/display_unit were added in a recent migration; cast to read them
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      display_quantity: (l as any).display_quantity ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      display_unit: (l as any).display_unit ?? null,
    }))
  );
  const [isPending, startTransition] = useTransition();

  // New line form state
  const [newIngredient, setNewIngredient] = useState<IngredientOption | null>(null);
  const [newQty, setNewQty] = useState("");
  const [newUnit, setNewUnit] = useState("ud");
  const [newWaste, setNewWaste] = useState("0");

  // When ingredient changes, reset unit to its baseUnit
  function handleIngredientChange(opt: IngredientOption | null) {
    setNewIngredient(opt);
    if (opt) {
      setNewUnit(opt.baseUnit);
    }
  }

  const compatibleUnits = newIngredient
    ? getCompatibleUnits(newIngredient.baseUnit)
    : ["g", "kg", "ml", "l", "ud"];

  const totalRaw = lines.reduce(
    (acc, l) => acc + (l.line_cost ?? l.sub_assembly_line_cost ?? 0),
    0
  );

  function handleAddLine() {
    if (!newIngredient || !newQty || Number(newQty) <= 0) {
      toast.error("Selecciona un ingrediente y una cantidad válida");
      return;
    }

    const localId = newLocalId();
    const sortOrder = lines.length;
    const qty = Number(newQty);
    const waste = Number(newWaste);

    // Normalize display qty → base unit for correct line_cost preview
    let normalizedQtyForCost = qty;
    try {
      const { normalizedQty: nq } = normalizeQuantity(qty, newUnit, newIngredient.baseUnit);
      normalizedQtyForCost = nq;
    } catch {
      // incompatible units — keep raw qty
    }

    const optimistic: LocalLine = {
      _localId: localId,
      _pending: true,
      id: null,
      assembly_id: assemblyId,
      component_id: newIngredient.type === "component" ? newIngredient.id : null,
      sub_assembly_id: newIngredient.type === "sub_assembly" ? newIngredient.id : null,
      component_name: newIngredient.type === "component" ? newIngredient.name : null,
      sub_assembly_name: newIngredient.type === "sub_assembly" ? newIngredient.name : null,
      master_item_id: null,
      master_item_name: null,
      base_unit: newIngredient.baseUnit,
      quantity: qty,
      unit: newUnit,
      display_quantity: qty,
      display_unit: newUnit,
      waste_pct: waste,
      sort_order: sortOrder,
      unit_cost: newIngredient.unitCost,
      line_cost: newIngredient.unitCost > 0
        ? newIngredient.unitCost * normalizedQtyForCost * (1 + waste / 100)
        : null,
      sub_assembly_cogs: null,
      sub_assembly_line_cost: null,
      line_type: newIngredient.type,
      ingredient_category: newIngredient.category,
    };

    setLines((prev) => [...prev, optimistic]);
    onIngredientAdded?.(newIngredient.name);
    setNewIngredient(null);
    setNewQty("");
    setNewUnit("ud");
    setNewWaste("0");

    startTransition(async () => {
      const result = await addBomLine(assemblyId, {
        ingredientId: newIngredient.id,
        type: newIngredient.type,
        ingredientBaseUnit: newIngredient.baseUnit,
        quantity: qty,
        unit: newUnit,
        wastePct: waste,
        sortOrder: sortOrder,
      });

      if (result.success && result.data) {
        setLines((prev) =>
          prev.map((l) =>
            l._localId === localId
              ? { ...l, id: result.data!.id, _pending: false }
              : l
          )
        );
      } else if (!result.success) {
        setLines((prev) => prev.filter((l) => l._localId !== localId));
        toast.error(result.error);
      }
    });
  }

  function handleUpdateQty(localId: string, lineId: string | null, qtyStr: string) {
    const num = Number(qtyStr);
    if (isNaN(num) || num <= 0) return;
    setLines((prev) =>
      prev.map((l) =>
        l._localId === localId ? { ...l, display_quantity: num, quantity: num } : l
      )
    );
    if (!lineId) return;
    startTransition(async () => {
      const unit = lines.find((l) => l._localId === localId)?.display_unit ?? lines.find((l) => l._localId === localId)?.unit ?? "ud";
      const result = await updateBomLine(lineId, {
        display_quantity: num,
        display_unit: unit,
      });
      if (!result.success) toast.error(result.error);
    });
  }

  function handleUpdateWaste(localId: string, lineId: string | null, wasteStr: string) {
    const num = Number(wasteStr);
    if (isNaN(num)) return;
    setLines((prev) =>
      prev.map((l) => (l._localId === localId ? { ...l, waste_pct: num } : l))
    );
    if (!lineId) return;
    startTransition(async () => {
      const result = await updateBomLine(lineId, { waste_pct: num });
      if (!result.success) toast.error(result.error);
    });
  }

  function handleUpdateUnit(localId: string, lineId: string | null, newDisplayUnit: string) {
    const line = lines.find((l) => l._localId === localId);
    if (!line) return;
    const baseQty = line.quantity ?? 0;
    const newFactor = UNIT_CONVERSIONS[newDisplayUnit]?.factor ?? 1;
    const newDisplayQty = newFactor !== 0 ? baseQty / newFactor : baseQty;

    setLines((prev) =>
      prev.map((l) =>
        l._localId === localId
          ? { ...l, display_unit: newDisplayUnit, display_quantity: newDisplayQty }
          : l
      )
    );
    if (!lineId) return;
    startTransition(async () => {
      const result = await updateBomLine(lineId, {
        display_unit: newDisplayUnit,
        display_quantity: newDisplayQty,
      });
      if (!result.success) toast.error(result.error);
    });
  }

  function handleDeleteLine(localId: string, lineId: string | null) {
    setLines((prev) => prev.filter((l) => l._localId !== localId));
    if (!lineId) return;
    startTransition(async () => {
      const result = await deleteBomLine(lineId);
      if (!result.success) toast.error(result.error);
    });
  }

  function handleMove(localId: string, direction: "up" | "down") {
    let reordered: LocalLine[] = [];
    setLines((prev) => {
      const idx = prev.findIndex((l) => l._localId === localId);
      if (idx === -1) return prev;
      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      reordered = next.map((l, i) => ({ ...l, sort_order: i }));
      return reordered;
    });

    startTransition(async () => {
      const payload = reordered
        .filter((l) => l.id)
        .map((l, i) => ({ id: l.id!, sort_order: i }));
      if (payload.length === 0) return;
      const result = await reorderBomLines(payload);
      if (!result.success) toast.error(result.error);
    });
  }

  const displayName = (l: LocalLine) =>
    l.line_type === "sub_assembly"
      ? l.sub_assembly_name
      : l.component_name ?? l.master_item_name;

  // Display quantity and unit: prefer user-entered display values
  const dispQty = (l: LocalLine) => l.display_quantity ?? l.quantity ?? 0;
  const dispUnit = (l: LocalLine) => l.display_unit ?? l.unit ?? l.base_unit ?? "—";

  return (
    <div className="rounded-lg border">
      <div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Ingrediente</th>
              <th className="px-3 py-2 text-right font-medium">Cantidad</th>
              <th className="px-3 py-2 text-center font-medium">Unidad</th>
              <th className="px-3 py-2 text-center font-medium">
                <div className="flex items-center justify-center gap-1">
                  Merma (%)
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help rounded-full bg-muted px-1 py-0.5 text-[10px]">
                        ?
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p>
                        Pérdida física al preparar el ingrediente (huesos, cáscaras,
                        evaporación).
                        <br />
                        <strong>Ej:</strong> 30% para carne con hueso — de 1 kg comprado
                        solo 700 g son aprovechables.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </th>
              <th className="px-3 py-2 text-right font-medium">Coste línea</th>
              <th className="px-3 py-2 text-center font-medium">Orden</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  Sin ingredientes. Añade el primero abajo.
                </td>
              </tr>
            )}
            {lines.map((l, idx) => (
              <tr
                key={l._localId}
                className={`border-b last:border-0 ${l._pending ? "opacity-60" : ""}`}
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    {l.line_type === "sub_assembly" && (
                      <span className="rounded bg-primary/10 px-1 py-0.5 text-[10px] text-primary">
                        Sub
                      </span>
                    )}
                    <span>{displayName(l) ?? "—"}</span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <Input
                    type="number"
                    min="0"
                    step="0.001"
                    defaultValue={dispQty(l)}
                    onBlur={(e) =>
                      handleUpdateQty(l._localId, l.id, e.target.value)
                    }
                    className="h-7 w-24 text-right"
                    disabled={isPending || l._pending}
                  />
                </td>
                <td className="px-3 py-2 text-center">
                  <Select
                    value={dispUnit(l)}
                    onValueChange={(val) => handleUpdateUnit(l._localId, l.id, val)}
                    disabled={isPending || l._pending}
                  >
                    <SelectTrigger className="h-7 w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {getCompatibleUnits(l.base_unit ?? "ud").map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="relative inline-flex items-center">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.5"
                          defaultValue={l.waste_pct ?? 0}
                          onChange={(e) => {
                            const num = Number(e.target.value);
                            if (isNaN(num)) return;
                            setLines((prev) =>
                              prev.map((ln) =>
                                ln._localId === l._localId
                                  ? {
                                      ...ln,
                                      waste_pct: num,
                                      line_cost:
                                        ln.unit_cost != null
                                          ? (ln.quantity ?? 0) * ln.unit_cost * (1 + num / 100)
                                          : ln.line_cost,
                                    }
                                  : ln
                              )
                            );
                          }}
                          onBlur={(e) =>
                            handleUpdateWaste(l._localId, l.id, e.target.value)
                          }
                          className="h-7 w-20 pr-5 text-right"
                          disabled={isPending || l._pending}
                        />
                        <span className="pointer-events-none absolute right-2 text-xs text-muted-foreground">
                          %
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p>
                        Merma: pérdida al preparar el ingrediente.
                        <br />
                        {l.waste_pct
                          ? `Con ${l.waste_pct}% de merma: de ${dispQty(l)} ${dispUnit(l)} solo ${((dispQty(l) as number) * (1 - (l.waste_pct ?? 0) / 100)).toFixed(3)} ${dispUnit(l)} son aprovechables.`
                          : "0% = sin merma."}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {(l.line_cost ?? l.sub_assembly_line_cost) != null
                    ? `${(l.line_cost ?? l.sub_assembly_line_cost)!.toFixed(3)} €`
                    : "—"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleMove(l._localId, "up")}
                      disabled={idx === 0 || isPending}
                    >
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleMove(l._localId, "down")}
                      disabled={idx === lines.length - 1 || isPending}
                    >
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => handleDeleteLine(l._localId, l.id)}
                    disabled={isPending || l._pending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}

            {/* Totals row */}
            {lines.length > 0 && (
              <tr className="border-t bg-muted/20 font-medium">
                <td
                  colSpan={4}
                  className="px-3 py-2 text-right text-xs text-muted-foreground"
                >
                  Total ingredientes
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {totalRaw.toFixed(3)} €
                </td>
                <td colSpan={2} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add new line */}
      <div className="border-t bg-muted/10 p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Añadir ingrediente
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1">
            <IngredientCombobox
              options={ingredientOptions}
              value={newIngredient}
              onChange={handleIngredientChange}
              disabled={isPending}
            />
          </div>
          <div className="w-28">
            <Input
              type="number"
              min="0"
              step="0.001"
              placeholder="Cantidad"
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
              disabled={isPending}
              className="h-9"
            />
          </div>
          <div className="w-28">
            <Select
              value={newUnit}
              onValueChange={setNewUnit}
              disabled={isPending}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {compatibleUnits.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="relative w-24">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  placeholder="0"
                  value={newWaste}
                  onChange={(e) => setNewWaste(e.target.value)}
                  disabled={isPending}
                  className="h-9 pr-6"
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  %
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <p>
                Merma (%): pérdida física al preparar el ingrediente.
                <br />
                <strong>Ej:</strong> 30% para carne con hueso.
              </p>
            </TooltipContent>
          </Tooltip>
          <Button
            type="button"
            size="sm"
            onClick={handleAddLine}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            <span className="ml-1">Añadir</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
