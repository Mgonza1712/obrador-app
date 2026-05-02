'use client'

import { useState, useTransition, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
    ArrowLeft, CheckCircle2, Clock, XCircle, MessageCircle, Globe, Mail, Phone,
    Trash2, Loader2, AlertCircle, CheckCircle, Package, AlertTriangle, RefreshCw,
    Truck, PackageCheck, PackageX, ChevronDown, ChevronUp, Scissors, MapPin,
    Plus, FileText, MessageSquare, Send,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { deleteOrderLine, updateOrderLine, cancelOrder, registerDelivery, cancelPendingLines, markAsSent, updateProviderNotes, splitOrderByProvider, updateOrderVenue, updateOrderNotes, notifyOrderModification } from '@/app/actions/pedidos'
import SendOrderButton from './SendOrderButton'
import UnmatchedLineRow from './UnmatchedLineRow'
import AddProductsPanel from './AddProductsPanel'
import SchedulingPanel from './SchedulingPanel'
import DiscrepanciasTab from './DiscrepanciasTab'
import type { OrderDetail, OrderLineDetail, DeliveryStatus, LinkedDocument } from '@/app/actions/pedidos'
import { getPendingQuantity, getQuantityToCancel, isLineDelivered, isLinePending } from '@/lib/orders/deliveryTolerance'

// ── Types ─────────────────────────────────────────────────────────────────────

interface MasterItemOption { id: string; official_name: string; base_unit: string }
interface ProviderOption { id: string; name: string; channel: string | null }
interface ActivePrice {
    master_item_id: string; provider_id: string; unit_price: number
    is_preferred: boolean; erp_providers: { name: string; channel: string | null } | null
}
interface AliasFormat { master_item_id: string; provider_id: string; formato_compra: string | null }

interface Props {
    order: OrderDetail
    masterItems: MasterItemOption[]
    providers: ProviderOption[]
    activePrices: ActivePrice[]
    aliasFormats: AliasFormat[]
    venues: { id: string; name: string }[]
    linkedDocuments: LinkedDocument[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcDeliveryStatus(lines: OrderLineDetail[]): DeliveryStatus {
    const active = lines.filter((l) => !l.is_cancelled)
    if (active.length === 0) return 'delivered'
    const allDelivered = active.every(isLineDelivered)
    const anyDelivered = active.some((l) => l.qty_received > 0)
    return allDelivered ? 'delivered' : anyDelivered ? 'partially_delivered' : 'pending'
}

function StatusBadge({ status, isTemplate }: { status: string; isTemplate: boolean }) {
    if (isTemplate) {
        return (
            <Badge variant="outline" className="border-purple-200 bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                <RefreshCw className="mr-1 h-3 w-3" />Plantilla recurrente
            </Badge>
        )
    }
    if (status === 'sent') {
        return (
            <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300">
                <CheckCircle2 className="mr-1 h-3 w-3" />Enviado
            </Badge>
        )
    }
    if (status === 'cancelled') {
        return (
            <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300">
                <XCircle className="mr-1 h-3 w-3" />Cancelado
            </Badge>
        )
    }
    return (
        <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            <Clock className="mr-1 h-3 w-3" />Borrador
        </Badge>
    )
}

function DeliveryStatusBadge({ status }: { status: DeliveryStatus }) {
    if (status === 'delivered') {
        return (
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                <PackageCheck className="mr-1 h-3 w-3" />Entregado
            </Badge>
        )
    }
    if (status === 'partially_delivered') {
        return (
            <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">
                <Truck className="mr-1 h-3 w-3" />Entrega parcial
            </Badge>
        )
    }
    if (status === 'invoiced') {
        return (
            <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                <CheckCircle2 className="mr-1 h-3 w-3" />Facturado
            </Badge>
        )
    }
    return (
        <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
            <PackageX className="mr-1 h-3 w-3" />Pendiente entrega
        </Badge>
    )
}

function ChannelBadge({ channel, phone, email }: { channel: string | null; phone?: string | null; email?: string | null }) {
    if (!channel) {
        return (
            <Badge variant="outline" className="text-xs border-amber-200 bg-amber-50 text-amber-700">
                <AlertTriangle className="mr-1 h-3 w-3" />Sin proveedor
            </Badge>
        )
    }
    const classes: Record<string, string> = {
        whatsapp: 'border-green-200 bg-green-50 text-green-700',
        email: 'border-blue-200 bg-blue-50 text-blue-700',
        telegram: 'border-sky-200 bg-sky-50 text-sky-700',
        telefono: 'border-gray-200 bg-gray-50 text-gray-700',
    }
    const icons: Record<string, React.ReactNode> = {
        whatsapp: <MessageCircle className="mr-1 h-3 w-3" />,
        email: <Mail className="mr-1 h-3 w-3" />,
        telegram: <Globe className="mr-1 h-3 w-3" />,
        telefono: <Phone className="mr-1 h-3 w-3" />,
    }
    const labels: Record<string, string> = {
        whatsapp: 'WhatsApp', email: 'Email', telegram: 'Telegram', telefono: 'Teléfono',
    }
    const title = channel === 'telefono' && phone ? phone : channel === 'email' && email ? email : undefined
    return (
        <Badge variant="outline" className={`text-xs ${classes[channel] ?? ''}`} title={title}>
            {icons[channel]}
            {labels[channel] ?? channel}
            {channel === 'telefono' && phone && <span className="ml-1 font-normal">{phone}</span>}
        </Badge>
    )
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('es-ES', {
        day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
}

function formatEur(value: number | null) {
    if (value == null) return '—'
    return value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function formatQty(value: number, unit: string | null) {
    const n = value % 1 === 0 ? value.toString() : value.toFixed(3).replace(/\.?0+$/, '')
    return unit ? `${n} ${unit}` : n
}

// ── Inline qty input ──────────────────────────────────────────────────────────

function InlineQtyInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    const [editing, setEditing] = useState(false)
    const [local, setLocal] = useState(value.toString())

    if (!editing) {
        return (
            <button
                onClick={() => { setLocal(value.toString()); setEditing(true) }}
                className="rounded border border-transparent px-2 py-0.5 tabular-nums hover:border-input hover:bg-background transition-colors"
            >
                {value}
            </button>
        )
    }
    return (
        <input
            type="number" min="0" step="1" autoFocus value={local}
            onChange={(e) => setLocal(e.target.value)}
            onBlur={() => {
                const n = parseFloat(local)
                if (!isNaN(n) && n > 0 && n !== value) onChange(n)
                setEditing(false)
            }}
            onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') { setEditing(false); setLocal(value.toString()) }
            }}
            className="w-16 rounded border border-ring bg-background px-2 py-0.5 text-right text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
        />
    )
}

// ── Register delivery panel ───────────────────────────────────────────────────

interface ExtraItem {
    key: string
    provider_id: string | null
    master_item_id: string | null
    raw_text: string
    quantity: string
}

function RegisterDeliveryPanel({
    lines,
    orderId,
    masterItems,
    activePrices,
    onSuccess,
    onClose,
}: {
    lines: OrderLineDetail[]
    orderId: string
    masterItems: MasterItemOption[]
    activePrices: ActivePrice[]
    onSuccess: (updates: { line_id: string; qty_received: number; notes: string | null }[], hadExtras: boolean) => void
    onClose: () => void
}) {
    const [received, setReceived] = useState<Record<string, string>>(
        () => Object.fromEntries(lines.map((l) => [l.id, getPendingQuantity(l).toString()]))
    )
    const [lineNotes, setLineNotes] = useState<Record<string, string>>(
        () => Object.fromEntries(lines.map((l) => [l.id, l.notes ?? '']))
    )
    const [expandedNoteIds, setExpandedNoteIds] = useState<Set<string>>(
        () => new Set(lines.filter((l) => l.notes).map((l) => l.id))
    )
    const [extras, setExtras] = useState<ExtraItem[]>([])
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)

    // Derive unique providers present in this delivery panel
    const orderProviders = Array.from(
        new Map(
            lines
                .filter((l) => l.provider_id)
                .map((l) => [l.provider_id!, { id: l.provider_id!, name: l.provider_name ?? l.provider_id! }])
        ).values()
    )
    const defaultProviderId = orderProviders.length === 1 ? orderProviders[0].id : null

    function getProviderItems(providerId: string | null): MasterItemOption[] {
        if (!providerId) return masterItems
        const ids = new Set(activePrices.filter((p) => p.provider_id === providerId).map((p) => p.master_item_id))
        return masterItems.filter((m) => ids.has(m.id))
    }

    function markAll() {
        setReceived(Object.fromEntries(lines.map((l) => [l.id, getPendingQuantity(l).toString()])))
    }
    function clearAll() { setReceived(Object.fromEntries(lines.map((l) => [l.id, '0']))) }

    function toggleNote(lineId: string) {
        setExpandedNoteIds((prev) => {
            const next = new Set(prev)
            if (next.has(lineId)) next.delete(lineId)
            else next.add(lineId)
            return next
        })
    }

    function addExtra() {
        setExtras((prev) => [...prev, {
            key: `${Date.now()}`,
            provider_id: defaultProviderId,
            master_item_id: null,
            raw_text: '',
            quantity: '1',
        }])
    }

    function removeExtra(key: string) {
        setExtras((prev) => prev.filter((e) => e.key !== key))
    }

    function handleConfirm() {
        const updates = lines.map((l) => ({
            line_id: l.id,
            // Accumulate: add newly received to what was already registered
            qty_received: l.qty_received + (parseFloat(received[l.id] ?? '0') || 0),
            notes: lineNotes[l.id]?.trim() || null,
        }))
        const parsedExtras = extras
            .filter((e) => e.raw_text.trim())
            .map((e) => ({
                raw_text: e.raw_text.trim(),
                quantity: parseFloat(e.quantity) || 1,
                provider_id: e.provider_id,
                master_item_id: e.master_item_id,
            }))

        startTransition(async () => {
            setError(null)
            const res = await registerDelivery(orderId, updates, parsedExtras.length > 0 ? parsedExtras : undefined)
            if (res.success) {
                onSuccess(updates, parsedExtras.length > 0)
            } else {
                setError(res.error ?? 'Error al registrar la recepción')
            }
        })
    }

    return (
        <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                    <Truck className="h-4 w-4 text-muted-foreground" />
                    Registrar recepción
                </h3>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={clearAll} className="h-7 text-xs px-2.5">
                        Nada recibido
                    </Button>
                    <Button variant="outline" size="sm" onClick={markAll} className="h-7 text-xs px-2.5">
                        Todo recibido
                    </Button>
                </div>
            </div>

            {/* Lines table */}
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-border">
                        <th className="pb-1.5 text-left text-xs font-medium text-muted-foreground">Producto</th>
                        <th className="pb-1.5 text-right text-xs font-medium text-muted-foreground w-20">Pendiente</th>
                        <th className="pb-1.5 text-right text-xs font-medium text-muted-foreground w-24">A recibir</th>
                    </tr>
                </thead>
                <tbody>
                    {lines.map((l) => (
                        <tr key={l.id} className="border-b border-border last:border-0 align-top">
                            <td className="py-2 pr-3 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-medium">{l.master_item_name ?? l.raw_text}</span>
                                    {l.qty_received > 0 && (
                                        <span className="text-xs text-muted-foreground">
                                            ({l.qty_received}{l.unit ? ` ${l.unit}` : ''} ya recibido{l.qty_received !== 1 ? 's' : ''})
                                        </span>
                                    )}
                                    <button
                                        onClick={() => toggleNote(l.id)}
                                        title={expandedNoteIds.has(l.id) ? 'Ocultar nota' : 'Agregar nota'}
                                        className={`shrink-0 transition-colors ${
                                            expandedNoteIds.has(l.id)
                                                ? 'text-blue-500'
                                                : 'text-muted-foreground/30 hover:text-muted-foreground'
                                        }`}
                                    >
                                        <MessageSquare className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                                {expandedNoteIds.has(l.id) && (
                                    <input
                                        type="text"
                                        value={lineNotes[l.id] ?? ''}
                                        onChange={(e) => setLineNotes((prev) => ({ ...prev, [l.id]: e.target.value }))}
                                        placeholder="Nota de recepción..."
                                        autoFocus
                                        className="mt-1 w-full rounded border border-input bg-background px-2 py-1 text-xs text-muted-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring"
                                    />
                                )}
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums text-xs text-muted-foreground w-20 shrink-0 pt-2.5">
                                {formatQty(getPendingQuantity(l), l.unit)}
                            </td>
                            <td className="py-2 text-right w-24 shrink-0 pt-2">
                                <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={received[l.id] ?? ''}
                                    onChange={(e) => setReceived((prev) => ({ ...prev, [l.id]: e.target.value }))}
                                    className="w-20 rounded border border-input bg-background px-2 py-1 text-right text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                                />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Extras section */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Artículos extra recibidos</span>
                    <Button variant="outline" size="sm" onClick={addExtra} className="h-6 text-xs px-2">
                        <Plus className="h-3 w-3 mr-1" />
                        Añadir
                    </Button>
                </div>
                {extras.length === 0 && (
                    <p className="text-xs text-muted-foreground/60">Artículos que llegaron sin estar en el pedido.</p>
                )}
                {extras.map((e) => {
                    const providerItems = getProviderItems(e.provider_id)
                    return (
                        <div key={e.key} className="flex items-center gap-2 flex-wrap">
                            {orderProviders.length > 1 && (
                                <select
                                    value={e.provider_id ?? ''}
                                    onChange={(ev) => setExtras((prev) => prev.map((x) => x.key === e.key
                                        ? { ...x, provider_id: ev.target.value || null, master_item_id: null, raw_text: '' }
                                        : x))}
                                    className="w-32 rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                >
                                    <option value="">Proveedor...</option>
                                    {orderProviders.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            )}
                            <input
                                type="text"
                                value={e.raw_text}
                                onChange={(ev) => {
                                    const val = ev.target.value
                                    const match = providerItems.find((m) => m.official_name.toLowerCase() === val.toLowerCase())
                                    setExtras((prev) => prev.map((x) => x.key === e.key
                                        ? { ...x, raw_text: val, master_item_id: match?.id ?? null }
                                        : x))
                                }}
                                list={`items-${e.key}`}
                                placeholder="Buscar artículo del proveedor..."
                                className="flex-1 min-w-40 rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                            <datalist id={`items-${e.key}`}>
                                {providerItems.map((item) => (
                                    <option key={item.id} value={item.official_name} />
                                ))}
                            </datalist>
                            <input
                                type="number"
                                min="1"
                                step="1"
                                value={e.quantity}
                                onChange={(ev) => setExtras((prev) => prev.map((x) => x.key === e.key ? { ...x, quantity: ev.target.value } : x))}
                                className="w-16 rounded border border-input bg-background px-2 py-1 text-right text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                            <button
                                onClick={() => removeExtra(e.key)}
                                className="text-muted-foreground/50 hover:text-destructive transition-colors"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    )
                })}
            </div>

            {error && (
                <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {error}
                </div>
            )}

            <div className="flex justify-end gap-2 pt-1 border-t border-border">
                <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>
                    Cancelar
                </Button>
                <Button size="sm" onClick={handleConfirm} disabled={isPending}>
                    {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Confirmar recepción'}
                </Button>
            </div>
        </div>
    )
}

// ── Provider group ────────────────────────────────────────────────────────────

function ProviderGroup({
    providerName, channel, phone, email, lines, isDraft, showDelivery,
    masterItems, providers, onDelete, onQtyChange, onLinked,
    initialNotes, onNotesBlur, onCancelLine,
}: {
    providerName: string; channel: string | null; phone: string | null; email: string | null
    lines: OrderLineDetail[]; isDraft: boolean; showDelivery: boolean
    masterItems: MasterItemOption[]; providers: ProviderOption[]
    onDelete: (lineId: string) => void
    onQtyChange: (lineId: string, qty: number) => void
    onLinked: (lineId: string, masterItemName: string) => void
    initialNotes: string
    onNotesBlur: (value: string) => void
    onCancelLine?: (lineId: string) => void
}) {
    const [localNotes, setLocalNotes] = useState(initialNotes)
    const totalEstimated = lines.reduce((sum, l) => {
        if (l.estimated_unit_price != null) return sum + l.estimated_unit_price * l.quantity
        return sum
    }, 0)

    return (
        <div className="overflow-hidden rounded-lg border border-border">
            <div className="flex items-center justify-between border-b border-border bg-muted/20 px-4 py-3">
                <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{providerName}</span>
                    <ChannelBadge channel={channel} phone={phone} email={email} />
                </div>
                {totalEstimated > 0 && (
                    <span className="text-sm tabular-nums text-muted-foreground">Est. {formatEur(totalEstimated)}</span>
                )}
            </div>
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-border bg-muted/10">
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase text-muted-foreground">Producto</th>
                        <th className="px-4 py-2 text-right text-xs font-medium uppercase text-muted-foreground w-28">Cant. pedida</th>
                        {showDelivery && <th className="px-4 py-2 text-right text-xs font-medium uppercase text-muted-foreground w-28">Recibido</th>}
                        <th className="px-4 py-2 text-right text-xs font-medium uppercase text-muted-foreground w-28">P. unit est.</th>
                        <th className="px-4 py-2 text-right text-xs font-medium uppercase text-muted-foreground w-32">Total est.</th>
                        <th className="px-4 py-2 w-16" />
                    </tr>
                </thead>
                <tbody>
                    {lines.map((line) => {
                        const lineDeliveryPending = isLinePending(line)
                        const isFullyReceived = !line.is_cancelled && isLineDelivered(line)
                        return (
                            <tr
                                key={line.id}
                                className={`border-b border-border last:border-0 ${
                                    line.is_cancelled
                                        ? 'opacity-50 bg-muted/20'
                                        : showDelivery && lineDeliveryPending
                                            ? 'bg-amber-50/40 dark:bg-amber-950/20'
                                            : showDelivery && isFullyReceived
                                                ? 'bg-emerald-50/40 dark:bg-emerald-950/20'
                                                : ''
                                }`}
                            >
                                <td className="px-4 py-3">
                                    <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={
                                                line.is_cancelled
                                                    ? 'line-through text-muted-foreground'
                                                    : line.is_matched ? 'font-medium' : 'text-amber-700'
                                            }>
                                                {line.master_item_name ?? (
                                                    <span className="italic text-muted-foreground">{line.raw_text}</span>
                                                )}
                                            </span>
                                            {line.is_cancelled && (
                                                <Badge variant="outline" className="text-xs border-slate-300 bg-slate-50 text-slate-500 shrink-0">Cancelado</Badge>
                                            )}
                                            {!line.is_cancelled && line.qty_cancelled > 0 && (
                                                <Badge variant="outline" className="text-xs border-slate-300 bg-slate-50 text-slate-600 shrink-0">Restante cerrado</Badge>
                                            )}
                                            {!line.is_matched && !line.is_cancelled && (
                                                <Badge variant="outline" className="text-xs border-amber-300 bg-amber-50 text-amber-700 shrink-0">Sin vincular</Badge>
                                            )}
                                        </div>
                                        {line.raw_text !== line.master_item_name && line.master_item_name && (
                                            <p className="mt-0.5 text-xs text-muted-foreground">&quot;{line.raw_text}&quot;</p>
                                        )}
                                        {/* Reception note — read-only once registered */}
                                        {line.notes && !isDraft && (
                                            <p className="mt-1 text-xs text-muted-foreground italic">
                                                <span className="font-medium not-italic">Nota:</span> {line.notes}
                                            </p>
                                        )}
                                        {!line.is_matched && isDraft && (
                                            <UnmatchedLineRow line={line} masterItems={masterItems} providers={providers} onLinked={onLinked} />
                                        )}
                                    </div>
                                </td>
                                <td className="px-4 py-3 w-28 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                        {isDraft ? (
                                            <InlineQtyInput value={line.quantity} onChange={(qty) => onQtyChange(line.id, qty)} />
                                        ) : (
                                            <span className="tabular-nums">{line.quantity}</span>
                                        )}
                                        {line.unit && <span className="text-muted-foreground">{line.unit}</span>}
                                    </div>
                                </td>
                                {showDelivery && (
                                    <td className="px-4 py-3 w-28 text-right tabular-nums">
                                        {line.is_cancelled ? (
                                            <span className="text-muted-foreground">—</span>
                                        ) : (
                                            <span className={
                                                line.qty_received === 0 ? 'text-muted-foreground'
                                                    : isFullyReceived ? 'text-emerald-600 font-medium'
                                                        : 'text-orange-600 font-medium'
                                            }>
                                                {line.qty_received > 0 ? line.qty_received : '0'}
                                                {line.unit && <span className="text-muted-foreground font-normal ml-1">{line.unit}</span>}
                                            </span>
                                        )}
                                    </td>
                                )}
                                <td className="px-4 py-3 w-28 text-right tabular-nums text-muted-foreground">
                                    {line.estimated_unit_price != null
                                        ? <span title="Precio estimado sin IVA">{formatEur(line.estimated_unit_price)}</span>
                                        : '—'}
                                </td>
                                <td className="px-4 py-3 w-32 text-right tabular-nums font-medium">
                                    {line.estimated_unit_price != null ? formatEur(line.estimated_unit_price * line.quantity) : '—'}
                                </td>
                                <td className="px-4 py-3 w-10">
                                    <div className="flex items-center justify-end gap-1">
                                        {showDelivery && !line.is_cancelled && (
                                            <button
                                                onClick={() => onCancelLine?.(line.id)}
                                                title="Cancelar esta línea"
                                                className="text-muted-foreground/40 hover:text-destructive transition-colors"
                                            >
                                                <XCircle className="h-3.5 w-3.5" />
                                            </button>
                                        )}
                                        {isDraft && (
                                            <button
                                                onClick={() => onDelete(line.id)}
                                                title="Eliminar línea"
                                                className="text-muted-foreground hover:text-destructive transition-colors"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>

            {/* Per-provider notes */}
            {isDraft && (
                <div className="border-t border-border px-4 py-2.5">
                    <textarea
                        value={localNotes}
                        onChange={(e) => setLocalNotes(e.target.value)}
                        onBlur={() => onNotesBlur(localNotes)}
                        placeholder={`Aclaraciones para ${providerName}...`}
                        rows={1}
                        className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-xs placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                </div>
            )}
            {!isDraft && localNotes && (
                <div className="border-t border-border px-4 py-2.5">
                    <p className="text-xs text-muted-foreground"><span className="font-medium">Aclaraciones:</span> {localNotes}</p>
                </div>
            )}
        </div>
    )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OrderDetailClient({ order, masterItems, providers, activePrices, aliasFormats, venues, linkedDocuments }: Props) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [isPending, startTransition] = useTransition()
    const [lines, setLines] = useState<OrderLineDetail[]>(order.lines)
    const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
    const [currentStatus, setCurrentStatus] = useState(order.status)
    const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatus>(order.delivery_status)
    const [scheduledFor, setScheduledFor] = useState(order.scheduled_for)
    const [isTemplate, setIsTemplate] = useState(order.is_template)
    const [recurrenceCron, setRecurrenceCron] = useState(order.recurrence_cron)
    const [recurrenceLabel, setRecurrenceLabel] = useState(order.recurrence_label)
    const [nextRunAt, setNextRunAt] = useState(order.next_run_at)
    const [showDeliveryPanel, setShowDeliveryPanel] = useState(false)
    const [showDeliverySection, setShowDeliverySection] = useState(true)
    const [providerNotes, setProviderNotes] = useState<Record<string, string>>(order.provider_notes ?? {})
    const [venueId, setVenueId] = useState<string | null>(order.venue_id)
    const [activeTab, setActiveTab] = useState<'lineas' | 'discrepancias'>(
        searchParams.get('tab') === 'discrepancias' ? 'discrepancias' : 'lineas'
    )
    const [confirmDialog, setConfirmDialog] = useState<{
        title: string
        description: string
        onConfirm: () => void
    } | null>(null)

    // Sync client state when server sends fresh data (triggered by router.refresh())
    useEffect(() => {
        setLines(order.lines)
        setDeliveryStatus(order.delivery_status as DeliveryStatus)
    }, [order.lines, order.delivery_status])

    const isDraft = currentStatus === 'draft'
    const isSent = currentStatus === 'sent'
    const showDelivery = isSent

    function showToast(type: 'success' | 'error', message: string) {
        setToast({ type, message })
        setTimeout(() => setToast(null), 4000)
    }

    function askConfirm(title: string, description: string, onConfirm: () => void) {
        setConfirmDialog({ title, description, onConfirm })
    }

    function handleMerged(lineId: string, newQty: number) {
        setLines((prev) => prev.map((l) => l.id === lineId ? { ...l, quantity: newQty } : l))
        showToast('success', 'Cantidad actualizada')
    }

    function handleCancelLine(lineId: string) {
        startTransition(async () => {
            const res = await cancelPendingLines(order.id, [lineId])
            if (res.success) {
                setLines((prev) => {
                    const next = prev.map((l) => {
                        if (l.id !== lineId) return l
                        const qtyToCancel = getQuantityToCancel(l)
                        return l.qty_received > 0
                            ? {
                                ...l,
                                qty_cancelled: qtyToCancel,
                                cancelled_reason: 'Proveedor no entregara el pendiente',
                                cancelled_at: new Date().toISOString(),
                            }
                            : {
                                ...l,
                                is_cancelled: true,
                                qty_cancelled: qtyToCancel,
                                cancelled_reason: 'Linea no entregada',
                                cancelled_at: new Date().toISOString(),
                            }
                    })
                    setDeliveryStatus(calcDeliveryStatus(next))
                    return next
                })
            } else {
                showToast('error', res.error ?? 'Error al cancelar la línea')
            }
        })
    }

    const [orderNotes, setOrderNotes] = useState(order.notes ?? '')
    async function handleOrderNotesBlur() {
        const trimmed = orderNotes.trim()
        if (trimmed === (order.notes ?? '').trim()) return
        await updateOrderNotes(order.id, trimmed || null)
    }

    function handleDelete(lineId: string) {
        startTransition(async () => {
            const res = await deleteOrderLine(lineId)
            if (res.success) {
                setLines((prev) => prev.filter((l) => l.id !== lineId))
            } else {
                showToast('error', res.error ?? 'Error al eliminar la línea')
            }
        })
    }

    function handleQtyChange(lineId: string, qty: number) {
        startTransition(async () => {
            const res = await updateOrderLine(lineId, { quantity: qty })
            if (res.success) {
                setLines((prev) => prev.map((l) => l.id === lineId ? { ...l, quantity: qty } : l))
            } else {
                showToast('error', res.error ?? 'Error al actualizar la cantidad')
            }
        })
    }

    function handleLinked(lineId: string, masterItemName: string) {
        setLines((prev) => prev.map((l) =>
            l.id === lineId ? { ...l, is_matched: true, master_item_name: masterItemName } : l
        ))
        showToast('success', 'Línea vinculada correctamente')
    }

    function handleAdded(newLines: OrderLineDetail[]) {
        setLines((prev) => [...prev, ...newLines])
        showToast('success', `${newLines.length} línea${newLines.length !== 1 ? 's' : ''} añadida${newLines.length !== 1 ? 's' : ''}`)
    }

    function handleCancel() {
        askConfirm(
            'Cancelar pedido',
            '¿Cancelar este pedido? Esta acción no se puede deshacer.',
            () => startTransition(async () => {
                const res = await cancelOrder(order.id)
                if (res.success) {
                    setCurrentStatus('cancelled')
                    showToast('success', 'Pedido cancelado')
                } else {
                    showToast('error', res.error ?? 'Error al cancelar')
                }
            })
        )
    }

    function handleMarkAsSent() {
        askConfirm(
            'Marcar como enviado',
            'Este pedido se marcará como enviado sin enviarse realmente. Usá esto solo para pedidos hechos por teléfono o para pruebas.',
            () => startTransition(async () => {
                const res = await markAsSent(order.id)
                if (res.success) {
                    setCurrentStatus('sent')
                    showToast('success', 'Pedido marcado como enviado')
                } else {
                    showToast('error', res.error ?? 'Error')
                }
            })
        )
    }

    function handleSplitByProvider() {
        const providerCount = new Set(lines.map((l) => l.provider_id ?? '__none__')).size
        askConfirm(
            'Separar por proveedor',
            `Se crearán ${providerCount} pedidos independientes (uno por proveedor). Las notas actuales se copiarán a cada uno. Este borrador se eliminará.`,
            () => startTransition(async () => {
                const res = await splitOrderByProvider(order.id)
                if (res.success) {
                    router.push('/pedidos')
                } else {
                    showToast('error', res.error ?? 'Error al dividir el pedido')
                }
            })
        )
    }

    async function handleVenueChange(newVenueId: string | null) {
        setVenueId(newVenueId)
        await updateOrderVenue(order.id, newVenueId)
    }

    async function handleProviderNoteBlur(providerKey: string, value: string) {
        const current = providerNotes[providerKey] ?? ''
        if (value.trim() === current) return
        setProviderNotes((prev) => {
            const next = { ...prev }
            if (value.trim()) next[providerKey] = value.trim()
            else delete next[providerKey]
            return next
        })
        await updateProviderNotes(order.id, providerKey, value)
    }

    function handleDeliveryRegistered(
        updates: { line_id: string; qty_received: number; notes: string | null }[],
        _hadExtras: boolean
    ) {
        // Optimistic update — immediate feedback while router.refresh() fetches fresh server data
        const nextLines = lines.map((l) => {
            const u = updates.find((x) => x.line_id === l.id)
            return u ? { ...l, qty_received: u.qty_received, notes: u.notes ?? l.notes } : l
        })
        setLines(nextLines)
        setDeliveryStatus(calcDeliveryStatus(nextLines))
        setShowDeliveryPanel(false)
        showToast('success', 'Recepción registrada')
        // Refresh server data — the useEffect above will sync lines/deliveryStatus from fresh order prop
        router.refresh()
    }

    function handleNotifyModification() {
        startTransition(async () => {
            const res = await notifyOrderModification(order.id)
            if (res.success) {
                showToast('success', 'Modificación notificada al proveedor')
            } else {
                showToast('error', res.error ?? 'Error al notificar')
            }
        })
    }

    function handleCancelPendingLines() {
        const pendingIds = lines
            .filter(isLinePending)
            .map((l) => l.id)
        if (pendingIds.length === 0) return

        askConfirm(
            'Cancelar líneas pendientes',
            `¿Cancelar ${pendingIds.length} línea${pendingIds.length !== 1 ? 's' : ''} pendiente${pendingIds.length !== 1 ? 's' : ''}? Esta acción no se puede deshacer.`,
            () => startTransition(async () => {
                const res = await cancelPendingLines(order.id, pendingIds)
                if (res.success) {
                    setLines((prev) => {
                        const next = prev.map((l) => {
                            if (!pendingIds.includes(l.id)) return l
                            const qtyToCancel = getQuantityToCancel(l)
                            return l.qty_received > 0
                                ? {
                                    ...l,
                                    qty_cancelled: qtyToCancel,
                                    cancelled_reason: 'Proveedor no entregara el pendiente',
                                    cancelled_at: new Date().toISOString(),
                                }
                                : {
                                    ...l,
                                    is_cancelled: true,
                                    qty_cancelled: qtyToCancel,
                                    cancelled_reason: 'Linea no entregada',
                                    cancelled_at: new Date().toISOString(),
                                }
                        })
                        setDeliveryStatus(calcDeliveryStatus(next))
                        return next
                    })
                    showToast('success', 'Líneas pendientes canceladas')
                } else {
                    showToast('error', res.error ?? 'Error al cancelar líneas')
                }
            })
        )
    }

    // Group lines by provider
    const groups = new Map<string | null, {
        name: string; channel: string | null; phone: string | null; email: string | null; lines: OrderLineDetail[]
    }>()
    for (const line of lines) {
        const key = line.provider_id
        const existing = groups.get(key)
        if (existing) {
            existing.lines.push(line)
        } else {
            groups.set(key, {
                name: line.provider_name ?? 'Sin proveedor',
                channel: line.provider_channel,
                phone: line.provider_phone,
                email: line.provider_email,
                lines: [line],
            })
        }
    }

    const totalEstimated = lines.reduce((sum, l) => {
        if (l.estimated_unit_price != null) return sum + l.estimated_unit_price * l.quantity
        return sum
    }, 0)

    const unmatchedCount = lines.filter((l) => !l.is_matched && !l.is_cancelled).length
    const pendingCount = lines.filter(isLinePending).length
    const activeLinesForDelivery = lines.filter((l) => !l.is_cancelled)
    const orderId = order.id.slice(0, 8).toUpperCase()

    return (
        <div className="flex flex-col gap-6 pb-24">
            {/* Back */}
            <Link
                href="/pedidos"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
            >
                <ArrowLeft className="h-4 w-4" />
                Pedidos
            </Link>

            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                    <Package className="h-7 w-7 text-muted-foreground" />
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Pedido #{orderId}</h1>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            {formatDate(order.created_at)}
                            {order.created_by && ` · por ${order.created_by}`}
                        </p>
                        {venues.length > 0 && (
                            <div className="mt-1.5 flex items-center gap-1.5">
                                <MapPin className={`h-3.5 w-3.5 shrink-0 ${isDraft && !venueId ? 'text-amber-500' : 'text-muted-foreground'}`} />
                                {isDraft ? (
                                    <select
                                        value={venueId ?? ''}
                                        onChange={(e) => handleVenueChange(e.target.value || null)}
                                        className={`rounded border px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring ${
                                            !venueId
                                                ? 'border-amber-400 bg-amber-50 text-amber-700 ring-amber-400 dark:bg-amber-950 dark:text-amber-300'
                                                : 'border-input bg-background text-muted-foreground'
                                        }`}
                                    >
                                        <option value="">Sin local asignado</option>
                                        {venues.map((v) => (
                                            <option key={v.id} value={v.id}>{v.name}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <span className="text-xs text-muted-foreground">
                                        {venues.find(v => v.id === venueId)?.name ?? 'Sin local asignado'}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge status={currentStatus} isTemplate={isTemplate} />
                    {isSent && <DeliveryStatusBadge status={deliveryStatus} />}
                    {isDraft && (
                        <>
                            {new Set(lines.map((l) => l.provider_id ?? '__none__')).size > 1 && (
                                <Button
                                    variant="outline" size="sm" onClick={handleSplitByProvider} disabled={isPending}
                                    className="text-xs"
                                    title="Crea un pedido separado por cada proveedor"
                                >
                                    <Scissors className="h-3.5 w-3.5" />
                                    Separar por proveedor
                                </Button>
                            )}
                            <Button
                                variant="outline" size="sm" onClick={handleMarkAsSent} disabled={isPending}
                                className="text-muted-foreground hover:text-foreground text-xs"
                                title="Para pedidos por teléfono o pruebas"
                            >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Marcar enviado
                            </Button>
                            <Button
                                variant="outline" size="sm" onClick={handleCancel} disabled={isPending}
                                className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                            >
                                <XCircle className="h-3.5 w-3.5" />
                                Cancelar pedido
                            </Button>
                        </>
                    )}
                </div>
            </div>


            {/* Scheduling panel — only for drafts */}
            {isDraft && (
                <>
                    {/* Late send warning: scheduled date passed but still draft */}
                    {scheduledFor && !isTemplate && new Date(scheduledFor) <= new Date() && (
                        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            <span>
                                Este pedido debía enviarse el{' '}
                                <strong>{new Date(scheduledFor).toLocaleString('es-ES', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</strong>{' '}
                                pero no se envió automáticamente.
                            </span>
                            <SendOrderButton orderId={order.id} lines={lines} venueId={venueId} compact />
                        </div>
                    )}
                    <SchedulingPanel
                        orderId={order.id}
                        venueId={venueId}
                        scheduledFor={scheduledFor}
                        isTemplate={isTemplate}
                        recurrenceCron={recurrenceCron}
                        recurrenceLabel={recurrenceLabel}
                        nextRunAt={nextRunAt}
                        onScheduleChange={setScheduledFor}
                        onRecurrenceChange={(tmpl, cron, label, nxt) => {
                            setIsTemplate(tmpl)
                            setRecurrenceCron(cron)
                            setRecurrenceLabel(label)
                            setNextRunAt(nxt)
                        }}
                    />
                </>
            )}

            {/* General order notes */}
            <div className="rounded-lg border border-border bg-card px-4 py-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notas del pedido</span>
                </div>
                <textarea
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    onBlur={handleOrderNotesBlur}
                    placeholder="Notas generales sobre este pedido..."
                    rows={2}
                    className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring"
                />
            </div>

            {/* Tab navigation — only for sent orders */}
            {isSent && (
                <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1 w-fit">
                    <button
                        onClick={() => setActiveTab('lineas')}
                        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                            activeTab === 'lineas'
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <Package className="h-3.5 w-3.5" />
                        Líneas
                    </button>
                    <button
                        onClick={() => setActiveTab('discrepancias')}
                        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                            activeTab === 'discrepancias'
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Discrepancias
                        {linkedDocuments.length > 0 && (
                            <span className="ml-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-100 px-1 text-xs font-medium text-orange-700">
                                {linkedDocuments.length}
                            </span>
                        )}
                    </button>
                </div>
            )}

            {/* Discrepancias tab content */}
            {isSent && activeTab === 'discrepancias' && (
                <DiscrepanciasTab orderId={order.id} initialLinkedDocuments={linkedDocuments} />
            )}

            {/* Lines tab content */}
            {(!isSent || activeTab === 'lineas') && (<>

            {/* Unmatched warning */}
            {unmatchedCount > 0 && isDraft && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                        {unmatchedCount} línea{unmatchedCount !== 1 ? 's' : ''} sin vincular al catálogo.
                        Vincula los productos antes de enviar el pedido.
                    </span>
                </div>
            )}

            {/* Delivery actions bar — only for sent orders */}
            {isSent && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/20 px-4 py-2.5">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Truck className="h-4 w-4" />
                        <span>
                            {deliveryStatus === 'delivered'
                                ? 'Pedido completamente entregado'
                                : deliveryStatus === 'partially_delivered'
                                    ? `${pendingCount} línea${pendingCount !== 1 ? 's' : ''} pendiente${pendingCount !== 1 ? 's' : ''} de entrega`
                                    : `${activeLinesForDelivery.length} línea${activeLinesForDelivery.length !== 1 ? 's' : ''} pendiente${activeLinesForDelivery.length !== 1 ? 's' : ''} de entrega`
                            }
                        </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleNotifyModification}
                            disabled={isPending}
                            className="text-xs"
                            title="Re-envía el pedido al proveedor con etiqueta de modificación"
                        >
                            <Send className="h-3.5 w-3.5" />
                            Notificar modificación
                        </Button>
                        {pendingCount > 0 && (
                            <>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setShowDeliveryPanel((v) => !v)}
                                    disabled={isPending}
                                    className="text-xs"
                                >
                                    <Truck className="h-3.5 w-3.5" />
                                    Registrar recepción
                                    {showDeliveryPanel ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleCancelPendingLines}
                                    disabled={isPending}
                                    className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                                >
                                    <XCircle className="h-3.5 w-3.5" />
                                    Cancelar pendientes
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Register delivery panel */}
            {showDeliveryPanel && activeLinesForDelivery.length > 0 && (
                <RegisterDeliveryPanel
                    lines={activeLinesForDelivery.filter(isLinePending)}
                    orderId={order.id}
                    masterItems={masterItems}
                    activePrices={activePrices}
                    onSuccess={handleDeliveryRegistered}
                    onClose={() => setShowDeliveryPanel(false)}
                />
            )}

            {/* Lines grouped by provider */}
            {lines.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
                    <Package className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">Sin líneas en este pedido.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Collapsible header for sent orders */}
                    {isSent && (
                        <button
                            onClick={() => setShowDeliverySection((v) => !v)}
                            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                            {showDeliverySection ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            {showDeliverySection ? 'Ocultar líneas' : 'Mostrar líneas'}
                        </button>
                    )}

                    {(!isSent || showDeliverySection) && (
                        <>
                            {Array.from(groups.entries()).map(([providerId, group]) => {
                                const providerKey = providerId ?? '__none__'
                                return (
                                    <ProviderGroup
                                        key={providerKey}
                                        providerName={group.name}
                                        channel={group.channel}
                                        phone={group.phone}
                                        email={group.email}
                                        lines={group.lines}
                                        isDraft={isDraft}
                                        showDelivery={showDelivery}
                                        masterItems={masterItems}
                                        providers={providers}
                                        onDelete={handleDelete}
                                        onQtyChange={handleQtyChange}
                                        onLinked={handleLinked}
                                        initialNotes={providerNotes[providerKey] ?? ''}
                                        onNotesBlur={(value) => handleProviderNoteBlur(providerKey, value)}
                                        onCancelLine={handleCancelLine}
                                    />
                                )
                            })}
                        </>
                    )}
                </div>
            )}

            {/* Add products panel — drafts and sent orders */}
            {(isDraft || isSent) && (
                <AddProductsPanel
                    orderId={order.id}
                    masterItems={masterItems}
                    providers={providers}
                    activePrices={activePrices}
                    aliasFormats={aliasFormats}
                    existingLines={lines}
                    onAdded={handleAdded}
                    onMerged={handleMerged}
                />
            )}

            </>)} {/* end lines tab content */}

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
                    {toast.type === 'success'
                        ? <CheckCircle className="h-4 w-4 shrink-0" />
                        : <AlertCircle className="h-4 w-4 shrink-0" />}
                    {toast.message}
                </div>
            )}

            {/* Confirm dialog */}
            <AlertDialog open={!!confirmDialog} onOpenChange={(open) => { if (!open) setConfirmDialog(null) }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{confirmDialog?.title}</AlertDialogTitle>
                        <AlertDialogDescription>{confirmDialog?.description}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => { confirmDialog?.onConfirm(); setConfirmDialog(null) }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Confirmar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Sticky footer */}
            {isDraft && lines.length > 0 && (
                <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between gap-3 border-t border-border bg-background/95 backdrop-blur-sm px-6 py-3">
                    <div className="text-sm text-muted-foreground">
                        {lines.length} línea{lines.length !== 1 ? 's' : ''}
                        {totalEstimated > 0 && (
                            <span className="ml-2 font-medium text-foreground">· Est. {formatEur(totalEstimated)}</span>
                        )}
                        {scheduledFor && !isTemplate && (
                            <span className="ml-2 text-blue-600 flex items-center gap-1 inline-flex">
                                <Clock className="h-3 w-3" />
                                Prog. {new Date(scheduledFor).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </span>
                        )}
                    </div>
                    {isTemplate ? (
                        <div className="flex items-center gap-1.5 text-sm text-purple-600">
                            <RefreshCw className="h-4 w-4" />
                            Plantilla — los envíos son automáticos
                        </div>
                    ) : (
                        <SendOrderButton orderId={order.id} lines={lines} venueId={venueId} />
                    )}
                </div>
            )}
        </div>
    )
}
