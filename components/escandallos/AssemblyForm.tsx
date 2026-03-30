"use client";

import { useState, useTransition, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { createAssembly, updateAssembly } from "@/lib/actions/escandallo.actions";
import type { AssemblyWithFinancials } from "@/lib/types/escandallo.types";

const ALERGENOS_EU = [
  'Gluten', 'Crustáceos', 'Huevos', 'Pescado', 'Cacahuetes',
  'Soja', 'Lácteos', 'Frutos secos', 'Apio', 'Mostaza',
  'Sésamo', 'Sulfitos', 'Altramuces', 'Moluscos',
];

const ASSEMBLY_CATEGORIES = [
  "Entrante",
  "Primer plato",
  "Segundo plato",
  "Postre",
  "Bebida",
  "Aperitivo",
  "Tapa",
  "Bocadillo",
  "Menu",
  "Otro",
];

const YIELD_UNITS = ["ud", "kg", "g", "l", "ml", "ración", "porción"];

interface Props {
  assembly?: AssemblyWithFinancials;
  suggestedAllergens?: string[];
}

export default function AssemblyForm({ assembly, suggestedAllergens }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [title, setTitle] = useState(assembly?.title ?? "");
  const [category, setCategory] = useState(assembly?.category ?? "");
  const [salePrice, setSalePrice] = useState(
    assembly?.sale_price != null ? String(assembly.sale_price) : ""
  );
  const [yieldQty, setYieldQty] = useState(
    assembly?.yield_qty != null ? String(assembly.yield_qty) : ""
  );
  const [yieldUnit, setYieldUnit] = useState(assembly?.yield_unit ?? "ud");
  const [marginTarget, setMarginTarget] = useState(
    assembly?.margin_target_pct ?? 65
  );
  const [bufferPct, setBufferPct] = useState(assembly?.buffer_pct ?? 5);
  const [notes, setNotes] = useState(assembly?.notes ?? "");
  const [isActive, setIsActive] = useState(assembly?.is_active ?? true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [allergens, setAllergens] = useState<string[]>((assembly as any)?.allergens ?? []);
  const [allergenOpen, setAllergenOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!suggestedAllergens || suggestedAllergens.length === 0) return;
    setAllergens((prev) => [...new Set([...prev, ...suggestedAllergens])]);
    setAllergenOpen(true);
  }, [suggestedAllergens]);

  const previewMargin = useMemo(() => {
    const pvp = parseFloat(salePrice);
    const cogs = assembly?.cogs ?? 0;
    if (!pvp || pvp <= 0 || !cogs) return null;
    return ((pvp - cogs) / pvp) * 100;
  }, [salePrice, assembly?.cogs]);

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    if (!title.trim()) newErrors.title = "El nombre es obligatorio";
    if (salePrice && isNaN(Number(salePrice)))
      newErrors.salePrice = "Introduce un número válido";
    if (yieldQty && isNaN(Number(yieldQty)))
      newErrors.yieldQty = "Introduce un número válido";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const formData = {
      title: title.trim(),
      category: category || null,
      sale_price: salePrice ? Number(salePrice) : null,
      yield_qty: yieldQty ? Number(yieldQty) : null,
      yield_unit: yieldUnit || null,
      margin_target_pct: marginTarget,
      buffer_pct: bufferPct,
      notes: notes || null,
      is_active: isActive,
      allergens,
    };

    startTransition(async () => {
      if (assembly?.id) {
        const result = await updateAssembly(assembly.id, formData);
        if (result.success) {
          toast.success("Escandallo actualizado correctamente");
          router.push("/escandallos");
        } else {
          toast.error(result.error);
        }
      } else {
        const result = await createAssembly(formData);
        if (result.success && result.data) {
          toast.success("Escandallo creado correctamente");
          router.push(`/escandallos/${result.data.id}`);
        } else if (!result.success) {
          toast.error(result.error);
        }
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={(e) => {
        if (
          e.key === "Enter" &&
          (e.target as HTMLElement).tagName !== "TEXTAREA"
        ) {
          e.preventDefault();
        }
      }}
      className="space-y-6"
    >
      {/* Title */}
      <div className="space-y-1.5">
        <Label htmlFor="title">
          Nombre del plato <span className="text-destructive">*</span>
        </Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ej. Tortilla española"
          disabled={isPending}
        />
        {errors.title && (
          <p className="text-xs text-destructive">{errors.title}</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Category */}
        <div className="space-y-1.5">
          <Label htmlFor="category">Categoría</Label>
          <Select
            value={category}
            onValueChange={setCategory}
            disabled={isPending}
          >
            <SelectTrigger id="category">
              <SelectValue placeholder="Selecciona categoría" />
            </SelectTrigger>
            <SelectContent>
              {ASSEMBLY_CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Sale price */}
        <div className="space-y-1.5">
          <Label htmlFor="salePrice">P.V.P. (€)</Label>
          <Input
            id="salePrice"
            type="number"
            step="0.01"
            min="0"
            value={salePrice}
            onChange={(e) => setSalePrice(e.target.value)}
            placeholder="0.00"
            disabled={isPending}
          />
          {errors.salePrice && (
            <p className="text-xs text-destructive">{errors.salePrice}</p>
          )}
          {previewMargin !== null && (
            <p
              className={`text-xs font-medium ${
                previewMargin >= marginTarget
                  ? "text-green-600 dark:text-green-400"
                  : previewMargin >= marginTarget * 0.8
                  ? "text-yellow-600 dark:text-yellow-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              Margen estimado: {previewMargin.toFixed(1)}%
            </p>
          )}
        </div>

        {/* Yield qty */}
        <div className="space-y-1.5">
          <Label htmlFor="yieldQty">Rendimiento</Label>
          <Input
            id="yieldQty"
            type="number"
            step="0.01"
            min="0"
            value={yieldQty}
            onChange={(e) => setYieldQty(e.target.value)}
            placeholder="1"
            disabled={isPending}
          />
          {errors.yieldQty && (
            <p className="text-xs text-destructive">{errors.yieldQty}</p>
          )}
        </div>

        {/* Yield unit */}
        <div className="space-y-1.5">
          <Label htmlFor="yieldUnit">Unidad rendimiento</Label>
          <Select
            value={yieldUnit}
            onValueChange={setYieldUnit}
            disabled={isPending}
          >
            <SelectTrigger id="yieldUnit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YIELD_UNITS.map((u) => (
                <SelectItem key={u} value={u}>
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Margin target */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Margen objetivo (%)</Label>
          <span className="text-sm font-medium tabular-nums">
            {marginTarget}%
          </span>
        </div>
        <Slider
          min={0}
          max={100}
          step={1}
          value={[marginTarget]}
          onValueChange={([v]) => setMarginTarget(v)}
          disabled={isPending}
        />
        <p className="text-xs text-muted-foreground">
          El sistema alertará cuando el margen real caiga por debajo de este
          umbral.
        </p>
      </div>

      {/* Buffer pct */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Label>Buffer de condimentos (%)</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  ?
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Porcentaje añadido al coste total para cubrir condimentos (sal,
                aceite, especias) y pequeñas mermas. Por defecto: 5%.
              </TooltipContent>
            </Tooltip>
          </div>
          <span className="text-sm font-medium tabular-nums">{bufferPct}%</span>
        </div>
        <Slider
          min={0}
          max={20}
          step={0.5}
          value={[bufferPct]}
          onValueChange={([v]) => setBufferPct(v)}
          disabled={isPending}
        />
      </div>

      {/* Allergens — Collapsible */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setAllergenOpen((o) => !o)}
          className="flex w-full items-center justify-between rounded-md py-1 text-sm font-medium text-foreground"
          disabled={isPending}
        >
          <span>
            Alérgenos{allergens.length > 0 ? ` (${allergens.length})` : ""}
          </span>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
              allergenOpen ? "rotate-180" : ""
            }`}
          />
        </button>
        {allergenOpen && (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <p className="text-xs text-muted-foreground">
                Marca los 14 alérgenos de declaración obligatoria (UE) presentes en el plato.
              </p>
              <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                <button
                  type="button"
                  className="hover:text-foreground underline-offset-2 hover:underline"
                  onClick={() => setAllergens([...ALERGENOS_EU])}
                  disabled={isPending}
                >
                  Seleccionar todos
                </button>
                <span>|</span>
                <button
                  type="button"
                  className="hover:text-foreground underline-offset-2 hover:underline"
                  onClick={() => setAllergens([])}
                  disabled={isPending}
                >
                  Limpiar
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ALERGENOS_EU.map((alergeno) => {
                const checked = allergens.includes(alergeno);
                return (
                  <label
                    key={alergeno}
                    className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                      checked
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    } ${isPending ? "pointer-events-none opacity-50" : ""}`}
                  >
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-primary"
                      checked={checked}
                      disabled={isPending}
                      onChange={() =>
                        setAllergens((prev) =>
                          checked ? prev.filter((a) => a !== alergeno) : [...prev, alergeno]
                        )
                      }
                    />
                    {alergeno}
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label htmlFor="notes">Notas</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Observaciones, instrucciones especiales de preparación..."
          rows={3}
          disabled={isPending}
        />
      </div>

      {/* Is active */}
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div>
          <p className="font-medium">Escandallo activo</p>
          <p className="text-sm text-muted-foreground">
            Los escandallos inactivos se muestran archivados en el listado.
          </p>
        </div>
        <Switch
          checked={isActive}
          onCheckedChange={setIsActive}
          disabled={isPending}
        />
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isPending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isPending ? "Guardando…" : assembly ? "Guardar cambios" : "Crear escandallo"}
        </Button>
      </div>
    </form>
  );
}
