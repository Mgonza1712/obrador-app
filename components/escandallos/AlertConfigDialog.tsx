"use client";

import { useState, useTransition } from "react";
import { Settings } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { upsertTenantConfig } from "@/lib/actions/escandallo.actions";

interface Props {
  initialSpikePct: number;
  initialCogsPct: number;
}

export default function AlertConfigDialog({ initialSpikePct, initialCogsPct }: Props) {
  const [open, setOpen] = useState(false);
  const [spikePct, setSpikePct] = useState(String(initialSpikePct));
  const [cogsPct, setCogsPct] = useState(String(initialCogsPct));
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (next) {
      // Reset to server values each time the dialog opens
      setSpikePct(String(initialSpikePct));
      setCogsPct(String(initialCogsPct));
    }
    setOpen(next);
  }

  function handleSave() {
    const spike = parseFloat(spikePct);
    const cogs = parseFloat(cogsPct);

    if (isNaN(spike) || spike < 0 || spike > 100) {
      toast.error("El umbral de subida de precio debe estar entre 0 y 100.");
      return;
    }
    if (isNaN(cogs) || cogs < 0 || cogs > 100) {
      toast.error("El umbral de aumento de coste debe estar entre 0 y 100.");
      return;
    }

    startTransition(async () => {
      const result = await upsertTenantConfig({
        threshold_price_spike_pct: spike,
        threshold_cogs_increase_pct: cogs,
      });
      if (result.success) {
        toast.success("Configuración guardada correctamente.");
        setOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="mr-2 h-4 w-4" />
          Configuración
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Umbrales de Alerta</DialogTitle>
          <DialogDescription>
            Define cuándo se generan alertas de rentabilidad para este local.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="spikePct">
              Umbral subida de precio de ingrediente (%)
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="spikePct"
                type="number"
                min="0"
                max="100"
                step="1"
                value={spikePct}
                onChange={(e) => setSpikePct(e.target.value)}
                disabled={isPending}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Alerta cuando un ingrediente sube más de este porcentaje.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cogsPct">
              Umbral aumento de coste del plato (%)
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="cogsPct"
                type="number"
                min="0"
                max="100"
                step="1"
                value={cogsPct}
                onChange={(e) => setCogsPct(e.target.value)}
                disabled={isPending}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Alerta cuando el COGS de un plato sube más de este porcentaje.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
