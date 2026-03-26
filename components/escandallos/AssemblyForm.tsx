"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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
}

export default function AssemblyForm({ assembly }: Props) {
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
  const [errors, setErrors] = useState<Record<string, string>>({});

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
    };

    startTransition(async () => {
      if (assembly?.id) {
        const result = await updateAssembly(assembly.id, formData);
        if (result.success) {
          toast.success("Escandallo actualizado correctamente");
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

      {/* Notes */}
      <div className="space-y-1.5">
        <Label htmlFor="notes">Notas</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Observaciones, alérgenos, instrucciones especiales..."
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
