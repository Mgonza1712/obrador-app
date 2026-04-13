'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateProviderToggle(
    id: string,
    field: 'shared_pricing' | 'is_active',
    value: boolean,
) {
    const supabase = await createClient()
    const { error } = await supabase
        .from('erp_providers')
        .update({ [field]: value })
        .eq('id', id)
    if (error) throw new Error(error.message)
}

export async function updateProvider(
    id: string,
    data: {
        name: string
        email: string | null
        phone: string | null
        contact_name: string | null
        channel: string | null
        notes: string | null
        shared_pricing: boolean
        is_active: boolean
        price_confidence_threshold: number
    },
) {
    const supabase = await createClient()
    const { error } = await supabase
        .from('erp_providers')
        .update(data)
        .eq('id', id)
    if (error) throw new Error(error.message)
    revalidatePath(`/proveedores/${id}`)
    revalidatePath('/proveedores')
}

type MergeResult =
    | { success: true }
    | { success: false; code: 'DUPLICATE_DOCUMENT' | 'ERROR' }

export async function mergeProviders(primaryId: string, mergedId: string): Promise<MergeResult> {
    const supabase = await createClient()

    // ── 1. Fetch documents for both providers ──────────────────────────────────
    const [{ data: mergedDocs, error: e1a }, { data: primaryDocs, error: e1b }] = await Promise.all([
        supabase.from('erp_documents').select('id, document_number').eq('provider_id', mergedId),
        supabase.from('erp_documents').select('id, document_number').eq('provider_id', primaryId),
    ])

    if (e1a || e1b) return { success: false, code: 'ERROR' }

    // Map primary provider's documents by document_number for O(1) lookup
    const primaryByNumber = new Map(
        (primaryDocs ?? [])
            .filter((d) => d.document_number)
            .map((d) => [d.document_number, d.id]),
    )

    // ── 2. Migrate each document of the merged provider ────────────────────────
    for (const doc of mergedDocs ?? []) {
        const conflictingId = doc.document_number
            ? primaryByNumber.get(doc.document_number)
            : undefined

        if (conflictingId) {
            // Duplicate document_number: primary already has the correct lines — discard this doc's lines and the doc itself
            const { error: linesErr } = await supabase
                .from('erp_purchase_lines')
                .delete()
                .eq('document_id', doc.id)

            if (linesErr) return { success: false, code: 'DUPLICATE_DOCUMENT' }

            const { error: delErr } = await supabase
                .from('erp_documents')
                .delete()
                .eq('id', doc.id)

            if (delErr) return { success: false, code: 'DUPLICATE_DOCUMENT' }
        } else {
            // No conflict: reassign to primary provider
            const { error: updateErr } = await supabase
                .from('erp_documents')
                .update({ provider_id: primaryId })
                .eq('id', doc.id)

            if (updateErr) return { success: false, code: 'ERROR' }
        }
    }

    // ── 3. Move item aliases (skip duplicates by raw_name) ────────────────────
    const [{ data: mergedAliases, error: e2a }, { data: primaryAliases, error: e2b }] =
        await Promise.all([
            supabase.from('erp_item_aliases').select('id, raw_name').eq('provider_id', mergedId),
            supabase.from('erp_item_aliases').select('raw_name').eq('provider_id', primaryId),
        ])

    if (e2a || e2b) return { success: false, code: 'ERROR' }

    const primaryRawNames = new Set((primaryAliases ?? []).map((a) => a.raw_name))

    for (const alias of mergedAliases ?? []) {
        if (primaryRawNames.has(alias.raw_name)) {
            // Primary already has this alias: discard the duplicate
            const { error } = await supabase
                .from('erp_item_aliases')
                .delete()
                .eq('id', alias.id)
            if (error) return { success: false, code: 'ERROR' }
        } else {
            // No conflict: reassign to primary provider
            const { error } = await supabase
                .from('erp_item_aliases')
                .update({ provider_id: primaryId })
                .eq('id', alias.id)
            if (error) return { success: false, code: 'ERROR' }
        }
    }

    // ── 4. Move price history (active entries: date-aware conflict resolution) ─
    const [{ data: mergedPrices, error: e3a }, { data: primaryActivePrices, error: e3b }] =
        await Promise.all([
            supabase
                .from('erp_price_history')
                .select('id, master_item_id, status, effective_date')
                .eq('provider_id', mergedId),
            // Only fetch active entries from primary — these are the ones that can conflict
            supabase
                .from('erp_price_history')
                .select('id, master_item_id, effective_date')
                .eq('provider_id', primaryId)
                .eq('status', 'active'),
        ])

    if (e3a || e3b) return { success: false, code: 'ERROR' }

    // Map primary's active entries by master_item_id for O(1) lookup
    type ActiveEntry = { id: string; effective_date: string | null }
    const primaryActiveByItem = new Map<string, ActiveEntry>(
        (primaryActivePrices ?? [])
            .filter((p) => p.master_item_id)
            .map((p) => [p.master_item_id as string, { id: p.id, effective_date: p.effective_date }]),
    )

    for (const ph of mergedPrices ?? []) {
        if (!ph.master_item_id || ph.status !== 'active') {
            // Case C: archived entries (or entries without item) — always move, no conflict check
            const { error } = await supabase
                .from('erp_price_history')
                .update({ provider_id: primaryId })
                .eq('id', ph.id)
            if (error) return { success: false, code: 'ERROR' }
            continue
        }

        const primaryActive = primaryActiveByItem.get(ph.master_item_id)

        if (!primaryActive) {
            // Case A: no active entry in primary for this item — move it
            const { error } = await supabase
                .from('erp_price_history')
                .update({ provider_id: primaryId })
                .eq('id', ph.id)
            if (error) return { success: false, code: 'ERROR' }
        } else {
            // Case B: primary already has an active entry — compare dates
            const mergedDate = ph.effective_date ?? ''
            const primaryDate = primaryActive.effective_date ?? ''

            if (mergedDate >= primaryDate) {
                // Merged is more recent or equal: archive primary's entry, move merged's as the new active
                const { error: archiveErr } = await supabase
                    .from('erp_price_history')
                    .update({ status: 'archived' })
                    .eq('id', primaryActive.id)
                if (archiveErr) return { success: false, code: 'ERROR' }

                const { error: moveErr } = await supabase
                    .from('erp_price_history')
                    .update({ provider_id: primaryId })
                    .eq('id', ph.id)
                if (moveErr) return { success: false, code: 'ERROR' }
            } else {
                // Merged is older: primary's entry is more recent — discard merged's
                const { error } = await supabase
                    .from('erp_price_history')
                    .delete()
                    .eq('id', ph.id)
                if (error) return { success: false, code: 'ERROR' }
            }
        }
    }

    // ── 5. Deactivate merged provider ─────────────────────────────────────────
    const { error: e4 } = await supabase
        .from('erp_providers')
        .update({ merged_into: primaryId, is_active: false })
        .eq('id', mergedId)
    if (e4) return { success: false, code: 'ERROR' }

    revalidatePath('/proveedores')
    return { success: true }
}
