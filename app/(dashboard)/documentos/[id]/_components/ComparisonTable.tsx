'use client'

import { useState, useTransition } from 'react'
import { CheckCircle, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import ComparisonRow from './ComparisonRow'
import { saveQuoteComparison } from '@/app/actions/presupuestos'
import type { ComparisonRowData } from './ComparisonRow'
import type { QuoteLineDecision } from '@/app/actions/presupuestos'

interface MasterItemOption {
    id: string
    official_name: string
    base_unit: string
    category: string | null
}

interface Props {
    documentId: string
    rows: ComparisonRowData[]
    masterItems: MasterItemOption[]
    isDraft: boolean
    providerId: string | null
}

type TipoPresupuesto = 'comparar' | 'negociado'

// Determines if a row should be pre-checked based on tipo and delta
function shouldPreCheck(row: ComparisonRowData, tipo: TipoPresupuesto): boolean {
    if (row.masterItemId == null) return false
    if (tipo === 'negociado') return true
    // tipo === 'comparar': pre-check only rows cheaper than current
    if (row.quoteCostPerBase == null || row.currentCostPerBase == null) return false
    const delta = ((row.quoteCostPerBase - row.currentCostPerBase) / row.currentCostPerBase) * 100
    return delta < -2
}

export default function ComparisonTable({ documentId, rows: initialRows, masterItems, isDraft, providerId }: Props) {
    const [rows, setRows] = useState<ComparisonRowData[]>(initialRows)
    const [tipo, setTipo] = useState<TipoPresupuesto>('comparar')
    const [activar, setActivar] = useState<Record<string, boolean>>(() => {
        const init: Record<string, boolean> = {}
        for (const row of initialRows) {
            init[row.purchaseLineId] = shouldPreCheck(row, 'comparar')
        }
        return init
    })
    const [setPreferred, setSetPreferred] = useState<Record<string, boolean>>(() => {
        const init: Record<string, boolean> = {}
        for (const row of initialRows) {
            init[row.purchaseLineId] = false
        }
        return init
    })
    const [isPending, startTransition] = useTransition()
    const [saved, setSaved] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Update tipo: recalculate pre-check state
    function handleTipoChange(newTipo: TipoPresupuesto) {
        setTipo(newTipo)
        const newActivar: Record<string, boolean> = {}
        for (const row of rows) {
            newActivar[row.purchaseLineId] = shouldPreCheck(row, newTipo)
        }
        setActivar(newActivar)
        // Clear preferred for rows that get unchecked
        setSetPreferred((prev) => {
            const next = { ...prev }
            for (const id of Object.keys(next)) {
                if (!newActivar[id]) next[id] = false
            }
            return next
        })
    }

    function handleDataUpdate(purchaseLineId: string, patch: Partial<ComparisonRowData>) {
        setRows((prev) => prev.map((r) =>
            r.purchaseLineId === purchaseLineId ? { ...r, ...patch } : r
        ))
    }

    function handleSendToRevision(purchaseLineId: string) {
        // Mark row as requiring revision (Caso D without master_item)
        // The server already has review_status='pending_review', just exclude from decisions
        setActivar((prev) => ({ ...prev, [purchaseLineId]: false }))
    }

    function handleSave() {
        setError(null)
        const decisions: QuoteLineDecision[] = rows.map((row) => ({
            purchaseLineId: row.purchaseLineId,
            priceHistoryId: row.priceHistoryId,
            activar: activar[row.purchaseLineId] ?? false,
            setPreferred: setPreferred[row.purchaseLineId] ?? false,
            // For new provider-product combos (Casos B/C with a provider):
            newAlias: (activar[row.purchaseLineId] && row.masterItemId && providerId && row.quoteCase !== 'A')
                ? {
                    rawName: row.rawName,
                    providerId: providerId,
                    masterItemId: row.masterItemId,
                    formatoCompra: row.quoteEnvases != null ? 'Caja' : null,
                    envasesPorFormato: row.quoteEnvases,
                    contenidoPorEnvase: row.quoteContenido,
                }
                : null,
        }))

        startTransition(async () => {
            const res = await saveQuoteComparison(documentId, decisions)
            if (res.success) {
                setSaved(true)
            } else {
                setError(res.error ?? 'Error al guardar la comparación')
            }
        })
    }

    const activarCount = Object.values(activar).filter(Boolean).length

    if (saved) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-green-200 bg-green-50 py-10 text-center dark:bg-green-950/20">
                <CheckCircle className="h-8 w-8 text-green-600" />
                <div>
                    <p className="font-medium text-green-800 dark:text-green-200">Comparación guardada</p>
                    <p className="mt-0.5 text-sm text-green-700 dark:text-green-300">
                        {activarCount} precio{activarCount !== 1 ? 's' : ''} activado{activarCount !== 1 ? 's' : ''}. Documento aprobado.
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* Tipo de presupuesto toggle */}
            {isDraft && (
                <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4">
                    <div className="flex-1">
                        <p className="text-sm font-medium mb-2">¿Para qué es este presupuesto?</p>
                        <div className="flex flex-col gap-2">
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                                <input
                                    type="radio"
                                    name="tipo"
                                    value="comparar"
                                    checked={tipo === 'comparar'}
                                    onChange={() => handleTipoChange('comparar')}
                                    className="accent-primary"
                                />
                                <span>
                                    <strong>Comparar opciones</strong>
                                    <span className="ml-1 text-muted-foreground text-xs">— solo activa los precios más baratos (Δ &gt; −2%)</span>
                                </span>
                            </label>
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                                <input
                                    type="radio"
                                    name="tipo"
                                    value="negociado"
                                    checked={tipo === 'negociado'}
                                    onChange={() => handleTipoChange('negociado')}
                                    className="accent-primary"
                                />
                                <span>
                                    <strong>Precios ya negociados</strong>
                                    <span className="ml-1 text-muted-foreground text-xs">— activa todos los precios del presupuesto</span>
                                </span>
                            </label>
                        </div>
                    </div>
                </div>
            )}

            {/* Table */}
            <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm min-w-[900px]">
                    <thead>
                        <tr className="border-b border-border bg-muted/30">
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs w-28">En presupuesto</th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs">Producto maestro</th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs w-36">Formato cotizado</th>
                            <th className="px-4 py-2.5 text-right font-medium text-muted-foreground text-xs w-32">€/ud base (cot.)</th>
                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs w-36">Proveedor actual</th>
                            <th className="px-4 py-2.5 text-right font-medium text-muted-foreground text-xs w-32">€/ud base (act.)</th>
                            <th className="px-4 py-2.5 text-center font-medium text-muted-foreground text-xs w-16">Δ%</th>
                            <th className="px-4 py-2.5 text-center font-medium text-muted-foreground text-xs w-16">
                                ✓ Activar
                            </th>
                            <th className="px-4 py-2.5 text-center font-medium text-muted-foreground text-xs w-16">
                                ★ Pref.
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <ComparisonRow
                                key={row.purchaseLineId}
                                data={row}
                                masterItems={masterItems}
                                activar={activar[row.purchaseLineId] ?? false}
                                setPreferred={setPreferred[row.purchaseLineId] ?? false}
                                onActivarChange={(v) => setActivar((prev) => ({ ...prev, [row.purchaseLineId]: v }))}
                                onSetPreferredChange={(v) => setSetPreferred((prev) => ({ ...prev, [row.purchaseLineId]: v }))}
                                onDataUpdate={(patch) => handleDataUpdate(row.purchaseLineId, patch)}
                                onSendToRevision={handleSendToRevision}
                                isDraft={isDraft}
                            />
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Save bar */}
            {isDraft && (
                <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
                    <p className="text-sm text-muted-foreground">
                        {activarCount > 0
                            ? `${activarCount} precio${activarCount !== 1 ? 's' : ''} seleccionado${activarCount !== 1 ? 's' : ''} para activar`
                            : 'Sin precios seleccionados'}
                    </p>
                    <div className="flex items-center gap-3">
                        {error && (
                            <span className="flex items-center gap-1.5 text-sm text-red-600">
                                <AlertCircle className="h-4 w-4" />
                                {error}
                            </span>
                        )}
                        <Button onClick={handleSave} disabled={isPending || activarCount === 0}>
                            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                            Confirmar y aprobar
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
