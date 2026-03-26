'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import {
    ChevronUp,
    ChevronDown,
    Clock,
    CheckCircle2,
    AlertTriangle,
    CircleDot,
    Filter,
    FileText,
    ChevronLeft,
    ChevronRight,
    Download,
    Loader2,
    ChevronsUpDown,
    Check,
    X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command'
import type { DocumentRow } from './page'
import type { Provider } from './_actions'

// ── Badge helpers ─────────────────────────────────────────────────────────────

function docTypeBadgeClass(docType: string | null): string {
    if (!docType) return 'border-border bg-muted text-muted-foreground'
    const t = docType.toLowerCase()
    if (t.includes('factura')) return 'border-blue-200 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800'
    if (t.includes('lbar')) return 'border-green-200 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300 dark:border-green-800'
    if (t.includes('presupuesto')) return 'border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800'
    return 'border-border bg-muted text-muted-foreground'
}

function ReconciliationBadge({ status, delta }: { status: string | null; delta: number | null }) {
    if (!status) return null
    const configs: Record<string, { label: string; cls: string; Icon: React.ElementType }> = {
        pending: { label: 'Pendiente', cls: 'border-gray-200 bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-300', Icon: Clock },
        matched: { label: 'Conciliado', cls: 'border-green-200 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300', Icon: CheckCircle2 },
        mismatch: { label: delta != null ? `Descuadre ${delta > 0 ? '+' : ''}${delta.toFixed(2)}€` : 'Descuadre', cls: 'border-red-200 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300', Icon: AlertTriangle },
        manual: { label: 'Manual', cls: 'border-purple-200 bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300', Icon: CircleDot },
    }
    const cfg = configs[status]
    if (!cfg) return null
    return (
        <Badge variant="outline" className={`gap-1 text-xs ${cfg.cls}`}>
            <cfg.Icon className="h-3 w-3" />
            {cfg.label}
        </Badge>
    )
}

// ── Filter helpers ────────────────────────────────────────────────────────────

const DOC_TYPES: { label: string; value: string }[] = [
    { label: 'Factura', value: 'factura' },
    { label: 'Factura Resumen', value: 'factura resumen' },
    { label: 'Albarán', value: 'albarán' },
    { label: 'Presupuesto', value: 'presupuesto' },
]

function buildUrl(pathname: string, current: URLSearchParams, updates: Record<string, string | null>): string {
    const params = new URLSearchParams(current)
    for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') {
            params.delete(key)
        } else {
            params.set(key, value)
        }
    }
    params.delete('page') // Reset page on filter change
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
}

// ── Sort indicator ────────────────────────────────────────────────────────────

function SortButton({
    label,
    currentSort,
    descKey,
    ascKey,
    onSort,
}: {
    label: string
    currentSort: string
    descKey: string
    ascKey: string
    onSort: (sort: string) => void
}) {
    const isDesc = currentSort === descKey
    const isAsc = currentSort === ascKey
    const isActive = isDesc || isAsc

    return (
        <button
            onClick={() => onSort(isDesc ? ascKey : descKey)}
            className={`flex items-center gap-1 font-medium transition-colors hover:text-foreground ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}
        >
            {label}
            <span className="flex flex-col">
                <ChevronUp className={`h-2.5 w-2.5 ${isAsc ? 'text-primary' : 'text-muted-foreground/40'}`} />
                <ChevronDown className={`h-2.5 w-2.5 ${isDesc ? 'text-primary' : 'text-muted-foreground/40'}`} />
            </span>
        </button>
    )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DocumentosClient({
    documents,
    total,
    page,
    pageSize,
    providers,
}: {
    documents: DocumentRow[]
    total: number
    page: number
    pageSize: number
    providers: Provider[]
}) {
    const router = useRouter()
    const pathname = usePathname()
    const [filtersOpen, setFiltersOpen] = useState(false)
    const [isExporting, setIsExporting] = useState(false)
    const [providerOpen, setProviderOpen] = useState(false)

    // isPending from useTransition shows a loading overlay on the
    // table while the server re-fetches, without blocking user interaction.
    const [isPending, startTransition] = useTransition()

    // filterKey increments when "Limpiar filtros" is clicked,
    // forcing uncontrolled inputs to remount with empty defaultValues.
    const [filterKey, setFilterKey] = useState(0)

    // Read current search params as a snapshot for rendering defaultValues.
    // navigate() always re-reads window.location.search at call time to avoid
    // stale-closure issues (see comment on navigate below).
    const getParams = () => {
        if (typeof window === 'undefined') return new URLSearchParams()
        return new URLSearchParams(window.location.search)
    }

    // LOCAL STATE for doc type toggles — this is the fix for the visual
    // inconsistency bug. Previously currentDocTypes was read from the URL at
    // render time, which is stale during a useTransition navigation (the URL
    // hasn't updated yet). By keeping a local copy we get instant visual
    // feedback on click, independent of when Next.js actually commits the
    // navigation and re-renders the server component.
    const getInitialDocTypes = () => {
        if (typeof window === 'undefined') return []
        return (new URLSearchParams(window.location.search).get('doc_type') ?? '').split(',').filter(Boolean)
    }
    const [selectedDocTypes, setSelectedDocTypes] = useState<string[]>(getInitialDocTypes)

    const currentParams = getParams()
    const currentSort = currentParams.get('sort') ?? 'date_desc'
    const currentStatus = currentParams.get('status') ?? ''
    const currentReconcStatus = currentParams.get('reconciliation_status') ?? ''
    const currentProviderId = currentParams.get('provider_id') ?? ''
    const currentDateFrom = currentParams.get('date_from') ?? ''
    const currentDateTo = currentParams.get('date_to') ?? ''
    const currentAmountMin = currentParams.get('amount_min') ?? ''
    const currentAmountMax = currentParams.get('amount_max') ?? ''
    const currentDocNumber = currentParams.get('document_number') ?? ''
    const currentDocTypes = (currentParams.get('doc_type') ?? '').split(',').filter(Boolean)

    const docNumberDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const amountMinDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const amountMaxDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // BUG FIX (filters): Read window.location.search at call time (not from closure)
    // to prevent stale URL state when multiple filters change within the debounce window.
    // If navigate captured currentParams from the closure at render time, a second filter
    // change before the first router.push completes would build the URL from stale state
    // and silently drop the first filter.
    function navigate(updates: Record<string, string | null>) {
        const current = new URLSearchParams(window.location.search)
        startTransition(() => {
            router.push(buildUrl(pathname, current, updates))
        })
    }

    function handleSort(sort: string) {
        navigate({ sort, page: null })
    }

    function handleDocTypeToggle(value: string) {
        // Update local state immediately for instant visual feedback (no waiting
        // for the Next.js navigation to complete and re-render the server component).
        const next = new Set(selectedDocTypes)
        if (next.has(value)) next.delete(value)
        else next.add(value)
        const nextArr = [...next]
        setSelectedDocTypes(nextArr)
        // Also navigate so the server re-fetches with the updated filter.
        const current = new URLSearchParams(window.location.search)
        startTransition(() => {
            router.push(buildUrl(pathname, current, { doc_type: nextArr.length > 0 ? nextArr.join(',') : null }))
        })
    }

    function handleClearFilters() {
        // Remount inputs so uncontrolled DOM values visually clear
        setFilterKey((k) => k + 1)
        setSelectedDocTypes([])
        startTransition(() => {
            router.push(pathname)
        })
    }

    // ── Export ──────────────────────────────────────────────────────────────────
    async function handleExport() {
        setIsExporting(true)
        try {
            const params = new URLSearchParams(window.location.search)
            const res = await fetch(`/documentos/export?${params.toString()}`)
            if (!res.ok) throw new Error(`Export failed: ${res.statusText}`)
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `documentos_export_${new Date().toISOString().slice(0, 10)}.xlsx`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
        } catch (err) {
            console.error('Export error:', err)
        } finally {
            setIsExporting(false)
        }
    }

    const totalPages = Math.ceil(total / pageSize)
    const hasActiveFilters = currentDocTypes.length > 0 || currentStatus || currentReconcStatus ||
        currentProviderId || currentDateFrom || currentDateTo || currentAmountMin || currentAmountMax || currentDocNumber

    return (
        <div className="space-y-4">
            {/* Filter toggle + count + export */}
            <div className="flex items-center gap-3">
                <button
                    onClick={() => setFiltersOpen((v) => !v)}
                    className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors ${filtersOpen ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
                >
                    <Filter className="h-3.5 w-3.5" />
                    Filtros
                    {hasActiveFilters && (
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    )}
                </button>
                <span className="text-sm text-muted-foreground">
                    {total} documento{total !== 1 ? 's' : ''}
                </span>
                <div className="ml-auto">
                    <button
                        onClick={handleExport}
                        disabled={isExporting}
                        className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isExporting
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Download className="h-3.5 w-3.5" />
                        }
                        Exportar
                    </button>
                </div>
            </div>

            {/* Filter panel */}
            {filtersOpen && (
                <div className="rounded-lg border border-border bg-card p-4 space-y-4">
                    {/* Doc type toggles */}
                    <div>
                        <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Tipo</p>
                        <div className="flex flex-wrap gap-2">
                            {DOC_TYPES.map((t) => (
                                <button
                                    key={t.value}
                                    onClick={() => handleDocTypeToggle(t.value)}
                                    className={`rounded-md border px-3 py-1 text-sm transition-colors ${selectedDocTypes.includes(t.value) ? docTypeBadgeClass(t.value) + ' border-current' : 'border-border text-muted-foreground hover:text-foreground'}`}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Inputs — key forces remount on clear so defaultValues reset */}
                    <div key={filterKey} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {/* Status */}
                        <div>
                            <label htmlFor="filter-status" className="mb-1 block text-xs font-medium text-muted-foreground">
                                Estado
                            </label>
                            <select
                                id="filter-status"
                                defaultValue={currentStatus}
                                onChange={(e) => navigate({ status: e.target.value || null })}
                                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            >
                                <option value="">Todos</option>
                                <option value="pending">Pendiente</option>
                                <option value="approved">Aprobado</option>
                            </select>
                        </div>

                        {/* Reconciliation status */}
                        <div>
                            <label htmlFor="filter-reconc" className="mb-1 block text-xs font-medium text-muted-foreground">
                                Conciliación
                            </label>
                            <select
                                id="filter-reconc"
                                defaultValue={currentReconcStatus}
                                onChange={(e) => navigate({ reconciliation_status: e.target.value || null })}
                                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            >
                                <option value="">Todos</option>
                                <option value="pending">Pendiente</option>
                                <option value="matched">Conciliado</option>
                                <option value="mismatch">Descuadre</option>
                                <option value="manual">Manual</option>
                                <option value="__null__">Sin conciliación</option>
                            </select>
                        </div>

                        {/* Provider Combobox */}
                        <div>
                            <label className="mb-1 block text-xs font-medium text-muted-foreground">
                                Proveedor
                            </label>
                            <Popover open={providerOpen} onOpenChange={setProviderOpen}>
                                <PopoverTrigger asChild>
                                    <button
                                        type="button"
                                        role="combobox"
                                        aria-expanded={providerOpen}
                                        className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                    >
                                        <span className={currentProviderId ? 'text-foreground' : 'text-muted-foreground'}>
                                            {currentProviderId
                                                ? (providers.find(p => p.id === currentProviderId)?.name ?? 'Proveedor desconocido')
                                                : 'Buscar proveedor...'}
                                        </span>
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[280px] p-0" align="start">
                                    <Command>
                                        <CommandInput placeholder="Escribir nombre..." />
                                        <CommandList>
                                            <CommandEmpty>Sin resultados</CommandEmpty>
                                            <CommandGroup>
                                                {currentProviderId && (
                                                    <CommandItem
                                                        value="__todos__"
                                                        onSelect={() => {
                                                            navigate({ provider_id: null })
                                                            setProviderOpen(false)
                                                        }}
                                                    >
                                                        <X className="mr-2 h-4 w-4 opacity-70" />
                                                        Todos los proveedores
                                                    </CommandItem>
                                                )}
                                                {providers.map(p => (
                                                    <CommandItem
                                                        key={p.id}
                                                        value={p.name}
                                                        onSelect={() => {
                                                            navigate({ provider_id: p.id === currentProviderId ? null : p.id })
                                                            setProviderOpen(false)
                                                        }}
                                                    >
                                                        <Check className={`mr-2 h-4 w-4 ${p.id === currentProviderId ? 'opacity-100' : 'opacity-0'}`} />
                                                        {p.name}
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                        </div>

                        {/* Document number — own debounce ref */}
                        <div>
                            <label htmlFor="filter-docnum" className="mb-1 block text-xs font-medium text-muted-foreground">
                                Nº Documento
                            </label>
                            <input
                                id="filter-docnum"
                                type="text"
                                defaultValue={currentDocNumber}
                                placeholder="Buscar número..."
                                onChange={(e) => {
                                    const val = e.target.value
                                    if (docNumberDebounceRef.current) clearTimeout(docNumberDebounceRef.current)
                                    docNumberDebounceRef.current = setTimeout(() => navigate({ document_number: val || null }), 350)
                                }}
                                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                        </div>

                        {/* Date from — no debounce needed for date inputs */}
                        <div>
                            <label htmlFor="filter-date-from" className="mb-1 block text-xs font-medium text-muted-foreground">
                                Fecha desde
                            </label>
                            <input
                                id="filter-date-from"
                                type="date"
                                defaultValue={currentDateFrom}
                                onChange={(e) => navigate({ date_from: e.target.value || null })}
                                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                        </div>

                        {/* Date to — e.target.value is always YYYY-MM-DD (no timezone conversion) */}
                        <div>
                            <label htmlFor="filter-date-to" className="mb-1 block text-xs font-medium text-muted-foreground">
                                Fecha hasta
                            </label>
                            <input
                                id="filter-date-to"
                                type="date"
                                defaultValue={currentDateTo}
                                onChange={(e) => navigate({ date_to: e.target.value || null })}
                                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                        </div>

                        {/* Amount min — own debounce ref */}
                        <div>
                            <label htmlFor="filter-amount-min" className="mb-1 block text-xs font-medium text-muted-foreground">
                                Importe mínimo
                            </label>
                            <input
                                id="filter-amount-min"
                                type="number"
                                min="0"
                                step="0.01"
                                defaultValue={currentAmountMin}
                                placeholder="0.00"
                                onChange={(e) => {
                                    const val = e.target.value
                                    if (amountMinDebounceRef.current) clearTimeout(amountMinDebounceRef.current)
                                    amountMinDebounceRef.current = setTimeout(() => navigate({ amount_min: val || null }), 350)
                                }}
                                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                        </div>

                        {/* Amount max — own debounce ref */}
                        <div>
                            <label htmlFor="filter-amount-max" className="mb-1 block text-xs font-medium text-muted-foreground">
                                Importe máximo
                            </label>
                            <input
                                id="filter-amount-max"
                                type="number"
                                min="0"
                                step="0.01"
                                defaultValue={currentAmountMax}
                                placeholder="Sin límite"
                                onChange={(e) => {
                                    const val = e.target.value
                                    if (amountMaxDebounceRef.current) clearTimeout(amountMaxDebounceRef.current)
                                    amountMaxDebounceRef.current = setTimeout(() => navigate({ amount_max: val || null }), 350)
                                }}
                                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                        </div>
                    </div>

                    {/* Clear filters */}
                    <button
                        onClick={handleClearFilters}
                        className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                    >
                        Limpiar filtros
                    </button>
                </div>
            )}

            {/* Table — relative wrapper for pending overlay */}
            <div className="relative">
                {/* BUG FIX (loading): isPending overlay shows during server re-fetch after
                    filter/sort changes, without blocking interaction or hiding stale data. */}
                {isPending && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/60 backdrop-blur-[1px]">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                )}

                {documents.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-20 text-center">
                        <FileText className="h-12 w-12 text-muted-foreground/40" />
                        <p className="text-sm text-muted-foreground">No se encontraron documentos.</p>
                    </div>
                ) : (
                    <div className="rounded-lg border border-border bg-card overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border text-left">
                                    <th className="px-4 py-3 font-medium text-muted-foreground">Tipo</th>
                                    <th className="px-4 py-3 font-medium text-muted-foreground">
                                        <SortButton
                                            label="Nº Documento"
                                            currentSort={currentSort}
                                            descKey="number_desc"
                                            ascKey="number_asc"
                                            onSort={handleSort}
                                        />
                                    </th>
                                    <th className="px-4 py-3 font-medium text-muted-foreground">Proveedor</th>
                                    <th className="px-4 py-3 font-medium text-muted-foreground">
                                        <SortButton
                                            label="Fecha"
                                            currentSort={currentSort}
                                            descKey="date_desc"
                                            ascKey="date_asc"
                                            onSort={handleSort}
                                        />
                                    </th>
                                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                                        <SortButton
                                            label="Total"
                                            currentSort={currentSort}
                                            descKey="total_desc"
                                            ascKey="total_asc"
                                            onSort={handleSort}
                                        />
                                    </th>
                                    <th className="px-4 py-3 font-medium text-muted-foreground">Estado</th>
                                    <th className="px-4 py-3 font-medium text-muted-foreground">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {documents.map((doc) => (
                                    <tr
                                        key={doc.id}
                                        className="border-b border-border last:border-0 hover:bg-accent/30 transition-colors"
                                    >
                                        <td className="px-4 py-3">
                                            <Badge variant="outline" className={`text-xs ${docTypeBadgeClass(doc.doc_type)}`}>
                                                {doc.doc_type ?? '—'}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs tabular-nums">
                                            {doc.document_number ?? <span className="text-muted-foreground">—</span>}
                                        </td>
                                        <td className="px-4 py-3">
                                            {doc.provider_name ?? <span className="text-muted-foreground/60">Sin proveedor</span>}
                                        </td>
                                        <td className="px-4 py-3 tabular-nums">
                                            {doc.document_date
                                                ? new Date(doc.document_date + 'T12:00:00').toLocaleDateString('es-ES', {
                                                      day: '2-digit',
                                                      month: 'short',
                                                      year: 'numeric',
                                                  })
                                                : <span className="text-muted-foreground">—</span>}
                                        </td>
                                        <td className="px-4 py-3 text-right tabular-nums font-medium">
                                            {doc.total_amount != null
                                                ? doc.total_amount.toLocaleString('es-ES', {
                                                      minimumFractionDigits: 2,
                                                      maximumFractionDigits: 2,
                                                  }) + ' €'
                                                : <span className="text-muted-foreground">—</span>}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-col gap-1">
                                                <Badge
                                                    variant="outline"
                                                    className={`w-fit text-xs ${doc.status === 'approved' ? 'border-green-200 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300' : 'border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'}`}
                                                >
                                                    {doc.status === 'approved' ? 'Aprobado' : 'Pendiente'}
                                                </Badge>
                                                <ReconciliationBadge
                                                    status={doc.reconciliation_status}
                                                    delta={doc.reconciliation_delta}
                                                />
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <Link
                                                href={`/documentos/${doc.id}`}
                                                className="text-xs font-medium text-primary hover:underline underline-offset-2"
                                            >
                                                Ver detalle
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                        Mostrando {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total}
                    </p>
                    <div className="flex items-center gap-2">
                        <Link
                            href={buildUrl(pathname, currentParams, { page: String(page - 1) })}
                            aria-disabled={page <= 1}
                            className={`flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm transition-colors ${page <= 1 ? 'pointer-events-none border-border text-muted-foreground/40' : 'border-border hover:bg-accent'}`}
                        >
                            <ChevronLeft className="h-3.5 w-3.5" />
                            Anterior
                        </Link>
                        <span className="text-sm text-muted-foreground">
                            {page} / {totalPages}
                        </span>
                        <Link
                            href={buildUrl(pathname, currentParams, { page: String(page + 1) })}
                            aria-disabled={page >= totalPages}
                            className={`flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm transition-colors ${page >= totalPages ? 'pointer-events-none border-border text-muted-foreground/40' : 'border-border hover:bg-accent'}`}
                        >
                            Siguiente
                            <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                    </div>
                </div>
            )}
        </div>
    )
}
