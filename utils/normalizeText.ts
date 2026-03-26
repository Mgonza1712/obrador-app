/**
 * normalizeText.ts
 *
 * Strips all diacritical marks (tildes, accents, etc.) from a string and
 * converts it to Title Case.
 *
 * Examples:
 *   'Jamón Ibérico'  → 'Jamon Iberico'
 *   'CHORIZO de PAMPLONA' → 'Chorizo De Pamplona'
 *   'aceite de oliva virgen' → 'Aceite De Oliva Virgen'
 */
export function normalizeText(input: string): string {
    // 1. Decompose unicode codepoints and strip combining diacritical marks (category Mn)
    const withoutDiacritics = input
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')

    // 2. Convert to Title Case (each word's first letter uppercased, rest lowercased)
    const titleCased = withoutDiacritics
        .toLowerCase()
        .replace(/(?:^|\s)\S/g, (char) => char.toUpperCase())

    return titleCased.trim()
}
