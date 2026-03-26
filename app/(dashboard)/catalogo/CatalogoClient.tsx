'use client'

import { Fragment, useRef, useState, useTransition } from 'react'
import { ChevronDown, ChevronRight, Search, ShoppingBasket, X, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { PRODUCT_CATEGORIES } from '@/lib/constants'
import { clearPreferredProvider, setPreferredProvider } from '@/app/actions/catalogo'
import ItemEditDrawer from '@/components/catalog/ItemEditDrawer'
import type { CatalogoItem } from './page'

type FilterPreferred = 'all' | 'with' | 'without'

type ToastState = {
    masterItemId: string
    previousPreferredId: string | null
}

export default function CatalogoClient({ items: initial }: { items: CatalogoItem[] }) {
    const [items, setItems] = useState(initial)
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
    const [search, setSearch] = useState('')
    const [category, setCategory] = useState('')
    const [filterPreferred, setFilterPreferred] = useState<FilterPreferred>('all')
    const [toast, setToast] = useState<ToastState | null>(null)
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [, startTransition] = useTransition()
    const [editingItemId, setEditingItemId] = useState<string | null>(null)

    function toggleExpand(id: string) {
        setExpandedIds((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    function showToast(masterItemId: string, previousPreferredId: string | null) {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
        setToast({ masterItemId, previousPreferredId })
        toastTimerRef.current = setTimeout(() => {
            setToast(null)
            toastTimerRef.current = null
        }, 5000)
    }

    function dismissToast() {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
        setToast(null)
    }

    function handleUndo() {
        if (!toast) return
        const { masterItemId, previousPreferredId } = toast
        dismissToast()

        if (previousPreferredId) {
            // Restore previous preferred provider
            setItems((prev) =>
                prev.map((item) => {
                    if (item.id !== masterItemId) return item
                    return {
                        ...item,
                        offers: item.offers.map((o) => ({
                            ...o,
                            isPreferred: o.id === previousPreferredId,
                        })),
                    }
                }),
            )
            startTransition(async () => {
                try {
                    await setPreferredProvider(previousPreferredId, masterItemId)
                } catch { /* ignore — optimistic state is best effort */ }
            })
        } else {
            // No previous preferred: clear all
            setItems((prev) =>
                prev.map((item) => {
                    if (item.id !== masterItemId) return item
                    return {
                        ...item,
                        offers: item.offers.map((o) => ({ ...o, isPreferred: false })),
                    }
                }),
            )
            startTransition(async () => {
                try {
                    await clearPreferredProvider(masterItemId)
                } catch { /* ignore */ }
            })
        }
    }

    function handleSetPreferred(masterItemId: string, priceHistoryId: string) {
        // Capture previous preferred before any update
        const currentItem = items.find((i) => i.id === masterItemId)
        const previousPreferredId = currentItem?.offers.find((o) => o.isPreferred)?.id ?? null

        // Optimistic update
        setItems((prev) =>
            prev.map((item) => {
                if (item.id !== masterItemId) return item
                return {
                    ...item,
                    offers: item.offers.map((o) => ({ ...o, isPreferred: o.id === priceHistoryId })),
                }
            }),
        )

        startTransition(async () => {
            try {
                await setPreferredProvider(priceHistoryId, masterItemId)
                showToast(masterItemId, previousPreferredId)
            } catch {
                // Revert optimistic update on failure
                setItems((prev) =>
                    prev.map((item) => {
                        if (item.id !== masterItemId) return item
                        return {
                            ...item,
                            offers: item.offers.map((o) => ({
                                ...o,
                                isPreferred: o.id === previousPreferredId,
                            })),
                        }
                    }),
                )
            }
        })
    }

    const filtered = items.filter((item) => {
        const matchSearch = item.officialName.toLowerCase().includes(search.toLowerCase())
        const matchCategory = !category || item.category === category
        const hasPreferred = item.offers.some((o) => o.isPreferred)
        const matchPreferred =
            filterPreferred === 'all' ? true : filterPreferred === 'with' ? hasPreferred : !hasPreferred
        return matchSearch && matchCategory && matchPreferred
    })

    return (
        <>
            {/* Filters */}
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Buscar producto..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                </div>
                <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                    <option value="">Todas las categorías</option>
                    {PRODUCT_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                            {c}
                        </option>
                    ))}
                </select>
                <div className="flex items-center gap-1 rounded-lg border border-border bg-muted p-1">
                    {(['all', 'with', 'without'] as FilterPreferred[]).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilterPreferred(f)}
                            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${filterPreferred === f ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            {f === 'all' ? 'Todos' : f === 'with' ? 'Con preferido' : 'Sin preferido'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Meta */}
            <p className="text-sm text-muted-foreground">
                {filtered.length} producto{filtered.length !== 1 ? 's' : ''}
            </p>

            {/* Table */}
            {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-20 text-center">
                    <ShoppingBasket className="h-12 w-12 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">No se encontraron productos.</p>
                </div>
            ) : (
                <div className="rounded-lg border border-border bg-card overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border">
                                <th className="w-8 px-3 py-3" />
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                    Producto
                                </th>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                    Categoría
                                </th>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                    Proveedor preferido
                                </th>
                                <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                                    Último precio
                                </th>
                                <th className="px-4 py-3 w-10" />
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((item) => {
                                const expanded = expandedIds.has(item.id)
                                const preferred = item.offers.find((o) => o.isPreferred)
                                // Most recent offer by effective_date (offers already sorted desc from server)
                                const latestOffer = item.offers[0] ?? null
                                const displayOffer = preferred ?? latestOffer

                                return (
                                    <Fragment key={item.id}>
                                        {/* Main row */}
                                        <tr
                                            onClick={() =>
                                                item.offers.length > 0 && toggleExpand(item.id)
                                            }
                                            className={`border-b border-border transition-colors ${item.offers.length > 0 ? 'cursor-pointer hover:bg-accent/40' : ''} ${expanded ? 'bg-accent/20' : ''}`}
                                        >
                                            <td className="px-3 py-3 text-muted-foreground">
                                                {item.offers.length > 0 ? (
                                                    expanded ? (
                                                        <ChevronDown className="h-4 w-4" />
                                                    ) : (
                                                        <ChevronRight className="h-4 w-4" />
                                                    )
                                                ) : null}
                                            </td>
                                            <td className="px-4 py-3 font-medium">
                                                {item.officialName}
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground">
                                                {item.category ?? '—'}
                                            </td>
                                            <td className="px-4 py-3">
                                                {preferred ? (
                                                    <span className="font-medium">
                                                        {preferred.providerName}
                                                    </span>
                                                ) : (
                                                    <Badge
                                                        variant="outline"
                                                        className="border-yellow-400 bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300"
                                                    >
                                                        Sin definir
                                                    </Badge>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {displayOffer ? (
                                                    <span
                                                        className={
                                                            preferred
                                                                ? 'font-medium'
                                                                : 'text-muted-foreground'
                                                        }
                                                    >
                                                        $
                                                        {displayOffer.unitPrice.toLocaleString(
                                                            'es-ES',
                                                            { minimumFractionDigits: 2 },
                                                        )}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground/50">
                                                        —
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        setEditingItemId(item.id)
                                                    }}
                                                    aria-label={`Editar ${item.officialName}`}
                                                    className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </button>
                                            </td>
                                        </tr>

                                        {/* Expanded sub-rows */}
                                        {expanded &&
                                            item.offers.map((offer) => (
                                                <tr
                                                    key={offer.id}
                                                    className="border-b border-border last:border-0 bg-muted/30"
                                                >
                                                    <td className="px-3 py-2.5" />
                                                    <td colSpan={5} className="px-4 py-2.5">
                                                        <label className="flex items-center gap-4 cursor-pointer">
                                                            <input
                                                                type="radio"
                                                                name={`preferred-${item.id}`}
                                                                checked={offer.isPreferred}
                                                                onChange={() =>
                                                                    handleSetPreferred(
                                                                        item.id,
                                                                        offer.id,
                                                                    )
                                                                }
                                                                className="h-4 w-4 accent-primary shrink-0"
                                                            />
                                                            <span className="font-medium flex-1">
                                                                {offer.providerName}
                                                            </span>
                                                            {offer.isPreferred && (
                                                                <Badge
                                                                    variant="outline"
                                                                    className="border-green-400 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                                                                >
                                                                    Preferido
                                                                </Badge>
                                                            )}
                                                            <span className="font-medium tabular-nums">
                                                                $
                                                                {offer.unitPrice.toLocaleString(
                                                                    'es-ES',
                                                                    { minimumFractionDigits: 2 },
                                                                )}
                                                            </span>
                                                            <span className="text-xs text-muted-foreground w-28 text-right">
                                                                {offer.effectiveDate
                                                                    ? new Date(
                                                                          offer.effectiveDate,
                                                                      ).toLocaleDateString('es-ES', {
                                                                          day: '2-digit',
                                                                          month: 'short',
                                                                          year: 'numeric',
                                                                      })
                                                                    : '—'}
                                                            </span>
                                                        </label>
                                                    </td>
                                                </tr>
                                            ))}
                                    </Fragment>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Toast — bottom-right, visible for 5s after a successful setPreferredProvider */}
            {toast && (
                <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-lg text-sm">
                    <span className="text-foreground">Proveedor preferido actualizado</span>
                    <button
                        onClick={handleUndo}
                        className="font-medium text-primary hover:underline"
                    >
                        Deshacer
                    </button>
                    <button
                        onClick={dismissToast}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="Cerrar"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
            )}

            {/* Item edit drawer */}
            <ItemEditDrawer
                itemId={editingItemId}
                onClose={() => setEditingItemId(null)}
            />
        </>
    )
}
