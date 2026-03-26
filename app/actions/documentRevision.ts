'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// --- Interfaces for the payload ---
interface DocumentRevisionPayload {
    document: {
        id: string
        doc_type: string
        document_number: string | null
        document_date: string | null
        total_amount: number | null
        venue_id: string | null
        provider_resolution:
        | { action: 'skip' }
        | { action: 'link_existing'; provider_id: string }
        | { action: 'create_and_link'; new_provider_name: string }
    }
    lines: Array<{
        purchase_line_id: string
        quantity: number
        unit_price: number | null
        line_total_cost: number
        unidad_precio: string
        unidades_por_pack: number
        cantidad_por_unidad: number
        formato: string
        raw_name: string | null
        resolution:
        | { action: 'skip' }
        | { action: 'link_existing'; master_item_id: string }
        | { action: 'create_and_link'; new_official_name: string; new_item_category: string; new_item_base_unit: string }
    }>
}

export async function approveDocument(payload: DocumentRevisionPayload): Promise<{ success: boolean; error?: string; existingDocumentId?: string }> {
    const supabase = await createClient()

    try {
        // We need tenant_id for new inserts (providers, master items)
        const { data: userData, error: userError } = await supabase.auth.getUser()
        if (userError || !userData.user) throw new Error('User not authenticated')

        // Fetch tenant_id constraint for safety. A robust ERP would get this from context, 
        // but assuming one tenant for now as per schema or fetch the first one the user has access to.
        // Quick assumption: we fetch standard tenant_id if available on erp_documents
        const { data: existingDoc } = await supabase
            .from('erp_documents')
            .select('tenant_id')
            .eq('id', payload.document.id)
            .single()

        const tenant_id = existingDoc?.tenant_id

        // ── 1. Resolve Provider ──
        let finalProviderId: string | null = null

        if (payload.document.provider_resolution.action === 'create_and_link') {
            const newName = payload.document.provider_resolution.new_provider_name
            const { data: newProvider, error } = await supabase
                .from('erp_providers')
                .insert({ name: newName, tenant_id })
                .select('id')
                .single()

            if (error) throw new Error(`Failed to create provider: ${error.message}`)
            finalProviderId = newProvider.id
        } else if (payload.document.provider_resolution.action === 'link_existing') {
            finalProviderId = payload.document.provider_resolution.provider_id
        }

        // ── 2. Duplicate validation (server-side) ──
        // Skip for presupuestos/cotizaciones — they never have a definitive document number
        const docTypeNorm = payload.document.doc_type?.toLowerCase()
        if (docTypeNorm !== 'presupuesto' && finalProviderId && payload.document.document_number) {
            const { data: dupes } = await supabase
                .from('erp_documents')
                .select('id')
                .eq('provider_id', finalProviderId)
                .eq('document_number', payload.document.document_number)
                .eq('status', 'approved')
                .neq('id', payload.document.id)
                .limit(1)

            if (dupes && dupes.length > 0) {
                return {
                    success: false,
                    error: 'duplicate',
                    existingDocumentId: dupes[0].id,
                }
            }
        }

        // ── 3. Update Document header fields (without status — set at the very end) ──
        const { error: docError } = await supabase
            .from('erp_documents')
            .update({
                provider_id: finalProviderId,
                venue_id: payload.document.venue_id,
                doc_type: payload.document.doc_type,
                document_number: payload.document.document_number,
                document_date: payload.document.document_date,
                total_amount: payload.document.total_amount,
            })
            .eq('id', payload.document.id)

        if (docError) throw new Error(`Failed to update document: ${docError.message}`)

        // ── 4. Process Lines (sequentially to avoid race conditions) ──
        for (const line of payload.lines) {

            // --- Step A: Master Item Resolution ---
            let finalMasterItemId: string | null = null

            if (line.resolution.action === 'create_and_link') {
                const { data: newItem, error } = await supabase
                    .from('erp_master_items')
                    .insert({
                        official_name: line.resolution.new_official_name,
                        category: line.resolution.new_item_category || null,
                        base_unit: line.resolution.new_item_base_unit || 'ud',
                        tenant_id,
                    })
                    .select('id')
                    .single()

                if (error) throw new Error(`Failed to create master item: ${error.message}`)
                finalMasterItemId = newItem.id
            } else if (line.resolution.action === 'link_existing') {
                finalMasterItemId = line.resolution.master_item_id
            }

            // --- Step B: Upsert Alias (learning engine) ---
            if (finalMasterItemId && finalProviderId && line.raw_name) {
                const conversion_multiplier = line.unidades_por_pack * line.cantidad_por_unidad

                const { data: existingAlias } = await supabase
                    .from('erp_item_aliases')
                    .select('id')
                    .eq('provider_id', finalProviderId)
                    .ilike('raw_name', line.raw_name)
                    .maybeSingle()

                const aliasPayload = {
                    provider_id: finalProviderId,
                    raw_name: line.raw_name,
                    master_item_id: finalMasterItemId,
                    unidad_precio: line.unidad_precio,
                    unidades_por_pack: line.unidades_por_pack,
                    cantidad_por_unidad: line.cantidad_por_unidad,
                    formato: line.formato || null,
                    conversion_multiplier,
                }

                if (existingAlias) {
                    await supabase.from('erp_item_aliases').update(aliasPayload).eq('id', existingAlias.id)
                } else {
                    await supabase.from('erp_item_aliases').insert(aliasPayload)
                }
            }

            // --- Step C: Update Purchase Line ---
            const { error: lineError } = await supabase
                .from('erp_purchase_lines')
                .update({
                    master_item_id: finalMasterItemId,
                    quantity: line.quantity,
                    unit_price: line.unit_price,
                    line_total_cost: line.line_total_cost,
                })
                .eq('id', line.purchase_line_id)

            if (lineError) throw new Error(`Failed to update line ${line.purchase_line_id}: ${lineError.message}`)

            // --- Step D: Price History ---
            if (finalMasterItemId && finalProviderId && line.unit_price != null) {
                const venueId = payload.document.venue_id
                const effectiveDate = payload.document.document_date
                const conversion_multiplier = line.unidades_por_pack * line.cantidad_por_unidad

                // Fetch the current active price for this item+provider combo
                const activePriceQuery = supabase
                    .from('erp_price_history')
                    .select('id, unit_price')
                    .eq('master_item_id', finalMasterItemId)
                    .eq('provider_id', finalProviderId)
                    .eq('status', 'active')

                if (venueId) {
                    activePriceQuery.eq('venue_id', venueId)
                } else {
                    activePriceQuery.is('venue_id', null)
                }

                const { data: activePrice } = await activePriceQuery.maybeSingle()

                // If price is identical to the current active entry, skip — no history change needed
                if (activePrice && activePrice.unit_price === line.unit_price) continue

                // Price changed (or no active entry exists): archive current and insert new
                const archiveQuery = supabase
                    .from('erp_price_history')
                    .update({ status: 'archived' })
                    .eq('master_item_id', finalMasterItemId)
                    .eq('status', 'active')

                if (venueId) {
                    archiveQuery.eq('venue_id', venueId)
                } else {
                    archiveQuery.is('venue_id', null)
                }

                await archiveQuery

                await supabase
                    .from('erp_price_history')
                    .insert({
                        master_item_id: finalMasterItemId,
                        provider_id: finalProviderId,
                        venue_id: venueId,
                        unit_price: line.unit_price,
                        cost_per_packaged_unit: line.unit_price / (line.unidades_por_pack || 1),
                        cost_per_base_unit: line.unit_price / (conversion_multiplier || 1),
                        effective_date: effectiveDate,
                        status: 'active',
                    })
            }
        }

        // ── 5. Mark document as approved — only after all lines processed successfully ──
        const { error: approveError } = await supabase
            .from('erp_documents')
            .update({ status: 'approved' })
            .eq('id', payload.document.id)

        if (approveError) throw new Error(`Failed to approve document: ${approveError.message}`)

        revalidatePath('/admin/revision')
        return { success: true }

    } catch (e: unknown) {
        console.error("Error approving document:", e)
        const message = e instanceof Error ? e.message : 'Unknown error occurred during approval'

        // Detect DB-level duplicate constraint violation (backup to the explicit check above)
        const isDuplicate = message.toLowerCase().includes('duplicate key') || message.includes('23505')
        if (isDuplicate && payload.document.document_number) {
            const provId = payload.document.provider_resolution.action === 'link_existing'
                ? payload.document.provider_resolution.provider_id
                : null

            let existingDocumentId: string | undefined
            if (provId) {
                const { data: existingDocs } = await supabase
                    .from('erp_documents')
                    .select('id')
                    .eq('provider_id', provId)
                    .eq('document_number', payload.document.document_number)
                    .eq('status', 'approved')
                    .neq('id', payload.document.id)
                    .limit(1)
                existingDocumentId = existingDocs?.[0]?.id
            }

            return { success: false, error: 'duplicate', existingDocumentId }
        }

        return { success: false, error: message }
    }
}

export async function deleteDocument(documentId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient()

    try {
        // 1. Verify document is in 'pending' status — never delete approved docs
        const { data: doc, error: fetchError } = await supabase
            .from('erp_documents')
            .select('status')
            .eq('id', documentId)
            .single()

        if (fetchError || !doc) throw new Error('Documento no encontrado')
        if (doc.status !== 'pending') throw new Error('Solo se pueden eliminar documentos en estado pendiente')

        // 2. Delete purchase lines first (foreign key constraint)
        const { error: linesError } = await supabase
            .from('erp_purchase_lines')
            .delete()
            .eq('document_id', documentId)

        if (linesError) throw new Error(`Error al eliminar las líneas: ${linesError.message}`)

        // 3. Delete the document
        const { error: docError } = await supabase
            .from('erp_documents')
            .delete()
            .eq('id', documentId)

        if (docError) throw new Error(`Error al eliminar el documento: ${docError.message}`)

        revalidatePath('/admin/revision')
        return { success: true }

    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Error desconocido al eliminar'
        return { success: false, error: message }
    }
}
