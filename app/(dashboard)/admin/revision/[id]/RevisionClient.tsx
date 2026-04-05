'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import Link from 'next/link'
import {
    ArrowLeft, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp,
    ExternalLink, FileText, Plus, Search, CheckCheck, Loader2, Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { normalizeText } from '@/utils/normalizeText'
import { useRouter } from 'next/navigation'
import { approveDocument, deleteDocument } from '@/app/actions/documentRevision'
import { getSecureDocumentUrl } from '@/app/actions/documents'
import type { MasterItemRef, DocumentWithRelations, PurchaseLineWithItem, ReferenceLookup } from './types'
import { BASE_UNITS, PRODUCT_CATEGORIES, FORMATOS_COMPRA } from '@/lib/constants'

// ─── Types ───────────────────────────────────────────────────────────────────


interface Props {
    document: DocumentWithRelations
    lines: PurchaseLineWithItem[]
    masterItems: MasterItemRef[]
    providers: ReferenceLookup[]
    venues: ReferenceLookup[]
    priceHistory: Record<string, number>
    fromProvider?: { id: string; name: string }
}

// ─── LineState: tracks the user's mapping decision per line ──────────────────

interface LineState {
    /** null = unmapped, string = existing master_item id, '__new__' = create new */
    selectedId: string | null
    /** only populated when selectedId === '__new__' */
    newItemName: string
    newItemCategory: string
    newItemBaseUnit: string
    expanded: boolean

    // Transactional variables
    quantity: number
    unit_price: number | null

    // Mathematical variables for item packaging/costing
    formato_compra: string
    envases_por_formato: number
    contenido_por_envase: number
    is_preferred: boolean
    overrideAssociation: boolean
}

// ─── ProviderCombobox ────────────────────────────────────────────────────────

interface ProviderComboboxProps {
    items: ReferenceLookup[]
    value: string | null
    newItemName: string
    onChange: (id: string | null, newName: string) => void
}

function ProviderCombobox({ items, value, newItemName, onChange }: ProviderComboboxProps) {
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const containerRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        function handle(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handle)
        return () => document.removeEventListener('mousedown', handle)
    }, [])

    const filtered = items.filter((item) =>
        item.name.toLowerCase().includes(query.toLowerCase())
    )

    const displayValue =
        value === '__new__'
            ? `➕ Crear: "${newItemName}"`
            : value
                ? items.find((i) => i.id === value)?.name ?? ''
                : ''

    function handleSelect(id: string) {
        onChange(id, '')
        setQuery('')
        setOpen(false)
    }

    function handleCreateNew() {
        // We do *not* automatically title case provider names like items, but we strip complex injects 
        const cleanName = query.trim()
        onChange('__new__', cleanName)
        setQuery('')
        setOpen(false)
    }

    return (
        <div ref={containerRef} className="relative w-full">
            <button
                type="button"
                onClick={() => {
                    setOpen((o) => !o)
                    setTimeout(() => inputRef.current?.focus(), 50)
                }}
                className={`flex w-full items-center justify-between rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${value === '__new__' ? 'border-blue-400 bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200' : 'border-input bg-transparent'}`}
                style={{ height: '32px' }} // Match h-8 of standard inputs
            >
                <span className="min-w-0 truncate">
                    {displayValue || 'Seleccionar o crear...'}
                </span>
                <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
            </button>

            {open && (
                <div className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-lg">
                    <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Buscar..."
                            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                        />
                    </div>
                    <ul className="max-h-52 overflow-y-auto py-1">
                        {filtered.map((item) => (
                            <li key={item.id}>
                                <button
                                    type="button"
                                    onClick={() => handleSelect(item.id)}
                                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-accent
                    ${value === item.id ? 'bg-accent font-medium' : ''}`}
                                >
                                    <span>{item.name}</span>
                                </button>
                            </li>
                        ))}
                        {query.trim() && (
                            <li className="border-t border-border">
                                <button
                                    type="button"
                                    onClick={handleCreateNew}
                                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950"
                                >
                                    <Plus className="h-4 w-4 shrink-0" />
                                    Crear: &quot;{query.trim()}&quot;
                                </button>
                            </li>
                        )}
                        {filtered.length === 0 && !query.trim() && (
                            <li className="px-3 py-4 text-center text-sm text-muted-foreground">
                                Escribe para buscar...
                            </li>
                        )}
                    </ul>
                </div>
            )}
        </div>
    )
}

// ─── CreatableCombobox (Items) ────────────────────────────────────────────────

interface ComboboxProps {
    items: MasterItemRef[]
    value: string | null
    newItemName: string
    onChange: (id: string | null, newName: string) => void
}

function CreatableCombobox({ items, value, newItemName, onChange }: ComboboxProps) {
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const containerRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    // Close on click-outside
    useEffect(() => {
        function handle(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handle)
        return () => document.removeEventListener('mousedown', handle)
    }, [])

    const filtered = items.filter((item) =>
        item.official_name.toLowerCase().includes(query.toLowerCase())
    )

    const displayValue =
        value === '__new__'
            ? `➕ Crear: "${newItemName}"`
            : value
                ? items.find((i) => i.id === value)?.official_name ?? ''
                : ''

    function handleSelect(id: string) {
        onChange(id, '')
        setQuery('')
        setOpen(false)
    }

    function handleCreateNew() {
        const normalized = normalizeText(query)
        onChange('__new__', normalized)
        setQuery('')
        setOpen(false)
    }

    return (
        <div ref={containerRef} className="relative w-full">
            {/* Trigger */}
            <button
                type="button"
                onClick={() => {
                    setOpen((o) => !o)
                    setTimeout(() => inputRef.current?.focus(), 50)
                }}
                className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors
          ${value
                        ? value === '__new__'
                            ? 'border-blue-400 bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200'
                            : 'border-green-400 bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200'
                        : 'border-border bg-background text-muted-foreground hover:border-primary/60'
                    }`}
            >
                <span className="truncate">
                    {displayValue || 'Buscar o crear producto…'}
                </span>
                <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
            </button>

            {/* Dropdown */}
            {open && (
                <div className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-lg">
                    {/* Search input */}
                    <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Buscar..."
                            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                        />
                    </div>

                    {/* Results */}
                    <ul className="max-h-52 overflow-y-auto py-1">
                        {filtered.map((item) => (
                            <li key={item.id}>
                                <button
                                    type="button"
                                    onClick={() => handleSelect(item.id)}
                                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-accent
                    ${value === item.id ? 'bg-accent font-medium' : ''}`}
                                >
                                    <div className="flex items-center gap-2">
                                        <span>{item.official_name}</span>
                                        {item.category && (
                                            <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] uppercase font-medium text-secondary-foreground">
                                                {item.category}
                                            </span>
                                        )}
                                    </div>
                                    <span className="ml-2 shrink-0 text-xs text-muted-foreground">{item.base_unit}</span>
                                </button>
                            </li>
                        ))}

                        {/* Create new option */}
                        {query.trim() && (
                            <li className="border-t border-border">
                                <button
                                    type="button"
                                    onClick={handleCreateNew}
                                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950"
                                >
                                    <Plus className="h-4 w-4 shrink-0" />
                                    Crear nuevo producto: &quot;{normalizeText(query)}&quot;
                                </button>
                            </li>
                        )}

                        {filtered.length === 0 && !query.trim() && (
                            <li className="px-3 py-4 text-center text-sm text-muted-foreground">
                                Escribe para buscar...
                            </li>
                        )}
                    </ul>
                </div>
            )}
        </div>
    )
}

// ─── FieldTooltip ─────────────────────────────────────────────────────────────

function FieldTooltip({ text }: { text: string }) {
    return (
        <span
            title={text}
            className="ml-1 inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full bg-muted text-[9px] font-bold text-muted-foreground hover:bg-muted-foreground hover:text-background transition-colors"
        >
            ?
        </span>
    )
}

// ─── Main RevisionClient component ───────────────────────────────────────────

export default function RevisionClient({ document: doc, lines, masterItems, providers, venues, priceHistory, fromProvider }: Props) {
    const router = useRouter()
    const backHref = fromProvider ? `/proveedores/${fromProvider.id}` : '/admin/revision'

    const [isSubmitting, setIsSubmitting] = useState(false)
    const [showMismatchModal, setShowMismatchModal] = useState(false)
    const [duplicateError, setDuplicateError] = useState<{ existingDocumentId?: string } | null>(null)
    const [showDuplicateToast, setShowDuplicateToast] = useState(false)
    const [autoApprovedExpanded, setAutoApprovedExpanded] = useState(false)
    const [allMarkedPreferred, setAllMarkedPreferred] = useState(false)
    const errorRef = useRef<HTMLDivElement>(null)

    const [secureUrl, setSecureUrl] = useState<string | null>(null)
    const [isLoadingDoc, setIsLoadingDoc] = useState(!!doc.drive_url)

    useEffect(() => {
        if (!doc.drive_url) {
            setIsLoadingDoc(false)
            return
        }

        let isMounted = true
        async function fetchSecureUrl() {
            try {
                // El action ya maneja null internamente si no hay fileName
                const url = await getSecureDocumentUrl(doc.drive_url)
                if (isMounted) {
                    setSecureUrl(url)
                }
            } catch (err) {
                console.error("Failed to load secure document url", err)
            } finally {
                if (isMounted) setIsLoadingDoc(false)
            }
        }

        fetchSecureUrl()
        return () => { isMounted = false }
    }, [doc.drive_url])

    // Initialize document-level editable state
    const [docState, setDocState] = useState(() => {
        const initialDocType = doc.doc_type?.toLowerCase() || 'factura'
        let initialDocNum = doc.document_number || ''

        if (initialDocType === 'presupuesto' && !initialDocNum) {
            const datePart = doc.document_date ? new Date(doc.document_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
            initialDocNum = `COT-${datePart}`
        }

        const hasNoProvider = !doc.provider_id && !doc.erp_providers
        const aiProviderName = doc.ai_interpretation?.proveedor_nombre
        const initialProviderId = hasNoProvider && aiProviderName ? '__new__' : (doc.provider_id ?? (doc.erp_providers?.id ?? null))
        const initialNewProviderName = hasNoProvider && aiProviderName ? aiProviderName : ''

        return {
            doc_type: initialDocType,
            document_number: initialDocNum,
            document_date: doc.document_date ? new Date(doc.document_date).toISOString().split('T')[0] : '',
            provider_id: initialProviderId,
            newProviderName: initialNewProviderName,
            venue_id: doc.erp_venues?.id ?? null,
            total_amount: doc.total_amount ?? 0,
            activate_prices: false,
        }
    })

    // Initialize per-line state — expanded always false on first render (server-safe)
    const [lineStates, setLineStates] = useState<Record<string, LineState>>(() => {
        const init: Record<string, LineState> = {}
        for (const line of lines) {
            const ai = line.ai_interpretation

            // Soportar ambas estructuras: nueva (normalization_step) y legacy (campos directos)
            const norm = (ai?.normalization_step as Record<string, unknown> | undefined) ?? ai
            const officialName = (norm?.official_name ?? ai?.producto_normalizado ?? '') as string
            const categoria = (norm?.categoria ?? ai?.categoria ?? '') as string
            const baseUnit = (norm?.base_unit ?? ai?.unidad_base ?? 'ud') as string
            const formatoCompra = (norm?.formato_compra ?? ai?.formato_compra ?? 'Unidad') as string
            const envasesPorFormato = Number(norm?.envases_por_formato ?? ai?.envases_por_formato ?? 1)
            const contenidoPorEnvase = Number(norm?.contenido_por_envase ?? ai?.contenido_por_envase ?? 1)

            const hasAiSuggestion = !line.master_item_id && !!officialName

            init[line.id] = {
                selectedId: line.master_item_id ?? (hasAiSuggestion ? '__new__' : null),
                newItemName: officialName,
                newItemCategory: categoria,
                newItemBaseUnit: baseUnit,
                expanded: false, // always collapsed on server — expanded via useEffect after hydration
                quantity: line.quantity,
                unit_price: line.unit_price,
                formato_compra: formatoCompra ? formatoCompra.charAt(0).toUpperCase() + formatoCompra.slice(1) : 'Unidad',
                envases_por_formato: envasesPorFormato,
                contenido_por_envase: contenidoPorEnvase,
                // Producto genuinamente nuevo (sin master_item) → preferido por defecto
                // Producto conocido → conservador, el operario puede cambiarlo
                is_preferred: !line.master_item_id,
                overrideAssociation: false,
            }
        }
        return init
    })

    // After hydration, expand lines that have no master_item_id (need review)
    useEffect(() => {
        setLineStates((prev) => {
            const next = { ...prev }
            for (const line of lines) {
                if (line.review_status === 'pending_review' || (!line.review_status && !line.master_item_id)) {
                    next[line.id] = { ...next[line.id], expanded: true }
                }
            }
            return next
        })
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    const updateLine = useCallback(
        (lineId: string, patch: Partial<LineState>) => {
            setLineStates((prev) => ({
                ...prev,
                [lineId]: { ...prev[lineId], ...patch },
            }))
        },
        []
    )

    const toggleExpand = useCallback(
        (lineId: string) => {
            setLineStates((prev) => ({
                ...prev,
                [lineId]: { ...prev[lineId], expanded: !prev[lineId].expanded },
            }))
        },
        []
    )

    // Derived counts
    const mappedCount = lines.filter((l) => {
        const s = lineStates[l.id]
        return s?.selectedId && s.selectedId !== null
    }).length
    const totalCount = lines.length
    // Lines without a DB master_item_id — genuinely new products needing human confirmation
    const unmappedCount = lines.filter((l) => !l.master_item_id).length

    // Dynamic Accounting sum
    const sumOfLines = lines.reduce((acc, line) => {
        const state = lineStates[line.id]
        if (!state) return acc
        const qty = state.quantity || 0
        const price = state.unit_price || 0
        return acc + (qty * price)
    }, 0)

    // Check if there is an accounting mismatch (tolerance $0.10 for the live banner)
    const mismatchAmount = Math.abs(sumOfLines - docState.total_amount)
    const isMismatch = docState.doc_type !== 'presupuesto' && mismatchAmount > 0.10
    // Significant mismatch: >1% of total OR >€0.50 — triggers save confirmation modal
    const hasSignificantMismatch = docState.doc_type !== 'presupuesto' &&
        mismatchAmount > Math.max(Math.abs(docState.total_amount) * 0.01, 0.50)

    // Force total amount to equal sumOfLines if doc_type is presupuesto
    const displayTotalAmount = docState.doc_type === 'presupuesto' ? sumOfLines : docState.total_amount

    function handleDocTypeChange(newType: string) {
        setDocState((prev) => {
            const updates = { ...prev, doc_type: newType }
            if (newType === 'presupuesto' && !prev.document_number) {
                const datePart = prev.document_date || new Date().toISOString().split('T')[0]
                updates.document_number = `COT-${datePart}`
            }
            return updates
        })
    }

    async function buildAndSubmit() {
        const payload = {
            document: {
                id: doc.id,
                doc_type: docState.doc_type,
                document_number: docState.document_number,
                document_date: docState.document_date,
                total_amount: displayTotalAmount,
                venue_id: docState.venue_id,
                activate_prices: docState.activate_prices,
                provider_resolution: docState.provider_id === '__new__'
                    ? { action: 'create_and_link' as const, new_provider_name: docState.newProviderName }
                    : { action: 'link_existing' as const, provider_id: docState.provider_id! }
            },
            lines: lines.map((line) => {
                const state = lineStates[line.id]
                const lineTotalCost = (state.quantity || 0) * (state.unit_price || 0)
                return {
                    purchase_line_id: line.id,
                    quantity: state.quantity,
                    unit_price: state.unit_price,
                    line_total_cost: lineTotalCost,
                    formato_compra: state.formato_compra,
                    envases_por_formato: state.envases_por_formato,
                    contenido_por_envase: state.contenido_por_envase,
                    resolution: state.selectedId === '__new__'
                        ? {
                            action: 'create_and_link' as const,
                            new_official_name: state.newItemName,
                            new_item_category: state.newItemCategory,
                            new_item_base_unit: state.newItemBaseUnit,
                        }
                        : state.selectedId
                            ? { action: 'link_existing' as const, master_item_id: state.selectedId }
                            : { action: 'skip' as const },
                    raw_name: line.raw_name,
                    review_status: line.review_status ?? null,
                    ai_interpretation: line.ai_interpretation as Record<string, unknown> | null,
                    is_preferred: state.is_preferred,
                }
            }),
        }

        setIsSubmitting(true)
        setDuplicateError(null)
        try {
            const result = await approveDocument(payload)
            if (result.success) {
                router.push(backHref)
                router.refresh()
            } else if (result.error === 'duplicate') {
                setDuplicateError({ existingDocumentId: result.existingDocumentId })
                // Scroll to the error banner and show a temporary toast near the button
                setTimeout(() => errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
                setShowDuplicateToast(true)
                setTimeout(() => setShowDuplicateToast(false), 4000)
            } else {
                alert(`Error al aprobar: ${result.error}`)
            }
        } catch (e: unknown) {
            alert(`Error inesperado: ${e instanceof Error ? e.message : String(e)}`)
        } finally {
            setIsSubmitting(false)
        }
    }

    async function handleApprove() {
        // --- PRE-FLIGHT CHECKS ---
        if (!docState.provider_id) {
            alert('Por favor selecciona un proveedor.')
            return
        }

        // Mismatch check: if significant, show confirmation modal instead of proceeding
        if (hasSignificantMismatch) {
            setShowMismatchModal(true)
            return
        }

        await buildAndSubmit()
    }

    async function handleDeleteDraft() {
        setIsSubmitting(true)
        try {
            const result = await deleteDocument(doc.id)
            if (result.success) {
                router.push(backHref)
                router.refresh()
            } else {
                alert(`Error al eliminar: ${result.error}`)
            }
        } catch (e: unknown) {
            alert(`Error inesperado: ${e instanceof Error ? e.message : String(e)}`)
        } finally {
            setIsSubmitting(false)
        }
    }

    // Header warning computations
    const pendingReviewCount = lines.filter(l => l.review_status === 'pending_review').length
    const newProductCount = lines.filter(l =>
        l.review_status === 'pending_review' &&
        (l.ai_interpretation?.review_reasons as string[] | null)?.includes('new_product')
    ).length
    const lowConfidenceCount = pendingReviewCount - newProductCount
    const warnings: string[] = []
    if (isMismatch) warnings.push(`Descuadre contable de $${mismatchAmount.toFixed(2)}`)
    if (newProductCount > 0) warnings.push(`${newProductCount} producto${newProductCount > 1 ? 's' : ''} nuevo${newProductCount > 1 ? 's' : ''} a confirmar`)
    if (lowConfidenceCount > 0) warnings.push(`${lowConfidenceCount} precio${lowConfidenceCount > 1 ? 's' : ''} con confianza baja`)

    // Separar líneas en dos grupos
    const pendingLines = lines.filter(l =>
        l.review_status === 'pending_review' || (!l.review_status && !l.master_item_id)
    )
    const approvedLines = lines.filter(l =>
        l.review_status === 'auto_approved' || (!l.review_status && !!l.master_item_id)
    )

    return (
        <div className="w-full max-w-[1600px] mx-auto p-4 md:p-6 flex flex-col gap-6">
            {/* ── Top Header ── */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    {fromProvider ? (
                        <>
                            <Link
                                href="/proveedores"
                                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                            >
                                Proveedores
                            </Link>
                            <span className="text-muted-foreground">/</span>
                            <Link
                                href={`/proveedores/${fromProvider.id}`}
                                className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                            >
                                <ArrowLeft className="h-4 w-4" />
                                {fromProvider.name}
                            </Link>
                        </>
                    ) : (
                        <Link
                            href="/admin/revision"
                            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            Volver
                        </Link>
                    )}
                    <span className="text-muted-foreground">/</span>
                    <h1 className="text-sm font-semibold">
                        {doc.doc_type.charAt(0).toUpperCase() + doc.doc_type.slice(1)}{' '}
                        {doc.document_number ? `#${doc.document_number}` : ''}
                    </h1>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    {warnings.length > 0 ? (
                        warnings.map((w, i) => (
                            <span key={i} className="flex items-center gap-1.5 text-sm font-medium text-orange-600 dark:text-orange-400">
                                <AlertTriangle className="h-4 w-4 shrink-0" />
                                {w}
                            </span>
                        ))
                    ) : (
                        <>
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" style={{ color: '#3B6D11' }} />
                            <span className="text-sm font-medium" style={{ color: '#3B6D11' }}>
                                Listo para guardar
                            </span>
                        </>
                    )}
                </div>
            </div>

            {/* ── Main content split — 50/50 ── */}
            <div className="flex flex-col lg:flex-row gap-6 items-start">

                {/* ── LEFT: Visor PDF — 50% ── */}
                <div className="w-full lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:flex-1 min-w-0 flex flex-col gap-4">
                    <div className="flex-1 w-full border rounded-xl overflow-hidden bg-white shadow-sm flex flex-col">
                        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5 bg-card">
                            <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-medium">Documento Original</span>
                            </div>
                            {secureUrl && (
                                <a
                                    href={secureUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    Abrir <ExternalLink className="h-3 w-3" />
                                </a>
                            )}
                        </div>
                        {isLoadingDoc ? (
                            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center p-8">
                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/50" />
                                <p className="text-sm text-muted-foreground animate-pulse">Cargando documento seguro...</p>
                            </div>
                        ) : secureUrl ? (
                            <iframe
                                src={secureUrl}
                                title="Documento PDF"
                                className="w-full h-full border-0"
                                allow="autoplay"
                            />
                        ) : (
                            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center p-8">
                                <FileText className="h-12 w-12 text-muted-foreground/30" />
                                <p className="text-sm text-muted-foreground">No hay URL de documento disponible.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── RIGHT: Two separate cards — 50% ── */}
                <div className="w-full lg:flex-1 min-w-0 flex flex-col gap-4">

                    {/* Card 1: Datos del Documento */}
                    <div className="bg-white dark:bg-card border rounded-xl shadow-sm p-4 sm:p-5">
                        <h2 className="text-base font-bold pb-3 mb-4 border-b border-border/50">Datos del Documento</h2>

                        {duplicateError && (
                            <div ref={errorRef} className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
                                <p className="font-medium text-red-800">Este documento ya fue procesado y está aprobado.</p>
                                <div className="mt-2 flex flex-wrap items-center gap-4">
                                    {duplicateError.existingDocumentId && (
                                        <a
                                            href={`/documentos/${duplicateError.existingDocumentId}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1 text-red-700 underline hover:text-red-900"
                                        >
                                            Ver documento original → <ExternalLink className="h-3.5 w-3.5" />
                                        </a>
                                    )}
                                    <button
                                        type="button"
                                        onClick={handleDeleteDraft}
                                        disabled={isSubmitting}
                                        className="flex items-center gap-1.5 text-red-700 underline hover:text-red-900 disabled:opacity-50"
                                    >
                                        {isSubmitting
                                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            : <Trash2 className="h-3.5 w-3.5" />
                                        }
                                        Eliminar este borrador
                                    </button>
                                </div>
                            </div>
                        )}

                        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
                            <div>
                                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tipo de Documento</label>
                                <select
                                    value={docState.doc_type}
                                    onChange={(e) => handleDocTypeChange(e.target.value)}
                                    className="mt-1 flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                >
                                    <option value="factura">Factura</option>
                                    <option value="albaran">Albarán / Guía</option>
                                    <option value="ticket">Ticket / Boleta</option>
                                    <option value="nota_credito">Nota de Crédito</option>
                                    <option value="presupuesto">Presupuesto / Cotización</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nº Documento</label>
                                <input
                                    type="text"
                                    value={docState.document_number}
                                    onChange={(e) => setDocState((prev) => ({ ...prev, document_number: e.target.value }))}
                                    className="mt-1 flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground"
                                    placeholder="Ej: F123-456"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Proveedor</label>
                                <div className="mt-1">
                                    <ProviderCombobox
                                        items={providers}
                                        value={docState.provider_id}
                                        newItemName={docState.newProviderName}
                                        onChange={(id, newName) => setDocState(prev => ({ ...prev, provider_id: id, newProviderName: newName }))}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Local</label>
                                <select
                                    value={docState.venue_id ?? ''}
                                    onChange={(e) => setDocState((prev) => ({ ...prev, venue_id: e.target.value || null }))}
                                    className="mt-1 flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                >
                                    <option value="">Sede Central / Todos los locales</option>
                                    {venues.map(v => (
                                        <option key={v.id} value={v.id}>{v.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="col-span-2">
                                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Fecha de Emisión</label>
                                <input
                                    type="date"
                                    value={docState.document_date}
                                    onChange={(e) => setDocState((prev) => ({ ...prev, document_date: e.target.value }))}
                                    className="mt-1 flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                />
                            </div>

                            {docState.doc_type === 'presupuesto' && (
                                <div className="col-span-2 flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-900 dark:bg-amber-950/40">
                                    <div>
                                        <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                                            Activar precios para escandallos
                                        </p>
                                        <p className="text-xs text-amber-700 dark:text-amber-400">
                                            Activá esto solo si los precios de este presupuesto son los que va a
                                            aplicar tu proveedor habitual. Las cotizaciones de evaluación déjalas desactivadas.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={docState.activate_prices}
                                        onClick={() => setDocState(prev => ({ ...prev, activate_prices: !prev.activate_prices }))}
                                        className={`relative ml-4 inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${docState.activate_prices ? 'bg-amber-500' : 'bg-input'}`}
                                    >
                                        <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transition-transform ${docState.activate_prices ? 'translate-x-5' : 'translate-x-0'}`} />
                                    </button>
                                </div>
                            )}

                            <div className="col-span-2 mt-2 pt-2 border-t border-border flex justify-end">
                                <div className="text-right w-full sm:w-1/2">
                                    <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total a pagar</dt>
                                    <dd className="mt-1">
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={displayTotalAmount ? parseFloat(displayTotalAmount.toFixed(2)) : ''}
                                                onChange={(e) => setDocState((prev) => ({ ...prev, total_amount: Number(e.target.value) }))}
                                                disabled={docState.doc_type === 'presupuesto'}
                                                className={`h-9 w-full rounded-md border pl-7 pr-3 text-right text-base font-bold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${isMismatch ? 'border-orange-400 text-orange-600 focus-visible:ring-orange-400' : 'border-input text-primary disabled:opacity-70 disabled:bg-muted/50'}`}
                                            />
                                        </div>
                                    </dd>
                                </div>
                            </div>
                        </dl>
                    </div>

                    {/* Card 2: Líneas de Compra */}
                    <div className="bg-white dark:bg-card border rounded-xl shadow-sm flex flex-col">
                        <div className="px-4 sm:px-5 py-3 border-b">
                            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                                Líneas de Compra ({lines.length})
                            </h2>
                        </div>

                        <div className="p-4 sm:p-5 bg-slate-50/50">
                            {lines.length === 0 && (
                                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                                    Este documento no tiene líneas de compra registradas.
                                </p>
                            )}

                            <div className="space-y-2">
                                {pendingLines.map((line) => {
                                    const state = lineStates[line.id]
                                    const isNew = state.selectedId === '__new__'
                                    const isMapped = !!line.master_item_id

                                    // Clasificación ternaria basada en review_status + review_reasons del JSONB
                                    const reviewStatus = line.review_status
                                    const reviewReasons: string[] = (line.ai_interpretation?.review_reasons as string[]) ?? []
                                    const isAutoApproved = reviewStatus === 'auto_approved'
                                    const isPendingPrice = reviewStatus === 'pending_review' && reviewReasons.includes('low_price_confidence')
                                    const isPendingNew = reviewStatus === 'pending_review' && reviewReasons.includes('new_product')
                                    // Fallback para líneas sin review_status (documentos anteriores al nuevo sistema)
                                    const isLegacyMapped = !reviewStatus && isMapped
                                    const isLegacyUnmapped = !reviewStatus && !isMapped
                                    const isManuallySkipped = reviewStatus === 'pending_review' && state.selectedId === null

                                    // Price variation vs last recorded price for this provider
                                    const lastPrice = isMapped && line.master_item_id ? priceHistory[line.master_item_id] : undefined
                                    const priceDelta = (isMapped && lastPrice != null && lastPrice > 0 && state.unit_price != null)
                                        ? ((state.unit_price - lastPrice) / lastPrice) * 100
                                        : null
                                    const showPriceAlert = priceDelta !== null && Math.abs(priceDelta) >= 0.5

                                    return (
                                        <div
                                            key={line.id}
                                            className="rounded-lg border transition-all duration-200"
                                            style={
                                                isManuallySkipped
                                                    ? { borderColor: '#94a3b8', borderWidth: '0.5px', backgroundColor: '#f8fafc' }
                                                    : isAutoApproved || isLegacyMapped
                                                    ? { borderColor: '#3B6D11', borderWidth: '0.5px', backgroundColor: '#ffffff' }
                                                    : isPendingPrice
                                                    ? { borderColor: '#BA7517', borderWidth: '1.5px', backgroundColor: '#FEF3C7' }
                                                    : { borderColor: '#BA7517', borderWidth: '1.5px', backgroundColor: '#FAEEDA' }
                                            }
                                        >
                                            {/* Line header */}
                                            <button
                                                type="button"
                                                onClick={() => toggleExpand(line.id)}
                                                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-black/5"
                                            >
                                                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                                                    {isManuallySkipped
                                                        ? null
                                                        : isAutoApproved || isLegacyMapped
                                                        ? <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: '#3B6D11' }} />
                                                        : <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: '#BA7517' }} />
                                                    }
                                                    <span className="min-w-0 truncate text-sm font-medium" title={line.raw_name || 'Producto sin identificar'} style={isManuallySkipped ? { color: '#94a3b8' } : (!isMapped ? { color: '#412402' } : undefined)}>
                                                        {line.raw_name || <span className="italic text-muted-foreground">Producto sin identificar</span>}
                                                    </span>
                                                </div>
                                                <div className="flex shrink-0 items-center gap-4">
                                                    {showPriceAlert && (
                                                        <span className="text-xs font-semibold tabular-nums" style={{ color: priceDelta! > 0 ? '#dc2626' : '#16a34a' }}>
                                                            {priceDelta! > 0 ? '▲' : '▼'} {Math.abs(priceDelta!).toFixed(1)}%
                                                        </span>
                                                    )}
                                                    <span className="text-xs text-muted-foreground">×{state.quantity}</span>
                                                    {state.unit_price != null && (
                                                        <span className="text-xs text-muted-foreground">${state.unit_price.toFixed(2)}/u</span>
                                                    )}
                                                    <span className="text-sm font-semibold">${((state.quantity || 0) * (state.unit_price || 0)).toFixed(2)}</span>
                                                    {state.expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                                                </div>
                                            </button>

                                            {/* Expanded body */}
                                            {state.expanded && (
                                                <div className="border-t border-current/10 px-4 py-3 space-y-3 bg-white rounded-b-lg">
                                                    <div className="grid grid-cols-3 gap-4 text-sm bg-accent/30 rounded-md p-3 border border-border/50">
                                                        <div>
                                                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Cantidad</label>
                                                            <input
                                                                type="number"
                                                                step="any"
                                                                min="0"
                                                                value={state.quantity || ''}
                                                                onChange={(e) => updateLine(line.id, { quantity: Number(e.target.value) })}
                                                                className="mt-1.5 flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Precio/u ($)</label>
                                                            <input
                                                                type="number"
                                                                step="any"
                                                                min="0"
                                                                value={state.unit_price ?? ''}
                                                                onChange={(e) => updateLine(line.id, { unit_price: e.target.value ? Number(e.target.value) : null })}
                                                                className="mt-1.5 flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                            />
                                                        </div>
                                                        <div className="flex flex-col justify-end">
                                                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Total línea</label>
                                                            <p className="flex h-8 items-center font-bold text-primary px-1">
                                                                ${((state.quantity || 0) * (state.unit_price || 0)).toFixed(2)}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {!line.master_item_id && line.ai_interpretation?.producto_normalizado && (
                                                        <p className="flex items-center gap-1.5 text-xs text-violet-600 dark:text-violet-400">
                                                            <span>✨</span>
                                                            <span>Campos pre-rellenados con sugerencia IA — edita si es necesario.</span>
                                                        </p>
                                                    )}

                                                    <div>
                                                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                                            Producto maestro
                                                        </label>
                                                        {isPendingPrice && !state.overrideAssociation ? (
                                                            <div className="flex items-center justify-between rounded-md border border-green-200 bg-green-50 px-3 py-2 dark:border-green-900 dark:bg-green-950/30">
                                                                <span className="text-sm text-green-800 dark:text-green-200 font-medium">
                                                                    {line.erp_master_items?.official_name ?? state.newItemName ?? '—'}
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => updateLine(line.id, { overrideAssociation: true })}
                                                                    className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline ml-3 shrink-0 transition-colors"
                                                                >
                                                                    ¿Asociación incorrecta?
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <CreatableCombobox
                                                                    items={masterItems}
                                                                    value={state.selectedId}
                                                                    newItemName={state.newItemName}
                                                                    onChange={(id, newName) => updateLine(line.id, { selectedId: id, newItemName: newName })}
                                                                />
                                                                {state.selectedId === '__new__' && (
                                                                    <div className="mt-3 p-3 bg-blue-50/50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 rounded-md">
                                                                        <p className="mb-2 text-xs font-medium text-blue-700 dark:text-blue-400">
                                                                            Se creará en el catálogo maestro. Verifica o corrige:
                                                                        </p>
                                                                        <div className="space-y-3">
                                                                            <div>
                                                                                <label className="text-[10px] font-semibold text-blue-600/70 dark:text-blue-400/70 uppercase">Nombre</label>
                                                                                <input
                                                                                    type="text"
                                                                                    value={state.newItemName}
                                                                                    onChange={(e) => updateLine(line.id, { newItemName: e.target.value })}
                                                                                    className="mt-1 block w-full h-7 rounded-sm border-blue-200 dark:border-blue-800 bg-white dark:bg-card px-2 text-xs text-blue-900 dark:text-blue-100 placeholder:text-blue-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
                                                                                    placeholder="Ej: Carne picada"
                                                                                />
                                                                            </div>
                                                                            <div className="grid grid-cols-2 gap-3">
                                                                                <div>
                                                                                    <label className="text-[10px] font-semibold text-blue-600/70 dark:text-blue-400/70 uppercase">Categoría</label>
                                                                                    <select
                                                                                        value={state.newItemCategory}
                                                                                        onChange={(e) => updateLine(line.id, { newItemCategory: e.target.value })}
                                                                                        className="mt-1 block w-full h-7 rounded-sm border-blue-200 dark:border-blue-800 bg-white dark:bg-card px-2 text-xs text-blue-900 dark:text-blue-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
                                                                                    >
                                                                                        <option value="">— Seleccionar —</option>
                                                                                        {PRODUCT_CATEGORIES.map((cat) => (
                                                                                            <option key={cat} value={cat}>{cat}</option>
                                                                                        ))}
                                                                                    </select>
                                                                                </div>
                                                                                <div>
                                                                                    <label className="text-[10px] font-semibold text-blue-600/70 dark:text-blue-400/70 uppercase">Unidad Base</label>
                                                                                    <select
                                                                                        value={state.newItemBaseUnit}
                                                                                        onChange={(e) => updateLine(line.id, { newItemBaseUnit: e.target.value })}
                                                                                        className="mt-1 block w-full h-7 rounded-sm border-blue-200 dark:border-blue-800 bg-white dark:bg-card px-2 text-xs text-blue-900 dark:text-blue-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
                                                                                    >
                                                                                        {BASE_UNITS.map((unit) => (
                                                                                            <option key={unit} value={unit}>{unit}</option>
                                                                                        ))}
                                                                                    </select>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>

                                                    {(isPendingNew || isLegacyUnmapped || isNew) && (
                                                        <div className="grid grid-cols-3 gap-3 rounded-md bg-secondary/30 p-3 mt-1">
                                                            <div>
                                                                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Formato de compra <FieldTooltip text="Formato en que se compra. Ej: 'Caja' si comprás cajas cerradas, 'Barril' si comprás un barril, 'Unidad' si comprás pieza a pieza." /></label>
                                                                <select
                                                                    value={state.formato_compra}
                                                                    onChange={(e) => updateLine(line.id, { formato_compra: e.target.value })}
                                                                    className="mt-1.5 flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                                >
                                                                    {FORMATOS_COMPRA.map(opt => (
                                                                        <option key={opt} value={opt}>{opt}</option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                            <div>
                                                                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Envases por formato <FieldTooltip text="Cuántas unidades trae ese bulto. Ej: una caja de Heineken trae 24 botellas → 24. Un barril → 1." /></label>
                                                                <input
                                                                    type="number"
                                                                    step="any"
                                                                    min="0"
                                                                    value={state.envases_por_formato}
                                                                    onChange={(e) => updateLine(line.id, { envases_por_formato: Number(e.target.value) })}
                                                                    className="mt-1.5 flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contenido por envase <FieldTooltip text="Volumen o peso de CADA unidad individual. Ej: botella Heineken 1/3 → 333 (ml). Kg de queso → 1000 (g). Pieza indivisible → 1 (ud)." /></label>
                                                                <input
                                                                    type="number"
                                                                    step="any"
                                                                    min="0"
                                                                    value={state.contenido_por_envase}
                                                                    onChange={(e) => updateLine(line.id, { contenido_por_envase: Number(e.target.value) })}
                                                                    className="mt-1.5 flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                                />
                                                            </div>
                                                        </div>
                                                    )}

                                                <div className="flex items-center justify-between rounded-md border border-border/50 bg-accent/20 px-3 py-2">
                                                    <div>
                                                        <p className="text-xs font-medium text-foreground">Proveedor preferido para este producto</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {isMapped && !isPendingNew
                                                                ? 'Al activar, el proveedor anterior perderá este estado para este producto.'
                                                                : 'Al ser producto nuevo, queda como proveedor preferido por defecto.'}
                                                        </p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        role="switch"
                                                        aria-checked={state.is_preferred}
                                                        onClick={() => updateLine(line.id, { is_preferred: !state.is_preferred })}
                                                        className={`relative ml-4 inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${state.is_preferred ? 'bg-green-500' : 'bg-input'}`}
                                                    >
                                                        <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${state.is_preferred ? 'translate-x-4' : 'translate-x-0'}`} />
                                                    </button>
                                                </div>

                                                {(isPendingPrice || isPendingNew || isLegacyUnmapped) && (
                                                    <div className="flex justify-end pt-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => updateLine(line.id, { selectedId: null, is_preferred: false })}
                                                            className="text-xs text-muted-foreground underline-offset-2 hover:underline hover:text-foreground transition-colors"
                                                        >
                                                            Saltar por ahora
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}

                            {approvedLines.length > 0 && (
                                    <div className="mt-3">
                                        <button
                                            type="button"
                                            onClick={() => setAutoApprovedExpanded(prev => !prev)}
                                            className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-accent/50"
                                        >
                                            <span className="flex items-center gap-2">
                                                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                                                {approvedLines.length} producto{approvedLines.length !== 1 ? 's' : ''} aprobado{approvedLines.length !== 1 ? 's' : ''} automáticamente
                                                <span
                                                    title="Estos productos fueron reconocidos por el sistema con alta confianza y no requieren revisión manual."
                                                    className="cursor-help text-muted-foreground/60 hover:text-muted-foreground"
                                                >ⓘ</span>
                                            </span>
                                            {autoApprovedExpanded
                                                ? <ChevronUp className="h-3.5 w-3.5" />
                                                : <ChevronDown className="h-3.5 w-3.5" />
                                            }
                                        </button>

                                        {autoApprovedExpanded && (
                                            <div className="mt-1 space-y-2">
                                                {approvedLines.map((line) => {
                                                    const state = lineStates[line.id]
                                                    const isNew = state.selectedId === '__new__'
                                                    const isMapped = !!line.master_item_id

                                                    const reviewStatus = line.review_status
                                                    const reviewReasons: string[] = (line.ai_interpretation?.review_reasons as string[]) ?? []
                                                    const isAutoApproved = reviewStatus === 'auto_approved'
                                                    const isPendingPrice = reviewStatus === 'pending_review' && reviewReasons.includes('low_price_confidence')
                                                    const isPendingNew = reviewStatus === 'pending_review' && reviewReasons.includes('new_product')
                                                    const isLegacyMapped = !reviewStatus && isMapped
                                                    const isLegacyUnmapped = !reviewStatus && !isMapped
                                                    const isManuallySkipped = reviewStatus === 'pending_review' && state.selectedId === null

                                                    const lastPrice = isMapped && line.master_item_id ? priceHistory[line.master_item_id] : undefined
                                                    const priceDelta = (isMapped && lastPrice != null && lastPrice > 0 && state.unit_price != null)
                                                        ? ((state.unit_price - lastPrice) / lastPrice) * 100
                                                        : null
                                                    const showPriceAlert = priceDelta !== null && Math.abs(priceDelta) >= 0.5

                                                    return (
                                                        <div
                                                            key={line.id}
                                                            className="rounded-lg border transition-all duration-200"
                                                            style={
                                                                isManuallySkipped
                                                                    ? { borderColor: '#94a3b8', borderWidth: '0.5px', backgroundColor: '#f8fafc' }
                                                                    : isAutoApproved || isLegacyMapped
                                                                    ? { borderColor: '#3B6D11', borderWidth: '0.5px', backgroundColor: '#ffffff' }
                                                                    : isPendingPrice
                                                                    ? { borderColor: '#BA7517', borderWidth: '1.5px', backgroundColor: '#FEF3C7' }
                                                                    : { borderColor: '#BA7517', borderWidth: '1.5px', backgroundColor: '#FAEEDA' }
                                                            }
                                                        >
                                                            <button
                                                                type="button"
                                                                onClick={() => toggleExpand(line.id)}
                                                                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-black/5"
                                                            >
                                                                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                                                                    {isManuallySkipped
                                                                        ? null
                                                                        : isAutoApproved || isLegacyMapped
                                                                        ? <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: '#3B6D11' }} />
                                                                        : <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: '#BA7517' }} />
                                                                    }
                                                                    <span className="min-w-0 truncate text-sm font-medium" title={line.raw_name || 'Producto sin identificar'} style={isManuallySkipped ? { color: '#94a3b8' } : (!isMapped ? { color: '#412402' } : undefined)}>
                                                                        {line.raw_name || <span className="italic text-muted-foreground">Producto sin identificar</span>}
                                                                    </span>
                                                                </div>
                                                                <div className="flex shrink-0 items-center gap-4">
                                                                    {showPriceAlert && (
                                                                        <span className="text-xs font-semibold tabular-nums" style={{ color: priceDelta! > 0 ? '#dc2626' : '#16a34a' }}>
                                                                            {priceDelta! > 0 ? '▲' : '▼'} {Math.abs(priceDelta!).toFixed(1)}%
                                                                        </span>
                                                                    )}
                                                                    <span className="text-xs text-muted-foreground">×{state.quantity}</span>
                                                                    {state.unit_price != null && (
                                                                        <span className="text-xs text-muted-foreground">${state.unit_price.toFixed(2)}/u</span>
                                                                    )}
                                                                    <span className="text-sm font-semibold">${((state.quantity || 0) * (state.unit_price || 0)).toFixed(2)}</span>
                                                                    {state.expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                                                                </div>
                                                            </button>

                                                            {state.expanded && (
                                                                <div className="border-t border-current/10 px-4 py-3 space-y-3 bg-white rounded-b-lg">
                                                                    <div className="grid grid-cols-3 gap-4 text-sm bg-accent/30 rounded-md p-3 border border-border/50">
                                                                        <div>
                                                                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Cantidad</label>
                                                                            <input
                                                                                type="number"
                                                                                step="any"
                                                                                min="0"
                                                                                value={state.quantity || ''}
                                                                                onChange={(e) => updateLine(line.id, { quantity: Number(e.target.value) })}
                                                                                className="mt-1.5 flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                                            />
                                                                        </div>
                                                                        <div>
                                                                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Precio/u ($)</label>
                                                                            <input
                                                                                type="number"
                                                                                step="any"
                                                                                min="0"
                                                                                value={state.unit_price ?? ''}
                                                                                onChange={(e) => updateLine(line.id, { unit_price: e.target.value ? Number(e.target.value) : null })}
                                                                                className="mt-1.5 flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                                            />
                                                                        </div>
                                                                        <div className="flex flex-col justify-end">
                                                                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Total línea</label>
                                                                            <p className="flex h-8 items-center font-bold text-primary px-1">
                                                                                ${((state.quantity || 0) * (state.unit_price || 0)).toFixed(2)}
                                                                            </p>
                                                                        </div>
                                                                    </div>

                                                                    {!line.master_item_id && line.ai_interpretation?.producto_normalizado && (
                                                                        <p className="flex items-center gap-1.5 text-xs text-violet-600 dark:text-violet-400">
                                                                            <span>✨</span>
                                                                            <span>Campos pre-rellenados con sugerencia IA — edita si es necesario.</span>
                                                                        </p>
                                                                    )}

                                                                    <div>
                                                                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                                                            Producto maestro
                                                                        </label>
                                                                        <CreatableCombobox
                                                                            items={masterItems}
                                                                            value={state.selectedId}
                                                                            newItemName={state.newItemName}
                                                                            onChange={(id, newName) => updateLine(line.id, { selectedId: id, newItemName: newName })}
                                                                        />
                                                                        {state.selectedId === '__new__' && (
                                                                            <div className="mt-3 p-3 bg-blue-50/50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 rounded-md">
                                                                                <p className="mb-2 text-xs font-medium text-blue-700 dark:text-blue-400">
                                                                                    Se creará en el catálogo maestro. Verifica o corrige:
                                                                                </p>
                                                                                <div className="space-y-3">
                                                                                    <div>
                                                                                        <label className="text-[10px] font-semibold text-blue-600/70 dark:text-blue-400/70 uppercase">Nombre</label>
                                                                                        <input
                                                                                            type="text"
                                                                                            value={state.newItemName}
                                                                                            onChange={(e) => updateLine(line.id, { newItemName: e.target.value })}
                                                                                            className="mt-1 block w-full h-7 rounded-sm border-blue-200 dark:border-blue-800 bg-white dark:bg-card px-2 text-xs text-blue-900 dark:text-blue-100 placeholder:text-blue-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
                                                                                            placeholder="Ej: Carne picada"
                                                                                        />
                                                                                    </div>
                                                                                    <div className="grid grid-cols-2 gap-3">
                                                                                        <div>
                                                                                            <label className="text-[10px] font-semibold text-blue-600/70 dark:text-blue-400/70 uppercase">Categoría</label>
                                                                                            <select
                                                                                                value={state.newItemCategory}
                                                                                                onChange={(e) => updateLine(line.id, { newItemCategory: e.target.value })}
                                                                                                className="mt-1 block w-full h-7 rounded-sm border-blue-200 dark:border-blue-800 bg-white dark:bg-card px-2 text-xs text-blue-900 dark:text-blue-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
                                                                                            >
                                                                                                <option value="">— Seleccionar —</option>
                                                                                                {PRODUCT_CATEGORIES.map((cat) => (
                                                                                                    <option key={cat} value={cat}>{cat}</option>
                                                                                                ))}
                                                                                            </select>
                                                                                        </div>
                                                                                        <div>
                                                                                            <label className="text-[10px] font-semibold text-blue-600/70 dark:text-blue-400/70 uppercase">Unidad Base</label>
                                                                                            <select
                                                                                                value={state.newItemBaseUnit}
                                                                                                onChange={(e) => updateLine(line.id, { newItemBaseUnit: e.target.value })}
                                                                                                className="mt-1 block w-full h-7 rounded-sm border-blue-200 dark:border-blue-800 bg-white dark:bg-card px-2 text-xs text-blue-900 dark:text-blue-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
                                                                                            >
                                                                                                {BASE_UNITS.map((unit) => (
                                                                                                    <option key={unit} value={unit}>{unit}</option>
                                                                                                ))}
                                                                                            </select>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    {(isPendingNew || isLegacyUnmapped || isNew) && (
                                                                        <div className="grid grid-cols-3 gap-3 rounded-md bg-secondary/30 p-3 mt-1">
                                                                            <div>
                                                                                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Formato de compra <FieldTooltip text="Formato en que se compra. Ej: 'Caja' si comprás cajas cerradas, 'Barril' si comprás un barril, 'Unidad' si comprás pieza a pieza." /></label>
                                                                                <select
                                                                                    value={state.formato_compra}
                                                                                    onChange={(e) => updateLine(line.id, { formato_compra: e.target.value })}
                                                                                    className="mt-1.5 flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                                                >
                                                                                    {FORMATOS_COMPRA.map(opt => (
                                                                                        <option key={opt} value={opt}>{opt}</option>
                                                                                    ))}
                                                                                </select>
                                                                            </div>
                                                                            <div>
                                                                                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Envases por formato <FieldTooltip text="Cuántas unidades trae ese bulto. Ej: una caja de Heineken trae 24 botellas → 24. Un barril → 1." /></label>
                                                                                <input
                                                                                    type="number"
                                                                                    step="any"
                                                                                    min="0"
                                                                                    value={state.envases_por_formato}
                                                                                    onChange={(e) => updateLine(line.id, { envases_por_formato: Number(e.target.value) })}
                                                                                    className="mt-1.5 flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                                                />
                                                                            </div>
                                                                            <div>
                                                                                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contenido por envase <FieldTooltip text="Volumen o peso de CADA unidad individual. Ej: botella Heineken 1/3 → 333 (ml). Kg de queso → 1000 (g). Pieza indivisible → 1 (ud)." /></label>
                                                                                <input
                                                                                    type="number"
                                                                                    step="any"
                                                                                    min="0"
                                                                                    value={state.contenido_por_envase}
                                                                                    onChange={(e) => updateLine(line.id, { contenido_por_envase: Number(e.target.value) })}
                                                                                    className="mt-1.5 flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                <div className="flex items-center justify-between rounded-md border border-border/50 bg-accent/20 px-3 py-2">
                                                                    <div>
                                                                        <p className="text-xs font-medium text-foreground">Proveedor preferido para este producto</p>
                                                                        <p className="text-xs text-muted-foreground">
                                                                            {isMapped && !isPendingNew
                                                                                ? 'Al activar, el proveedor anterior perderá este estado para este producto.'
                                                                                : 'Al ser producto nuevo, queda como proveedor preferido por defecto.'}
                                                                        </p>
                                                                    </div>
                                                                    <button
                                                                        type="button"
                                                                        role="switch"
                                                                        aria-checked={state.is_preferred}
                                                                        onClick={() => updateLine(line.id, { is_preferred: !state.is_preferred })}
                                                                        className={`relative ml-4 inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${state.is_preferred ? 'bg-green-500' : 'bg-input'}`}
                                                                    >
                                                                        <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${state.is_preferred ? 'translate-x-4' : 'translate-x-0'}`} />
                                                                    </button>
                                                                </div>

                                                                {(isPendingPrice || isPendingNew || isLegacyUnmapped) && (
                                                                    <div className="flex justify-end pt-1">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => updateLine(line.id, { selectedId: null, is_preferred: false })}
                                                                            className="text-xs text-muted-foreground underline-offset-2 hover:underline hover:text-foreground transition-colors"
                                                                        >
                                                                            Saltar por ahora
                                                                        </button>
                                                                    </div>
                                                                )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Approve button */}
                        <div className="p-4 border-t bg-white dark:bg-card rounded-b-xl shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                            <button
                                type="button"
                                onClick={() => {
                                    const newValue = !allMarkedPreferred
                                    setAllMarkedPreferred(newValue)
                                    setLineStates(prev => {
                                        const next = { ...prev }
                                        for (const line of lines) {
                                            next[line.id] = { ...next[line.id], is_preferred: newValue }
                                        }
                                        return next
                                    })
                                }}
                                className={`w-full mb-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                                    allMarkedPreferred
                                        ? 'border-green-400 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-950/40 dark:text-green-300'
                                        : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
                                }`}
                            >
                                {allMarkedPreferred
                                    ? '✓ Todos marcados como preferidos — click para desmarcar'
                                    : 'Marcar todos como proveedor preferido'}
                            </button>
                            <Button
                                onClick={handleApprove}
                                disabled={isSubmitting}
                                size="lg"
                                className="w-full gap-2 text-sm font-semibold"
                            >
                                {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCheck className="h-5 w-5" />}
                                {isSubmitting ? 'Procesando...' : 'Aprobar Documento'}
                            </Button>
                            {showDuplicateToast && (
                                <p className="mt-2 text-center text-xs font-medium text-red-600">
                                    Documento duplicado — revisá la parte superior
                                </p>
                            )}
                            <p className="mt-2 text-center text-xs text-muted-foreground">
                                {mappedCount < totalCount
                                    ? `⚠️ ${totalCount - mappedCount} línea(s) todavía sin mapear`
                                    : '✅ Todas las líneas están mapeadas'}
                            </p>
                        </div>
                    </div>

                </div>
            </div>

            {/* ── Mismatch confirmation modal ── */}
            {showMismatchModal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                    onClick={() => setShowMismatchModal(false)}
                >
                    <div
                        className="bg-white dark:bg-card rounded-xl shadow-xl max-w-sm w-full p-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start gap-3 mb-4">
                            <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
                            <div>
                                <h3 className="font-semibold text-foreground">Descuadre en el total</h3>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    La suma de las líneas difiere del total ingresado en{' '}
                                    <strong className="text-orange-600">
                                        ${mismatchAmount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </strong>
                                    . ¿Querés corregirlo antes de guardar?
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-3 justify-end">
                            <Button variant="outline" onClick={() => setShowMismatchModal(false)}>
                                Corregir
                            </Button>
                            <Button
                                className="bg-orange-500 hover:bg-orange-600 text-white"
                                onClick={() => { setShowMismatchModal(false); buildAndSubmit() }}
                            >
                                Guardar igual
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Fixed mismatch banner ── */}
            {isMismatch && (
                <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 shadow-lg dark:border-orange-900 dark:bg-orange-950/80 max-w-lg w-[calc(100%-2rem)] pointer-events-none">
                    <AlertTriangle className="h-5 w-5 shrink-0 text-orange-500" />
                    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-sm leading-tight">
                        <span className="font-semibold text-orange-800 dark:text-orange-200">Descuadre contable:</span>
                        <span className="text-orange-700 dark:text-orange-300">
                            suma de líneas <strong>${sumOfLines.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                            {' '}vs{' '}
                            <strong>${docState.total_amount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> ingresado
                        </span>
                        <span className="font-bold text-orange-500">
                            (Δ ${Math.abs(sumOfLines - docState.total_amount).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                        </span>
                    </div>
                </div>
            )}
        </div>
    )
}
