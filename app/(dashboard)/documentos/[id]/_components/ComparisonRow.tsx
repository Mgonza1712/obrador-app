'use client'

import { useState } from 'react'
import { AlertTriangle, TrendingDown, TrendingUp, Minus, SendToBack } from 'lucide-react'
import FormatoEditor from './FormatoEditor'
import MasterItemCombobox from './MasterItemCombobox'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ComparisonRowData {
    // IDs
    purchaseLineId: string
    priceHistoryId: string  // status='quote'

    // Line info
    rawName: string
    quoteCase: 'A' | 'B' | 'C' | 'D'

    // Quote (this presupuesto)
    masterItemId: string | null
    masterItemName: string | null
    masterItemBaseUnit: string

    quoteUnitPrice: number
    quoteEnvases: number | null
    quoteContenido: number | null
    quoteCostPerBase: number | null

    // Current active (for comparison)
    currentProviderName: string | null
    currentCostPerBase: number | null
    currentEnvases: number | null
    currentContenido: number | null

    // Provider info
    providerId: string | null
    providerName: string | null
}

interface MasterItemOption {
    id: string
    official_name: string
    base_unit: string
    category: string | null
}

interface Props {
    data: ComparisonRowData
    masterItems: MasterItemOption[]
    activar: boolean
    setPreferred: boolean
    onActivarChange: (v: boolean) => void
    onSetPreferredChange: (v: boolean) => void
    onDataUpdate: (updated: Partial<ComparisonRowData>) => void
    onSendToRevision?: (purchaseLineId: string) => void
    isDraft: boolean // false if doc already approved
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatEurBase(value: number | null, unit: string) {
    if (value == null) return <span className="text-amber-600 italic text-xs">—</span>
    return (
        <span className="tabular-nums">
            {value.toLocaleString('es-ES', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} €/{unit}
        </span>
    )
}

function DeltaBadge({ quote, current }: { quote: number | null; current: number | null }) {
    if (quote == null || current == null || current === 0) {
        return <span className="text-xs text-muted-foreground">—</span>
    }
    const delta = ((quote - current) / current) * 100
    const abs = Math.abs(delta)

    if (abs <= 2) {
        return (
            <span className="flex items-center gap-0.5 text-xs text-yellow-600">
                <Minus className="h-3 w-3" />
                {delta.toFixed(1)}%
            </span>
        )
    }
    if (delta < -2) {
        return (
            <span className="flex items-center gap-0.5 text-xs font-medium text-green-600">
                <TrendingDown className="h-3 w-3" />
                {delta.toFixed(1)}%
            </span>
        )
    }
    return (
        <span className="flex items-center gap-0.5 text-xs font-medium text-red-600">
            <TrendingUp className="h-3 w-3" />
            +{delta.toFixed(1)}%
        </span>
    )
}

function rowBgClass(data: ComparisonRowData) {
    if (data.masterItemId == null || data.quoteCostPerBase == null) return 'bg-amber-50/40 dark:bg-amber-950/10'
    if (data.currentCostPerBase == null) return ''
    const delta = ((data.quoteCostPerBase - data.currentCostPerBase) / data.currentCostPerBase) * 100
    if (delta < -2) return 'bg-green-50/40 dark:bg-green-950/10'
    if (delta > 2) return 'bg-red-50/20 dark:bg-red-950/10'
    return ''
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ComparisonRow({
    data,
    masterItems,
    activar,
    setPreferred,
    onActivarChange,
    onSetPreferredChange,
    onDataUpdate,
    onSendToRevision,
    isDraft,
}: Props) {
    const [localData, setLocalData] = useState(data)

    function update(patch: Partial<ComparisonRowData>) {
        const updated = { ...localData, ...patch }
        setLocalData(updated)
        onDataUpdate(patch)
    }

    const isNoProduct = localData.masterItemId == null
    const isNoFormat = localData.quoteCostPerBase == null && !isNoProduct
    const canEdit = isDraft

    return (
        <tr className={`border-b border-border last:border-0 ${rowBgClass(localData)}`}>
            {/* Nombre en presupuesto */}
            <td className="px-4 py-3 text-xs text-muted-foreground max-w-[120px]">
                <span className="line-clamp-2" title={localData.rawName}>{localData.rawName}</span>
            </td>

            {/* Producto maestro */}
            <td className="px-4 py-3">
                {isNoProduct && (
                    <div className="flex items-center gap-1 mb-1">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                        <span className="text-xs text-amber-700">Caso D</span>
                    </div>
                )}
                <MasterItemCombobox
                    purchaseLineId={localData.purchaseLineId}
                    priceHistoryId={localData.priceHistoryId}
                    currentMasterItemId={localData.masterItemId}
                    currentMasterItemName={localData.masterItemName}
                    masterItems={masterItems}
                    quoteCase={localData.quoteCase}
                    onUpdated={(id, name, baseUnit) => update({
                        masterItemId: id,
                        masterItemName: name,
                        masterItemBaseUnit: baseUnit,
                    })}
                />
                {isNoProduct && canEdit && onSendToRevision && (
                    <button
                        onClick={() => onSendToRevision(localData.purchaseLineId)}
                        className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        title="Enviar a revisión para dar de alta el producto"
                    >
                        <SendToBack className="h-3 w-3" />
                        Enviar a revisión
                    </button>
                )}
            </td>

            {/* Formato cotizado */}
            <td className="px-4 py-3">
                <FormatoEditor
                    priceHistoryId={localData.priceHistoryId}
                    purchaseLineId={localData.purchaseLineId}
                    envases={localData.quoteEnvases}
                    contenido={localData.quoteContenido}
                    unitBase={localData.masterItemBaseUnit}
                    readonly={!canEdit || localData.quoteCase === 'A'}
                    onUpdated={(env, cont, costPerBase) => update({
                        quoteEnvases: env,
                        quoteContenido: cont,
                        quoteCostPerBase: costPerBase,
                    })}
                />
            </td>

            {/* €/unidad base (cotizado) */}
            <td className="px-4 py-3 text-right">
                {isNoFormat ? (
                    <span className="text-xs text-amber-600 italic">Faltan datos</span>
                ) : (
                    formatEurBase(localData.quoteCostPerBase, localData.masterItemBaseUnit)
                )}
            </td>

            {/* Proveedor actual + formato */}
            <td className="px-4 py-3 text-xs text-muted-foreground">
                {localData.currentProviderName ? (
                    <div>
                        <div className="font-medium text-foreground text-xs">{localData.currentProviderName}</div>
                        {localData.currentEnvases != null && localData.currentContenido != null && (
                            <div className="mt-0.5 tabular-nums">
                                {localData.currentEnvases} × {localData.currentContenido} {localData.masterItemBaseUnit}
                            </div>
                        )}
                    </div>
                ) : (
                    <span className="text-muted-foreground italic">Sin precio activo</span>
                )}
            </td>

            {/* €/unidad base (actual) */}
            <td className="px-4 py-3 text-right">
                {formatEurBase(localData.currentCostPerBase, localData.masterItemBaseUnit)}
            </td>

            {/* Δ% */}
            <td className="px-4 py-3 text-center">
                <DeltaBadge quote={localData.quoteCostPerBase} current={localData.currentCostPerBase} />
            </td>

            {/* ✓ Activar */}
            <td className="px-4 py-3 text-center">
                {isNoProduct ? (
                    <span className="text-xs text-muted-foreground">—</span>
                ) : (
                    <input
                        type="checkbox"
                        checked={activar}
                        onChange={(e) => {
                            onActivarChange(e.target.checked)
                            if (!e.target.checked) onSetPreferredChange(false)
                        }}
                        disabled={!canEdit}
                        className="h-4 w-4 rounded border-input accent-primary"
                    />
                )}
            </td>

            {/* ★ Preferido */}
            <td className="px-4 py-3 text-center">
                {isNoProduct ? (
                    <span className="text-xs text-muted-foreground">—</span>
                ) : (
                    <input
                        type="checkbox"
                        checked={setPreferred}
                        onChange={(e) => onSetPreferredChange(e.target.checked)}
                        disabled={!canEdit || !activar}
                        className="h-4 w-4 rounded border-input accent-primary"
                    />
                )}
            </td>
        </tr>
    )
}
