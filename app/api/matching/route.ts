/**
 * POST /api/matching
 *
 * Called by n8n after procesar_factura_completa_v4 to auto-link
 * a processed document to a purchase order.
 *
 * Body: { document_id: string, secret: string }
 * Auth: shared secret === CRON_SECRET
 */
import { NextRequest, NextResponse } from 'next/server'
import { matchOrderToDocument } from '@/app/actions/pedidos'

export async function POST(req: NextRequest) {
    const body = await req.json()
    const { document_id, secret } = body

    if (!secret || secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!document_id) {
        return NextResponse.json({ error: 'document_id required' }, { status: 400 })
    }

    const result = await matchOrderToDocument(document_id)
    return NextResponse.json(result)
}
