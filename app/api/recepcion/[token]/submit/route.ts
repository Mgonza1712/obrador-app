import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    const { token } = await params
    const supabase = createServiceClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    const body = await req.json()
    const orderId: string | null = body.order_id || null
    const observations: string | null = body.observations?.trim() || null
    const hasPhoto: boolean = !!body.has_photo

    if (!hasPhoto) {
        return NextResponse.json(
            { success: false, error: 'Falta adjuntar la foto del documento. Si no llegó documento, usa el flujo de cantidades manuales.' },
            { status: 400 }
        )
    }

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

    // Optimistically mark order as "En proceso" when scanning a photo for it.
    // The Extraction Callback updates delivery_status when extraction completes.
    if (hasPhoto && orderId) {
        await sb
            .from('erp_purchase_orders')
            .update({
                scan_submitted_at: new Date().toISOString(),
                ...(observations ? { notes: observations } : {}),
            })
            .eq('id', orderId)

        revalidatePath(`/pedidos/${orderId}`)
        revalidatePath('/pedidos')
    }

    return NextResponse.json({ success: true })
}
