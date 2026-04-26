/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/cron/send-orders
 *
 * Called by the Supabase pg_cron job `process_scheduled_orders` every minute.
 * Handles two cases:
 *   - order_ids:   One-time scheduled orders (scheduled_for already cleared in DB)
 *   - template_ids: Recurring templates (next_run_at already advanced by 1h in DB as guard)
 *
 * Authentication: shared secret via body field `secret` === env CRON_SECRET
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

interface Body {
    order_ids?: string[]
    template_ids?: string[]
    secret: string
}

export async function POST(req: NextRequest) {
    const body: Body = await req.json()
    const { order_ids, template_ids, secret } = body

    if (!secret || secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServiceClient()
    const sb = supabase as any
    const webhookUrl = process.env.SEND_ORDER_WEBHOOK_URL

    if (!webhookUrl) {
        return NextResponse.json({ error: 'SEND_ORDER_WEBHOOK_URL not configured' }, { status: 500 })
    }

    const results: { id: string; success: boolean; error?: string }[] = []

    // ── One-time scheduled orders ────────────────────────────────────────────
    if (order_ids?.length) {
        for (const orderId of order_ids) {
            try {
                const r = await sendOrderInternal(orderId, webhookUrl, sb)
                results.push({ id: orderId, ...r })
            } catch (err) {
                results.push({ id: orderId, success: false, error: String(err) })
            }
        }
    }

    // ── Recurring templates ──────────────────────────────────────────────────
    if (template_ids?.length) {
        for (const templateId of template_ids) {
            try {
                const r = await processRecurringTemplate(templateId, webhookUrl, sb)
                results.push({ id: templateId, ...r })
            } catch (err) {
                results.push({ id: templateId, success: false, error: String(err) })
            }
        }
    }

    return NextResponse.json({ processed: results.length, results })
}

// ─── Send a single order (splits by provider if needed) ────────────────────────

async function sendOrderInternal(
    orderId: string,
    webhookUrl: string,
    sb: any
): Promise<{ success: boolean; error?: string }> {
    const { data: lines } = await sb
        .from('erp_purchase_order_lines')
        .select('provider_id')
        .eq('order_id', orderId)

    const providerIds = [
        ...new Set(((lines ?? []) as any[]).map((l: any) => l.provider_id).filter(Boolean)),
    ]

    if (providerIds.length > 1) {
        return splitAndSend(orderId, webhookUrl, sb)
    }

    return callSendWebhook(orderId, webhookUrl, sb)
}

// ─── Split order by provider, send each child ──────────────────────────────────

async function splitAndSend(
    orderId: string,
    webhookUrl: string,
    sb: any
): Promise<{ success: boolean; error?: string }> {
    const { data: order } = await sb
        .from('erp_purchase_orders')
        .select('tenant_id, source_channel, venue_id, provider_notes, status')
        .eq('id', orderId)
        .single()

    if (!order || order.status !== 'draft') {
        return { success: false, error: 'Pedido no encontrado o no es borrador' }
    }

    const { data: lines } = await sb
        .from('erp_purchase_order_lines')
        .select('raw_text, quantity, unit, estimated_unit_price, is_matched, match_confidence, notes, sort_order, provider_id, master_item_id')
        .eq('order_id', orderId)
        .order('sort_order', { ascending: true, nullsFirst: false })

    if (!lines?.length) return { success: false, error: 'Sin líneas' }

    // Group by provider
    const byProvider = new Map<string, any[]>()
    for (const line of lines as any[]) {
        const key = line.provider_id ?? '__none__'
        const group = byProvider.get(key) ?? []
        group.push(line)
        byProvider.set(key, group)
    }

    const parentNotes: Record<string, string> = (order.provider_notes as Record<string, string>) ?? {}
    const childIds: string[] = []

    for (const [providerKey, groupLines] of byProvider.entries()) {
        const childNote = parentNotes[providerKey] ?? null
        const childProviderNotes: Record<string, string> = {}
        if (childNote) childProviderNotes[providerKey] = childNote

        const { data: newOrder } = await sb
            .from('erp_purchase_orders')
            .insert({
                tenant_id:      order.tenant_id,
                source_channel: order.source_channel,
                status:         'draft',
                venue_id:       order.venue_id ?? null,
                provider_notes: childProviderNotes,
            })
            .select('id')
            .single()

        if (!newOrder) continue

        await sb.from('erp_purchase_order_lines').insert(
            (groupLines as any[]).map((l: any, i: number) => ({
                order_id:            newOrder.id,
                raw_text:            l.raw_text,
                quantity:            l.quantity,
                unit:                l.unit ?? null,
                estimated_unit_price: l.estimated_unit_price ?? null,
                is_matched:          l.is_matched,
                match_confidence:    l.match_confidence ?? null,
                notes:               l.notes ?? null,
                sort_order:          i,
                provider_id:         l.provider_id ?? null,
                master_item_id:      l.master_item_id ?? null,
            }))
        )

        childIds.push(newOrder.id)
    }

    // Delete original order
    await sb.from('erp_purchase_order_lines').delete().eq('order_id', orderId)
    await sb.from('erp_purchase_orders').delete().eq('id', orderId)

    // Send each child
    const errors: string[] = []
    for (const childId of childIds) {
        const r = await callSendWebhook(childId, webhookUrl, sb)
        if (!r.success) errors.push(r.error ?? 'Error desconocido')
    }

    return errors.length ? { success: false, error: errors.join(' | ') } : { success: true }
}

// ─── Call n8n send webhook for one order ───────────────────────────────────────

async function callSendWebhook(
    orderId: string,
    webhookUrl: string,
    sb: any
): Promise<{ success: boolean; error?: string }> {
    const { data: orderData } = await sb
        .from('erp_purchase_orders')
        .select('venue_id, provider_notes')
        .eq('id', orderId)
        .single()

    let emailFrom: string | null = null
    let emailFromName: string | null = null
    let replyToEmail: string | null = null

    if (orderData?.venue_id) {
        const { data: venue } = await sb
            .from('erp_venues')
            .select('email_from, email_from_name, reply_to_email')
            .eq('id', orderData.venue_id)
            .single()
        emailFrom     = venue?.email_from      ?? null
        emailFromName = venue?.email_from_name ?? null
        replyToEmail  = venue?.reply_to_email  ?? null
    }

    const res = await fetch(webhookUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
            order_id:        orderId,
            provider_notes:  (orderData?.provider_notes as Record<string, string>) ?? {},
            email_from:      emailFrom,
            email_from_name: emailFromName,
            reply_to_email:  replyToEmail,
        }),
    })

    if (!res.ok) {
        const txt = await res.text()
        return { success: false, error: `Webhook ${res.status}: ${txt.slice(0, 200)}` }
    }

    // Mark as sent (belt+suspenders — n8n also does this)
    await sb
        .from('erp_purchase_orders')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', orderId)

    return { success: true }
}

// ─── Recurring template: create child order, send, update next_run_at ──────────

async function processRecurringTemplate(
    templateId: string,
    webhookUrl: string,
    sb: any
): Promise<{ success: boolean; error?: string }> {
    const { data: template } = await sb
        .from('erp_purchase_orders')
        .select('tenant_id, source_channel, venue_id, provider_notes, is_template, recurrence_cron')
        .eq('id', templateId)
        .single()

    if (!template?.is_template) {
        return { success: false, error: 'No es una plantilla recurrente' }
    }

    const { data: templateLines } = await sb
        .from('erp_purchase_order_lines')
        .select('raw_text, quantity, unit, estimated_unit_price, is_matched, match_confidence, notes, sort_order, provider_id, master_item_id')
        .eq('order_id', templateId)
        .order('sort_order', { ascending: true, nullsFirst: false })

    if (!templateLines?.length) {
        return { success: false, error: 'La plantilla no tiene líneas' }
    }

    // Create child order
    const { data: childOrder } = await sb
        .from('erp_purchase_orders')
        .insert({
            tenant_id:      template.tenant_id,
            source_channel: template.source_channel,
            status:         'draft',
            venue_id:       template.venue_id ?? null,
            provider_notes: template.provider_notes ?? null,
            template_id:    templateId,
        })
        .select('id')
        .single()

    if (!childOrder) return { success: false, error: 'No se pudo crear el pedido hijo' }

    await sb.from('erp_purchase_order_lines').insert(
        (templateLines as any[]).map((l: any, i: number) => ({
            order_id:            childOrder.id,
            raw_text:            l.raw_text,
            quantity:            l.quantity,
            unit:                l.unit ?? null,
            estimated_unit_price: l.estimated_unit_price ?? null,
            is_matched:          l.is_matched,
            match_confidence:    l.match_confidence ?? null,
            notes:               l.notes ?? null,
            sort_order:          i,
            provider_id:         l.provider_id ?? null,
            master_item_id:      l.master_item_id ?? null,
        }))
    )

    // Compute and persist the accurate next_run_at
    if (template.recurrence_cron) {
        const nextRunAt = computeNextRunAt(template.recurrence_cron)
        await sb
            .from('erp_purchase_orders')
            .update({ next_run_at: nextRunAt })
            .eq('id', templateId)
    }

    // Send the child order
    return sendOrderInternal(childOrder.id, webhookUrl, sb)
}

// ─── Compute next_run_at from cron expression (mirrors SQL helper) ─────────────

function computeNextRunAt(cronExpr: string): string {
    const parts = cronExpr.split(' ')
    const minute      = parseInt(parts[0])
    const hour        = parseInt(parts[1])
    const dayOfMonth  = parts[2]
    const weekdaysPart = parts[4]

    const now = new Date()

    if (weekdaysPart !== '*') {
        const targetDays = weekdaysPart.split(',').map((d) => {
            const n = parseInt(d)
            return n === 7 ? 0 : n
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
        const dom = parseInt(dayOfMonth)
        const candidate = new Date(now)
        candidate.setDate(dom)
        candidate.setHours(hour, minute, 0, 0)
        if (candidate <= now) candidate.setMonth(candidate.getMonth() + 1)
        return candidate.toISOString()
    } else {
        const candidate = new Date(now)
        candidate.setHours(hour, minute, 0, 0)
        if (candidate <= now) candidate.setDate(candidate.getDate() + 1)
        return candidate.toISOString()
    }

    const fallback = new Date(now)
    fallback.setDate(fallback.getDate() + 7)
    fallback.setHours(hour, minute, 0, 0)
    return fallback.toISOString()
}
