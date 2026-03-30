'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

// ── Schemas ──────────────────────────────────────────────────────────────────

const PurchaseLineSchema = z.object({
    id: z.string().uuid().optional(),
    raw_name: z.string().min(1, 'El nombre del producto es requerido'),
    quantity: z.number().positive('La cantidad debe ser positiva'),
    unit_price: z.number().nonnegative().nullable(),
    line_total_cost: z.number().nonnegative(),
})

const SaveDocumentSchema = z.object({
    documentId: z.string().uuid(),
    header: z.object({
        doc_type: z.string().min(1, 'El tipo de documento es requerido'),
        document_number: z.string().nullable(),
        document_date: z.string().nullable(),
        total_amount: z.number().nullable(),
        provider_id: z.string().uuid().nullable().optional(),
    }),
    lines: z.array(PurchaseLineSchema),
    deletedLineIds: z.array(z.string().uuid()),
})

const ReassignVenueSchema = z.object({
    docId: z.string().uuid(),
    venueId: z.string().uuid(),
})

export type SaveDocumentInput = z.infer<typeof SaveDocumentSchema>
export type ActionResult = { success: true } | { success: false; error: string }
export type Venue = { id: string; name: string }
export type Provider = { id: string; name: string }

// ── Mutations ────────────────────────────────────────────────────────────────

export async function saveDocument(input: SaveDocumentInput): Promise<ActionResult> {
    const parsed = SaveDocumentSchema.safeParse(input)
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0].message }
    }

    const { documentId, header, lines, deletedLineIds } = parsed.data
    const supabase = await createClient()

    // Update header
    const headerUpdate: Record<string, unknown> = {
        doc_type: header.doc_type,
        document_number: header.document_number,
        document_date: header.document_date,
        total_amount: header.total_amount,
    }
    if (header.provider_id !== undefined) headerUpdate.provider_id = header.provider_id

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: headerErr } = await (supabase as any)
        .from('erp_documents')
        .update(headerUpdate)
        .eq('id', documentId)

    if (headerErr) return { success: false, error: `Error al guardar cabecera: ${headerErr.message}` }

    // Delete removed lines
    if (deletedLineIds.length > 0) {
        const { error } = await supabase
            .from('erp_purchase_lines')
            .delete()
            .in('id', deletedLineIds)
        if (error) return { success: false, error: `Error al eliminar líneas: ${error.message}` }
    }

    // Upsert lines
    for (const line of lines) {
        if (line.id) {
            const { error } = await supabase
                .from('erp_purchase_lines')
                .update({
                    raw_name: line.raw_name,
                    quantity: line.quantity,
                    unit_price: line.unit_price,
                    line_total_cost: line.line_total_cost,
                })
                .eq('id', line.id)
            if (error) return { success: false, error: `Error al actualizar línea: ${error.message}` }
        } else {
            const { error } = await supabase
                .from('erp_purchase_lines')
                .insert({
                    document_id: documentId,
                    raw_name: line.raw_name,
                    quantity: line.quantity,
                    unit_price: line.unit_price,
                    line_total_cost: line.line_total_cost,
                })
            if (error) return { success: false, error: `Error al crear línea: ${error.message}` }
        }
    }

    // Recalculate reconciliation_delta: invoice total - albaranes - lines
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any
    const [{ data: docRow }, { data: albaranes }, { data: savedLines }] = await Promise.all([
        sb.from('erp_documents').select('total_amount').eq('id', documentId).single(),
        sb.from('erp_documents').select('total_amount').eq('parent_invoice_id', documentId),
        supabase.from('erp_purchase_lines').select('line_total_cost').eq('document_id', documentId),
    ])
    const delta =
        (docRow?.total_amount ?? 0) -
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((albaranes ?? []).reduce((s: number, a: any) => s + (a.total_amount ?? 0), 0)) -
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((savedLines ?? []).reduce((s: number, l: any) => s + (l.line_total_cost ?? 0), 0))
    await sb.from('erp_documents').update({ reconciliation_delta: delta }).eq('id', documentId)

    revalidatePath(`/documentos/${documentId}`)
    revalidatePath('/documentos')
    return { success: true }
}

export async function approveDocumentStatus(documentId: string): Promise<ActionResult> {
    if (!documentId) return { success: false, error: 'ID de documento inválido' }
    const supabase = await createClient()

    const { error } = await supabase
        .from('erp_documents')
        .update({ status: 'approved' })
        .eq('id', documentId)
        .eq('status', 'pending')

    if (error) return { success: false, error: error.message }

    revalidatePath(`/documentos/${documentId}`)
    revalidatePath('/documentos')
    return { success: true }
}

export async function reassignDocumentVenue(docId: string, venueId: string): Promise<ActionResult> {
    const parsed = ReassignVenueSchema.safeParse({ docId, venueId })
    if (!parsed.success) return { success: false, error: 'Datos de venue inválidos' }

    const supabase = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
        .from('erp_documents')
        .update({ venue_id: parsed.data.venueId })
        .eq('id', parsed.data.docId)

    if (error) return { success: false, error: error.message }

    revalidatePath(`/documentos/${docId}`)
    revalidatePath('/documentos')
    return { success: true }
}

export async function getVenues(): Promise<Venue[]> {
    const supabase = await createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
        .from('erp_venues')
        .select('id, name')
        .order('name')
    return (data ?? []) as Venue[]
}

export async function getProviders(): Promise<Provider[]> {
    const supabase = await createClient()
    const { data } = await supabase
        .from('erp_providers')
        .select('id, name')
        .eq('is_active', true)
        .order('name')
        .limit(100)
    return (data ?? []) as Provider[]
}
