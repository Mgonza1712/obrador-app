'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
    CheckCircle2, AlertTriangle, PackageX, PackagePlus, ExternalLink,
    Loader2, Link2, Link2Off, FileText,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    generateDiscrepancyReport, linkDocumentToOrder, unlinkDocumentFromOrder,
} from '@/app/actions/pedidos'
import type { LinkedDocument, DiscrepancyReport, DiscrepancyLine } from '@/app/actions/pedidos'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatEur(val: number | null) {
    if (val == null) return '—'
    return val.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function formatQty(val: number | null, unit: string | null) {
    if (val == null) return '—'
    const n = val % 1 === 0 ? val.toString() : val.toFixed(3).replace(/\.?0+$/, '')
    return unit ? `${n} ${unit}` : n
}

// ── Row type badge ─────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: DiscrepancyLine['type'] }) {
    if (type === 'ok') return (
        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 text-xs">
            <CheckCircle2 className="mr-1 h-3 w-3" />OK
        </Badge>
    )
    if (type === 'qty_diff') return (
        <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700 text-xs">
            <AlertTriangle className="mr-1 h-3 w-3" />Diferencia
        </Badge>
    )
    if (type === 'extra') return (
        <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 text-xs">
            <PackagePlus className="mr-1 h-3 w-3" />No pedido
        </Badge>
    )
    return (
        <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700 text-xs">
            <PackageX className="mr-1 h-3 w-3" />No entregado
        </Badge>
    )
}

// ── Discrepancy table ─────────────────────────────────────────────────────────

function DiscrepancyTable({ report }: { report: DiscrepancyReport }) {
    const { lines, summary } = report

    return (
        <div className="space-y-3">
            {/* Summary chips */}
            <div className="flex flex-wrap gap-2 text-sm">
                {summary.ok > 0 && (
                    <span className="flex items-center gap-1 text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />{summary.ok} OK
                    </span>
                )}
                {summary.qty_diff > 0 && (
                    <span className="flex items-center gap-1 text-orange-600">
                        <AlertTriangle className="h-3.5 w-3.5" />{summary.qty_diff} diferencia
                    </span>
                )}
                {summary.extra > 0 && (
                    <span className="flex items-center gap-1 text-blue-600">
                        <PackagePlus className="h-3.5 w-3.5" />{summary.extra} no pedido
                    </span>
                )}
                {summary.missing > 0 && (
                    <span className="flex items-center gap-1 text-red-600">
                        <PackageX className="h-3.5 w-3.5" />{summary.missing} no entregado
                    </span>
                )}
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                            <th className="px-3 py-2 text-left font-medium">Producto</th>
                            <th className="px-3 py-2 text-right font-medium">Qty pedida</th>
                            <th className="px-3 py-2 text-right font-medium">Qty albaran</th>
                            <th className="px-3 py-2 text-right font-medium">Diferencia</th>
                            <th className="px-3 py-2 text-left font-medium">Estado</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {lines.map((line, i) => (
                            <tr key={i} className={line.type === 'ok' ? 'bg-transparent' : line.type === 'missing' ? 'bg-red-50/40 dark:bg-red-950/10' : line.type === 'extra' ? 'bg-blue-50/40 dark:bg-blue-950/10' : 'bg-orange-50/40 dark:bg-orange-950/10'}>
                                <td className="px-3 py-2 font-medium">{line.name}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                                    {formatQty(line.qty_ordered, line.unit)}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                                    {formatQty(line.qty_document, line.unit)}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums font-medium">
                                    {line.difference == null ? '—' : (
                                        <span className={line.difference > 0 ? 'text-blue-600' : line.difference < 0 ? 'text-red-600' : 'text-muted-foreground'}>
                                            {line.difference > 0 ? '+' : ''}{formatQty(line.difference, line.unit)}
                                        </span>
                                    )}
                                </td>
                                <td className="px-3 py-2">
                                    <TypeBadge type={line.type} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

// ── Linked document card ──────────────────────────────────────────────────────

function LinkedDocumentCard({
    linked,
    orderId,
    onUnlinked,
}: {
    linked: LinkedDocument
    orderId: string
    onUnlinked: (documentId: string) => void
}) {
    const [report, setReport] = useState<DiscrepancyReport | null>(null)
    const [loadingReport, setLoadingReport] = useState(false)
    const [showReport, setShowReport] = useState(false)
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)

    async function handleLoadReport() {
        if (report) { setShowReport((v) => !v); return }
        setLoadingReport(true)
        const r = await generateDiscrepancyReport(orderId, linked.document_id)
        setReport(r)
        setShowReport(true)
        setLoadingReport(false)
    }

    function handleUnlink() {
        startTransition(async () => {
            const res = await unlinkDocumentFromOrder(orderId, linked.document_id)
            if (res.success) onUnlinked(linked.document_id)
            else setError(res.error ?? 'Error al desvincular')
        })
    }

    const doc = linked.document
    const hasIssues = report && (report.summary.qty_diff > 0 || report.summary.missing > 0 || report.summary.extra > 0)

    return (
        <div className="rounded-lg border border-border bg-card">
            <div className="flex items-start justify-between gap-3 p-4">
                <div className="flex items-start gap-3">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">
                                {doc.doc_type}{doc.document_number ? ` · ${doc.document_number}` : ''}
                            </span>
                            <Badge variant="outline" className="text-xs">
                                {doc.status === 'approved' ? 'Aprobado' : 'Pendiente'}
                            </Badge>
                            {linked.match_score != null && (
                                <span className="text-xs text-muted-foreground">
                                    {linked.linked_by === 'auto' ? 'Auto' : 'Manual'} · {Math.round(linked.match_score * 100)}%
                                </span>
                            )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                            <span>{formatDate(doc.document_date)}</span>
                            {doc.total_amount != null && <span>{formatEur(doc.total_amount)}</span>}
                            {doc.venue_name && <span>{doc.venue_name}</span>}
                        </div>
                        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
                    </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" asChild>
                        <Link href={`/documentos/${linked.document_id}`} target="_blank">
                            <ExternalLink className="h-3 w-3" />
                            Ver
                        </Link>
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={handleLoadReport}
                        disabled={loadingReport}
                    >
                        {loadingReport ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                        {showReport ? 'Ocultar' : 'Ver discrepancias'}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={handleUnlink}
                        disabled={isPending}
                        title="Desvincular documento"
                    >
                        <Link2Off className="h-3 w-3" />
                    </Button>
                </div>
            </div>

            {showReport && report && (
                <div className="border-t border-border px-4 pb-4 pt-3">
                    {report.lines.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Sin líneas para comparar (faltan master_item_id en alguno de los lados).</p>
                    ) : hasIssues ? (
                        <DiscrepancyTable report={report} />
                    ) : (
                        <div className="flex items-center gap-2 text-sm text-emerald-700">
                            <CheckCircle2 className="h-4 w-4" />
                            Sin discrepancias — pedido y albaran coinciden.
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

// ── Link document form ────────────────────────────────────────────────────────

function LinkDocumentForm({
    orderId,
    onLinked,
}: {
    orderId: string
    onLinked: (documentId: string) => void
}) {
    const [input, setInput] = useState('')
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)

    function handleLink() {
        const trimmed = input.trim()
        if (!trimmed) return
        setError(null)
        startTransition(async () => {
            const res = await linkDocumentToOrder(orderId, trimmed)
            if (res.success) { setInput(''); onLinked(trimmed) }
            else setError(res.error ?? 'Error al vincular')
        })
    }

    return (
        <div className="flex items-start gap-2">
            <input
                type="text"
                placeholder="ID del documento a vincular"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button size="sm" onClick={handleLink} disabled={isPending || !input.trim()}>
                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                Vincular
            </Button>
            {error && <p className="text-xs text-red-600 self-center">{error}</p>}
        </div>
    )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DiscrepanciasTab({
    orderId,
    initialLinkedDocuments,
}: {
    orderId: string
    initialLinkedDocuments: LinkedDocument[]
}) {
    const [linkedDocuments, setLinkedDocuments] = useState(initialLinkedDocuments)
    const [showLinkForm, setShowLinkForm] = useState(false)

    function handleUnlinked(documentId: string) {
        setLinkedDocuments((prev) => prev.filter((d) => d.document_id !== documentId))
    }

    function handleLinked(documentId: string) {
        // Refresh will happen via revalidatePath; for now just close the form
        setShowLinkForm(false)
        // Optimistically add a placeholder — the page will revalidate
        window.location.reload()
    }

    return (
        <div className="space-y-4">
            {linkedDocuments.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border py-10 text-center">
                    <FileText className="mx-auto h-8 w-8 text-muted-foreground/40" />
                    <p className="mt-2 text-sm font-medium text-muted-foreground">Sin documentos vinculados</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        El matching automático se ejecuta cuando el extractor procesa un albarán.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {linkedDocuments.map((linked) => (
                        <LinkedDocumentCard
                            key={linked.document_id}
                            linked={linked}
                            orderId={orderId}
                            onUnlinked={handleUnlinked}
                        />
                    ))}
                </div>
            )}

            {/* Manual link */}
            <div>
                {!showLinkForm ? (
                    <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => setShowLinkForm(true)}
                    >
                        <Link2 className="h-3.5 w-3.5" />
                        Vincular documento manualmente
                    </Button>
                ) : (
                    <div className="space-y-2">
                        <LinkDocumentForm orderId={orderId} onLinked={handleLinked} />
                        <Button variant="ghost" size="sm" className="text-xs" onClick={() => setShowLinkForm(false)}>
                            Cancelar
                        </Button>
                    </div>
                )}
            </div>
        </div>
    )
}
