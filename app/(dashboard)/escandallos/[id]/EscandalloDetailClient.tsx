"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import AssemblyForm from "@/components/escandallos/AssemblyForm";
import BomLineEditor from "@/components/escandallos/BomLineEditor";
import type {
  AssemblyWithFinancials,
  BomLineExpanded,
  IngredientOption,
} from "@/lib/types/escandallo.types";

const ALERGENOS_POR_INGREDIENTE: Record<string, string[]> = {
  harina: ["Gluten"],
  trigo: ["Gluten"],
  pan: ["Gluten"],
  leche: ["Lácteos"],
  queso: ["Lácteos"],
  nata: ["Lácteos"],
  mantequilla: ["Lácteos"],
  huevo: ["Huevos"],
  huevos: ["Huevos"],
  gambas: ["Crustáceos"],
  langostinos: ["Crustáceos"],
  cangrejo: ["Crustáceos"],
  salmon: ["Pescado"],
  salmón: ["Pescado"],
  atun: ["Pescado"],
  atún: ["Pescado"],
  bacalao: ["Pescado"],
  anchoa: ["Pescado"],
  soja: ["Soja"],
  tofu: ["Soja"],
  almendra: ["Frutos secos"],
  nuez: ["Frutos secos"],
  cacahuete: ["Cacahuetes"],
  mostaza: ["Mostaza"],
  sésamo: ["Sésamo"],
  sesamo: ["Sésamo"],
  sulfito: ["Sulfitos"],
  vino: ["Sulfitos"],
  jamón: [],
};

function getAlergenos(ingredientName: string): string[] {
  const normalized = ingredientName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const found = new Set<string>();
  for (const [key, alergenos] of Object.entries(ALERGENOS_POR_INGREDIENTE)) {
    if (normalized.includes(key)) alergenos.forEach((a) => found.add(a));
  }
  return Array.from(found);
}

interface Props {
  assemblyId: string;
  assembly: AssemblyWithFinancials;
  initialLines: BomLineExpanded[];
  ingredientOptions: IngredientOption[];
}

export default function EscandalloDetailClient({
  assemblyId,
  assembly,
  initialLines,
  ingredientOptions,
}: Props) {
  const [allergenSuggestion, setAllergenSuggestion] = useState<string[]>([]);

  function handleIngredientAdded(name: string) {
    const detected = getAlergenos(name);
    if (detected.length > 0) {
      setAllergenSuggestion([...detected]);
    }
  }

  return (
    <>
      {/* SECCIÓN 1: Composición del plato */}
      <Card>
        <CardHeader>
          <CardTitle>Composición del Plato</CardTitle>
          <CardDescription>
            Ingredientes y sub-recetas que forman este escandallo. El coste
            total se recalcula automáticamente al guardar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BomLineEditor
            assemblyId={assemblyId}
            initialLines={initialLines}
            ingredientOptions={ingredientOptions}
            onIngredientAdded={handleIngredientAdded}
          />
        </CardContent>
      </Card>

      <Separator />

      {/* SECCIÓN 2: Datos financieros */}
      <Card>
        <CardHeader>
          <CardTitle>Datos del Escandallo</CardTitle>
          <CardDescription>
            Precio de venta, margen objetivo y configuración de costes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AssemblyForm assembly={assembly} suggestedAllergens={allergenSuggestion} />
        </CardContent>
      </Card>
    </>
  );
}
