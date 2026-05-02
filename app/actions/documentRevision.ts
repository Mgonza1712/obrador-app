'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { matchOrderToDocument } from '@/app/actions/pedidos'

// --- Interfaces for the payload ---
interface DocumentRevisionPayload {
    document: {
        id: string
        doc_type: string
        document_number: string | null
        document_date: string | null
        total_amount: number | null
        venue_id: string | null
        activate_prices: boolean  // presupuestos → active si true, quote si false
        provider_resolution:
        | { action: 'skip' }
        | { action: 'link_existing'; provider_id: string }
        | { action: 'create_and_link'; new_provider_name: string }
    }
    lines: Array<{
        purchase_line_id: string
        /** When true, this line does not exist in the DB yet and must be INSERTed first */
        is_new_line?: boolean
        quantity: number
        unit_price: number | null
        line_total_cost: number
        formato_compra: string
        envases_por_formato: number
        contenido_por_envase: number
        raw_name: string | null
        review_status?: string | null
        ai_interpretation?: Record<string, unknown> | null
        is_preferred: boolean
        iva_percent?: number | null
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

        // Determinar status para price_history:
        // - Facturas y albaranes → siempre 'active'
        // - Presupuestos → 'quote' por defecto, 'active' si el operario activó el toggle
        const priceHistoryStatus = (docTypeNorm === 'presupuesto' && !payload.document.activate_prices)
            ? 'quote'
            : 'active'
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

            // --- Step 0: Create the purchase line if it was added manually (no DB row yet) ---
            if (line.is_new_line) {
                const { data: newLineRow, error: newLineErr } = await supabase
                    .from('erp_purchase_lines')
                    .insert({
                        document_id: payload.document.id,
                        raw_name: line.raw_name,
                        quantity: line.quantity,
                        unit_price: line.unit_price,
                        line_total_cost: line.line_total_cost,
                        review_status: 'pending_review',
                    })
                    .select('id')
                    .single()
                if (newLineErr) throw new Error(`Failed to create manual line: ${newLineErr.message}`)
                // Override the temp ID with the real DB id for subsequent steps
                line.purchase_line_id = newLineRow.id
            }

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
                    formato_compra: line.formato_compra,
                    envases_por_formato: line.envases_por_formato,
                    contenido_por_envase: line.contenido_por_envase,
                }

                if (existingAlias) {
                    // Para líneas auto_approved el alias ya existe con datos correctos del ciclo anterior.
                    // No sobrescribir con los campos nulos del normalization_step que el extractor deja en null para productos conocidos.
                    if (line.review_status !== 'auto_approved') {
                        await supabase.from('erp_item_aliases').update(aliasPayload).eq('id', existingAlias.id)
                    }
                } else {
                    await supabase.from('erp_item_aliases').insert(aliasPayload)
                }
            }

            // --- Step C: Update Purchase Line ---
            const newReviewStatus =
                line.resolution.action === 'skip' ? 'skipped'
                : line.review_status === 'auto_approved' ? 'auto_approved'
                : 'reviewed'

            const { error: lineError } = await supabase
                .from('erp_purchase_lines')
                .update({
                    master_item_id: finalMasterItemId,
                    quantity: line.quantity,
                    unit_price: line.unit_price,
                    line_total_cost: line.line_total_cost,
                    review_status: newReviewStatus,
                })
                .eq('id', line.purchase_line_id)

            if (lineError) throw new Error(`Failed to update line ${line.purchase_line_id}: ${lineError.message}`)

            // --- Step D: Price History ---
            // Procesar precio si: hay master_item, hay proveedor, hay precio, y la línea no fue saltada
            if (finalMasterItemId && finalProviderId && line.unit_price != null && line.resolution.action !== 'skip') {
                const venueId = payload.document.venue_id
                const effectiveDate = payload.document.document_date

                // Usar datos de formato del alias para cálculos de costo precisos.
                // Para líneas auto_approved el normalization_step tiene campos nulos;
                // el alias tiene la data correcta del ciclo de aprendizaje anterior.
                const { data: aliasFormat } = await supabase
                    .from('erp_item_aliases')
                    .select('envases_por_formato, contenido_por_envase')
                    .eq('master_item_id', finalMasterItemId)
                    .eq('provider_id', finalProviderId)
                    .maybeSingle()

                const effectiveEnvases = (aliasFormat ? Number(aliasFormat.envases_por_formato) : line.envases_por_formato) || 1
                const effectiveContenido = (aliasFormat ? Number(aliasFormat.contenido_por_envase) : line.contenido_por_envase) || 1

                // Buscar el precio más reciente (activo o archivado) para comparar
                const { data: latestPrice } = await supabase
                    .from('erp_price_history')
                    .select('id, unit_price, is_preferred, status, effective_date')
                    .eq('master_item_id', finalMasterItemId)
                    .eq('provider_id', finalProviderId)
                    .order('effective_date', { ascending: false })
                    .limit(1)
                    .maybeSingle()

                // Guardia de fecha: documento más antiguo que el precio vigente no lo sobreescribe
                const newDocDate = effectiveDate ? new Date(effectiveDate) : null
                const latestPriceDate = (latestPrice as any)?.effective_date ? new Date((latestPrice as any).effective_date) : null
                const isNewDocMoreRecent = !latestPriceDate || !newDocDate || newDocDate >= latestPriceDate

                if (latestPrice && Math.abs(Number(latestPrice.unit_price) - (line.unit_price ?? 0)) < 0.001) {
                    // Precio sin cambios: actualizar metadata solo si el documento es más reciente
                    if (isNewDocMoreRecent) {
                        const { data: activePrice } = await supabase
                            .from('erp_price_history')
                            .select('id, is_preferred')
                            .eq('master_item_id', finalMasterItemId)
                            .eq('provider_id', finalProviderId)
                            .eq('status', priceHistoryStatus)
                            .maybeSingle()

                        if (activePrice) {
                            const updates: Record<string, unknown> = {
                                document_id: payload.document.id,
                                cost_per_base_unit: line.unit_price / (effectiveEnvases * effectiveContenido),
                                cost_per_packaged_unit: line.unit_price / effectiveEnvases,
                            }
                            if (line.iva_percent != null) updates.iva_percent = line.iva_percent

                            // Solo promover is_preferred, nunca degradar:
                            // el default false del UI para productos conocidos no indica intención del usuario de quitarlo.
                            if (line.is_preferred && !activePrice.is_preferred) {
                                updates.is_preferred = true
                                await supabase
                                    .from('erp_price_history')
                                    .update({ is_preferred: false })
                                    .eq('master_item_id', finalMasterItemId)
                                    .eq('status', priceHistoryStatus)
                                    .neq('id', activePrice.id)
                            }

                            await supabase
                                .from('erp_price_history')
                                .update(updates)
                                .eq('id', activePrice.id)
                        }
                    }
                    continue
                }

                // Documento más antiguo que el precio vigente: guardar como registro histórico sin tocar el activo
                if (!isNewDocMoreRecent) {
                    await supabase
                        .from('erp_price_history')
                        .insert({
                            master_item_id: finalMasterItemId,
                            provider_id: finalProviderId,
                            venue_id: venueId,
                            unit_price: line.unit_price,
                            cost_per_packaged_unit: line.unit_price / effectiveEnvases,
                            cost_per_base_unit: line.unit_price / (effectiveEnvases * effectiveContenido),
                            effective_date: effectiveDate,
                            status: 'archived',
                            is_preferred: false,
                            iva_percent: line.iva_percent ?? null,
                            document_id: payload.document.id,
                        })
                    continue
                }

                // Precio cambió (o no hay precio previo): archivar el activo e insertar el nuevo
                const { data: currentActive } = await supabase
                    .from('erp_price_history')
                    .select('id, is_preferred')
                    .eq('master_item_id', finalMasterItemId)
                    .eq('provider_id', finalProviderId)
                    .eq('status', priceHistoryStatus)
                    .maybeSingle()

                const { count: anyActivePriceCount } = await supabase
                    .from('erp_price_history')
                    .select('id', { count: 'exact', head: true })
                    .eq('master_item_id', finalMasterItemId)
                    .eq('status', priceHistoryStatus)

                const isAbsolutelyFirstPrice = (anyActivePriceCount ?? 0) === 0
                const inheritedPreferred = currentActive?.is_preferred ?? latestPrice?.is_preferred ?? false
                // Usar || para heredar is_preferred: el default false del payload no debe anular un is_preferred=true existente
                const finalIsPreferred = line.is_preferred || inheritedPreferred

                await supabase
                    .from('erp_price_history')
                    .update({ status: 'archived' })
                    .eq('master_item_id', finalMasterItemId)
                    .eq('provider_id', finalProviderId)
                    .eq('status', priceHistoryStatus)

                if (finalIsPreferred || isAbsolutelyFirstPrice) {
                    await supabase
                        .from('erp_price_history')
                        .update({ is_preferred: false })
                        .eq('master_item_id', finalMasterItemId)
                        .eq('status', priceHistoryStatus)
                        .neq('provider_id', finalProviderId)
                }

                await supabase
                    .from('erp_price_history')
                    .insert({
                        master_item_id: finalMasterItemId,
                        provider_id: finalProviderId,
                        venue_id: venueId,
                        unit_price: line.unit_price,
                        cost_per_packaged_unit: line.unit_price / effectiveEnvases,
                        cost_per_base_unit: line.unit_price / (effectiveEnvases * effectiveContenido),
                        effective_date: effectiveDate,
                        status: priceHistoryStatus,
                        is_preferred: finalIsPreferred || isAbsolutelyFirstPrice,
                        iva_percent: line.iva_percent ?? null,
                        document_id: payload.document.id,
                    })
            }

            // --- Step E: Registro de correcciones para análisis y entrenamiento futuro ---
            // Solo para líneas que el operario revisó manualmente (no auto_approved, no skip)
            if (line.review_status === 'pending_review' && line.resolution.action !== 'skip' && finalMasterItemId) {
                const aiData = line.ai_interpretation
                const extractionStep = aiData?.extraction_step as Record<string, unknown> | null
                const normStep = aiData?.normalization_step as Record<string, unknown> | null

                const getAiPrice = () => {
                    const ep = extractionStep?.precio_total as { value?: number; confidence?: number } | null
                    return ep ?? { value: aiData?.precio_total as number | null, confidence: null }
                }
                const getAiQty = () => {
                    const eq = extractionStep?.cantidad_comprada as { value?: number; confidence?: number } | null
                    return eq ?? { value: aiData?.cantidad_comprada as number | null, confidence: null }
                }

                const corrections: Array<{
                    field_name: string
                    extracted_value: string | null
                    corrected_value: string | null
                    confidence: number | null
                    correction_type: string
                }> = []

                const aiPrice = getAiPrice()
                if (aiPrice?.value != null && Math.abs(Number(aiPrice.value) - (line.unit_price ?? 0)) > 0.001) {
                    corrections.push({
                        field_name: 'precio_unitario',
                        extracted_value: String(aiPrice.value),
                        corrected_value: String(line.unit_price),
                        confidence: (aiPrice.confidence as number) ?? null,
                        correction_type: 'price',
                    })
                }

                const aiQty = getAiQty()
                if (aiQty?.value != null && Number(aiQty.value) !== line.quantity) {
                    corrections.push({
                        field_name: 'cantidad_comprada',
                        extracted_value: String(aiQty.value),
                        corrected_value: String(line.quantity),
                        confidence: (aiQty.confidence as number) ?? null,
                        correction_type: 'quantity',
                    })
                }

                if (line.resolution.action === 'create_and_link') {
                    const aiOfficialName = (normStep?.official_name as string | null)
                        ?? (aiData?.producto_normalizado as string | null)
                    if (aiOfficialName && aiOfficialName !== line.resolution.new_official_name) {
                        corrections.push({
                            field_name: 'official_name',
                            extracted_value: aiOfficialName,
                            corrected_value: line.resolution.new_official_name,
                            confidence: null,
                            correction_type: 'normalization',
                        })
                    }
                    corrections.push({
                        field_name: 'product_confirmation',
                        extracted_value: null,
                        corrected_value: line.resolution.new_official_name,
                        confidence: null,
                        correction_type: 'new_product',
                    })
                }

                if (corrections.length > 0) {
                    const { data: providerData } = finalProviderId ? await supabase
                        .from('erp_providers')
                        .select('name')
                        .eq('id', finalProviderId)
                        .single() : { data: null }

                    for (const correction of corrections) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        await (supabase as any).from('extraction_corrections').insert({
                            document_id: payload.document.id,
                            purchase_line_id: line.purchase_line_id,
                            field_name: correction.field_name,
                            extracted_value: correction.extracted_value,
                            corrected_value: correction.corrected_value,
                            confidence: correction.confidence,
                            correction_type: correction.correction_type,
                            document_type: payload.document.doc_type,
                            provider_name: providerData?.name ?? null,
                            model_version: (aiData?.model_version as string) ?? null,
                            prompt_version: (aiData?.prompt_version as string) ?? null,
                        })
                    }
                }
            }
        }

        // ── 5. Mark document as approved — only after all lines processed successfully ──
        const { error: approveError } = await supabase
            .from('erp_documents')
            .update({ status: 'approved' })
            .eq('id', payload.document.id)

        if (approveError) throw new Error(`Failed to approve document: ${approveError.message}`)

        // ── 6. If this is an Albaran, check if any pending Factura Resumen can now be reconciled ──
        if (payload.document.doc_type?.toLowerCase() === 'albaran') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any).rpc('trigger_conciliacion_for_albaran', { p_albaran_id: payload.document.id })
        }

        // ── 7. Auto-link to purchase order (Albaran/Factura only, not Presupuesto) ──
        if (payload.document.doc_type?.toLowerCase() !== 'presupuesto') {
            await matchOrderToDocument(payload.document.id)
        }

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
        if (doc.status !== 'pending' && doc.status !== 'pending_review') throw new Error('Solo se pueden eliminar documentos en estado pendiente')

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
