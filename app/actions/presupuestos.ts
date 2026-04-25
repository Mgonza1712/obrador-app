'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActionResult {
    success: boolean
    error?: string
}

// ─── updateQuoteLineFormat ────────────────────────────────────────────────────

/**
 * Actualiza el desglose de formato de una línea de presupuesto.
 * Recalcula cost_per_base_unit y cost_per_packaged_unit en erp_price_history
 * a partir del unit_price actual. También actualiza el ai_interpretation
 * de la purchase_line para que el módulo de comparación lo refleje.
 *
 * Casos B y C del módulo de comparación: el operario corrige el desglose
 * (envases × contenido) y el sistema recalcula el coste por unidad base.
 */
export async function updateQuoteLineFormat(
    priceHistoryId: string,
    purchaseLineId: string,
    envasesPorFormato: number,
    contenidoPorEnvase: number
): Promise<ActionResult & { costPerBase?: number; costPerPack?: number }> {
    const supabase = await createClient()

    // Leer unit_price del price_history (fuente de verdad del precio)
    const { data: ph, error: phFetchError } = await (supabase as any)
        .from('erp_price_history')
        .select('unit_price')
        .eq('id', priceHistoryId)
        .single()

    if (phFetchError || !ph) {
        return { success: false, error: 'Price history no encontrado' }
    }

    const unitPrice: number = ph.unit_price
    const product = envasesPorFormato * contenidoPorEnvase
    const costPerBase: number | null = product > 0 ? unitPrice / product : null
    const costPerPack: number | null = envasesPorFormato > 0 ? unitPrice / envasesPorFormato : null

    // Actualizar erp_price_history con los nuevos costes recalculados
    const { error: phUpdateError } = await (supabase as any)
        .from('erp_price_history')
        .update({
            cost_per_base_unit: costPerBase,
            cost_per_packaged_unit: costPerPack,
        })
        .eq('id', priceHistoryId)

    if (phUpdateError) return { success: false, error: phUpdateError.message }

    // Actualizar ai_interpretation de la purchase_line con el nuevo formato
    const { data: line } = await supabase
        .from('erp_purchase_lines')
        .select('ai_interpretation')
        .eq('id', purchaseLineId)
        .single()

    if (line?.ai_interpretation) {
        const ai = line.ai_interpretation as Record<string, unknown>
        const normStep = (ai.normalization_step as Record<string, unknown>) ?? {}
        const updatedAi = {
            ...ai,
            normalization_step: {
                ...normStep,
                envases_por_formato: envasesPorFormato,
                contenido_por_envase: contenidoPorEnvase,
                cost_per_base_unit: costPerBase,
                cost_per_packaged_unit: costPerPack,
            },
        }
        await supabase
            .from('erp_purchase_lines')
            .update({ ai_interpretation: updatedAi })
            .eq('id', purchaseLineId)
    }

    return {
        success: true,
        costPerBase: costPerBase ?? undefined,
        costPerPack: costPerPack ?? undefined,
    }
}

// ─── updateQuoteLineMasterItem ────────────────────────────────────────────────

/**
 * Cambia el producto maestro asignado a una línea de presupuesto.
 * Aplica a Casos B, C y D donde el operario corrige la asignación del LLM.
 * Actualiza tanto la purchase_line como el price_history('quote') correspondiente.
 */
export async function updateQuoteLineMasterItem(
    purchaseLineId: string,
    priceHistoryId: string,
    masterItemId: string
): Promise<ActionResult> {
    const supabase = await createClient()

    const { error: lineError } = await supabase
        .from('erp_purchase_lines')
        .update({ master_item_id: masterItemId })
        .eq('id', purchaseLineId)

    if (lineError) return { success: false, error: lineError.message }

    const { error: phError } = await (supabase as any)
        .from('erp_price_history')
        .update({ master_item_id: masterItemId })
        .eq('id', priceHistoryId)

    if (phError) return { success: false, error: phError.message }

    return { success: true }
}

// ─── linkQuoteProvider ────────────────────────────────────────────────────────

/**
 * Vincula un proveedor a un documento que fue procesado con provider_id=NULL (Camino 3).
 * Paso 0 del módulo de comparación cuando el extractor no identificó al proveedor.
 *
 * Actualiza:
 * - erp_documents.provider_id
 * - erp_price_history(status='quote', provider_id=NULL) para este documento
 */
export async function linkQuoteProvider(
    documentId: string,
    providerId: string
): Promise<ActionResult> {
    const supabase = await createClient()

    // Actualizar el documento
    const { error: docError } = await (supabase as any)
        .from('erp_documents')
        .update({ provider_id: providerId })
        .eq('id', documentId)

    if (docError) return { success: false, error: docError.message }

    // Actualizar price_history('quote') del documento que tienen provider_id=NULL
    const { error: phError } = await (supabase as any)
        .from('erp_price_history')
        .update({ provider_id: providerId })
        .eq('document_id', documentId)
        .eq('status', 'quote')
        .is('provider_id', null)

    if (phError) return { success: false, error: phError.message }

    revalidatePath(`/documentos/${documentId}`)
    revalidatePath(`/documentos/${documentId}/comparar`)
    return { success: true }
}

// ─── activateQuotePrices ──────────────────────────────────────────────────────

/**
 * Activa todos los precios cotizados de un presupuesto Camino 1 (auto-procesado).
 * El usuario hace click en "Activar precios" desde la notificación o desde /documentos/[id].
 *
 * Cambia status='quote' → status='active' para todos los erp_price_history del documento.
 * Si setPreferred=true, los marca como preferidos para futuros pedidos y descarta el
 * preferred anterior de esos mismos productos.
 *
 * Para el módulo de comparación (Caminos 2/3) se usará saveQuoteComparison
 * (implementado en Fase 4c junto con la UI de comparación).
 */
export async function activateQuotePrices(
    documentId: string,
    setPreferred: boolean
): Promise<ActionResult & { activatedCount?: number }> {
    const supabase = await createClient()

    // Leer todos los price_history('quote') del documento
    const { data: quotePrices, error: fetchError } = await (supabase as any)
        .from('erp_price_history')
        .select('id, master_item_id, venue_id')
        .eq('document_id', documentId)
        .eq('status', 'quote')

    if (fetchError) return { success: false, error: fetchError.message }
    if (!quotePrices?.length) {
        return { success: false, error: 'No hay precios en estado quote para este documento' }
    }

    const quoteIds: string[] = quotePrices.map((p: { id: string }) => p.id)

    // Si setPreferred: quitar is_preferred de los registros activos actuales
    // para los mismos productos (antes de activar los nuevos)
    if (setPreferred) {
        const masterItemIds = (quotePrices as Array<{ master_item_id: string | null }>)
            .map(p => p.master_item_id)
            .filter((id): id is string => id !== null)

        if (masterItemIds.length > 0) {
            await (supabase as any)
                .from('erp_price_history')
                .update({ is_preferred: false })
                .in('master_item_id', masterItemIds)
                .eq('status', 'active')
        }
    }

    // Activar los precios cotizados
    const updatePayload: Record<string, unknown> = { status: 'active' }
    if (setPreferred) updatePayload.is_preferred = true

    const { error: activateError } = await (supabase as any)
        .from('erp_price_history')
        .update(updatePayload)
        .in('id', quoteIds)

    if (activateError) return { success: false, error: activateError.message }

    // Aprobar el documento si aún no lo está (Camino 1 ya está approved, no hace daño)
    await (supabase as any)
        .from('erp_documents')
        .update({ status: 'approved' })
        .eq('id', documentId)

    revalidatePath(`/documentos/${documentId}`)
    revalidatePath('/documentos')

    return { success: true, activatedCount: quoteIds.length }
}

// ─── saveQuoteComparison ──────────────────────────────────────────────────────

/**
 * Guarda las decisiones del módulo de comparación de presupuestos (Caminos 2/3).
 * Por cada línea marcada para activar:
 *   1. Actualiza erp_price_history status='active'
 *   2. Si setPreferred: marca is_preferred=true y deselecciona los demás activos del mismo producto
 *   3. Si es un proveedor nuevo para este producto: inserta erp_item_aliases
 * Por cada línea Caso D sin resolver: deja review_status='pending_review' (ya está así en DB)
 * Al finalizar: marca el documento como 'approved'
 */

export interface QuoteLineDecision {
    purchaseLineId: string
    priceHistoryId: string
    activar: boolean
    setPreferred: boolean
    // Para crear alias si es proveedor nuevo (Casos B/C):
    newAlias?: {
        rawName: string
        providerId: string
        masterItemId: string
        formatoCompra: string | null
        envasesPorFormato: number | null
        contenidoPorEnvase: number | null
    } | null
}

export async function saveQuoteComparison(
    documentId: string,
    decisions: QuoteLineDecision[]
): Promise<ActionResult & { activatedCount?: number }> {
    const supabase = await createClient()

    const toActivate = decisions.filter((d) => d.activar)
    const preferredIds: string[] = []

    // Collect master_item_ids for those being set as preferred (to deselect others)
    if (toActivate.some((d) => d.setPreferred)) {
        const phIds = toActivate.filter((d) => d.setPreferred).map((d) => d.priceHistoryId)
        const { data: phs } = await (supabase as any)
            .from('erp_price_history')
            .select('id, master_item_id')
            .in('id', phIds)

        if (phs) {
            const masterItemIds = (phs as Array<{ master_item_id: string | null }>)
                .map((p) => p.master_item_id)
                .filter((id): id is string => id !== null)

            if (masterItemIds.length > 0) {
                // Deselect previous preferred for these master_items
                await (supabase as any)
                    .from('erp_price_history')
                    .update({ is_preferred: false })
                    .in('master_item_id', masterItemIds)
                    .eq('status', 'active')
                    .eq('is_preferred', true)
            }

            preferredIds.push(...(phs as Array<{ id: string }>).map((p) => p.id))
        }
    }

    // Activate selected lines
    for (const d of toActivate) {
        const updatePayload: Record<string, unknown> = { status: 'active' }
        if (d.setPreferred) updatePayload.is_preferred = true

        const { error } = await (supabase as any)
            .from('erp_price_history')
            .update(updatePayload)
            .eq('id', d.priceHistoryId)

        if (error) return { success: false, error: error.message }

        // Create alias for new provider-product combos
        if (d.newAlias) {
            const { rawName, providerId, masterItemId, formatoCompra, envasesPorFormato, contenidoPorEnvase } = d.newAlias

            // Check alias doesn't already exist
            const { data: existing } = await supabase
                .from('erp_item_aliases')
                .select('id')
                .eq('raw_name', rawName)
                .eq('provider_id', providerId)
                .maybeSingle()

            if (!existing) {
                await (supabase as any)
                    .from('erp_item_aliases')
                    .insert({
                        raw_name: rawName,
                        provider_id: providerId,
                        master_item_id: masterItemId,
                        formato_compra: formatoCompra,
                        envases_por_formato: envasesPorFormato,
                        contenido_por_envase: contenidoPorEnvase,
                    })
            }
        }
    }

    // Mark document as approved
    await (supabase as any)
        .from('erp_documents')
        .update({ status: 'approved' })
        .eq('id', documentId)

    revalidatePath(`/documentos/${documentId}`)
    revalidatePath('/documentos')

    return { success: true, activatedCount: toActivate.length }
}
