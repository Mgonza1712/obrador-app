'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Package, MessageCircle, Globe, ChevronRight, CheckCircle2, Clock, XCircle, Truck, PackageCheck, PackageX, Filter, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { OrderSummary } from '@/app/actions/pedidos'

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
    if (status === 'sent') {
        return (
            <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Enviado
            </Badge>
        )
    }
    if (status === 'cancelled') {
        return (
            <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300">
                <XCircle className="mr-1 h-3 w-3" />
                Cancelado
            </Badge>
        )
    }
    return (
        <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            <Clock className="mr-1 h-3 w-3" />
            Borrador
        </Badge>
    )
}

function DeliveryBadge({ status }: { status: string }) {
    if (status === 'delivered') {
        return (
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px] px-1.5 py-0">
                <PackageCheck className="mr-1 h-2.5 w-2.5" />Entregado
            </Badge>
        )
    }
    if (status === 'partially_delivered') {
        return (
            <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700 text-[10px] px-1.5 py-0">
                <Truck className="mr-1 h-2.5 w-2.5" />Parcial
            </Badge>
        )
    }
    if (status === 'invoiced') {
        return (
            <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 text-[10px] px-1.5 py-0">
                <CheckCircle2 className="mr-1 h-2.5 w-2.5" />Facturado
            </Badge>
        )
    }
    return (
        <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-500 text-[10px] px-1.5 py-0">
            <PackageX className="mr-1 h-2.5 w-2.5" />Pte. entrega
        </Badge>
    )
}

function ChannelIcon({ channel }: { channel: string }) {
    if (channel === 'whatsapp') return <MessageCircle className="h-3.5 w-3.5 text-green-600" />
    return <Globe className="h-3.5 w-3.5 text-blue-500" />
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    })
}

// ── Component ─────────────────────────────────────────────────────────────────

type Filter = 'all' | 'draft' | 'sent' | 'cancelled'

export default function OrdersTable({ orders }: { orders: OrderSummary[] }) {
    const [filter, setFilter] = useState<Filter>('all')
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')
    const [providerFilter, setProviderFilter] = useState('all')

    const allProviders = [...new Set(orders.flatMap((o) => o.providers))].sort()

    const filtered = orders.filter((o) => {
        if (filter !== 'all' && o.status !== filter) return false
        if (dateFrom) {
            const orderDate = new Date(o.created_at)
            const fromDate = new Date(dateFrom)
            if (orderDate < fromDate) return false
        }
        if (dateTo) {
            const orderDate = new Date(o.created_at)
            const toDate = new Date(dateTo)
            toDate.setDate(toDate.getDate() + 1)
            if (orderDate >= toDate) return false
        }
        if (providerFilter !== 'all' && !o.providers.includes(providerFilter)) return false
        return true
    })

    const counts = {
        all: orders.length,
        draft: orders.filter((o) => o.status === 'draft').length,
        sent: orders.filter((o) => o.status === 'sent').length,
        cancelled: orders.filter((o) => o.status === 'cancelled').length,
    }

    if (orders.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-20 text-center">
                <Package className="h-10 w-10 text-muted-foreground/40" />
                <div>
                    <p className="text-sm font-medium text-muted-foreground">Sin pedidos todavía</p>
                    <p className="mt-0.5 text-xs text-muted-foreground/70">
                        Los pedidos creados por WhatsApp o desde la web aparecerán aquí.
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* Filter row */}
            <div className="flex flex-wrap items-center gap-3">
                {/* Status tabs */}
                <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1">
                    {(['all', 'draft', 'sent', 'cancelled'] as Filter[]).map((f) => {
                        const labels: Record<Filter, string> = {
                            all: 'Todos',
                            draft: 'Borrador',
                            sent: 'Enviados',
                            cancelled: 'Cancelados',
                        }
                        return (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                                    filter === f
                                        ? 'bg-background text-foreground shadow-sm'
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                {labels[f]}
                                {counts[f] > 0 && (
                                    <span className="ml-1.5 text-muted-foreground">{counts[f]}</span>
                                )}
                            </button>
                        )
                    })}
                </div>

                {/* Divider */}
                <div className="h-5 w-px bg-border" />

                {/* Date filters */}
                <div className="flex items-center gap-1.5">
                    <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                    <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        title="Desde"
                    />
                    <span className="text-xs text-muted-foreground">—</span>
                    <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        title="Hasta"
                    />
                </div>

                {/* Provider filter */}
                {allProviders.length > 0 && (
                    <select
                        value={providerFilter}
                        onChange={(e) => setProviderFilter(e.target.value)}
                        className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                        <option value="all">Todos los proveedores</option>
                        {allProviders.map((p) => (
                            <option key={p} value={p}>{p}</option>
                        ))}
                    </select>
                )}

                {/* Clear filters */}
                {(dateFrom || dateTo || providerFilter !== 'all') && (
                    <button
                        onClick={() => { setDateFrom(''); setDateTo(''); setProviderFilter('all') }}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                        Limpiar filtros
                    </button>
                )}
            </div>

            {/* Table */}
            <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-border bg-muted/30">
                            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Pedido</th>
                            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Origen</th>
                            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Categorías / Proveedores</th>
                            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Productos</th>
                            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Estado</th>
                            <th className="px-4 py-3 w-10" />
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                                    Sin pedidos en este estado.
                                </td>
                            </tr>
                        ) : (
                            filtered.map((order) => (
                                <tr
                                    key={order.id}
                                    className="border-b border-border last:border-0 hover:bg-accent/30 transition-colors"
                                >
                                    <td className="px-4 py-3">
                                        <div className="font-mono text-xs text-muted-foreground"># {order.id.slice(0, 8).toUpperCase()}</div>
                                        <div className="text-xs text-muted-foreground/70 mt-0.5">{formatDate(order.created_at)}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-1.5">
                                            <ChannelIcon channel={order.source_channel} />
                                            <span className="text-muted-foreground capitalize">
                                                {order.source_channel === 'whatsapp' ? 'WhatsApp' : 'Web'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 max-w-xs">
                                        <div className="flex flex-wrap gap-1">
                                            {order.providers.slice(0, 3).map((p) => (
                                                <Badge key={p} variant="secondary" className="text-xs px-1.5 py-0 font-normal">
                                                    {p}
                                                </Badge>
                                            ))}
                                            {order.providers.length > 3 && (
                                                <Badge variant="secondary" className="text-xs px-1.5 py-0 font-normal text-muted-foreground">
                                                    +{order.providers.length - 3}
                                                </Badge>
                                            )}
                                        </div>
                                        {order.categories.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {order.categories.slice(0, 3).map((c) => (
                                                    <span key={c} className="text-[10px] text-muted-foreground/70">{c}</span>
                                                ))}
                                                {order.categories.length > 3 && (
                                                    <span className="text-[10px] text-muted-foreground/70">+{order.categories.length - 3}</span>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums">
                                        <span className="font-medium">{order.total_lines}</span>
                                        {order.total_lines > order.matched_lines && (
                                            <span className="ml-1 text-xs text-amber-600">
                                                ({order.total_lines - order.matched_lines} sin vincular)
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex flex-col gap-1">
                                            <StatusBadge status={order.status} />
                                            {order.status === 'sent' && order.delivery_status !== 'pending' && (
                                                <DeliveryBadge status={order.delivery_status} />
                                            )}
                                            {order.linked_documents_count > 0 && (
                                                <Link
                                                    href={`/pedidos/${order.id}?tab=discrepancias`}
                                                    className="inline-flex w-fit items-center gap-1 rounded border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[10px] font-medium text-orange-700 transition-colors hover:bg-orange-100"
                                                >
                                                    <AlertTriangle className="h-2.5 w-2.5" />
                                                    Discrepancias
                                                    <span className="text-orange-500">{order.linked_documents_count}</span>
                                                </Link>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <Link
                                            href={`/pedidos/${order.id}`}
                                            className="flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            <ChevronRight className="h-4 w-4" />
                                        </Link>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
