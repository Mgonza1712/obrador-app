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
    master_item_id: z.string().uuid().nullable().optional(),
    ai_interpretation: z.record(z.string(), z.unknown()).nullable().optional(),
})

const SaveDocumentSchema = z.object({
    documentId: z.string().uuid(),
    header: z.object({
        doc_type: z.string().min(1, 'El tipo de documento es requerido'),
        document_number: z.string().nullable(),
        document_date: z.string().nullable(),
        total_amount: z.number().nullable(),
        provider_id: z.string().uuid().nullable().optional(),
        venue_id: z.string().uuid().nullable().optional(),
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
    const providerId = header.provider_id ?? null
    const venueId = header.venue_id ?? null
    const documentDate = header.document_date ?? null

    // Fetch provider name once (for extraction_corrections)
    let providerName: string | null = null
    if (providerId) {
        const { data: provRow } = await supabase
            .from('erp_providers')
            .select('name')
            .eq('id', providerId)
            .single()
        providerName = provRow?.name ?? null
    }

    for (const line of lines) {
        if (line.id) {
            // Capture the pre-update unit_price to detect changes vs active price_history
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

            // ── A-1: Sync price_history when price changes ──────────────────
            const masterItemId = line.master_item_id ?? null
            if (masterItemId && providerId && line.unit_price != null) {
                // Find the current non-archived price for this master_item + provider.
                // For presupuestos we also look for 'quote' so we can correctly inherit the
                // status that was set during revision (active = precio negociado, quote = cotización).
                const { data: activePrice } = await supabase
                    .from('erp_price_history')
                    .select('id, unit_price, is_preferred, iva_percent, cost_per_packaged_unit, cost_per_base_unit, status')
                    .eq('master_item_id', masterItemId)
                    .eq('provider_id', providerId)
                    .in('status', ['active', 'quote'])
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle()

                const newPrice = line.unit_price
                const existingPrice = activePrice ? Number(activePrice.unit_price) : null

                if (existingPrice === null || Math.abs(newPrice - existingPrice) >= 0.001) {
                    // Fetch packaging from alias to calculate costs
                    const { data: alias } = await supabase
                        .from('erp_item_aliases')
                        .select('envases_por_formato, contenido_por_envase')
                        .eq('master_item_id', masterItemId)
                        .eq('provider_id', providerId)
                        .limit(1)
                        .maybeSingle()

                    const envases = Number(alias?.envases_por_formato ?? 1) || 1
                    const contenido = Number(alias?.contenido_por_envase ?? 1) || 1
                    const costPerPackaged = newPrice / envases
                    const costPerBase = newPrice / (envases * contenido)

                    // Archive current active
                    if (activePrice) {
                        await supabase
                            .from('erp_price_history')
                            .update({ status: 'archived' })
                            .eq('id', activePrice.id)
                    }

                    // Determine status to inherit:
                    // - Non-presupuesto → always 'active'
                    // - Presupuesto con precio previo → heredar su status (active si fue negociado, quote si era cotización)
                    // - Presupuesto sin precio previo → 'quote' por defecto (no contaminar precios reales)
                    const newStatus = header.doc_type?.toLowerCase() === 'presupuesto'
                        ? ((activePrice?.status as 'active' | 'quote' | undefined) ?? 'quote')
                        : 'active'

                    await supabase
                        .from('erp_price_history')
                        .insert({
                            master_item_id: masterItemId,
                            provider_id: providerId,
                            venue_id: venueId,
                            unit_price: newPrice,
                            cost_per_packaged_unit: costPerPackaged,
                            cost_per_base_unit: costPerBase,
                            status: newStatus,
                            is_preferred: activePrice?.is_preferred ?? false,
                            effective_date: documentDate,
                            iva_percent: activePrice?.iva_percent ?? null,
                            document_id: documentId,
                        })
                }
            }

            // ── A-2: extraction_corrections when AI price differs ───────────
            if (masterItemId && line.unit_price != null && line.ai_interpretation) {
                const aiData = line.ai_interpretation
                const extractionStep = aiData.extraction_step as Record<string, unknown> | null | undefined
                const aiPriceField = extractionStep?.precio_unitario as { value?: number; confidence?: number } | null | undefined
                const aiPrice = aiPriceField?.value

                if (aiPrice != null && Math.abs(Number(aiPrice) - line.unit_price) >= 0.001) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    await (supabase as any).from('extraction_corrections').insert({
                        document_id: documentId,
                        purchase_line_id: line.id,
                        field_name: 'precio_unitario',
                        extracted_value: String(aiPrice),
                        corrected_value: String(line.unit_price),
                        confidence: aiPriceField?.confidence ?? null,
                        document_type: header.doc_type,
                        provider_name: providerName,
                        correction_type: 'price_edit_post_approval',
                        step: 'extraction',
                    })
                }
            }
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
        supabase.from('erp_purchase_lines').select('line_total_cost, iva_percent').eq('document_id', documentId),
    ])
    // delta = total CON IVA (factura) - total albaranes vinculados - SUM(linea_sin_iva × (1 + iva/100))
    const delta =
        (docRow?.total_amount ?? 0) -
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((albaranes ?? []).reduce((s: number, a: any) => s + (a.total_amount ?? 0), 0)) -
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((savedLines ?? []).reduce((s: number, l: any) => s + (l.line_total_cost ?? 0) * (1 + (l.iva_percent ?? 0) / 100), 0))
    await sb.from('erp_documents').update({ reconciliation_delta: delta }).eq('id', documentId)

    revalidatePath(`/documentos/${documentId}`)
    revalidatePath('/documentos')
    return { success: true }
}

export async function approveDocumentStatus(documentId: string): Promise<ActionResult> {
    if (!documentId) return { success: false, error: 'ID de documento inválido' }
    const supabase = await createClient()

    const { error } = await (supabase as any)
        .from('erp_documents')
        .update({ status: 'approved' })
        .eq('id', documentId)
        .in('status', ['pending', 'pending_review'])

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

export type MasterItemOption = { id: string; official_name: string; base_unit: string; category: string | null }

export async function getMasterItems(): Promise<MasterItemOption[]> {
    const supabase = await createClient()
    const { data } = await supabase
        .from('erp_master_items')
        .select('id, official_name, base_unit, category')
        .order('official_name')
        .limit(500)
    return (data ?? []) as MasterItemOption[]
}

// ── linkSkippedLine ──────────────────────────────────────────────────────────
// Links a purchase_line with review_status='skipped' to a master_item,
// creates or updates the alias, and inserts a price_history entry if applicable.

const LinkSkippedLineSchema = z.object({
    lineId: z.string().uuid(),
    documentId: z.string().uuid(),
    providerId: z.string().uuid().nullable(),
    venueId: z.string().uuid().nullable(),
    documentDate: z.string().nullable(),
    docType: z.string().nullable(),
    unitPrice: z.number().nonnegative().nullable(),
    resolution: z.discriminatedUnion('action', [
        z.object({
            action: z.literal('link_existing'),
            masterItemId: z.string().uuid(),
        }),
        z.object({
            action: z.literal('create_and_link'),
            officialName: z.string().min(1),
            category: z.string().nullable(),
            baseUnit: z.string().min(1),
        }),
    ]),
    alias: z.object({
        rawName: z.string(),
        formatoCompra: z.string(),
        envasesPorFormato: z.number().positive(),
        contenidoPorEnvase: z.number().positive(),
    }),
})

export type LinkSkippedLineInput = z.infer<typeof LinkSkippedLineSchema>

export async function linkSkippedLine(input: LinkSkippedLineInput): Promise<ActionResult> {
    const parsed = LinkSkippedLineSchema.safeParse(input)
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

    const { lineId, documentId, providerId, venueId, documentDate, docType, unitPrice, resolution, alias } = parsed.data
    const supabase = await createClient()

    // ── 1. Resolve master_item ──
    let masterItemId: string

    if (resolution.action === 'create_and_link') {
        // Fetch tenant_id from the document
        const { data: docRow } = await (supabase as any)
            .from('erp_documents')
            .select('tenant_id')
            .eq('id', documentId)
            .single()
        const tenantId = docRow?.tenant_id ?? null

        const { data: newItem, error } = await supabase
            .from('erp_master_items')
            .insert({
                official_name: resolution.officialName,
                category: resolution.category || null,
                base_unit: resolution.baseUnit,
                tenant_id: tenantId,
            })
            .select('id')
            .single()
        if (error) return { success: false, error: `Error al crear producto maestro: ${error.message}` }
        masterItemId = newItem.id
    } else {
        masterItemId = resolution.masterItemId
    }

    // ── 2. Upsert alias ──
    if (providerId && alias.rawName) {
        const { data: existingAlias } = await supabase
            .from('erp_item_aliases')
            .select('id')
            .eq('provider_id', providerId)
            .ilike('raw_name', alias.rawName)
            .maybeSingle()

        const aliasPayload = {
            provider_id: providerId,
            raw_name: alias.rawName,
            master_item_id: masterItemId,
            formato_compra: alias.formatoCompra,
            envases_por_formato: alias.envasesPorFormato,
            contenido_por_envase: alias.contenidoPorEnvase,
        }
        if (existingAlias) {
            await supabase.from('erp_item_aliases').update(aliasPayload).eq('id', existingAlias.id)
        } else {
            await supabase.from('erp_item_aliases').insert(aliasPayload)
        }
    }

    // ── 3. Update purchase line ──
    const { error: lineError } = await supabase
        .from('erp_purchase_lines')
        .update({ master_item_id: masterItemId, review_status: 'reviewed' })
        .eq('id', lineId)
    if (lineError) return { success: false, error: `Error al actualizar línea: ${lineError.message}` }

    // ── 4. Insert price_history if unit_price is available ──
    if (providerId && unitPrice != null) {
        const envases = alias.envasesPorFormato || 1
        const contenido = alias.contenidoPorEnvase || 1
        const costPerPackaged = unitPrice / envases
        const costPerBase = unitPrice / (envases * contenido)

        // Archive any existing active price
        await supabase
            .from('erp_price_history')
            .update({ status: 'archived' })
            .eq('master_item_id', masterItemId)
            .eq('provider_id', providerId)
            .eq('status', 'active')

        await supabase
            .from('erp_price_history')
            .insert({
                master_item_id: masterItemId,
                provider_id: providerId,
                venue_id: venueId,
                unit_price: unitPrice,
                cost_per_packaged_unit: costPerPackaged,
                cost_per_base_unit: costPerBase,
                status: docType?.toLowerCase() === 'presupuesto' ? 'quote' : 'active',
                is_preferred: true,
                effective_date: documentDate,
                document_id: documentId,
            })
    }

    revalidatePath(`/documentos/${documentId}`)
    revalidatePath('/documentos')
    return { success: true }
}
