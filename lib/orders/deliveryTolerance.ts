export const FRESH_TOLERANCE_CATEGORIES = new Set([
    'Frutas y Verduras',
    'Carnes',
    'Pescados y Mariscos',
])

const WEIGHT_OR_VOLUME_UNITS = new Set([
    'kg',
    'kgs',
    'kilogramo',
    'kilogramos',
    'kilo',
    'kilos',
    'g',
    'gr',
    'gramo',
    'gramos',
    'l',
    'lt',
    'lts',
    'litro',
    'litros',
    'ml',
    'mililitro',
    'mililitros',
])

const FRESH_SHORTAGE_TOLERANCE_RATIO = 0.20

export interface DeliveryLineLike {
    quantity: number
    qty_received?: number | null
    qty_cancelled?: number | null
    unit?: string | null
    category?: string | null
    is_cancelled?: boolean | null
}

export function isMeasuredFreshLine(line: Pick<DeliveryLineLike, 'unit' | 'category'>): boolean {
    if (!line.category || !FRESH_TOLERANCE_CATEGORIES.has(line.category)) return false
    const normalizedUnit = line.unit?.trim().toLowerCase()
    return !!normalizedUnit && WEIGHT_OR_VOLUME_UNITS.has(normalizedUnit)
}

export function getPendingQuantity(line: DeliveryLineLike): number {
    if (line.is_cancelled) return 0
    return Math.max(
        0,
        Number(line.quantity ?? 0) -
            Number(line.qty_received ?? 0) -
            Number(line.qty_cancelled ?? 0)
    )
}

export function isLineDelivered(line: DeliveryLineLike): boolean {
    const quantity = Number(line.quantity ?? 0)
    if (line.is_cancelled || quantity <= 0) return true

    const pending = getPendingQuantity(line)
    if (pending <= 0) return true

    if (!isMeasuredFreshLine(line)) return false

    return pending / quantity <= FRESH_SHORTAGE_TOLERANCE_RATIO
}

export function isLinePending(line: DeliveryLineLike): boolean {
    return !isLineDelivered(line)
}

export function getQuantityToCancel(line: DeliveryLineLike): number {
    return getPendingQuantity(line)
}
