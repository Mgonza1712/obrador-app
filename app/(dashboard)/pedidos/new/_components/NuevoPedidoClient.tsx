'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
    ArrowLeft, Search, Plus, Trash2, Loader2, Send, AlertCircle, Package,
    MessageCircle, Mail, Globe, Phone, Building2, Star, MapPin,
} from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { createOrderFromWeb } from '@/app/actions/pedidos'
import { FORMATOS_COMPRA } from '@/lib/constants'

// ── Types ─────────────────────────────────────────────────────────────────────

interface MasterItem {
    id: string
    official_name: string
    base_unit: string
    category: string | null
}

interface Provider {
    id: string
    name: string
    channel: string | null
}

interface ActivePrice {
    master_item_id: string
    provider_id: string
    unit_price: number
    is_preferred: boolean
    erp_providers: { name: string; channel: string | null } | null
}

interface AliasFormat {
    master_item_id: string
    provider_id: string
    formato_compra: string | null
}

interface OrderLine {
    _key: string
    masterItemId: string
    masterItemName: string
    masterItemBaseUnit: string
    quantity: number
    unit: string
    providerId: string | null
    providerName: string | null
    providerChannel: string | null
    estimatedUnitPrice: number | null
    notes: string
}

interface Props {
    masterItems: MasterItem[]
    providers: Provider[]
    activePrices: ActivePrice[]
    aliasFormats: AliasFormat[]
    venues: { id: string; name: string }[]
    defaultVenueId: string | null
}

type Mode = 'catalog' | 'provider' | 'free'

// ── Helpers ───────────────────────────────────────────────────────────────────

function ChannelIcon({ channel, className }: { channel: string | null; className?: string }) {
    const cls = className ?? 'h-3 w-3'
    if (channel === 'whatsapp') return <MessageCircle className={`${cls} text-green-600`} />
    if (channel === 'email') return <Mail className={`${cls} text-blue-500`} />
    if (channel === 'telegram') return <Globe className={`${cls} text-sky-500`} />
    if (channel === 'telefono') return <Phone className={`${cls} text-gray-500`} />
    return null
}

function getAliasFormat(
    aliasFormats: AliasFormat[],
    masterItemId: string,
    providerId: string,
): string | null {
    return aliasFormats.find(
        (a) => a.master_item_id === masterItemId && a.provider_id === providerId
    )?.formato_compra ?? null
}

// ── Product search combobox ───────────────────────────────────────────────────

function ProductSearch({
    masterItems,
    onSelect,
}: {
    masterItems: MasterItem[]
    onSelect: (item: MasterItem) => void
}) {
    const [query, setQuery] = useState('')
    const [open, setOpen] = useState(false)
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

    const filtered = query.length >= 2
        ? masterItems.filter((i) => i.official_name.toLowerCase().includes(query.toLowerCase())).slice(0, 40)
        : []

    return (
        <div ref={containerRef} className="relative w-full">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
                    onFocus={() => setOpen(true)}
                    placeholder="Buscar producto en el catálogo..."
                    className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
            </div>
            {open && filtered.length > 0 && (
                <div className="absolute left-0 top-full z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
                    {filtered.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                                onSelect(item)
                                setQuery('')
                                setOpen(false)
                                inputRef.current?.focus()
                            }}
                            className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-accent transition-colors"
                        >
                            <span className="truncate">{item.official_name}</span>
                            <span className="ml-3 shrink-0 text-xs text-muted-foreground">
                                {item.category ?? ''} · {item.base_unit}
                            </span>
                        </button>
                    ))}
                </div>
            )}
            {open && query.length >= 2 && filtered.length === 0 && (
                <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-md border border-border bg-popover px-4 py-3 shadow-lg">
                    <p className="text-sm text-muted-foreground">Sin resultados para &quot;{query}&quot;</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Usa &quot;Texto libre&quot; para añadir directamente.</p>
                </div>
            )}
        </div>
    )
}

// ── Format field (alias-aware) ────────────────────────────────────────────────

function FormatField({
    masterItemId,
    providerId,
    aliasFormats,
    value,
    onChange,
}: {
    masterItemId: string
    providerId: string | null
    aliasFormats: AliasFormat[]
    value: string
    onChange: (v: string) => void
}) {
    const aliasFormat = masterItemId && providerId
        ? getAliasFormat(aliasFormats, masterItemId, providerId)
        : null

    if (aliasFormat) {
        return (
            <div className="flex flex-col gap-0.5">
                <span className="text-sm rounded-md border border-input bg-muted/40 px-3 py-2 text-muted-foreground">
                    {aliasFormat}
                </span>
                <span className="text-[10px] text-muted-foreground/60">Formato del proveedor</span>
            </div>
        )
    }

    return (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
            {FORMATOS_COMPRA.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
    )
}

// ── Browse-by-provider panel ──────────────────────────────────────────────────

function ProviderBrowse({
    providers,
    masterItems,
    activePrices,
    aliasFormats,
    onAddLine,
}: {
    providers: Provider[]
    masterItems: MasterItem[]
    activePrices: ActivePrice[]
    aliasFormats: AliasFormat[]
    onAddLine: (item: MasterItem, price: ActivePrice, qty: number, unit: string) => void
}) {
    const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
    const [quantities, setQuantities] = useState<Record<string, string>>({})
    const [providerSearch, setProviderSearch] = useState('')

    const masterItemById = new Map(masterItems.map((m) => [m.id, m]))

    // All active prices per provider (not just preferred)
    const productsByProvider = new Map<string, Array<{ masterItem: MasterItem; price: ActivePrice }>>()
    for (const ap of activePrices) {
        const mi = masterItemById.get(ap.master_item_id)
        if (!mi) continue
        const arr = productsByProvider.get(ap.provider_id) ?? []
        arr.push({ masterItem: mi, price: ap })
        productsByProvider.set(ap.provider_id, arr)
    }

    const filteredProviders = providerSearch
        ? providers.filter((p) => p.name.toLowerCase().includes(providerSearch.toLowerCase()))
        : providers

    const selectedProvider = providers.find((p) => p.id === selectedProviderId) ?? null
    const browseItems = selectedProviderId
        ? (productsByProvider.get(selectedProviderId) ?? [])
            .sort((a, b) => a.masterItem.official_name.localeCompare(b.masterItem.official_name))
        : []

    function getQty(itemId: string) { return quantities[itemId] ?? '1' }

    function getDefaultUnit(masterItemId: string, providerId: string) {
        return getAliasFormat(aliasFormats, masterItemId, providerId) ?? 'Caja'
    }

    function handleAdd(item: { masterItem: MasterItem; price: ActivePrice }) {
        const qty = parseFloat(getQty(item.masterItem.id))
        if (isNaN(qty) || qty <= 0) return
        const unit = getDefaultUnit(item.masterItem.id, item.price.provider_id)
        onAddLine(item.masterItem, item.price, qty, unit)
        setQuantities((prev) => ({ ...prev, [item.masterItem.id]: '1' }))
    }

    return (
        <div className="flex gap-3 min-h-[280px]">
            {/* Provider list */}
            <div className="w-44 shrink-0 rounded-md border border-border overflow-hidden flex flex-col">
                <div className="p-2 border-b border-border bg-muted/20">
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                        <input
                            type="text"
                            value={providerSearch}
                            onChange={(e) => setProviderSearch(e.target.value)}
                            placeholder="Buscar..."
                            className="w-full rounded border border-input bg-background py-1 pl-6 pr-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {filteredProviders.map((p) => {
                        const count = productsByProvider.get(p.id)?.length ?? 0
                        return (
                            <button
                                key={p.id}
                                onClick={() => setSelectedProviderId(p.id)}
                                className={`flex w-full items-center justify-between px-2.5 py-2 text-left text-xs transition-colors ${
                                    selectedProviderId === p.id
                                        ? 'bg-primary/10 text-primary font-medium'
                                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                                }`}
                            >
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <ChannelIcon channel={p.channel} />
                                    <span className="truncate">{p.name}</span>
                                </div>
                                {count > 0 && (
                                    <span className="ml-1 shrink-0 text-muted-foreground/60">{count}</span>
                                )}
                            </button>
                        )
                    })}
                    {filteredProviders.length === 0 && (
                        <p className="px-3 py-4 text-xs text-muted-foreground text-center">Sin resultados</p>
                    )}
                </div>
            </div>

            {/* Product list */}
            <div className="flex-1 min-w-0 overflow-hidden rounded-md border border-border flex flex-col">
                {!selectedProvider ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2 text-center p-6">
                        <Building2 className="h-8 w-8 text-muted-foreground/30" />
                        <p className="text-xs text-muted-foreground">Selecciona un proveedor para ver sus productos</p>
                    </div>
                ) : browseItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2 text-center p-6">
                        <Package className="h-8 w-8 text-muted-foreground/30" />
                        <p className="text-xs text-muted-foreground">
                            {selectedProvider.name} no tiene productos con precio activo en el catálogo.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-y-auto">
                        <div className="px-3 py-2 border-b border-border bg-muted/20 flex items-center gap-1.5">
                            <ChannelIcon channel={selectedProvider.channel} />
                            <span className="text-xs font-medium">{selectedProvider.name}</span>
                            <span className="text-xs text-muted-foreground ml-1">· {browseItems.length} productos</span>
                        </div>
                        {browseItems.map((item) => {
                            const aliasUnit = getDefaultUnit(item.masterItem.id, item.price.provider_id)
                            return (
                                <div
                                    key={item.masterItem.id}
                                    className="flex items-center gap-2 border-b border-border last:border-0 px-3 py-2"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <p className="text-sm font-medium truncate">{item.masterItem.official_name}</p>
                                            {item.price.is_preferred && (
                                                <Star className="h-3 w-3 shrink-0 text-amber-400 fill-amber-400" />
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {aliasUnit}
                                            {item.price.unit_price > 0 && (
                                                <span className="ml-1 font-medium text-foreground">
                                                    · {item.price.unit_price.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                    <input
                                        type="number"
                                        min="0.001"
                                        step="1"
                                        value={getQty(item.masterItem.id)}
                                        onChange={(e) => setQuantities((prev) => ({ ...prev, [item.masterItem.id]: e.target.value }))}
                                        className="w-14 rounded border border-input bg-background px-2 py-1 text-right text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                                    />
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleAdd(item)}
                                        className="h-7 px-2 text-xs shrink-0"
                                    >
                                        <Plus className="h-3 w-3" />
                                        Añadir
                                    </Button>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NuevoPedidoClient({ masterItems, providers, activePrices, aliasFormats, venues, defaultVenueId }: Props) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [lines, setLines] = useState<OrderLine[]>([])
    const [mode, setMode] = useState<Mode>('catalog')
    const [venueId, setVenueId] = useState<string | null>(defaultVenueId)

    // Catalog mode state
    const [selectedItem, setSelectedItem] = useState<MasterItem | null>(null)
    const [selectedPrice, setSelectedPrice] = useState<ActivePrice | null>(null)

    // Free-text mode state
    const [rawText, setRawText] = useState('')
    const [freeProviderId, setFreeProviderId] = useState<string>('')

    // Shared form state
    const [quantity, setQuantity] = useState('1')
    const [unit, setUnit] = useState('Caja')
    const [error, setError] = useState<string | null>(null)

    // Prices per master item
    const pricesByItem = new Map<string, ActivePrice[]>()
    for (const ap of activePrices) {
        const arr = pricesByItem.get(ap.master_item_id) ?? []
        arr.push(ap)
        pricesByItem.set(ap.master_item_id, arr)
    }

    function resolveUnit(masterItemId: string, providerId: string | null) {
        if (!providerId) return 'Caja'
        return getAliasFormat(aliasFormats, masterItemId, providerId) ?? 'Caja'
    }

    function handleSelectItem(item: MasterItem) {
        setSelectedItem(item)
        const prices = pricesByItem.get(item.id) ?? []
        const preferred = prices.find((p) => p.is_preferred) ?? prices[0] ?? null
        setSelectedPrice(preferred)
        setUnit(resolveUnit(item.id, preferred?.provider_id ?? null))
        setQuantity('1')
    }

    function handleSelectPrice(price: ActivePrice) {
        setSelectedPrice(price)
        if (selectedItem) setUnit(resolveUnit(selectedItem.id, price.provider_id))
    }

    function handleAddCatalogLine() {
        if (!selectedItem) { setError('Selecciona un producto del catálogo.'); return }
        const qty = parseFloat(quantity)
        if (isNaN(qty) || qty <= 0) { setError('La cantidad debe ser un número positivo.'); return }

        const providerName = selectedPrice?.erp_providers?.name
            ?? providers.find((p) => p.id === selectedPrice?.provider_id)?.name
            ?? null
        const providerChannel = selectedPrice?.erp_providers?.channel
            ?? providers.find((p) => p.id === selectedPrice?.provider_id)?.channel
            ?? null
        const effectiveUnit = selectedItem && selectedPrice
            ? (getAliasFormat(aliasFormats, selectedItem.id, selectedPrice.provider_id) ?? unit)
            : unit

        setLines((prev) => [...prev, {
            _key: `${Date.now()}-${Math.random()}`,
            masterItemId: selectedItem.id,
            masterItemName: selectedItem.official_name,
            masterItemBaseUnit: selectedItem.base_unit,
            quantity: qty,
            unit: effectiveUnit,
            providerId: selectedPrice?.provider_id ?? null,
            providerName,
            providerChannel,
            estimatedUnitPrice: selectedPrice?.unit_price ?? null,
            notes: '',
        }])
        setSelectedItem(null)
        setSelectedPrice(null)
        setQuantity('1')
        setUnit('Caja')
        setError(null)
    }

    function handleAddFreeLine() {
        if (!rawText.trim()) { setError('Escribe el texto del producto.'); return }
        const qty = parseFloat(quantity)
        if (isNaN(qty) || qty <= 0) { setError('La cantidad debe ser un número positivo.'); return }

        const provider = freeProviderId ? providers.find((p) => p.id === freeProviderId) ?? null : null

        setLines((prev) => [...prev, {
            _key: `${Date.now()}-${Math.random()}`,
            masterItemId: '',
            masterItemName: rawText.trim(),
            masterItemBaseUnit: 'ud',
            quantity: qty,
            unit,
            providerId: provider?.id ?? null,
            providerName: provider?.name ?? null,
            providerChannel: provider?.channel ?? null,
            estimatedUnitPrice: null,
            notes: '',
        }])
        setRawText('')
        setFreeProviderId('')
        setQuantity('1')
        setUnit('Caja')
        setError(null)
    }

    function handleBrowseAddLine(item: MasterItem, price: ActivePrice, qty: number, lineUnit: string) {
        const providerName = price.erp_providers?.name
            ?? providers.find((p) => p.id === price.provider_id)?.name
            ?? null
        const providerChannel = price.erp_providers?.channel
            ?? providers.find((p) => p.id === price.provider_id)?.channel
            ?? null
        setLines((prev) => [...prev, {
            _key: `${Date.now()}-${Math.random()}`,
            masterItemId: item.id,
            masterItemName: item.official_name,
            masterItemBaseUnit: item.base_unit,
            quantity: qty,
            unit: lineUnit,
            providerId: price.provider_id,
            providerName,
            providerChannel,
            estimatedUnitPrice: price.unit_price,
            notes: '',
        }])
    }

    function handleDeleteLine(key: string) {
        setLines((prev) => prev.filter((l) => l._key !== key))
    }

    function handleUpdateLineQty(key: string, qty: number) {
        setLines((prev) => prev.map((l) => l._key === key ? { ...l, quantity: qty } : l))
    }

    function handleSubmit() {
        if (lines.length === 0) { setError('Añade al menos una línea al pedido.'); return }
        setError(null)
        startTransition(async () => {
            const res = await createOrderFromWeb(
                lines.map((l) => ({
                    raw_text: l.masterItemName,
                    quantity: l.quantity,
                    unit: l.unit,
                    master_item_id: l.masterItemId || undefined,
                    provider_id: l.providerId || undefined,
                })),
                venueId
            )
            if (res.success && res.orderId) {
                router.push(`/pedidos/${res.orderId}`)
            } else {
                setError(res.error ?? 'Error al crear el pedido')
            }
        })
    }

    const totalEstimated = lines.reduce((sum, l) => {
        if (l.estimatedUnitPrice != null) return sum + l.estimatedUnitPrice * l.quantity
        return sum
    }, 0)

    const MODE_TABS: { key: Mode; label: string }[] = [
        { key: 'catalog', label: 'Buscar catálogo' },
        { key: 'provider', label: 'Por proveedor' },
        { key: 'free', label: 'Texto libre' },
    ]

    // Item prices for provider selector
    const itemPrices = selectedItem ? (pricesByItem.get(selectedItem.id) ?? []) : []

    return (
        <div className="flex flex-col gap-6 pb-24 max-w-3xl">
            {/* Back */}
            <Link
                href="/pedidos"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
            >
                <ArrowLeft className="h-4 w-4" />
                Pedidos
            </Link>

            {/* Header */}
            <div className="flex items-center gap-3">
                <Package className="h-7 w-7 text-muted-foreground" />
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Nuevo pedido</h1>
                    <p className="text-sm text-muted-foreground">
                        Añade los productos que necesitas. Se guardará como borrador para revisar y enviar.
                    </p>
                </div>
            </div>

            {/* Venue selector */}
            {venues.length > 0 && (
                <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                    {venues.length === 1 ? (
                        <span className="text-sm text-muted-foreground">{venues[0].name}</span>
                    ) : (
                        <select
                            value={venueId ?? ''}
                            onChange={(e) => setVenueId(e.target.value || null)}
                            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                            <option value="">Sin local asignado</option>
                            {venues.map((v) => (
                                <option key={v.id} value={v.id}>{v.name}</option>
                            ))}
                        </select>
                    )}
                </div>
            )}

            {/* Add line form */}
            <section className="rounded-lg border border-border bg-card p-5 space-y-4">
                <h2 className="text-sm font-semibold">Añadir producto</h2>

                {/* Mode tabs */}
                <div className="flex gap-1.5 text-xs">
                    {MODE_TABS.map((t) => (
                        <button
                            key={t.key}
                            onClick={() => {
                                setMode(t.key)
                                setSelectedItem(null)
                                setSelectedPrice(null)
                                setRawText('')
                                setFreeProviderId('')
                                setQuantity('1')
                                setUnit('Caja')
                                setError(null)
                            }}
                            className={`rounded-md px-3 py-1 transition-colors ${mode === t.key
                                ? 'bg-primary text-primary-foreground'
                                : 'border border-border text-muted-foreground hover:text-foreground'}`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Browse by provider */}
                {mode === 'provider' ? (
                    <ProviderBrowse
                        providers={providers}
                        masterItems={masterItems}
                        activePrices={activePrices}
                        aliasFormats={aliasFormats}
                        onAddLine={handleBrowseAddLine}
                    />
                ) : mode === 'free' ? (
                    /* Free-text mode */
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-end gap-3">
                            <div className="flex-1 min-w-[200px]">
                                <label className="mb-1 block text-xs font-medium text-muted-foreground">Descripción</label>
                                <input
                                    type="text"
                                    value={rawText}
                                    onChange={(e) => setRawText(e.target.value)}
                                    placeholder='Ej. "Lo de siempre de Makro"'
                                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                />
                            </div>
                            <div className="w-24 shrink-0">
                                <label className="mb-1 block text-xs font-medium text-muted-foreground">Cantidad</label>
                                <input
                                    type="number"
                                    min="0.001"
                                    step="0.001"
                                    value={quantity}
                                    onChange={(e) => setQuantity(e.target.value)}
                                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                                />
                            </div>
                            <div className="w-32 shrink-0">
                                <label className="mb-1 block text-xs font-medium text-muted-foreground">Formato</label>
                                <select
                                    value={unit}
                                    onChange={(e) => setUnit(e.target.value)}
                                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                >
                                    {FORMATOS_COMPRA.map((f) => <option key={f} value={f}>{f}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-end gap-3">
                            <div className="flex-1 min-w-[200px]">
                                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                                    Proveedor <span className="text-muted-foreground/50">(opcional)</span>
                                </label>
                                <select
                                    value={freeProviderId}
                                    onChange={(e) => setFreeProviderId(e.target.value)}
                                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                >
                                    <option value="">Sin proveedor asignado</option>
                                    {providers.map((p) => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>
                            <Button
                                type="button"
                                onClick={handleAddFreeLine}
                                className="flex items-center gap-1.5 shrink-0"
                            >
                                <Plus className="h-4 w-4" />
                                Añadir
                            </Button>
                        </div>
                    </div>
                ) : (
                    /* Catalog mode */
                    <div className="space-y-3">
                        <div>
                            <label className="mb-1 block text-xs font-medium text-muted-foreground">Producto</label>
                            <ProductSearch masterItems={masterItems} onSelect={handleSelectItem} />
                        </div>

                        {selectedItem && (
                            <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 dark:bg-green-950/20 space-y-2">
                                {/* Selected item name */}
                                <div className="flex items-center justify-between">
                                    <span className="font-medium text-sm text-green-800 dark:text-green-200 truncate">
                                        {selectedItem.official_name}
                                    </span>
                                    <button
                                        onClick={() => { setSelectedItem(null); setSelectedPrice(null) }}
                                        className="ml-2 text-xs text-muted-foreground hover:text-foreground"
                                    >
                                        ×
                                    </button>
                                </div>

                                {/* Provider selector */}
                                {itemPrices.length > 0 ? (
                                    <div>
                                        <p className="text-[10px] text-muted-foreground mb-1">Selecciona proveedor:</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {itemPrices.map((p) => {
                                                const name = p.erp_providers?.name
                                                    ?? providers.find((pr) => pr.id === p.provider_id)?.name
                                                    ?? p.provider_id
                                                const channel = p.erp_providers?.channel
                                                    ?? providers.find((pr) => pr.id === p.provider_id)?.channel
                                                    ?? null
                                                const isSelected = selectedPrice?.provider_id === p.provider_id
                                                return (
                                                    <button
                                                        key={p.provider_id}
                                                        onClick={() => handleSelectPrice(p)}
                                                        className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors ${
                                                            isSelected
                                                                ? 'bg-green-700 text-white dark:bg-green-600'
                                                                : 'border border-green-300 text-green-800 hover:bg-green-100 dark:text-green-200 dark:border-green-700 dark:hover:bg-green-900'
                                                        }`}
                                                    >
                                                        <ChannelIcon channel={channel} />
                                                        {name}
                                                        {p.is_preferred && <Star className="h-2.5 w-2.5 fill-current opacity-70" />}
                                                        {p.unit_price > 0 && (
                                                            <span className="opacity-70">
                                                                {p.unit_price.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                                                            </span>
                                                        )}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-xs text-amber-600">Sin proveedor preferido en el catálogo</p>
                                )}
                            </div>
                        )}

                        <div className="flex flex-wrap items-end gap-3">
                            <div className="w-24 shrink-0">
                                <label className="mb-1 block text-xs font-medium text-muted-foreground">Cantidad</label>
                                <input
                                    type="number"
                                    min="0.001"
                                    step="0.001"
                                    value={quantity}
                                    onChange={(e) => setQuantity(e.target.value)}
                                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                                />
                            </div>

                            <div className="w-36 shrink-0">
                                <label className="mb-1 block text-xs font-medium text-muted-foreground">Formato</label>
                                <FormatField
                                    masterItemId={selectedItem?.id ?? ''}
                                    providerId={selectedPrice?.provider_id ?? null}
                                    aliasFormats={aliasFormats}
                                    value={unit}
                                    onChange={setUnit}
                                />
                            </div>

                            <Button
                                type="button"
                                onClick={handleAddCatalogLine}
                                disabled={!selectedItem}
                                className="flex items-center gap-1.5 shrink-0"
                            >
                                <Plus className="h-4 w-4" />
                                Añadir
                            </Button>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="flex items-center gap-2 text-sm text-red-600">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        {error}
                    </div>
                )}
            </section>

            {/* Lines list */}
            {lines.length > 0 && (
                <section className="rounded-lg border border-border bg-card overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                        <div>
                            <h2 className="text-sm font-semibold">Líneas del pedido</h2>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                {lines.length} producto{lines.length !== 1 ? 's' : ''}
                                {totalEstimated > 0 && (
                                    <span className="ml-1.5">
                                        · Est. {totalEstimated.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                                    </span>
                                )}
                            </p>
                        </div>
                    </div>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border bg-muted/20">
                                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs">Producto</th>
                                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground text-xs w-24">Cant.</th>
                                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs w-28">Formato</th>
                                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs">Proveedor</th>
                                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground text-xs w-28">Est. ud.</th>
                                <th className="px-4 py-2.5 w-10" />
                            </tr>
                        </thead>
                        <tbody>
                            {lines.map((line) => (
                                <tr key={line._key} className="border-b border-border last:border-0">
                                    <td className="px-4 py-2.5">
                                        <span className="font-medium">{line.masterItemName}</span>
                                    </td>
                                    <td className="px-4 py-2.5 text-right">
                                        <input
                                            type="number"
                                            min="0.001"
                                            step="0.001"
                                            value={line.quantity}
                                            onChange={(e) => {
                                                const v = parseFloat(e.target.value)
                                                if (!isNaN(v) && v > 0) handleUpdateLineQty(line._key, v)
                                            }}
                                            className="w-16 rounded border border-input bg-background px-2 py-0.5 text-right text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                                        />
                                    </td>
                                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{line.unit}</td>
                                    <td className="px-4 py-2.5">
                                        {line.providerName ? (
                                            <div className="flex items-center gap-1.5 text-xs">
                                                <ChannelIcon channel={line.providerChannel} />
                                                <span>{line.providerName}</span>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-amber-600 italic">Sin preferido</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-2.5 text-right tabular-nums text-xs text-muted-foreground">
                                        {line.estimatedUnitPrice != null
                                            ? line.estimatedUnitPrice.toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €'
                                            : '—'}
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <button
                                            onClick={() => handleDeleteLine(line._key)}
                                            className="text-muted-foreground hover:text-destructive transition-colors"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            )}

            {/* Empty state */}
            {lines.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-14 text-center">
                    <Package className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">
                        Busca un producto en el catálogo y pulsa &quot;Añadir&quot; para comenzar el pedido.
                    </p>
                </div>
            )}

            {/* Sticky footer */}
            <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between gap-3 border-t border-border bg-background/95 backdrop-blur-sm px-6 py-3">
                <Link
                    href="/pedidos"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    Cancelar
                </Link>
                <Button
                    onClick={handleSubmit}
                    disabled={isPending || lines.length === 0}
                    className="flex items-center gap-1.5"
                >
                    {isPending
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Send className="h-4 w-4" />}
                    Crear pedido ({lines.length} producto{lines.length !== 1 ? 's' : ''})
                </Button>
            </div>
        </div>
    )
}
