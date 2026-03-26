export const UNIT_CONVERSIONS: Record<string, { base: string; factor: number }> = {
  // Masa → base: 'g'
  g:    { base: "g",  factor: 1 },
  kg:   { base: "g",  factor: 1000 },
  mg:   { base: "g",  factor: 0.001 },
  oz:   { base: "g",  factor: 28.3495 },
  lb:   { base: "g",  factor: 453.592 },
  // Volumen → base: 'ml'
  ml:   { base: "ml", factor: 1 },
  l:    { base: "ml", factor: 1000 },
  cl:   { base: "ml", factor: 10 },
  dl:   { base: "ml", factor: 100 },
  // Unidades → base: 'ud'
  ud:     { base: "ud", factor: 1 },
  pz:     { base: "ud", factor: 1 },
  racion: { base: "ud", factor: 1 },
};

export function normalizeQuantity(
  quantity: number,
  displayUnit: string,
  ingredientBaseUnit: string
): { normalizedQty: number; normalizedUnit: string } {
  const fromConversion = UNIT_CONVERSIONS[displayUnit];
  const toConversion   = UNIT_CONVERSIONS[ingredientBaseUnit];

  if (!fromConversion || !toConversion) {
    return { normalizedQty: quantity, normalizedUnit: displayUnit };
  }

  if (fromConversion.base !== toConversion.base) {
    throw new Error(
      `Unidad incompatible: "${displayUnit}" no puede convertirse a "${ingredientBaseUnit}".`
    );
  }

  // Convert display unit → base unit of the ingredient family
  const normalizedQty = quantity * fromConversion.factor;
  return { normalizedQty, normalizedUnit: ingredientBaseUnit };
}

export function getCompatibleUnits(baseUnit: string): string[] {
  const entry = UNIT_CONVERSIONS[baseUnit];
  if (!entry) return [baseUnit];
  return Object.entries(UNIT_CONVERSIONS)
    .filter(([, v]) => v.base === entry.base)
    .map(([k]) => k);
}
