'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// NOTE: parent_invoice_id, reconciliation_delta, reconciliation_status, referenced_delivery_notes
// exist in the DB but are not yet in the generated database.types.ts.
// All operations on these columns use (supabase as any) until types are regenerated.

export type ActionResult = { success: true } | { success: false; error: string }

const TOLERANCE = 0.01

// Recalculates reconciliation_delta and reconciliation_status for an invoice
async function recalcAndSaveDelta(invoiceId: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = await createClient() as any

    const [{ data: invoice }, { data: albaranes }] = await Promise.all([
        sb.from('erp_documents').select('total_amount').eq('id', invoiceId).single(),
        sb.from('erp_documents').select('total_amount').eq('parent_invoice_id', invoiceId),
    ])

    const invoiceTotal = invoice?.total_amount ?? 0
    const albaranTotal = (albaranes ?? []).reduce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sum: number, a: any) => sum + (a.total_amount ?? 0),
        0,
    )
    const delta = invoiceTotal - albaranTotal
    const newStatus = Math.abs(delta) <= TOLERANCE ? 'matched' : 'mismatch'

    await sb
        .from('erp_documents')
        .update({ reconciliation_delta: delta, reconciliation_status: newStatus })
        .eq('id', invoiceId)
}

export async function linkDeliveryNote(albaranId: string, invoiceId: string): Promise<ActionResult> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = await createClient() as any

    const { error } = await sb
        .from('erp_documents')
        .update({ parent_invoice_id: invoiceId })
        .eq('id', albaranId)
        .is('parent_invoice_id', null) // Only link orphans

    if (error) return { success: false, error: error.message }

    await recalcAndSaveDelta(invoiceId)
    revalidatePath(`/documentos/${invoiceId}`)
    return { success: true }
}

export async function unlinkDeliveryNote(albaranId: string, invoiceId: string): Promise<ActionResult> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = await createClient() as any

    const { error } = await sb
        .from('erp_documents')
        .update({ parent_invoice_id: null })
        .eq('id', albaranId)
        .eq('parent_invoice_id', invoiceId)

    if (error) return { success: false, error: error.message }

    await recalcAndSaveDelta(invoiceId)
    revalidatePath(`/documentos/${invoiceId}`)
    return { success: true }
}

export async function searchOrphanAlbaranes(
    query: string,
    providerId: string,
): Promise<Array<{ id: string; document_number: string | null; document_date: string | null; total_amount: number | null }>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = await createClient() as any

    let q = sb
        .from('erp_documents')
        .select('id, document_number, document_date, total_amount')
        .eq('provider_id', providerId)
        .is('parent_invoice_id', null)
        .ilike('doc_type', '%lbar%') // Matches 'Albarán', 'albaran', etc.
        .limit(10)

    if (query) {
        q = q.ilike('document_number', `%${query}%`)
    }

    const { data } = await q.order('document_date', { ascending: false })
    return data ?? []
}

export async function confirmManualReconciliation(invoiceId: string): Promise<ActionResult> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = await createClient() as any

    const { data: invoice } = await sb
        .from('erp_documents')
        .select('reconciliation_delta')
        .eq('id', invoiceId)
        .single()

    if (!invoice) return { success: false, error: 'Documento no encontrado' }

    const delta = Math.abs(invoice.reconciliation_delta ?? Infinity)
    if (delta > TOLERANCE) {
        return {
            success: false,
            error: `El descuadre actual (${(invoice.reconciliation_delta ?? 0).toFixed(2)} €) supera la tolerancia permitida (±${TOLERANCE} €).`,
        }
    }

    const { error } = await sb
        .from('erp_documents')
        .update({ reconciliation_status: 'manual', status: 'approved' })
        .eq('id', invoiceId)

    if (error) return { success: false, error: error.message }

    revalidatePath(`/documentos/${invoiceId}`)
    revalidatePath('/documentos')
    return { success: true }
}
