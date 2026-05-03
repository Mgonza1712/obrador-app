'use server'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { AUTO_CLOSED_REMAINDER_REASON, getAutoClosePendingQuantity, isLineDelivered, isLinePending } from '@/lib/orders/deliveryTolerance'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VenueInfo {
    id: string
    name: string
    tenant_id: string
}

export interface PendingOrderLine {
    id: string
    raw_text: string
    quantity: number
    unit: string | null
    qty_received: number
    qty_cancelled: number
    category: string | null
    base_unit: string | null
    provider_name: string | null
}

export interface PendingOrder {
    id: string
    sent_at: string | null
    notes: string | null
    delivery_status: string
    scan_submitted_at: string | null
    providers: string[]
    lines: PendingOrderLine[]
}

export interface RecepcionResult {
    success: boolean
    error?: string
}

// ─── Token validation ─────────────────────────────────────────────────────────

export async function validateVenueToken(token: string): Promise<VenueInfo | null> {
    if (!token || token.length < 10) return null
    const supabase = createServiceClient()
    const { data } = await (supabase as any)
        .from('erp_venues')
        .select('id, name, tenant_id')
        .eq('reception_token', token)
        .maybeSingle()
    return data ?? null
}

// ─── Pending orders (no prices exposed) ──────────────────────────────────────

export async function getPendingOrdersForVenue(venueId: string): Promise<PendingOrder[]> {
    const supabase = createServiceClient()
    const sb = supabase as any

    const { data: orders } = await sb
        .from('erp_purchase_orders')
        .select('id, sent_at, notes, delivery_status, scan_submitted_at')
        .eq('venue_id', venueId)
        .eq('status', 'sent')
        .in('delivery_status', ['pending', 'partially_delivered'])
        .order('sent_at', { ascending: false })

    if (!orders || (orders as any[]).length === 0) return []

    const orderIds = (orders as any[]).map((o: any) => o.id)

    const { data: lines } = await sb
        .from('erp_purchase_order_lines')
        .select('id, order_id, raw_text, quantity, unit, qty_received, qty_cancelled, erp_providers(name), erp_master_items(category, base_unit)')
        .in('order_id', orderIds)
        .or('is_cancelled.is.null,is_cancelled.eq.false')

    return (orders as any[]).map((o: any) => {
        const orderLines = ((lines ?? []) as any[]).filter((l: any) => l.order_id === o.id)
        const providerSet = new Set<string>()
        for (const l of orderLines) {
            if (l.erp_providers?.name) providerSet.add(l.erp_providers.name)
        }
        return {
            id: o.id,
            sent_at: o.sent_at,
            notes: o.notes,
            delivery_status: o.delivery_status ?? 'pending',
            scan_submitted_at: o.scan_submitted_at ?? null,
            providers: [...providerSet],
            lines: orderLines
                .map((l: any) => ({
                    id: l.id,
                    raw_text: l.raw_text,
                    quantity: Number(l.quantity),
                    unit: l.unit ?? null,
                    qty_received: Number(l.qty_received ?? 0),
                    qty_cancelled: Number(l.qty_cancelled ?? 0),
                    category: l.erp_master_items?.category ?? null,
                    base_unit: l.erp_master_items?.base_unit ?? null,
                    provider_name: l.erp_providers?.name ?? null,
                }))
                .filter((l: PendingOrderLine) => isLinePending(l)),
        }
    })
        .filter((o: PendingOrder) => o.lines.length > 0)
}

// ─── Manual delivery (no photo) ───────────────────────────────────────────────

export async function anonRegisterDelivery(
    token: string,
    orderId: string,
    receivedLines: { line_id: string; qty_received: number }[],
    observations: string | null
): Promise<RecepcionResult> {
    const supabase = createServiceClient()
    const sb = supabase as any

    // Validate token → venue
    const { data: venue } = await sb
        .from('erp_venues')
        .select('id')
        .eq('reception_token', token)
        .maybeSingle()

    if (!venue) return { success: false, error: 'Token inválido' }

    // Verify order belongs to venue
    const { data: order } = await sb
        .from('erp_purchase_orders')
        .select('id')
        .eq('id', orderId)
        .eq('venue_id', venue.id)
        .maybeSingle()

    if (!order) return { success: false, error: 'Pedido no encontrado' }

    // Update quantities sequentially
    for (const l of receivedLines) {
        const { error } = await sb
            .from('erp_purchase_order_lines')
            .update({ qty_received: l.qty_received })
            .eq('id', l.line_id)
            .eq('order_id', orderId)
        if (error) return { success: false, error: error.message }
    }

    const { data: updatedLines } = await sb
        .from('erp_purchase_order_lines')
        .select('id, quantity, qty_received, qty_cancelled, unit, is_cancelled, erp_master_items(category, base_unit)')
        .eq('order_id', orderId)
        .in('id', receivedLines.map((l) => l.line_id))

    const now = new Date().toISOString()
    for (const line of (updatedLines ?? []) as any[]) {
        const autoCloseQty = getAutoClosePendingQuantity({
            quantity: Number(line.quantity),
            qty_received: Number(line.qty_received ?? 0),
            qty_cancelled: Number(line.qty_cancelled ?? 0),
            unit: line.unit ?? null,
            category: line.erp_master_items?.category ?? null,
            is_cancelled: line.is_cancelled ?? false,
        })

        if (autoCloseQty <= 0) continue

        const { error } = await sb
            .from('erp_purchase_order_lines')
            .update({
                qty_cancelled: Number(line.qty_cancelled ?? 0) + autoCloseQty,
                cancelled_reason: AUTO_CLOSED_REMAINDER_REASON,
                cancelled_at: now,
            })
            .eq('id', line.id)
            .eq('order_id', orderId)

        if (error) return { success: false, error: error.message }
    }

    // Recalculate delivery_status
    const { data: allLines } = await sb
        .from('erp_purchase_order_lines')
        .select('quantity, qty_received, qty_cancelled, unit, is_cancelled, erp_master_items(category, base_unit)')
        .eq('order_id', orderId)

    const active = ((allLines ?? []) as any[]).filter((l: any) => !l.is_cancelled)
    const allDelivered =
        active.length === 0 || active.every((l: any) => isLineDelivered({
            quantity: Number(l.quantity),
            qty_received: Number(l.qty_received ?? 0),
            qty_cancelled: Number(l.qty_cancelled ?? 0),
            unit: l.unit ?? null,
            category: l.erp_master_items?.category ?? null,
            is_cancelled: l.is_cancelled ?? false,
        }))
    const anyDelivered = active.some((l: any) => Number(l.qty_received ?? 0) > 0)
    const delivery_status = allDelivered
        ? 'delivered'
        : anyDelivered
            ? 'partially_delivered'
            : 'pending'

    await sb
        .from('erp_purchase_orders')
        .update({
            delivery_status,
            ...(observations?.trim() ? { notes: observations.trim() } : {}),
        })
        .eq('id', orderId)

    revalidatePath(`/pedidos/${orderId}`)
    revalidatePath('/pedidos')
    return { success: true }
}
