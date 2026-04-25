'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
    ArrowLeft, CheckCircle2, Clock, XCircle, MessageCircle, Globe, Mail, Phone,
    Trash2, Loader2, AlertCircle, CheckCircle, Package, AlertTriangle, RefreshCw,
    Truck, PackageCheck, PackageX, ChevronDown, ChevronUp, Scissors, MapPin,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { deleteOrderLine, updateOrderLine, cancelOrder, registerDelivery, cancelPendingLines, markAsSent, updateProviderNotes, splitOrderByProvider, updateOrderVenue } from '@/app/actions/pedidos'
import SendOrderButton from './SendOrderButton'
import UnmatchedLineRow from './UnmatchedLineRow'
import AddProductsPanel from './AddProductsPanel'
import SchedulingPanel from './SchedulingPanel'
import type { OrderDetail, OrderLineDetail, DeliveryStatus } from '@/app/actions/pedidos'

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
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcDeliveryStatus(lines: OrderLineDetail[]): DeliveryStatus {
    const active = lines.filter((l) => !l.is_cancelled)
    if (active.length === 0) return 'delivered'
    const allDelivered = active.every((l) => l.qty_received >= l.quantity)
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
            type="number" min="0" step="0.001" autoFocus value={local}
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

function RegisterDeliveryPanel({
    lines,
    orderId,
    onSuccess,
    onClose,
}: {
    lines: OrderLineDetail[]
    orderId: string
    onSuccess: (updates: { line_id: string; qty_received: number }[]) => void
    onClose: () => void
}) {
    const [received, setReceived] = useState<Record<string, string>>(
        () => Object.fromEntries(lines.map((l) => [l.id, l.qty_received > 0 ? l.qty_received.toString() : '']))
    )
    const [isPending, startTransition] = useTransition()

    function markAll() {
        setReceived(Object.fromEntries(lines.map((l) => [l.id, l.quantity.toString()])))
    }

    function handleConfirm() {
        const updates = lines.map((l) => ({
            line_id: l.id,
            qty_received: parseFloat(received[l.id] ?? '0') || 0,
        }))
        startTransition(async () => {
            const res = await registerDelivery(orderId, updates)
            if (res.success) {
                onSuccess(updates)
            }
        })
    }

    return (
        <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                    <Truck className="h-4 w-4 text-muted-foreground" />
                    Registrar recepción
                </h3>
                <button
                    onClick={markAll}
                    className="text-xs text-primary hover:underline"
                >
                    Marcar todo recibido
                </button>
            </div>
            <div className="space-y-2">
                {lines.map((l) => (
                    <div key={l.id} className="flex items-center gap-3 text-sm">
                        <span className="flex-1 min-w-0 truncate">
                            {l.master_item_name ?? l.raw_text}
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0">
                            {formatQty(l.quantity, l.unit)}
                        </span>
                        <input
                            type="number"
                            min="0"
                            max={l.quantity}
                            step="0.001"
                            placeholder="0"
                            value={received[l.id] ?? ''}
                            onChange={(e) => setReceived((prev) => ({ ...prev, [l.id]: e.target.value }))}
                            className="w-20 shrink-0 rounded border border-input bg-background px-2 py-1 text-right text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                    </div>
                ))}
            </div>
            <div className="flex justify-end gap-2 pt-1">
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
    initialNotes, onNotesBlur,
}: {
    providerName: string; channel: string | null; phone: string | null; email: string | null
    lines: OrderLineDetail[]; isDraft: boolean; showDelivery: boolean
    masterItems: MasterItemOption[]; providers: ProviderOption[]
    onDelete: (lineId: string) => void
    onQtyChange: (lineId: string, qty: number) => void
    onLinked: (lineId: string, masterItemName: string) => void
    initialNotes: string
    onNotesBlur: (value: string) => void
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
                <tbody>
                    {lines.map((line) => {
                        const isPending = !line.is_cancelled && line.qty_received < line.quantity
                        const isFullyReceived = !line.is_cancelled && line.qty_received >= line.quantity

                        return (
                            <tr
                                key={line.id}
                                className={`border-b border-border last:border-0 ${
                                    line.is_cancelled
                                        ? 'opacity-50 bg-muted/20'
                                        : showDelivery && isPending
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
                                                <Badge variant="outline" className="text-xs border-slate-300 bg-slate-50 text-slate-500 shrink-0">
                                                    Cancelado
                                                </Badge>
                                            )}
                                            {!line.is_matched && !line.is_cancelled && (
                                                <Badge variant="outline" className="text-xs border-amber-300 bg-amber-50 text-amber-700 shrink-0">
                                                    Sin vincular
                                                </Badge>
                                            )}
                                        </div>
                                        {line.raw_text !== line.master_item_name && line.master_item_name && (
                                            <p className="mt-0.5 text-xs text-muted-foreground">&quot;{line.raw_text}&quot;</p>
                                        )}
                                        {!line.is_matched && isDraft && (
                                            <UnmatchedLineRow
                                                line={line}
                                                masterItems={masterItems}
                                                providers={providers}
                                                onLinked={onLinked}
                                            />
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
                                                line.qty_received === 0
                                                    ? 'text-muted-foreground'
                                                    : isFullyReceived
                                                        ? 'text-emerald-600 font-medium'
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
                                {isDraft && (
                                    <td className="px-4 py-3 w-10">
                                        <button
                                            onClick={() => onDelete(line.id)}
                                            className="text-muted-foreground hover:text-destructive transition-colors"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </td>
                                )}
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

export default function OrderDetailClient({ order, masterItems, providers, activePrices, aliasFormats, venues }: Props) {
    const router = useRouter()
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

    const isDraft = currentStatus === 'draft'
    const isSent = currentStatus === 'sent'
    const showDelivery = isSent

    function showToast(type: 'success' | 'error', message: string) {
        setToast({ type, message })
        setTimeout(() => setToast(null), 4000)
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
        if (!confirm('¿Cancelar este pedido? Esta acción no se puede deshacer.')) return
        startTransition(async () => {
            const res = await cancelOrder(order.id)
            if (res.success) {
                setCurrentStatus('cancelled')
                showToast('success', 'Pedido cancelado')
            } else {
                showToast('error', res.error ?? 'Error al cancelar')
            }
        })
    }

    function handleMarkAsSent() {
        if (!confirm('¿Marcar este pedido como enviado sin enviarlo realmente? Usá esto solo para pedidos hechos por teléfono o para pruebas.')) return
        startTransition(async () => {
            const res = await markAsSent(order.id)
            if (res.success) {
                setCurrentStatus('sent')
                showToast('success', 'Pedido marcado como enviado')
            } else {
                showToast('error', res.error ?? 'Error')
            }
        })
    }

    function handleSplitByProvider() {
        const providerCount = new Set(lines.map((l) => l.provider_id ?? '__none__')).size
        if (!confirm(
            `¿Separar este pedido en ${providerCount} pedidos independientes (uno por proveedor)?\n\n` +
            `Las notas actuales se copian a cada uno como punto de partida. ` +
            `Este borrador se eliminará.`
        )) return
        startTransition(async () => {
            const res = await splitOrderByProvider(order.id)
            if (res.success) {
                router.push('/pedidos')
            } else {
                showToast('error', res.error ?? 'Error al dividir el pedido')
            }
        })
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

    function handleDeliveryRegistered(updates: { line_id: string; qty_received: number }[]) {
        setLines((prev) => {
            const next = prev.map((l) => {
                const u = updates.find((x) => x.line_id === l.id)
                return u ? { ...l, qty_received: u.qty_received } : l
            })
            setDeliveryStatus(calcDeliveryStatus(next))
            return next
        })
        setShowDeliveryPanel(false)
        showToast('success', 'Recepción registrada')
    }

    function handleCancelPendingLines() {
        const pendingIds = lines
            .filter((l) => !l.is_cancelled && l.qty_received < l.quantity)
            .map((l) => l.id)
        if (pendingIds.length === 0) return

        if (!confirm(`¿Cancelar ${pendingIds.length} línea${pendingIds.length !== 1 ? 's' : ''} pendiente${pendingIds.length !== 1 ? 's' : ''}? Esta acción no se puede deshacer.`)) return

        startTransition(async () => {
            const res = await cancelPendingLines(order.id, pendingIds)
            if (res.success) {
                setLines((prev) => {
                    const next = prev.map((l) =>
                        pendingIds.includes(l.id) ? { ...l, is_cancelled: true } : l
                    )
                    setDeliveryStatus(calcDeliveryStatus(next))
                    return next
                })
                showToast('success', 'Líneas pendientes canceladas')
            } else {
                showToast('error', res.error ?? 'Error al cancelar líneas')
            }
        })
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
    const pendingCount = lines.filter((l) => !l.is_cancelled && l.qty_received < l.quantity).length
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
                                <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                {isDraft ? (
                                    <select
                                        value={venueId ?? ''}
                                        onChange={(e) => handleVenueChange(e.target.value || null)}
                                        className="rounded border border-input bg-background px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring text-muted-foreground"
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
                <SchedulingPanel
                    orderId={order.id}
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
            )}

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
                    <div className="flex items-center gap-2">
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
                    lines={activeLinesForDelivery.filter((l) => l.qty_received < l.quantity)}
                    orderId={order.id}
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
                            <div className={`hidden sm:grid gap-x-4 px-4 text-xs font-medium uppercase text-muted-foreground ${
                                showDelivery
                                    ? 'sm:grid-cols-[1fr_auto_auto_auto_auto]'
                                    : isDraft
                                        ? 'sm:grid-cols-[1fr_auto_auto_auto_auto]'
                                        : 'sm:grid-cols-[1fr_auto_auto_auto]'
                            }`}>
                                <span>Producto</span>
                                <span className="text-right">Cant. pedida</span>
                                {showDelivery && <span className="text-right">Recibido</span>}
                                <span className="text-right">P. unit est.</span>
                                <span className="text-right">Total est.</span>
                                {isDraft && <span />}
                            </div>
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
                                    />
                                )
                            })}
                        </>
                    )}
                </div>
            )}

            {/* Add products panel — only for drafts */}
            {isDraft && (
                <AddProductsPanel
                    orderId={order.id}
                    masterItems={masterItems}
                    providers={providers}
                    activePrices={activePrices}
                    aliasFormats={aliasFormats}
                    onAdded={handleAdded}
                />
            )}

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
                        <SendOrderButton orderId={order.id} lines={lines} />
                    )}
                </div>
            )}
        </div>
    )
}
