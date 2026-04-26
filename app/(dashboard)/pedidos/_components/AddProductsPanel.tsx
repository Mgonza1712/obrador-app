'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { Search, Plus, Loader2, ChevronDown, ChevronUp, MessageCircle, Mail, Globe, Phone, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { addLinesToOrder, updateOrderLine } from '@/app/actions/pedidos'
import type { OrderLineDetail } from '@/app/actions/pedidos'
import { FORMATOS_COMPRA } from '@/lib/constants'

interface MasterItem { id: string; official_name: string; base_unit: string }
interface Provider { id: string; name: string; channel: string | null }
interface ActivePrice {
    master_item_id: string; provider_id: string; unit_price: number
    is_preferred: boolean; erp_providers: { name: string; channel: string | null } | null
}
interface AliasFormat { master_item_id: string; provider_id: string; formato_compra: string | null }

interface Props {
    orderId: string
    masterItems: MasterItem[]
    providers: Provider[]
    activePrices: ActivePrice[]
    aliasFormats: AliasFormat[]
    existingLines: OrderLineDetail[]
    onAdded: (lines: OrderLineDetail[]) => void
    onMerged: (lineId: string, newQty: number) => void
}

function ChannelIcon({ channel }: { channel: string | null }) {
    if (channel === 'whatsapp') return <MessageCircle className="h-3 w-3 text-green-600" />
    if (channel === 'email') return <Mail className="h-3 w-3 text-blue-500" />
    if (channel === 'telegram') return <Globe className="h-3 w-3 text-sky-500" />
    if (channel === 'telefono') return <Phone className="h-3 w-3 text-gray-500" />
    return null
}

function getAliasFormat(aliasFormats: AliasFormat[], itemId: string, providerId: string): string | null {
    return aliasFormats.find((a) => a.master_item_id === itemId && a.provider_id === providerId)?.formato_compra ?? null
}

function ProductCombobox({ masterItems, onSelect }: { masterItems: MasterItem[]; onSelect: (item: MasterItem) => void }) {
    const [q, setQ] = useState('')
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        const handle = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
        document.addEventListener('mousedown', handle)
        return () => document.removeEventListener('mousedown', handle)
    }, [])

    const filtered = q.length >= 2
        ? masterItems.filter((i) => i.official_name.toLowerCase().includes(q.toLowerCase())).slice(0, 30)
        : []

    return (
        <div ref={ref} className="relative flex-1 min-w-[180px]">
            <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input
                    ref={inputRef}
                    type="text"
                    value={q}
                    onChange={(e) => { setQ(e.target.value); setOpen(true) }}
                    onFocus={() => setOpen(true)}
                    placeholder="Buscar producto..."
                    className="w-full rounded-md border border-input bg-background py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
            </div>
            {open && filtered.length > 0 && (
                <div className="absolute left-0 top-full z-50 mt-1 w-full max-h-52 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
                    {filtered.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => { onSelect(item); setQ(''); setOpen(false) }}
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
                        >
                            <span className="truncate">{item.official_name}</span>
                            <span className="ml-2 shrink-0 text-xs text-muted-foreground">{item.base_unit}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

export default function AddProductsPanel({ orderId, masterItems, providers, activePrices, aliasFormats, existingLines, onAdded, onMerged }: Props) {
    const [expanded, setExpanded] = useState(false)
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)

    // Catalog form state
    const [selectedItem, setSelectedItem] = useState<MasterItem | null>(null)
    const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
    const [quantity, setQuantity] = useState('1')
    const [unit, setUnit] = useState('Caja')
    const [useRaw, setUseRaw] = useState(false)
    const [rawText, setRawText] = useState('')
    const [freeProviderId, setFreeProviderId] = useState('')

    const pricesByItem = new Map<string, ActivePrice[]>()
    for (const ap of activePrices) {
        const arr = pricesByItem.get(ap.master_item_id) ?? []
        arr.push(ap)
        pricesByItem.set(ap.master_item_id, arr)
    }

    function handleSelectItem(item: MasterItem) {
        setSelectedItem(item)
        const prices = pricesByItem.get(item.id) ?? []
        const preferred = prices.find((p) => p.is_preferred) ?? prices[0] ?? null
        const pid = preferred?.provider_id ?? null
        setSelectedProviderId(pid)
        setUnit(pid ? (getAliasFormat(aliasFormats, item.id, pid) ?? 'Caja') : 'Caja')
        setQuantity('1')
    }

    function handleSelectProvider(pid: string) {
        setSelectedProviderId(pid)
        if (selectedItem) setUnit(getAliasFormat(aliasFormats, selectedItem.id, pid) ?? 'Caja')
    }

    function handleAdd() {
        if (useRaw) {
            if (!rawText.trim()) { setError('Escribe el texto del producto.'); return }
        } else {
            if (!selectedItem) { setError('Selecciona un producto.'); return }
        }
        const qty = parseFloat(quantity)
        if (isNaN(qty) || qty <= 0) { setError('Cantidad inválida.'); return }

        const pid = useRaw ? (freeProviderId || null) : selectedProviderId
        const priceInfo = selectedItem && pid ? activePrices.find((p) => p.master_item_id === selectedItem.id && p.provider_id === pid) ?? null : null
        const providerInfo = pid ? providers.find((p) => p.id === pid) ?? null : null
        const effectiveUnit = selectedItem && pid ? (getAliasFormat(aliasFormats, selectedItem.id, pid) ?? unit) : unit
        const masterItemId = useRaw ? null : (selectedItem?.id ?? null)

        // Deduplication: if same master_item_id + provider_id already in order, merge quantities
        const duplicate = !useRaw && masterItemId
            ? existingLines.find(
                (l) => l.master_item_id === masterItemId && l.provider_id === pid && !l.is_cancelled
            ) ?? null
            : null

        if (duplicate) {
            const newQty = duplicate.quantity + qty
            startTransition(async () => {
                const res = await updateOrderLine(duplicate.id, { quantity: newQty })
                if (res.success) {
                    onMerged(duplicate.id, newQty)
                    setSelectedItem(null)
                    setSelectedProviderId(null)
                    setQuantity('1')
                    setUnit('Caja')
                    setError(null)
                } else {
                    setError(res.error ?? 'Error al actualizar la cantidad')
                }
            })
            return
        }

        startTransition(async () => {
            const res = await addLinesToOrder(orderId, [{
                raw_text: useRaw ? rawText.trim() : selectedItem!.official_name,
                quantity: qty,
                unit: effectiveUnit,
                master_item_id: masterItemId ?? undefined,
                provider_id: pid ?? undefined,
                estimated_unit_price: priceInfo?.unit_price ?? undefined,
            }])
            if (res.success && res.insertedIds?.[0]) {
                const newLine: OrderLineDetail = {
                    id: res.insertedIds[0],
                    raw_text: useRaw ? rawText.trim() : selectedItem!.official_name,
                    quantity: qty,
                    unit: effectiveUnit,
                    is_matched: !useRaw && !!selectedItem,
                    provider_id: pid,
                    provider_name: providerInfo?.name ?? priceInfo?.erp_providers?.name ?? null,
                    provider_channel: providerInfo?.channel ?? priceInfo?.erp_providers?.channel ?? null,
                    provider_phone: null,
                    provider_email: null,
                    master_item_id: masterItemId,
                    master_item_name: useRaw ? null : (selectedItem?.official_name ?? null),
                    master_item_base_unit: useRaw ? null : (selectedItem?.base_unit ?? null),
                    estimated_unit_price: priceInfo?.unit_price ?? null,
                    match_confidence: null,
                    notes: null,
                    sort_order: null,
                    qty_received: 0,
                    is_cancelled: false,
                }
                onAdded([newLine])
                setSelectedItem(null)
                setSelectedProviderId(null)
                setRawText('')
                setFreeProviderId('')
                setQuantity('1')
                setUnit('Caja')
                setUseRaw(false)
                setError(null)
            } else {
                setError(res.error ?? 'Error al añadir línea')
            }
        })
    }

    const itemPrices = selectedItem ? (pricesByItem.get(selectedItem.id) ?? []) : []
    const aliasUnit = selectedItem && selectedProviderId
        ? getAliasFormat(aliasFormats, selectedItem.id, selectedProviderId)
        : null

    return (
        <div className="rounded-lg border border-dashed border-border bg-muted/10">
            <button
                onClick={() => setExpanded((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
                <span className="flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Añadir productos al borrador
                </span>
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {expanded && (
                <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
                    {/* Mode toggle */}
                    <div className="flex gap-1.5 text-xs">
                        <button
                            onClick={() => { setUseRaw(false); setRawText('') }}
                            className={`rounded px-2.5 py-1 transition-colors ${!useRaw ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:text-foreground'}`}
                        >
                            Del catálogo
                        </button>
                        <button
                            onClick={() => { setUseRaw(true); setSelectedItem(null) }}
                            className={`rounded px-2.5 py-1 transition-colors ${useRaw ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:text-foreground'}`}
                        >
                            Texto libre
                        </button>
                    </div>

                    <div className="flex flex-wrap items-end gap-3">
                        {useRaw ? (
                            <>
                                <div className="flex-1 min-w-[180px]">
                                    <label className="mb-1 block text-xs text-muted-foreground">Descripción</label>
                                    <input
                                        type="text"
                                        value={rawText}
                                        onChange={(e) => setRawText(e.target.value)}
                                        placeholder="Ej. Lo de siempre"
                                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                    />
                                </div>
                                <div className="w-40">
                                    <label className="mb-1 block text-xs text-muted-foreground">Proveedor (opcional)</label>
                                    <select
                                        value={freeProviderId}
                                        onChange={(e) => setFreeProviderId(e.target.value)}
                                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                    >
                                        <option value="">Sin asignar</option>
                                        {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 min-w-[180px] space-y-2">
                                <div>
                                    <label className="mb-1 block text-xs text-muted-foreground">Producto</label>
                                    <ProductCombobox masterItems={masterItems} onSelect={handleSelectItem} />
                                </div>
                                {selectedItem && itemPrices.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                        {itemPrices.map((p) => {
                                            const name = p.erp_providers?.name ?? providers.find((pr) => pr.id === p.provider_id)?.name ?? p.provider_id
                                            const ch = p.erp_providers?.channel ?? providers.find((pr) => pr.id === p.provider_id)?.channel ?? null
                                            const isSelected = selectedProviderId === p.provider_id
                                            return (
                                                <button
                                                    key={p.provider_id}
                                                    onClick={() => handleSelectProvider(p.provider_id)}
                                                    className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs transition-colors ${
                                                        isSelected
                                                            ? 'bg-primary text-primary-foreground'
                                                            : 'border border-border text-muted-foreground hover:border-primary hover:text-foreground'
                                                    }`}
                                                >
                                                    <ChannelIcon channel={ch} />
                                                    {name}
                                                    {p.is_preferred && <Star className="h-2.5 w-2.5 fill-current" />}
                                                    {p.unit_price > 0 && <span>{p.unit_price.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span>}
                                                </button>
                                            )
                                        })}
                                    </div>
                                )}
                                {selectedItem && itemPrices.length === 0 && (
                                    <div className="space-y-1">
                                        <p className="text-xs text-amber-600">Sin precios en catálogo — seleccioná el proveedor:</p>
                                        <select
                                            value={selectedProviderId ?? ''}
                                            onChange={(e) => handleSelectProvider(e.target.value)}
                                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                        >
                                            <option value="">Sin asignar</option>
                                            {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                        </select>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="w-20 shrink-0">
                            <label className="mb-1 block text-xs text-muted-foreground">Cant.</label>
                            <input
                                type="number"
                                min="1"
                                step="1"
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                        </div>

                        <div className="w-32 shrink-0">
                            <label className="mb-1 block text-xs text-muted-foreground">Formato</label>
                            {aliasUnit ? (
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-sm rounded-md border border-input bg-muted/40 px-3 py-2 text-muted-foreground">{aliasUnit}</span>
                                    <span className="text-[10px] text-muted-foreground/60">Del proveedor</span>
                                </div>
                            ) : (
                                <select
                                    value={unit}
                                    onChange={(e) => setUnit(e.target.value)}
                                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                >
                                    {FORMATOS_COMPRA.map((f) => <option key={f} value={f}>{f}</option>)}
                                </select>
                            )}
                        </div>

                        <Button
                            type="button"
                            size="sm"
                            onClick={handleAdd}
                            disabled={isPending}
                            className="flex items-center gap-1.5 shrink-0"
                        >
                            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                            Añadir
                        </Button>
                    </div>

                    {error && <p className="text-xs text-red-600">{error}</p>}
                </div>
            )}
        </div>
    )
}
