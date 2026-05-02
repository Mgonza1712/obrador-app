/**
 * POST /api/matching
 *
 * Called by n8n after procesar_factura_completa_v4 to auto-link
 * a processed document to a purchase order.
 *
 * Body: { document_id: string, secret: string, venue_id?: string }
 * Auth: shared secret === CRON_SECRET
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { matchOrderToDocument } from '@/app/actions/pedidos'

export async function POST(req: NextRequest) {
    const body = await req.json()
    const { document_id, secret, venue_id } = body

    if (!secret || secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!document_id) {
        return NextResponse.json({ error: 'document_id required' }, { status: 400 })
    }

    // If QR scan provided a venue_id, override the LLM-derived venue on the document
    if (venue_id) {
        const sb = createServiceClient() as any
        await sb.from('erp_documents').update({ venue_id }).eq('id', document_id)
    }

    const result = await matchOrderToDocument(document_id)
    return NextResponse.json(result)
}
