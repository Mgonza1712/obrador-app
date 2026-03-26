import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import DocumentoDetailClient from './DocumentoDetailClient'

export type PurchaseLine = {
    id: string
    raw_name: string | null
    quantity: number | null
    unit_price: number | null
    line_total_cost: number | null
    master_item_id: string | null
}

export type LinkedAlbaran = {
    id: string
    document_number: string | null
    document_date: string | null
    total_amount: number | null
}

export type DocumentDetail = {
    id: string
    doc_type: string | null
    document_number: string | null
    document_date: string | null
    total_amount: number | null
    status: string | null
    reconciliation_status: string | null
    reconciliation_delta: number | null
    referenced_delivery_notes: string[] | null
    parent_invoice_id: string | null
    drive_url: string | null
    provider_id: string | null
    provider_name: string | null
    venue_id: string | null
    tenant_id: string | null
    created_at: string | null
    lines: PurchaseLine[]
    linkedAlbaranes: LinkedAlbaran[]
}

export default async function DocumentoDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    const supabase = await createClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any
    const [docResult, linesResult, albaranesResult] = await Promise.all([
        sb
            .from('erp_documents')
            .select(
                'id, doc_type, document_number, document_date, total_amount, status, reconciliation_status, reconciliation_delta, referenced_delivery_notes, parent_invoice_id, drive_url, provider_id, venue_id, tenant_id, created_at, erp_providers(name)',
            )
            .eq('id', id)
            .single(),
        supabase
            .from('erp_purchase_lines')
            .select('id, raw_name, quantity, unit_price, line_total_cost, master_item_id')
            .eq('document_id', id)
            .order('id'),
        sb
            .from('erp_documents')
            .select('id, document_number, document_date, total_amount')
            .eq('parent_invoice_id', id)
            .order('document_date', { ascending: false }),
    ])

    if (docResult.error || !docResult.data) {
        if (docResult.error?.code === 'PGRST116') return notFound()
        return (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
                <AlertCircle className="h-10 w-10 text-destructive" />
                <p className="text-sm text-muted-foreground">
                    Error al cargar el documento: {docResult.error?.message}
                </p>
            </div>
        )
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = docResult.data as any
    const doc: DocumentDetail = {
        id: raw.id,
        doc_type: raw.doc_type,
        document_number: raw.document_number,
        document_date: raw.document_date,
        total_amount: raw.total_amount,
        status: raw.status,
        reconciliation_status: raw.reconciliation_status,
        reconciliation_delta: raw.reconciliation_delta,
        referenced_delivery_notes: raw.referenced_delivery_notes,
        parent_invoice_id: raw.parent_invoice_id,
        drive_url: raw.drive_url,
        provider_id: raw.provider_id,
        provider_name: raw.erp_providers?.name ?? null,
        venue_id: raw.venue_id,
        tenant_id: raw.tenant_id,
        created_at: raw.created_at ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lines: (linesResult.data ?? []).map((l: any) => ({
            id: l.id,
            raw_name: l.raw_name,
            quantity: l.quantity,
            unit_price: l.unit_price,
            line_total_cost: l.line_total_cost,
            master_item_id: l.master_item_id,
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        linkedAlbaranes: (albaranesResult.data ?? []).map((a: any) => ({
            id: a.id,
            document_number: a.document_number,
            document_date: a.document_date,
            total_amount: a.total_amount,
        })),
    }

    return <DocumentoDetailClient doc={doc} />
}
