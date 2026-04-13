'use client'

import { useTransition, useState, useId, useEffect, useRef } from 'react'
import Link from 'next/link'
import {
    ArrowLeft, Plus, Trash2, Save, CheckCircle, Loader2, AlertCircle, ExternalLink,
    Building2, ChevronsUpDown, Check, Link2, Search, ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import ReconciliationPanel from '@/components/documents/ReconciliationPanel'
import {
    saveDocument, approveDocumentStatus,
    reassignDocumentVenue, getVenues, getProviders,
    getMasterItems, linkSkippedLine,
} from '../_actions'
import type { DocumentDetail, PurchaseLine } from './page'
import type { Venue, Provider, MasterItemOption } from '../_actions'
import { FORMATOS_COMPRA, BASE_UNITS, PRODUCT_CATEGORIES } from '@/lib/constants'

// ── Types ─────────────────────────────────────────────────────────────────────

type LocalLine = PurchaseLine & { _tempId?: string; _deleted?: boolean }

const DOC_TYPES = ['Factura', 'Factura Resumen', 'Albarán', 'Presupuesto']

// ── Helpers ───────────────────────────────────────────────────────────────────

function docTypeBadgeClass(docType: string | null): string {
    if (!docType) return ''
    const t = docType.toLowerCase()
    if (t.includes('factura')) return 'border-blue-200 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
    if (t.includes('lbar')) return 'border-green-200 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300'
    if (t.includes('presupuesto')) return 'border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
    return ''
}

// ── Provider Combobox ─────────────────────────────────────────────────────────

function ProviderCombobox({
    value,
    onChange,
    disabled,
}: {
    value: string | null
    onChange: (id: string | null, name: string | null) => void
    disabled?: boolean
}) {
    const [open, setOpen] = useState(false)
    const [providers, setProviders] = useState<Provider[]>([])
    const [loading, setLoading] = useState(false)
    const [search, setSearch] = useState('')
    const loadedRef = useRef(false)

    async function loadProviders() {
        if (loadedRef.current) return
        loadedRef.current = true
        setLoading(true)
        try {
            const data = await getProviders()
            setProviders(data)
        } finally {
            setLoading(false)
        }
    }

    const filtered = search
        ? providers.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
        : providers

    const selectedName = providers.find((p) => p.id === value)?.name ?? null

    return (
        <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) loadProviders() }}>
            <PopoverTrigger asChild>
                <button
                    disabled={disabled}
                    className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                    role="combobox"
                    aria-expanded={open}
                >
                    <span className={selectedName ? 'text-foreground' : 'text-muted-foreground'}>
                        {selectedName ?? 'Sin proveedor'}
                    </span>
                    <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="start">
                <Command>
                    <CommandInput
                        placeholder="Buscar proveedor..."
                        value={search}
                        onValueChange={setSearch}
                    />
                    {loading && (
                        <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                    )}
                    {!loading && (
                        <>
                            <CommandEmpty>Sin resultados.</CommandEmpty>
                            <CommandGroup>
                                <CommandItem
                                    value="__none__"
                                    onSelect={() => { onChange(null, null); setOpen(false); setSearch('') }}
                                >
                                    <span className="text-muted-foreground italic">Sin proveedor</span>
                                </CommandItem>
                                {filtered.map((p) => (
                                    <CommandItem
                                        key={p.id}
                                        value={p.id}
                                        onSelect={() => { onChange(p.id, p.name); setOpen(false); setSearch('') }}
                                    >
                                        <Check className={`mr-2 h-4 w-4 ${value === p.id ? 'opacity-100' : 'opacity-0'}`} />
                                        {p.name}
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

// ── Venue Combobox (inside dialog) ────────────────────────────────────────────

function VenueCombobox({
    value,
    onChange,
}: {
    value: string | null
    onChange: (id: string, name: string) => void
}) {
    const [open, setOpen] = useState(false)
    const [venues, setVenues] = useState<Venue[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')

    useEffect(() => {
        getVenues().then((data) => {
            setVenues(data)
            setLoading(false)
        })
    }, [])

    const filtered = search
        ? venues.filter((v) => v.name.toLowerCase().includes(search.toLowerCase()))
        : venues

    const selectedName = venues.find((v) => v.id === value)?.name

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    role="combobox"
                    aria-expanded={open}
                >
                    <span className={selectedName ? 'text-foreground' : 'text-muted-foreground'}>
                        {loading ? 'Cargando...' : (selectedName ?? 'Selecciona local...')}
                    </span>
                    <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0" align="start">
                <Command>
                    <CommandInput
                        placeholder="Buscar local..."
                        value={search}
                        onValueChange={setSearch}
                    />
                    <CommandEmpty>Sin resultados.</CommandEmpty>
                    <CommandGroup>
                        {filtered.map((v) => (
                            <CommandItem
                                key={v.id}
                                value={v.id}
                                onSelect={() => { onChange(v.id, v.name); setOpen(false); setSearch('') }}
                            >
                                <Check className={`mr-2 h-4 w-4 ${value === v.id ? 'opacity-100' : 'opacity-0'}`} />
                                {v.name}
                            </CommandItem>
                        ))}
                    </CommandGroup>
                </Command>
            </PopoverContent>
        </Popover>
    )
}

// ── SkippedLineEditor ─────────────────────────────────────────────────────────

function SkippedLineEditor({
    line,
    doc,
    onSaved,
}: {
    line: PurchaseLine
    doc: DocumentDetail
    onSaved: () => void
}) {
    const [isOpen, setIsOpen] = useState(false)
    const [isPending, startTransition] = useTransition()
    const [masterItems, setMasterItems] = useState<MasterItemOption[]>([])
    const [loadingItems, setLoadingItems] = useState(false)
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [newItemName, setNewItemName] = useState('')
    const [newItemCategory, setNewItemCategory] = useState('')
    const [newItemBaseUnit, setNewItemBaseUnit] = useState('ud')
    const [query, setQuery] = useState('')
    const [comboOpen, setComboOpen] = useState(false)
    const [formatoCompra, setFormatoCompra] = useState('Unidad')
    const [envasesPorFormato, setEnvasesPorFormato] = useState(1)
    const [contenidoPorEnvase, setContenidoPorEnvase] = useState(1)
    const [error, setError] = useState<string | null>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    // Load master items lazily when the editor opens
    useEffect(() => {
        if (!isOpen || masterItems.length > 0) return
        setLoadingItems(true)
        getMasterItems().then((items) => {
            setMasterItems(items)
            setLoadingItems(false)
        })
    }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

    // Close combobox on outside click
    useEffect(() => {
        function handle(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setComboOpen(false)
            }
        }
        document.addEventListener('mousedown', handle)
        return () => document.removeEventListener('mousedown', handle)
    }, [])

    const filtered = masterItems.filter((item) =>
        item.official_name.toLowerCase().includes(query.toLowerCase())
    )

    const displayValue =
        selectedId === '__new__'
            ? `➕ Crear: "${newItemName}"`
            : selectedId
                ? masterItems.find((i) => i.id === selectedId)?.official_name ?? ''
                : ''

    function handleSave() {
        if (!selectedId) {
            setError('Selecciona o crea un producto maestro.')
            return
        }
        setError(null)

        const resolution =
            selectedId === '__new__'
                ? { action: 'create_and_link' as const, officialName: newItemName, category: newItemCategory || null, baseUnit: newItemBaseUnit }
                : { action: 'link_existing' as const, masterItemId: selectedId }

        startTransition(async () => {
            const result = await linkSkippedLine({
                lineId: line.id,
                documentId: doc.id,
                providerId: doc.provider_id,
                venueId: doc.venue_id,
                documentDate: doc.document_date,
                docType: doc.doc_type,
                unitPrice: line.unit_price,
                resolution,
                alias: {
                    rawName: line.raw_name ?? '',
                    formatoCompra,
                    envasesPorFormato,
                    contenidoPorEnvase,
                },
            })
            if (result.success) {
                setIsOpen(false)
                onSaved()
            } else {
                setError(result.error)
            }
        })
    }

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800"
            >
                <Link2 className="h-3 w-3" />
                Vincular
            </button>
        )
    }

    return (
        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50/60 p-3 space-y-3 dark:bg-amber-950/20 dark:border-amber-900">
            {/* Master item combobox */}
            <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Producto maestro</label>
                {loadingItems ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Cargando...</div>
                ) : (
                    <div ref={containerRef} className="relative">
                        <button
                            type="button"
                            onClick={() => { setComboOpen((o) => !o); setTimeout(() => inputRef.current?.focus(), 50) }}
                            className={`flex w-full items-center justify-between rounded-md border px-3 py-1.5 text-sm transition-colors ${selectedId ? selectedId === '__new__' ? 'border-blue-400 bg-blue-50 text-blue-800' : 'border-green-400 bg-green-50 text-green-800' : 'border-input bg-background text-muted-foreground'}`}
                        >
                            <span className="truncate">{displayValue || 'Buscar o crear producto...'}</span>
                            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
                        </button>
                        {comboOpen && (
                            <div className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-lg">
                                <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                                    <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                    <input ref={inputRef} type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar..." className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
                                </div>
                                <ul className="max-h-48 overflow-y-auto py-1">
                                    {filtered.map((item) => (
                                        <li key={item.id}>
                                            <button type="button" onClick={() => { setSelectedId(item.id); setQuery(''); setComboOpen(false) }}
                                                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${selectedId === item.id ? 'bg-accent font-medium' : ''}`}>
                                                <span>{item.official_name}</span>
                                                <span className="text-xs text-muted-foreground">{item.base_unit}</span>
                                            </button>
                                        </li>
                                    ))}
                                    {query.trim() && (
                                        <li className="border-t border-border">
                                            <button type="button" onClick={() => { setSelectedId('__new__'); setNewItemName(query.trim()); setQuery(''); setComboOpen(false) }}
                                                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-blue-600 hover:bg-blue-50">
                                                <Plus className="h-4 w-4 shrink-0" />
                                                Crear: &quot;{query.trim()}&quot;
                                            </button>
                                        </li>
                                    )}
                                    {filtered.length === 0 && !query.trim() && (
                                        <li className="px-3 py-4 text-center text-sm text-muted-foreground">Escribe para buscar...</li>
                                    )}
                                </ul>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* New item fields */}
            {selectedId === '__new__' && (
                <div className="grid grid-cols-3 gap-2 rounded-md border border-blue-100 bg-blue-50/50 p-2">
                    <div className="col-span-3">
                        <label className="text-[10px] font-semibold uppercase text-blue-600/70">Nombre</label>
                        <input type="text" value={newItemName} onChange={(e) => setNewItemName(e.target.value)}
                            className="mt-0.5 block w-full rounded border border-blue-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    </div>
                    <div>
                        <label className="text-[10px] font-semibold uppercase text-blue-600/70">Categoría</label>
                        <select value={newItemCategory} onChange={(e) => setNewItemCategory(e.target.value)}
                            className="mt-0.5 block w-full rounded border border-blue-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400">
                            <option value="">— Seleccionar —</option>
                            {PRODUCT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] font-semibold uppercase text-blue-600/70">Unidad base</label>
                        <select value={newItemBaseUnit} onChange={(e) => setNewItemBaseUnit(e.target.value)}
                            className="mt-0.5 block w-full rounded border border-blue-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400">
                            {BASE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                    </div>
                </div>
            )}

            {/* Packaging fields */}
            <div className="grid grid-cols-3 gap-2">
                <div>
                    <label className="mb-0.5 block text-[10px] font-medium text-muted-foreground uppercase">Formato de compra</label>
                    <select value={formatoCompra} onChange={(e) => setFormatoCompra(e.target.value)}
                        className="w-full rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring">
                        {FORMATOS_COMPRA.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                </div>
                <div>
                    <label className="mb-0.5 block text-[10px] font-medium text-muted-foreground uppercase">Envases/formato</label>
                    <input type="number" min="0" step="any" value={envasesPorFormato}
                        onChange={(e) => setEnvasesPorFormato(Number(e.target.value) || 1)}
                        className="w-full rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div>
                    <label className="mb-0.5 block text-[10px] font-medium text-muted-foreground uppercase">Contenido/envase</label>
                    <input type="number" min="0" step="any" value={contenidoPorEnvase}
                        onChange={(e) => setContenidoPorEnvase(Number(e.target.value) || 1)}
                        className="w-full rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleSave} disabled={isPending || !selectedId}>
                    {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                    Guardar vinculación
                </Button>
                <button onClick={() => setIsOpen(false)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Cancelar
                </button>
            </div>
        </div>
    )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DocumentoDetailClient({ doc }: { doc: DocumentDetail }) {
    const uid = useId()
    const [isPending, startTransition] = useTransition()
    const [isApprovePending, startApproveTransition] = useTransition()
    const [isVenuePending, startVenueTransition] = useTransition()

    // Header state
    const [docType, setDocType] = useState(doc.doc_type ?? '')
    const [documentNumber, setDocumentNumber] = useState(doc.document_number ?? '')
    const [documentDate, setDocumentDate] = useState(doc.document_date ?? '')
    const [totalAmount, setTotalAmount] = useState(doc.total_amount?.toString() ?? '')
    const [providerId, setProviderId] = useState<string | null>(doc.provider_id ?? null)
    const [providerName, setProviderName] = useState<string | null>(doc.provider_name ?? null)

    // Lines state
    const [lines, setLines] = useState<LocalLine[]>(doc.lines)
    const [deletedLineIds, setDeletedLineIds] = useState<string[]>([])

    // Venue reassign dialog
    const [venueDialogOpen, setVenueDialogOpen] = useState(false)
    const [pendingVenueId, setPendingVenueId] = useState<string | null>(null)
    const [pendingVenueName, setPendingVenueName] = useState<string | null>(null)

    // UI state
    const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
    const [isDirty, setIsDirty] = useState(false)

    const showReconciliation =
        doc.reconciliation_status !== null ||
        (doc.doc_type?.toLowerCase().includes('resumen') ?? false)

    function markDirty() {
        setIsDirty(true)
        setToast(null)
    }

    function handleAddLine() {
        const newLine: LocalLine = {
            id: '',
            _tempId: `new-${Date.now()}`,
            raw_name: '',
            quantity: 1,
            unit_price: null,
            line_total_cost: 0,
            master_item_id: null,
            review_status: null,
            iva_percent: null,
            ai_interpretation: null,
        }
        setLines((prev) => [...prev, newLine])
        markDirty()
    }

    function handleDeleteLine(index: number) {
        const line = lines[index]
        if (line.id) {
            setDeletedLineIds((prev) => [...prev, line.id])
        }
        setLines((prev) => prev.filter((_, i) => i !== index))
        markDirty()
    }

    function handleLineChange<K extends keyof LocalLine>(index: number, field: K, value: LocalLine[K]) {
        setLines((prev) =>
            prev.map((l, i) => {
                if (i !== index) return l
                const updated = { ...l, [field]: value }
                if (field === 'quantity' || field === 'unit_price') {
                    const qty = field === 'quantity' ? (value as number) : (l.quantity ?? 0)
                    const price = field === 'unit_price' ? (value as number | null) : l.unit_price
                    updated.line_total_cost = qty * (price ?? 0)
                }
                return updated
            }),
        )
        markDirty()
    }

    function handleSave() {
        const parsedAmount = totalAmount !== '' ? parseFloat(totalAmount) : null
        if (totalAmount !== '' && isNaN(parsedAmount!)) {
            setToast({ type: 'error', message: 'El importe total no es un número válido.' })
            return
        }

        const payload = {
            documentId: doc.id,
            header: {
                doc_type: docType,
                document_number: documentNumber || null,
                document_date: documentDate || null,
                total_amount: parsedAmount,
                provider_id: providerId,
                venue_id: doc.venue_id ?? null,
            },
            lines: lines.map((l) => ({
                id: l.id || undefined,
                raw_name: l.raw_name ?? '',
                quantity: l.quantity ?? 0,
                unit_price: l.unit_price,
                line_total_cost: l.line_total_cost ?? 0,
                master_item_id: l.master_item_id ?? null,
                ai_interpretation: l.ai_interpretation ?? null,
            })),
            deletedLineIds,
        }

        startTransition(async () => {
            const result = await saveDocument(payload)
            if (result.success) {
                setIsDirty(false)
                setDeletedLineIds([])
                setToast({ type: 'success', message: 'Cambios guardados correctamente.' })
            } else {
                setToast({ type: 'error', message: result.error })
            }
        })
    }

    function handleApprove() {
        startApproveTransition(async () => {
            const result = await approveDocumentStatus(doc.id)
            if (result.success) {
                setToast({ type: 'success', message: 'Documento aprobado.' })
            } else {
                setToast({ type: 'error', message: result.error })
            }
        })
    }

    function handleVenueConfirm() {
        if (!pendingVenueId) return
        startVenueTransition(async () => {
            const result = await reassignDocumentVenue(doc.id, pendingVenueId)
            if (result.success) {
                setToast({ type: 'success', message: `Local reasignado a "${pendingVenueName}".` })
                setVenueDialogOpen(false)
            } else {
                setToast({ type: 'error', message: result.error })
            }
        })
    }

    const linesSubtotal = lines.reduce((sum, l) => sum + (l.line_total_cost ?? 0), 0)

    return (
        <div className="flex flex-col gap-6 pb-24">
            {/* Back navigation */}
            <div className="flex items-center gap-3">
                <Link
                    href={doc.parent_invoice_id ? `/documentos/${doc.parent_invoice_id}` : '/documentos'}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ArrowLeft className="h-4 w-4" />
                    {doc.parent_invoice_id ? 'Volver a Factura Resumen' : 'Documentos'}
                </Link>
            </div>

            {/* Page title */}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        {doc.document_number ?? 'Documento sin número'}
                    </h1>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                        {providerName ?? 'Sin proveedor'} · Creado{' '}
                        {new Date(doc.created_at ?? '').toLocaleDateString('es-ES', {
                            day: '2-digit',
                            month: 'long',
                            year: 'numeric',
                        })}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-xs ${docTypeBadgeClass(doc.doc_type)}`}>
                        {doc.doc_type ?? '—'}
                    </Badge>
                    <Badge
                        variant="outline"
                        className={`text-xs ${doc.status === 'approved' ? 'border-green-200 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300' : 'border-amber-200 bg-amber-50 text-amber-700'}`}
                    >
                        {doc.status === 'approved' ? 'Aprobado' : 'Pendiente'}
                    </Badge>
                    {/* Reasignar local button */}
                    <button
                        onClick={() => { setPendingVenueId(null); setPendingVenueName(null); setVenueDialogOpen(true) }}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors border border-border rounded-md px-2 py-1"
                        title="Reasignar local"
                    >
                        <Building2 className="h-3.5 w-3.5" />
                        Reasignar local
                    </button>
                    {doc.drive_url && (
                        <a
                            href={doc.drive_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Ver documento
                        </a>
                    )}
                </div>
            </div>

            {/* Header editable fields */}
            <section className="rounded-lg border border-border bg-card p-5 space-y-4">
                <h2 className="text-base font-semibold">Cabecera del documento</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                        <label htmlFor={`${uid}-doctype`} className="mb-1 block text-xs font-medium text-muted-foreground">
                            Tipo de documento
                        </label>
                        <select
                            id={`${uid}-doctype`}
                            value={docType}
                            onChange={(e) => { setDocType(e.target.value); markDirty() }}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                            {DOC_TYPES.map((t) => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                            {docType && !DOC_TYPES.includes(docType) && (
                                <option value={docType}>{docType}</option>
                            )}
                        </select>
                    </div>

                    <div>
                        <label htmlFor={`${uid}-docnum`} className="mb-1 block text-xs font-medium text-muted-foreground">
                            Nº Documento
                        </label>
                        <input
                            id={`${uid}-docnum`}
                            type="text"
                            value={documentNumber}
                            onChange={(e) => { setDocumentNumber(e.target.value); markDirty() }}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            placeholder="—"
                        />
                    </div>

                    <div>
                        <label htmlFor={`${uid}-docdate`} className="mb-1 block text-xs font-medium text-muted-foreground">
                            Fecha
                        </label>
                        <input
                            id={`${uid}-docdate`}
                            type="date"
                            value={documentDate}
                            onChange={(e) => { setDocumentDate(e.target.value); markDirty() }}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                    </div>

                    <div>
                        <label htmlFor={`${uid}-total`} className="mb-1 block text-xs font-medium text-muted-foreground">
                            Total (€)
                        </label>
                        <input
                            id={`${uid}-total`}
                            type="number"
                            step="0.01"
                            min="0"
                            value={totalAmount}
                            onChange={(e) => { setTotalAmount(e.target.value); markDirty() }}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            placeholder="0.00"
                        />
                    </div>

                    {/* 1D: Provider Combobox */}
                    <div className="sm:col-span-2">
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">
                            Proveedor
                        </label>
                        <ProviderCombobox
                            value={providerId}
                            onChange={(id, name) => { setProviderId(id); setProviderName(name); markDirty() }}
                            disabled={isPending}
                        />
                    </div>
                </div>
            </section>

            {/* Albaranes vinculados — shown on Factura Resumen that has linked albaranes */}
            {doc.linkedAlbaranes.length > 0 && (
                <section className="rounded-lg border border-border bg-card p-5 space-y-3">
                    <h2 className="text-base font-semibold">Albaranes vinculados</h2>
                    <div className="divide-y divide-border rounded-md border border-border overflow-hidden">
                        {doc.linkedAlbaranes.map((a) => (
                            <Link
                                key={a.id}
                                href={`/documentos/${a.id}`}
                                className="flex items-center justify-between px-4 py-3 hover:bg-accent/30 transition-colors"
                            >
                                <span className="text-sm font-medium">
                                    {a.document_number ?? <span className="text-muted-foreground italic">Sin número</span>}
                                </span>
                                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                    {a.document_date && (
                                        <span>
                                            {new Date(a.document_date + 'T12:00:00').toLocaleDateString('es-ES', {
                                                day: '2-digit',
                                                month: 'short',
                                                year: 'numeric',
                                            })}
                                        </span>
                                    )}
                                    {a.total_amount != null && (
                                        <span className="tabular-nums">
                                            {a.total_amount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                                        </span>
                                    )}
                                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                                </div>
                            </Link>
                        ))}
                    </div>
                </section>
            )}

            {/* Reconciliation panel */}
            {showReconciliation && (
                <ReconciliationPanel
                    invoiceId={doc.id}
                    providerId={doc.provider_id}
                    reconciliationStatus={doc.reconciliation_status}
                    reconciliationDelta={doc.reconciliation_delta}
                    referencedNotes={doc.referenced_delivery_notes}
                    linkedAlbaranes={doc.linkedAlbaranes}
                    invoiceTotal={totalAmount !== '' && !isNaN(Number(totalAmount)) ? Number(totalAmount) : doc.total_amount ?? null}
                    purchaseLinesTotal={linesSubtotal}
                />
            )}

            {/* Purchase lines table */}
            <section className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <div>
                        <h2 className="text-base font-semibold">Líneas de compra</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {lines.length} línea{lines.length !== 1 ? 's' : ''} ·{' '}
                            Subtotal:{' '}
                            {linesSubtotal.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                        </p>
                    </div>
                    <button
                        onClick={handleAddLine}
                        className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent transition-colors"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Añadir línea
                    </button>
                </div>

                {lines.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">
                        Sin líneas de compra.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border bg-muted/30">
                                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Producto</th>
                                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground w-28">Cantidad</th>
                                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground w-32">Precio unit.</th>
                                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground w-32">Total línea</th>
                                    <th className="px-4 py-2.5 w-10" />
                                </tr>
                            </thead>
                            <tbody>
                                {lines.map((line, index) => {
                                    const lineKey = line.id || line._tempId || index
                                    const isSkipped = line.review_status === 'skipped'
                                    return (
                                        <tr key={lineKey} className={`border-b border-border last:border-0 ${isSkipped ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''}`}>
                                            <td className="px-4 py-2">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="text"
                                                            value={line.raw_name ?? ''}
                                                            onChange={(e) => handleLineChange(index, 'raw_name', e.target.value)}
                                                            aria-label="Nombre del producto"
                                                            className="w-full min-w-[180px] rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                                            placeholder="Nombre del producto"
                                                        />
                                                        {isSkipped && (
                                                            <Badge variant="outline" className="shrink-0 text-xs border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                                                                Pendiente de vincular
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    {isSkipped && line.id && (
                                                        <SkippedLineEditor
                                                            line={line}
                                                            doc={doc}
                                                            onSaved={() => {
                                                                // Optimistically update review_status in local state
                                                                setLines((prev) => prev.map((l, i) =>
                                                                    i === index ? { ...l, review_status: 'reviewed' } : l
                                                                ))
                                                            }}
                                                        />
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-2">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.001"
                                                    value={line.quantity ?? ''}
                                                    onChange={(e) => handleLineChange(index, 'quantity', parseFloat(e.target.value) || 0)}
                                                    aria-label="Cantidad"
                                                    className="w-full rounded border border-input bg-background px-2 py-1 text-right text-sm focus:outline-none focus:ring-1 focus:ring-ring tabular-nums"
                                                />
                                            </td>
                                            <td className="px-4 py-2">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={line.unit_price ?? ''}
                                                    onChange={(e) => {
                                                        const v = e.target.value
                                                        handleLineChange(index, 'unit_price', v === '' ? null : parseFloat(v))
                                                    }}
                                                    aria-label="Precio unitario"
                                                    className="w-full rounded border border-input bg-background px-2 py-1 text-right text-sm focus:outline-none focus:ring-1 focus:ring-ring tabular-nums"
                                                    placeholder="—"
                                                />
                                            </td>
                                            <td className="px-4 py-2 text-right tabular-nums font-medium">
                                                {(line.line_total_cost ?? 0).toLocaleString('es-ES', {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2,
                                                })}{' '}
                                                €
                                            </td>
                                            <td className="px-4 py-2">
                                                <button
                                                    onClick={() => handleDeleteLine(index)}
                                                    aria-label="Eliminar línea"
                                                    className="text-muted-foreground hover:text-destructive transition-colors"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* Toast */}
            {toast && (
                <div
                    role="alert"
                    className={`fixed bottom-24 right-6 z-50 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg ${
                        toast.type === 'success'
                            ? 'border-green-200 bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200'
                            : 'border-red-200 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200'
                    }`}
                >
                    {toast.type === 'success' ? (
                        <CheckCircle className="h-4 w-4 shrink-0" />
                    ) : (
                        <AlertCircle className="h-4 w-4 shrink-0" />
                    )}
                    {toast.message}
                </div>
            )}

            {/* Sticky footer */}
            <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between gap-3 border-t border-border bg-background/95 backdrop-blur-sm px-6 py-3">
                <div className="flex items-center gap-2 text-sm">
                    {isDirty && (
                        <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            Cambios sin guardar
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {doc.status === 'pending' && !isDirty && (
                        <button
                            onClick={handleApprove}
                            disabled={isApprovePending}
                            className="flex items-center gap-1.5 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60 transition-colors"
                        >
                            {isApprovePending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <CheckCircle className="h-4 w-4" />
                            )}
                            Aprobar documento
                        </button>
                    )}
                    <Button
                        onClick={handleSave}
                        disabled={isPending || !isDirty}
                        className="flex items-center gap-1.5"
                    >
                        {isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Save className="h-4 w-4" />
                        )}
                        Guardar cambios
                    </Button>
                </div>
            </div>

            {/* 1A: Reasignar venue dialog */}
            <Dialog open={venueDialogOpen} onOpenChange={setVenueDialogOpen}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Building2 className="h-5 w-5" />
                            Reasignar local
                        </DialogTitle>
                    </DialogHeader>
                    <div className="py-2">
                        <p className="mb-3 text-sm text-muted-foreground">
                            Selecciona el local al que pertenece este documento.
                        </p>
                        <VenueCombobox
                            value={pendingVenueId}
                            onChange={(id, name) => { setPendingVenueId(id); setPendingVenueName(name) }}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setVenueDialogOpen(false)} disabled={isVenuePending}>
                            Cancelar
                        </Button>
                        <Button onClick={handleVenueConfirm} disabled={!pendingVenueId || isVenuePending}>
                            {isVenuePending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            Confirmar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
