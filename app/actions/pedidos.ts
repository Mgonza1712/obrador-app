'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ActionResult {
    success: boolean
    error?: string
}

export type OrderStatus = 'draft' | 'sent' | 'cancelled'
export type DeliveryStatus = 'pending' | 'partially_delivered' | 'delivered' | 'invoiced'

export interface OrderSummary {
    id: string
    status: OrderStatus
    delivery_status: DeliveryStatus
    source_channel: string
    created_at: string
    sent_at: string | null
    notes: string | null
    created_by: string | null
    total_lines: number
    matched_lines: number
    categories: string[]
    providers: string[]
    scheduled_for: string | null
    is_template: boolean
    recurrence_label: string | null
    next_run_at: string | null
}

export interface OrderLineDetail {
    id: string
    raw_text: string
    quantity: number
    unit: string | null
    estimated_unit_price: number | null
    is_matched: boolean
    match_confidence: number | null
    notes: string | null
    sort_order: number | null
    provider_id: string | null
    provider_name: string | null
    provider_channel: string | null
    provider_phone: string | null
    provider_email: string | null
    master_item_id: string | null
    master_item_name: string | null
    master_item_base_unit: string | null
    qty_received: number
    is_cancelled: boolean
}

export interface OrderDetail {
    id: string
    status: OrderStatus
    delivery_status: DeliveryStatus
    source_channel: string
    created_at: string
    sent_at: string | null
    notes: string | null
    created_by: string | null
    scheduled_for: string | null
    is_template: boolean
    recurrence_cron: string | null
    recurrence_label: string | null
    next_run_at: string | null
    template_id: string | null
    provider_notes: Record<string, string>
    venue_id: string | null
    venue_name: string | null
    lines: OrderLineDetail[]
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getOrders(): Promise<OrderSummary[]> {
    const supabase = await createClient()

    const { data, error } = await (supabase as any)
        .from('erp_purchase_orders')
        .select('id, status, delivery_status, source_channel, created_at, sent_at, notes, created_by, scheduled_for, is_template, recurrence_label, next_run_at')
        .order('created_at', { ascending: false })

    if (error || !data) return []

    // Fetch line counts per order
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderIds = (data as any[]).map((o) => o.id)
    if (orderIds.length === 0) return []

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lines } = await (supabase as any)
        .from('erp_purchase_order_lines')
        .select('order_id, is_matched, erp_master_items(category), erp_providers(name)')
        .in('order_id', orderIds)

    const countsByOrder: Record<string, { total: number; matched: number; categories: Set<string>; providers: Set<string> }> = {}
    for (const id of orderIds) {
        countsByOrder[id] = { total: 0, matched: 0, categories: new Set(), providers: new Set() }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const l of (lines ?? []) as any[]) {
        const entry = countsByOrder[l.order_id]
        if (!entry) continue
        entry.total += 1
        if (l.is_matched) entry.matched += 1
        if (l.erp_master_items?.category) entry.categories.add(l.erp_master_items.category)
        if (l.erp_providers?.name) entry.providers.add(l.erp_providers.name)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]).map((o) => ({
        id: o.id,
        status: o.status as OrderStatus,
        delivery_status: (o.delivery_status ?? 'pending') as DeliveryStatus,
        source_channel: o.source_channel,
        created_at: o.created_at,
        sent_at: o.sent_at,
        notes: o.notes,
        created_by: o.created_by,
        total_lines: countsByOrder[o.id]?.total ?? 0,
        matched_lines: countsByOrder[o.id]?.matched ?? 0,
        categories: countsByOrder[o.id] ? [...countsByOrder[o.id].categories].sort() : [],
        providers: countsByOrder[o.id] ? [...countsByOrder[o.id].providers].sort() : [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        scheduled_for: (o as any).scheduled_for ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        is_template: (o as any).is_template ?? false,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recurrence_label: (o as any).recurrence_label ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        next_run_at: (o as any).next_run_at ?? null,
    }))
}

export async function getOrderDetail(orderId: string): Promise<OrderDetail | null> {
    const supabase = await createClient()

    const { data: order, error: orderError } = await (supabase as any)
        .from('erp_purchase_orders')
        .select('id, status, delivery_status, source_channel, created_at, sent_at, notes, created_by, scheduled_for, is_template, recurrence_cron, recurrence_label, next_run_at, template_id, provider_notes, venue_id, erp_venues(name)')
        .eq('id', orderId)
        .single()

    if (orderError || !order) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any
    const { data: lines } = await sb
        .from('erp_purchase_order_lines')
        .select(`
            id, raw_text, quantity, unit, estimated_unit_price, is_matched,
            match_confidence, notes, sort_order, qty_received, is_cancelled,
            provider_id, master_item_id,
            erp_providers(name, channel, phone, email),
            erp_master_items(official_name, base_unit)
        `)
        .eq('order_id', orderId)
        .order('sort_order', { ascending: true, nullsFirst: false })

    return {
        id: order.id,
        status: order.status as OrderStatus,
        delivery_status: (order.delivery_status ?? 'pending') as DeliveryStatus,
        source_channel: order.source_channel,
        created_at: order.created_at,
        sent_at: order.sent_at,
        notes: order.notes,
        created_by: order.created_by,
        scheduled_for: order.scheduled_for ?? null,
        is_template: order.is_template ?? false,
        recurrence_cron: order.recurrence_cron ?? null,
        recurrence_label: order.recurrence_label ?? null,
        next_run_at: order.next_run_at ?? null,
        template_id: order.template_id ?? null,
        provider_notes: (order.provider_notes as Record<string, string>) ?? {},
        venue_id: order.venue_id ?? null,
        venue_name: (order as any).erp_venues?.name ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lines: (lines ?? []).map((l: any) => ({
            id: l.id,
            raw_text: l.raw_text,
            quantity: l.quantity,
            unit: l.unit,
            estimated_unit_price: l.estimated_unit_price,
            is_matched: l.is_matched,
            match_confidence: l.match_confidence,
            notes: l.notes,
            sort_order: l.sort_order,
            qty_received: l.qty_received ?? 0,
            is_cancelled: l.is_cancelled ?? false,
            provider_id: l.provider_id,
            provider_name: l.erp_providers?.name ?? null,
            provider_channel: l.erp_providers?.channel ?? null,
            provider_phone: l.erp_providers?.phone ?? null,
            provider_email: l.erp_providers?.email ?? null,
            master_item_id: l.master_item_id,
            master_item_name: l.erp_master_items?.official_name ?? null,
            master_item_base_unit: l.erp_master_items?.base_unit ?? null,
        })),
    }
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function updateOrderLine(
    lineId: string,
    data: {
        quantity?: number
        unit?: string | null
        provider_id?: string | null
        master_item_id?: string | null
        notes?: string | null
    }
): Promise<ActionResult> {
    const supabase = await createClient()

    const { error } = await supabase
        .from('erp_purchase_order_lines')
        .update(data)
        .eq('id', lineId)

    if (error) return { success: false, error: error.message }

    revalidatePath('/pedidos/[id]', 'page')
    return { success: true }
}

export async function deleteOrderLine(lineId: string): Promise<ActionResult> {
    const supabase = await createClient()

    const { error } = await supabase
        .from('erp_purchase_order_lines')
        .delete()
        .eq('id', lineId)

    if (error) return { success: false, error: error.message }

    revalidatePath('/pedidos/[id]', 'page')
    return { success: true }
}

export async function linkOrderLine(
    lineId: string,
    masterItemId: string,
    providerId: string | null
): Promise<ActionResult> {
    const supabase = await createClient()

    const { error } = await supabase
        .from('erp_purchase_order_lines')
        .update({ master_item_id: masterItemId, provider_id: providerId, is_matched: true })
        .eq('id', lineId)

    if (error) return { success: false, error: error.message }

    revalidatePath('/pedidos/[id]', 'page')
    return { success: true }
}

// ── Internal: send one order to n8n webhook ───────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function _sendOrderWebhook(orderId: string, webhookUrl: string, supabase: any): Promise<ActionResult & { sent?: string[]; manual?: string[] }> {
    const { data: orderData } = await supabase
        .from('erp_purchase_orders')
        .select('venue_id, provider_notes')
        .eq('id', orderId)
        .single()

    let emailFrom: string | null = null
    let emailFromName: string | null = null
    let replyToEmail: string | null = null
    if (orderData?.venue_id) {
        const { data: venueData } = await supabase
            .from('erp_venues')
            .select('email_from, email_from_name, reply_to_email')
            .eq('id', orderData.venue_id)
            .single()
        emailFrom = venueData?.email_from ?? null
        emailFromName = venueData?.email_from_name ?? null
        replyToEmail = venueData?.reply_to_email ?? null
    }

    try {
        const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                order_id: orderId,
                provider_notes: (orderData?.provider_notes as Record<string, string>) ?? {},
                email_from: emailFrom,
                email_from_name: emailFromName,
                reply_to_email: replyToEmail,
            }),
        })

        const rawText = await res.text()
        if (!res.ok) {
            return { success: false, error: `Webhook error ${res.status}: ${rawText}` }
        }

        let result: { sent?: string[]; manual?: string[] } = {}
        try {
            result = rawText ? JSON.parse(rawText) : {}
        } catch {
            console.error('n8n webhook returned non-JSON:', rawText)
        }

        // Mark as sent (n8n also does this — belt+suspenders)
        await supabase
            .from('erp_purchase_orders')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .eq('id', orderId)

        revalidatePath(`/pedidos/${orderId}`)
        return { success: true, sent: result.sent ?? [], manual: result.manual ?? [] }
    } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Error desconocido' }
    }
}

export async function sendOrder(orderId: string): Promise<ActionResult & { sent?: string[]; manual?: string[]; splitInto?: number }> {
    const supabase = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any

    const webhookUrl = process.env.SEND_ORDER_WEBHOOK_URL
    if (!webhookUrl) {
        return { success: false, error: 'SEND_ORDER_WEBHOOK_URL no configurada' }
    }

    // Check distinct providers to decide if auto-split is needed
    const { data: lines } = await sb
        .from('erp_purchase_order_lines')
        .select('provider_id')
        .eq('order_id', orderId)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const providerIds = [...new Set(((lines ?? []) as any[]).map((l) => l.provider_id).filter(Boolean))]

    if (providerIds.length > 1) {
        // Auto-split by provider, then send each child order
        const splitResult = await splitOrderByProvider(orderId)
        if (!splitResult.success || !splitResult.orderIds) {
            return { success: false, error: splitResult.error ?? 'Error al dividir el pedido' }
        }

        const errors: string[] = []
        for (const childId of splitResult.orderIds) {
            const res = await _sendOrderWebhook(childId, webhookUrl, sb)
            if (!res.success) errors.push(res.error ?? 'Error desconocido')
        }

        revalidatePath('/pedidos')
        if (errors.length > 0) return { success: false, error: errors.join(' | ') }
        return { success: true, splitInto: splitResult.orderIds.length }
    }

    // Single provider — send directly
    const res = await _sendOrderWebhook(orderId, webhookUrl, sb)
    revalidatePath('/pedidos')
    return res
}

export async function createOrderFromWeb(
    lines: { raw_text: string; quantity: number; unit?: string; master_item_id?: string; provider_id?: string; estimated_unit_price?: number }[],
    venueId?: string | null,
    providerNotes?: Record<string, string>
): Promise<ActionResult & { orderId?: string }> {
    const supabase = await createClient()

    // Resolve tenant_id from the logged-in user's profile
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'No autenticado' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single()

    const tenantId = profile?.tenant_id
    if (!tenantId) return { success: false, error: 'Tenant no encontrado' }

    const { data: order, error: orderError } = await supabase
        .from('erp_purchase_orders')
        .insert({
            tenant_id: tenantId,
            source_channel: 'web',
            status: 'draft',
            venue_id: venueId ?? null,
            provider_notes: providerNotes && Object.keys(providerNotes).length > 0 ? providerNotes : null,
        })
        .select('id')
        .single()

    if (orderError || !order) {
        return { success: false, error: orderError?.message ?? 'No se pudo crear el pedido' }
    }

    const lineInserts = lines.map((l, i) => ({
        order_id: order.id,
        raw_text: l.raw_text,
        quantity: l.quantity,
        unit: l.unit ?? null,
        master_item_id: l.master_item_id ?? null,
        provider_id: l.provider_id ?? null,
        is_matched: !!(l.master_item_id),
        estimated_unit_price: l.estimated_unit_price ?? null,
        sort_order: i,
    }))

    const { error: linesError } = await supabase
        .from('erp_purchase_order_lines')
        .insert(lineInserts)

    if (linesError) return { success: false, error: linesError.message }

    revalidatePath('/pedidos')
    return { success: true, orderId: order.id }
}

export async function updateProviderNotes(
    orderId: string,
    providerKey: string,
    notes: string
): Promise<ActionResult> {
    const supabase = await createClient()
    const sb = supabase as any

    // Fetch current JSONB, patch the key, write back
    const { data: order } = await sb
        .from('erp_purchase_orders')
        .select('provider_notes')
        .eq('id', orderId)
        .single()

    const current: Record<string, string> = (order?.provider_notes as Record<string, string>) ?? {}
    const updated = { ...current }
    const trimmed = notes.trim()
    if (trimmed) {
        updated[providerKey] = trimmed
    } else {
        delete updated[providerKey]
    }

    const { error } = await sb
        .from('erp_purchase_orders')
        .update({ provider_notes: updated })
        .eq('id', orderId)

    if (error) return { success: false, error: error.message }
    return { success: true }
}

export async function markAsSent(orderId: string): Promise<ActionResult> {
    const supabase = await createClient()

    const { error } = await (supabase as any)
        .from('erp_purchase_orders')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', orderId)
        .eq('status', 'draft') // only if still a draft

    if (error) return { success: false, error: error.message }

    revalidatePath(`/pedidos/${orderId}`)
    revalidatePath('/pedidos')
    return { success: true }
}

export async function cancelOrder(orderId: string): Promise<ActionResult> {
    const supabase = await createClient()

    const { error } = await (supabase as any)
        .from('erp_purchase_orders')
        .update({ status: 'cancelled' })
        .eq('id', orderId)

    if (error) return { success: false, error: error.message }

    revalidatePath(`/pedidos/${orderId}`)
    revalidatePath('/pedidos')
    return { success: true }
}

export async function updateOrderNotes(orderId: string, notes: string | null): Promise<ActionResult> {
    const supabase = await createClient()
    const { error } = await (supabase as any)
        .from('erp_purchase_orders')
        .update({ notes: notes?.trim() || null })
        .eq('id', orderId)
    if (error) return { success: false, error: error.message }
    revalidatePath(`/pedidos/${orderId}`)
    return { success: true }
}

export async function addLinesToOrder(
    orderId: string,
    lines: { raw_text: string; quantity: number; unit?: string; master_item_id?: string; provider_id?: string; estimated_unit_price?: number }[]
): Promise<ActionResult & { insertedIds?: string[] }> {
    const supabase = await createClient()

    // Get current max sort_order for this order
    const { data: existing } = await supabase
        .from('erp_purchase_order_lines')
        .select('sort_order')
        .eq('order_id', orderId)
        .order('sort_order', { ascending: false })
        .limit(1)

    const baseSort = (existing?.[0]?.sort_order ?? -1) + 1

    const inserts = lines.map((l, i) => ({
        order_id: orderId,
        raw_text: l.raw_text,
        quantity: l.quantity,
        unit: l.unit ?? null,
        master_item_id: l.master_item_id ?? null,
        provider_id: l.provider_id ?? null,
        is_matched: !!(l.master_item_id),
        estimated_unit_price: l.estimated_unit_price ?? null,
        sort_order: baseSort + i,
    }))

    const { data, error } = await supabase
        .from('erp_purchase_order_lines')
        .insert(inserts)
        .select('id')

    if (error) return { success: false, error: error.message }

    revalidatePath(`/pedidos/${orderId}`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { success: true, insertedIds: (data as any[]).map((r) => r.id) }
}

export async function scheduleOrder(
    orderId: string,
    scheduledFor: string | null
): Promise<ActionResult> {
    const supabase = await createClient()

    // When setting a one-time schedule, clear any active recurrence (mutual exclusion)
    const patch: Record<string, unknown> = { scheduled_for: scheduledFor }
    if (scheduledFor) {
        patch.is_template = false
        patch.recurrence_cron = null
        patch.recurrence_label = null
        patch.next_run_at = null
    }

    const { error } = await (supabase as any)
        .from('erp_purchase_orders')
        .update(patch)
        .eq('id', orderId)

    if (error) return { success: false, error: error.message }

    revalidatePath(`/pedidos/${orderId}`)
    revalidatePath('/pedidos')
    return { success: true }
}

// ── Cron helpers ──────────────────────────────────────────────────────────────

function computeNextRunAt(cronExpr: string): string {
    // Supports: "MIN HOUR * * WEEKDAYS" or "MIN HOUR * * *" (daily) or "MIN HOUR DAY * *" (monthly)
    const parts = cronExpr.split(' ')
    const minute = parseInt(parts[0])
    const hour = parseInt(parts[1])
    const dayOfMonth = parts[2]
    const weekdaysPart = parts[4]

    const now = new Date()

    if (weekdaysPart !== '*') {
        // Weekly: find next matching weekday (1=Mon..7=Sun, but JS getDay() is 0=Sun..6=Sat)
        const targetDays = weekdaysPart.split(',').map((d) => {
            const n = parseInt(d)
            return n === 7 ? 0 : n // convert 7=Sun to 0
        })
        for (let ahead = 0; ahead <= 7; ahead++) {
            const candidate = new Date(now)
            candidate.setDate(now.getDate() + ahead)
            candidate.setHours(hour, minute, 0, 0)
            if (targetDays.includes(candidate.getDay()) && candidate > now) {
                return candidate.toISOString()
            }
        }
    } else if (dayOfMonth !== '*') {
        // Monthly: next occurrence of that day-of-month
        const dom = parseInt(dayOfMonth)
        const candidate = new Date(now)
        candidate.setDate(dom)
        candidate.setHours(hour, minute, 0, 0)
        if (candidate <= now) candidate.setMonth(candidate.getMonth() + 1)
        return candidate.toISOString()
    } else {
        // Daily
        const candidate = new Date(now)
        candidate.setHours(hour, minute, 0, 0)
        if (candidate <= now) candidate.setDate(candidate.getDate() + 1)
        return candidate.toISOString()
    }

    // Fallback: one week from now
    const fallback = new Date(now)
    fallback.setDate(fallback.getDate() + 7)
    fallback.setHours(hour, minute, 0, 0)
    return fallback.toISOString()
}

// ── MC-2: Delivery tracking ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function recalcDeliveryStatus(supabase: any, orderId: string): Promise<void> {
    const { data: lines } = await supabase
        .from('erp_purchase_order_lines')
        .select('quantity, qty_received, is_cancelled')
        .eq('order_id', orderId)

    if (!lines || lines.length === 0) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const active = (lines as any[]).filter((l) => !l.is_cancelled)
    const allDelivered = active.length === 0 || active.every((l) => (l.qty_received ?? 0) >= l.quantity)
    const anyDelivered = active.some((l) => (l.qty_received ?? 0) > 0)

    const delivery_status: DeliveryStatus = allDelivered ? 'delivered' : anyDelivered ? 'partially_delivered' : 'pending'

    await supabase
        .from('erp_purchase_orders')
        .update({ delivery_status })
        .eq('id', orderId)
}

export async function registerDelivery(
    orderId: string,
    receivedLines: { line_id: string; qty_received: number; notes?: string | null }[],
    extras?: { raw_text: string; quantity: number; provider_id?: string | null; master_item_id?: string | null }[]
): Promise<ActionResult & { addedLineIds?: string[] }> {
    const supabase = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any

    // Insert extra lines (items received that weren't in the order)
    let addedLineIds: string[] = []
    if (extras && extras.length > 0) {
        const { data: existing } = await supabase
            .from('erp_purchase_order_lines')
            .select('sort_order')
            .eq('order_id', orderId)
            .order('sort_order', { ascending: false })
            .limit(1)

        const baseSort = (existing?.[0]?.sort_order ?? -1) + 1

        const extraInserts = extras.map((e, i) => ({
            order_id: orderId,
            raw_text: e.raw_text,
            quantity: e.quantity,
            qty_received: e.quantity,
            is_matched: !!e.master_item_id,
            provider_id: e.provider_id ?? null,
            master_item_id: e.master_item_id ?? null,
            sort_order: baseSort + i,
        }))

        const { data: inserted, error: extrasErr } = await sb
            .from('erp_purchase_order_lines')
            .insert(extraInserts)
            .select('id')

        if (extrasErr) return { success: false, error: extrasErr.message }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        addedLineIds = (inserted as any[]).map((r) => r.id)
    }

    // Update received quantities (and optionally notes) for existing lines — sequential to avoid
    // issues with Supabase PromiseLike objects being resolved by Promise.all in server actions
    for (const l of receivedLines) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const patch: Record<string, any> = { qty_received: l.qty_received }
        if (l.notes !== undefined) patch.notes = l.notes || null

        const { error: updateErr } = await sb
            .from('erp_purchase_order_lines')
            .update(patch)
            .eq('id', l.line_id)
            .eq('order_id', orderId)

        if (updateErr) return { success: false, error: updateErr.message }
    }

    await recalcDeliveryStatus(sb, orderId)

    revalidatePath(`/pedidos/${orderId}`)
    revalidatePath('/pedidos')
    return { success: true, addedLineIds }
}

export async function cancelPendingLines(
    orderId: string,
    lineIds: string[]
): Promise<ActionResult> {
    if (lineIds.length === 0) return { success: true }
    const supabase = await createClient()

    const { error } = await (supabase as any)
        .from('erp_purchase_order_lines')
        .update({ is_cancelled: true })
        .eq('order_id', orderId)
        .in('id', lineIds)

    if (error) return { success: false, error: error.message }

    await recalcDeliveryStatus(supabase as any, orderId)

    revalidatePath(`/pedidos/${orderId}`)
    revalidatePath('/pedidos')
    return { success: true }
}

// ── Venue ─────────────────────────────────────────────────────────────────────

export async function updateOrderVenue(orderId: string, venueId: string | null): Promise<ActionResult> {
    const supabase = await createClient()
    const { error } = await (supabase as any)
        .from('erp_purchase_orders')
        .update({ venue_id: venueId })
        .eq('id', orderId)
    if (error) return { success: false, error: error.message }
    revalidatePath(`/pedidos/${orderId}`)
    return { success: true }
}

// ── Split order by provider ───────────────────────────────────────────────────

export async function splitOrderByProvider(
    orderId: string
): Promise<ActionResult & { orderIds?: string[] }> {
    const supabase = await createClient()
    const sb = supabase as any

    // Fetch original order
    const { data: order, error: orderErr } = await sb
        .from('erp_purchase_orders')
        .select('id, tenant_id, source_channel, notes, status, is_template, provider_notes, venue_id')
        .eq('id', orderId)
        .single()

    if (orderErr || !order) return { success: false, error: 'Pedido no encontrado' }
    if (order.status !== 'draft') return { success: false, error: 'Solo se pueden dividir borradores' }
    if (order.is_template) return { success: false, error: 'No se puede dividir una plantilla recurrente' }

    // Fetch all lines
    const { data: lines, error: linesErr } = await sb
        .from('erp_purchase_order_lines')
        .select('raw_text, quantity, unit, estimated_unit_price, is_matched, match_confidence, notes, sort_order, provider_id, master_item_id')
        .eq('order_id', orderId)
        .order('sort_order', { ascending: true, nullsFirst: false })

    if (linesErr || !lines || (lines as any[]).length === 0) {
        return { success: false, error: 'El pedido no tiene líneas' }
    }

    // Group lines by provider_id (null becomes its own group)
    const byProvider = new Map<string, any[]>()
    for (const line of lines as any[]) {
        const key = line.provider_id ?? '__none__'
        const group = byProvider.get(key) ?? []
        group.push(line)
        byProvider.set(key, group)
    }

    if (byProvider.size <= 1) {
        return { success: false, error: 'El pedido ya tiene un solo proveedor, no hace falta dividirlo' }
    }

    // Create one child order per provider group
    const newOrderIds: string[] = []
    for (const [providerKey, groupLines] of byProvider.entries()) {
        // Copy only the note that belongs to this provider group
        const parentNotes: Record<string, string> = (order.provider_notes as Record<string, string>) ?? {}
        const childNote = parentNotes[providerKey] ?? null
        const childProviderNotes: Record<string, string> = {}
        if (childNote) childProviderNotes[providerKey] = childNote

        const { data: newOrder, error: createErr } = await sb
            .from('erp_purchase_orders')
            .insert({
                tenant_id: order.tenant_id,
                source_channel: order.source_channel,
                status: 'draft',
                venue_id: order.venue_id ?? null,
                provider_notes: childProviderNotes,
            })
            .select('id')
            .single()

        if (createErr || !newOrder) {
            return { success: false, error: 'Error al crear pedido: ' + (createErr?.message ?? '') }
        }

        const lineInserts = (groupLines as any[]).map((l: any, i: number) => ({
            order_id: newOrder.id,
            raw_text: l.raw_text,
            quantity: l.quantity,
            unit: l.unit ?? null,
            estimated_unit_price: l.estimated_unit_price ?? null,
            is_matched: l.is_matched,
            match_confidence: l.match_confidence ?? null,
            notes: l.notes ?? null,
            sort_order: i,
            provider_id: l.provider_id ?? null,
            master_item_id: l.master_item_id ?? null,
        }))

        const { error: insertErr } = await sb
            .from('erp_purchase_order_lines')
            .insert(lineInserts)

        if (insertErr) {
            return { success: false, error: 'Error al copiar líneas: ' + insertErr.message }
        }

        newOrderIds.push(newOrder.id)
    }

    // Delete original order (lines first to satisfy FK)
    await sb.from('erp_purchase_order_lines').delete().eq('order_id', orderId)
    await sb.from('erp_purchase_orders').delete().eq('id', orderId)

    revalidatePath('/pedidos')
    return { success: true, orderIds: newOrderIds }
}

export async function notifyOrderModification(orderId: string): Promise<ActionResult & { sent?: string[]; manual?: string[] }> {
    const supabase = await createClient()
    const sb = supabase as any

    const webhookUrl = process.env.SEND_ORDER_WEBHOOK_URL
    if (!webhookUrl) return { success: false, error: 'SEND_ORDER_WEBHOOK_URL no configurada' }

    const { data: orderData } = await sb
        .from('erp_purchase_orders')
        .select('venue_id, provider_notes, status')
        .eq('id', orderId)
        .single()

    if (orderData?.status !== 'sent') {
        return { success: false, error: 'Solo se pueden notificar modificaciones de pedidos enviados' }
    }

    let emailFrom: string | null = null
    let emailFromName: string | null = null
    let replyToEmail: string | null = null
    if (orderData?.venue_id) {
        const { data: venueData } = await sb
            .from('erp_venues')
            .select('email_from, email_from_name, reply_to_email')
            .eq('id', orderData.venue_id)
            .single()
        emailFrom = venueData?.email_from ?? null
        emailFromName = venueData?.email_from_name ?? null
        replyToEmail = venueData?.reply_to_email ?? null
    }

    // Fetch lines to know which providers are in this order
    const { data: orderLines } = await sb
        .from('erp_purchase_order_lines')
        .select('provider_id')
        .eq('order_id', orderId)
        .not('provider_id', 'is', null)

    const providerIds = [...new Set(((orderLines ?? []) as any[]).map((l) => l.provider_id).filter(Boolean))]
    const existingNotes = (orderData?.provider_notes as Record<string, string>) ?? {}
    const modLabel = '⚠️ MODIFICACIÓN DE PEDIDO — Este mensaje actualiza un pedido anterior.'
    const modProviderNotes: Record<string, string> = {}
    for (const pid of providerIds) {
        const current = existingNotes[pid] ?? ''
        modProviderNotes[pid] = current ? `${modLabel}\n\n${current}` : modLabel
    }

    try {
        const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                order_id: orderId,
                is_modification: true,
                provider_notes: modProviderNotes,
                email_from: emailFrom,
                email_from_name: emailFromName,
                reply_to_email: replyToEmail,
            }),
        })
        const rawText = await res.text()
        if (!res.ok) return { success: false, error: `Webhook error ${res.status}: ${rawText}` }

        let result: { sent?: string[]; manual?: string[] } = {}
        try { result = rawText ? JSON.parse(rawText) : {} } catch { /* non-JSON */ }

        revalidatePath(`/pedidos/${orderId}`)
        return { success: true, sent: result.sent ?? [], manual: result.manual ?? [] }
    } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Error desconocido' }
    }
}

export async function setRecurrence(
    orderId: string,
    cron: string | null,
    label: string | null
): Promise<ActionResult> {
    const supabase = await createClient()

    const isActivating = cron !== null
    const nextRunAt = isActivating ? computeNextRunAt(cron!) : null

    // When activating recurrence, clear any one-time schedule (mutual exclusion)
    const patch: Record<string, unknown> = {
        is_template: isActivating,
        recurrence_cron: cron,
        recurrence_label: label,
        next_run_at: nextRunAt,
    }
    if (isActivating) {
        patch.scheduled_for = null
    }

    const { error } = await (supabase as any)
        .from('erp_purchase_orders')
        .update(patch)
        .eq('id', orderId)

    if (error) return { success: false, error: error.message }

    revalidatePath(`/pedidos/${orderId}`)
    revalidatePath('/pedidos')
    return { success: true }
}
