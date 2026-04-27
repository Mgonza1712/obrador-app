/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    const { token } = await params
    const supabase = createServiceClient()
    const sb = supabase as any

    // Validate token → venue
    const { data: venue } = await sb
        .from('erp_venues')
        .select('id, name, tenant_id')
        .eq('reception_token', token)
        .maybeSingle()

    if (!venue) {
        return NextResponse.json({ success: false, error: 'Token inválido' }, { status: 403 })
    }

    const formData = await req.formData()
    const orderId = (formData.get('order_id') as string) || null
    const observations = (formData.get('observations') as string)?.trim() || null
    const docType = (formData.get('doc_type') as string) || 'albaran'
    const photo = formData.get('photo') as File | null

    // Verify order belongs to venue (if provided)
    if (orderId) {
        const { data: order } = await sb
            .from('erp_purchase_orders')
            .select('id')
            .eq('id', orderId)
            .eq('venue_id', venue.id)
            .maybeSingle()

        if (!order) {
            return NextResponse.json(
                { success: false, error: 'Pedido no encontrado para este local' },
                { status: 403 }
            )
        }
    }

    // Upload photo to storage
    let photoBase64: string | null = null
    let photoFilename: string | null = null

    if (photo && photo.size > 0) {
        const bytes = await photo.arrayBuffer()
        const buffer = Buffer.from(bytes)
        photoBase64 = buffer.toString('base64')
        photoFilename = photo.name || `recepcion_${Date.now()}.jpg`

        const storagePath = `recepciones/${venue.id}/${Date.now()}_${photoFilename}`
        await supabase.storage
            .from('albaranes')
            .upload(storagePath, buffer, {
                contentType: photo.type || 'image/jpeg',
                upsert: false,
            })
        // Storage errors are non-fatal — we still process the document
    }

    // If a photo was taken and linked to an order: mark as "En proceso" immediately
    // (optimistic — n8n can take >10s due to S3 upload, so we can't wait for job_id)
    // The Extraction Callback clears scan_submitted_at and updates delivery_status when done.
    if (photoBase64 && orderId) {
        await sb
            .from('erp_purchase_orders')
            .update({
                scan_submitted_at: new Date().toISOString(),
                ...(observations ? { notes: observations } : {}),
            })
            .eq('id', orderId)

        revalidatePath(`/pedidos/${orderId}`)
        revalidatePath('/pedidos')
    } else if (orderId && observations) {
        await sb
            .from('erp_purchase_orders')
            .update({ notes: observations })
            .eq('id', orderId)

        revalidatePath(`/pedidos/${orderId}`)
        revalidatePath('/pedidos')
    }

    // Send to n8n scanner-intake webhook for extraction (fire-and-forget)
    let jobId: string | null = null
    if (photoBase64 && photoFilename) {
        const webhookUrl =
            process.env.SCANNER_WEBHOOK_URL ??
            'https://n8n.wescaleops.com/webhook/scanner-intake'
        try {
            const res = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    document_base64: photoBase64,
                    local: venue.name,
                    filename: photoFilename,
                    is_image: true,
                    order_id: orderId ?? null,
                    venue_id: venue.id,
                    observations,
                    doc_type: docType,
                    source: 'recepcion_anonima',
                }),
            })
            if (res.ok) {
                const data = await res.json()
                if (data.job_id) jobId = data.job_id
            }
        } catch {
            // Non-blocking — extractor failure doesn't fail the reception
        }
    }

    return NextResponse.json({ success: true, jobId })
}
