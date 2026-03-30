'use client'

import { useState, useTransition, useRef } from 'react'
import {
    Clock,
    CheckCircle2,
    AlertTriangle,
    CircleDot,
    Search,
    Link2,
    Link2Off,
    Loader2,
    ChevronsUpDown,
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command'
import { linkDeliveryNote, unlinkDeliveryNote, searchOrphanAlbaranes, confirmManualReconciliation } from '@/app/(dashboard)/documentos/[id]/_actions'
import type { LinkedAlbaran } from '@/app/(dashboard)/documentos/[id]/page'

// ── Types ─────────────────────────────────────────────────────────────────────

type OrphanResult = {
    id: string
    document_number: string | null
    document_date: string | null
    total_amount: number | null
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ReconciliationPanelProps {
    invoiceId: string
    providerId: string | null
    reconciliationStatus: string | null
    reconciliationDelta: number | null
    referencedNotes: string[] | null
    linkedAlbaranes: LinkedAlbaran[]
    invoiceTotal: number | null
    purchaseLinesTotal?: number
}

// ── Alert banner ──────────────────────────────────────────────────────────────

function AlertBanner({
    status,
    delta,
    referencedNotes,
}: {
    status: string | null
    delta: number | null
    referencedNotes: string[] | null
}) {
    if (!status) {
        return (
            <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
                <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="text-sm">
                    <p className="font-medium">Factura resumen</p>
                    {referencedNotes && referencedNotes.length > 0 && (
                        <p className="mt-0.5 text-blue-700 dark:text-blue-300">
                            Albaranes referenciados: {referencedNotes.join(', ')}
                        </p>
                    )}
                </div>
            </div>
        )
    }

    const configs: Record<string, { icon: React.ElementType; cls: string; title: string; body: string | null }> = {
        pending: {
            icon: Clock,
            cls: 'border-gray-200 bg-gray-50 text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200',
            title: 'Conciliación pendiente',
            body: referencedNotes?.length ? `Albaranes referenciados: ${referencedNotes.join(', ')}` : null,
        },
        matched: {
            icon: CheckCircle2,
            cls: 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200',
            title: 'Factura conciliada automáticamente',
            body: null,
        },
        mismatch: {
            icon: AlertTriangle,
            cls: 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200',
            title: `Descuadre de ${delta != null ? Math.abs(delta).toFixed(2) + ' €' : '—'} entre factura y albaranes vinculados`,
            body: null,
        },
        manual: {
            icon: CircleDot,
            cls: 'border-purple-200 bg-purple-50 text-purple-800 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-200',
            title: 'Conciliación aprobada manualmente',
            body: null,
        },
    }

    const cfg = configs[status] ?? configs.pending
    const Icon = cfg.icon

    return (
        <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${cfg.cls}`}>
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="text-sm">
                <p className="font-medium">{cfg.title}</p>
                {cfg.body && <p className="mt-0.5 opacity-80">{cfg.body}</p>}
            </div>
        </div>
    )
}

// ── Albaran Combobox ──────────────────────────────────────────────────────────

function AlbaranCombobox({
    providerId,
    linked,
    onLink,
    disabled,
}: {
    providerId: string
    linked: LinkedAlbaran[]
    onLink: (albaran: OrphanResult) => void
    disabled?: boolean
}) {
    const [open, setOpen] = useState(false)
    const [options, setOptions] = useState<OrphanResult[]>([])
    const [loading, setLoading] = useState(false)
    const loadedRef = useRef(false)

    async function loadOptions() {
        if (loadedRef.current) return
        loadedRef.current = true
        setLoading(true)
        try {
            const results = await searchOrphanAlbaranes('', providerId)
            setOptions(results)
        } finally {
            setLoading(false)
        }
    }

    const linkedIds = new Set(linked.map((a) => a.id))
    const available = options.filter((o) => !linkedIds.has(o.id))

    return (
        <Popover
            open={open}
            onOpenChange={(o) => {
                setOpen(o)
                if (o) loadOptions()
            }}
        >
            <PopoverTrigger asChild>
                <button
                    disabled={disabled}
                    className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                    role="combobox"
                    aria-expanded={open}
                    aria-label="Seleccionar albarán huérfano para vincular"
                >
                    <span className="flex items-center gap-2 text-muted-foreground">
                        <Search className="h-4 w-4 shrink-0" />
                        Seleccionar albarán huérfano para vincular...
                    </span>
                    <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-[480px] p-0" align="start">
                <Command>
                    <CommandInput placeholder="Buscar por número de albarán..." />
                    {loading && (
                        <div className="flex items-center justify-center py-6">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                    )}
                    {!loading && (
                        <>
                            <CommandEmpty>No hay albaranes huérfanos disponibles.</CommandEmpty>
                            <CommandGroup>
                                {available.map((r) => (
                                    <CommandItem
                                        key={r.id}
                                        value={`${r.document_number ?? ''} ${r.document_date ?? ''}`}
                                        onSelect={() => {
                                            onLink(r)
                                            setOpen(false)
                                            // Reset so next open reloads a fresh list
                                            loadedRef.current = false
                                        }}
                                    >
                                        <div className="flex flex-1 items-center justify-between gap-4">
                                            <span className="font-mono text-sm">
                                                {r.document_number ?? '(sin número)'}
                                            </span>
                                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                                {r.document_date && (
                                                    <span>
                                                        {new Date(r.document_date).toLocaleDateString('es-ES', {
                                                            day: '2-digit',
                                                            month: 'short',
                                                            year: 'numeric',
                                                        })}
                                                    </span>
                                                )}
                                                {r.total_amount != null && (
                                                    <span className="tabular-nums font-medium text-foreground">
                                                        {r.total_amount.toLocaleString('es-ES', {
                                                            minimumFractionDigits: 2,
                                                        })}{' '}
                                                        €
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <Link2 className="ml-3 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </>
                    )}
                </Command>
            </PopoverContent>
        </Popover>
    )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ReconciliationPanel({
    invoiceId,
    providerId,
    reconciliationStatus,
    reconciliationDelta,
    referencedNotes,
    linkedAlbaranes: initialLinked,
    invoiceTotal,
    purchaseLinesTotal = 0,
}: ReconciliationPanelProps) {
    const [linked, setLinked] = useState<LinkedAlbaran[]>(initialLinked)
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()
    const [isConfirmPending, startConfirmTransition] = useTransition()
    const [confirmError, setConfirmError] = useState<string | null>(null)

    // Live delta: always computed from current invoiceTotal, linked albaranes, and purchase lines
    const albaraneTotal = linked.reduce((sum, a) => sum + (a.total_amount ?? 0), 0)
    const displayDelta = (invoiceTotal ?? 0) - albaraneTotal - purchaseLinesTotal
    const withinTolerance = Math.abs(displayDelta) <= 0.01

    function handleLink(albaran: OrphanResult) {
        setError(null)
        startTransition(async () => {
            const result = await linkDeliveryNote(albaran.id, invoiceId)
            if (result.success) {
                setLinked((prev) => [
                    ...prev,
                    {
                        id: albaran.id,
                        document_number: albaran.document_number,
                        document_date: albaran.document_date,
                        total_amount: albaran.total_amount,
                    },
                ])
            } else {
                setError(result.error)
            }
        })
    }

    function handleUnlink(albaranId: string) {
        setError(null)
        startTransition(async () => {
            const result = await unlinkDeliveryNote(albaranId, invoiceId)
            if (result.success) {
                setLinked((prev) => prev.filter((a) => a.id !== albaranId))
            } else {
                setError(result.error)
            }
        })
    }

    function handleConfirm() {
        setConfirmError(null)
        startConfirmTransition(async () => {
            const result = await confirmManualReconciliation(invoiceId)
            if (!result.success) {
                setConfirmError(result.error)
            }
        })
    }

    // Keep reconciliationDelta in scope to suppress the unused-var warning
    void reconciliationDelta

    return (
        <section className="rounded-lg border border-border bg-card p-5 space-y-5">
            <h2 className="text-base font-semibold">Conciliación de albaranes</h2>

            {/* Status alert */}
            <AlertBanner
                status={reconciliationStatus}
                delta={displayDelta}
                referencedNotes={referencedNotes}
            />

            {/* Linked albaranes */}
            <div>
                <h3 className="mb-3 text-sm font-medium">Albaranes vinculados</h3>
                {linked.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin albaranes vinculados.</p>
                ) : (
                    <div className="rounded-md border border-border overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border bg-muted/30">
                                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Nº Albarán</th>
                                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Fecha</th>
                                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Total</th>
                                    <th className="px-3 py-2 w-10" />
                                </tr>
                            </thead>
                            <tbody>
                                {linked.map((a) => (
                                    <tr key={a.id} className="border-b border-border last:border-0">
                                        <td className="px-3 py-2 font-mono text-xs">{a.document_number ?? '—'}</td>
                                        <td className="px-3 py-2 text-muted-foreground">
                                            {a.document_date
                                                ? new Date(a.document_date).toLocaleDateString('es-ES', {
                                                      day: '2-digit',
                                                      month: 'short',
                                                      year: 'numeric',
                                                  })
                                                : '—'}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                            {a.total_amount != null
                                                ? a.total_amount.toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €'
                                                : '—'}
                                        </td>
                                        <td className="px-3 py-2">
                                            <button
                                                onClick={() => handleUnlink(a.id)}
                                                disabled={isPending}
                                                aria-label="Desvincular albarán"
                                                className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                                            >
                                                <Link2Off className="h-4 w-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {/* Summary row */}
                                <tr className="border-t border-border bg-muted/20">
                                    <td colSpan={2} className="px-3 py-2 text-sm font-medium">
                                        Total albaranes
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                                        {albaraneTotal.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                                    </td>
                                    <td />
                                </tr>
                                {/* Delta row */}
                                <tr className={`border-t border-border ${!withinTolerance ? 'bg-red-50 dark:bg-red-950/30' : 'bg-green-50 dark:bg-green-950/20'}`}>
                                    <td colSpan={2} className="px-3 py-2 text-sm font-medium">
                                        Diferencia vs Factura
                                    </td>
                                    <td className={`px-3 py-2 text-right tabular-nums font-bold ${!withinTolerance ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>
                                        {displayDelta > 0 ? '+' : ''}
                                        {displayDelta.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                                    </td>
                                    <td />
                                </tr>
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Orphan albaran combobox */}
            {providerId && (
                <div>
                    <h3 className="mb-3 text-sm font-medium">Buscar albaranes huérfanos</h3>
                    <AlbaranCombobox
                        providerId={providerId}
                        linked={linked}
                        onLink={handleLink}
                        disabled={isPending}
                    />
                </div>
            )}

            {/* Error display */}
            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}

            {/* Confirm manual reconciliation */}
            {reconciliationStatus !== 'matched' && reconciliationStatus !== 'manual' && (
                <div className="flex flex-col gap-2 pt-2 border-t border-border">
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-sm text-muted-foreground">
                            {withinTolerance
                                ? 'El descuadre está dentro de la tolerancia permitida.'
                                : `Descuadre de ${Math.abs(displayDelta).toFixed(2)} € — resuelve el descuadre antes de confirmar.`}
                        </p>
                        <button
                            onClick={handleConfirm}
                            disabled={!withinTolerance || isConfirmPending}
                            aria-describedby={confirmError ? 'reconc-error' : undefined}
                            className="flex items-center gap-1.5 rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-40 transition-colors"
                        >
                            {isConfirmPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CircleDot className="h-4 w-4" />}
                            Confirmar conciliación manual
                        </button>
                    </div>
                    {confirmError && (
                        <p id="reconc-error" role="alert" className="text-sm text-destructive">
                            {confirmError}
                        </p>
                    )}
                </div>
            )}
        </section>
    )
}
