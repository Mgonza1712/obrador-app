"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Package, ChefHat } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { IngredientOption } from "@/lib/types/escandallo.types";

interface Props {
  options: IngredientOption[];
  value: IngredientOption | null;
  onChange: (option: IngredientOption | null) => void;
  disabled?: boolean;
}

export default function IngredientCombobox({
  options,
  value,
  onChange,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);

  const componentOptions = options.filter((o) => o.type === "component");
  const subAssemblyOptions = options.filter((o) => o.type === "sub_assembly");

  const selectedLabel = value?.name ?? "Seleccionar ingrediente...";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
          type="button"
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-0" align="start">
        <Command
          filter={(value, search) => {
            const normalize = (str: string) =>
              str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
            return normalize(value).includes(normalize(search)) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Buscar ingrediente..." />
          <CommandList>
            <CommandEmpty>No se encontraron resultados.</CommandEmpty>

            {componentOptions.length > 0 && (
              <CommandGroup heading="Materias Primas">
                {componentOptions.map((opt) => (
                  <CommandItem
                    key={`component-${opt.id}`}
                    value={`${opt.officialName} ${opt.name} component`}
                    onSelect={() => {
                      onChange(value?.id === opt.id ? null : opt);
                      setOpen(false);
                    }}
                  >
                    <div className="flex w-full items-center gap-2">
                      <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <div className="flex flex-1 flex-col overflow-hidden">
                        <span className="truncate text-sm">{opt.name}</span>
                        {opt.officialName !== opt.name && (
                          <span className="truncate text-xs text-muted-foreground">
                            {opt.officialName}
                          </span>
                        )}
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {opt.unitCost > 0
                          ? `${opt.unitCost.toFixed(3)} €/${opt.baseUnit}`
                          : "—"}
                      </span>
                      <Check
                        className={cn(
                          "ml-1 h-4 w-4 shrink-0",
                          value?.id === opt.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {componentOptions.length > 0 && subAssemblyOptions.length > 0 && (
              <CommandSeparator />
            )}

            {subAssemblyOptions.length > 0 && (
              <CommandGroup heading="Sub-recetas">
                {subAssemblyOptions.map((opt) => (
                  <CommandItem
                    key={`sub-${opt.id}`}
                    value={`${opt.name} sub_assembly`}
                    onSelect={() => {
                      onChange(value?.id === opt.id ? null : opt);
                      setOpen(false);
                    }}
                  >
                    <div className="flex w-full items-center gap-2">
                      <ChefHat className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="flex-1 truncate text-sm text-primary">
                        {opt.name}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {opt.unitCost > 0
                          ? `${opt.unitCost.toFixed(3)} €/${opt.baseUnit}`
                          : "—"}
                      </span>
                      <Check
                        className={cn(
                          "ml-1 h-4 w-4 shrink-0",
                          value?.id === opt.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
