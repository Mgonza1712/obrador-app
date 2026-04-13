import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import RevisionClient from './RevisionClient'
import type { DocumentWithRelations, PurchaseLineWithItem, ReferenceLookup } from './types'

interface Props {
    params: Promise<{ id: string }>
    searchParams: Promise<{ from?: string; providerId?: string }>
}

export async function generateMetadata({ params }: Props) {
    const { id } = await params
    return { title: `Revisión #${id.slice(0, 8)} | Obrador` }
}

export default async function RevisionDetailPage({ params, searchParams }: Props) {
    const { id } = await params
    const { from, providerId } = await searchParams
    const supabase = await createClient()

    // ── 1. Fetch the document (flat) ──
    const { data: docRaw, error: docError } = await supabase
        .from('erp_documents')
        .select('id, doc_type, document_date, document_number, total_amount, status, drive_url, provider_id, venue_id, ai_interpretation')
        .eq('id', id)
        .single()

    if (docError) {
        // PGRST116 = no rows returned → genuine 404
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((docError as any).code === 'PGRST116') return notFound()
        return (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
                <AlertCircle className="h-10 w-10 text-destructive" />
                <p className="text-sm text-muted-foreground">
                    Error al cargar el documento: {docError.message}
                </p>
            </div>
        )
    }
    if (!docRaw) return notFound()

    // ── 2. Fetch full lists for the dynamic selects (flat, parallel) ──
    const [providersRes, venuesRes] = await Promise.all([
        supabase
            .from('erp_providers')
            .select('id, name')
            .order('name', { ascending: true }),
        supabase
            .from('erp_venues')
            .select('id, name')
            .order('name', { ascending: true }),
    ])

    const providers: ReferenceLookup[] = providersRes.data ?? []
    const venues: ReferenceLookup[] = venuesRes.data ?? []

    // Attach current document provider and venue relations manually
    const currentProvider = providers.find((p) => p.id === docRaw.provider_id) ?? null
    const currentVenue = venues.find((v) => v.id === docRaw.venue_id) ?? null

    const doc: DocumentWithRelations = {
        id: docRaw.id,
        doc_type: docRaw.doc_type,
        document_date: docRaw.document_date,
        document_number: docRaw.document_number,
        total_amount: docRaw.total_amount,
        status: docRaw.status,
        drive_url: docRaw.drive_url,
        provider_id: docRaw.provider_id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ai_interpretation: (docRaw.ai_interpretation ?? null) as any,
        erp_providers: currentProvider,
        erp_venues: currentVenue,
    }

    // ── 3. Fetch purchase lines (flat) ──
    const { data: linesRaw, error: linesError } = await supabase
        .from('erp_purchase_lines')
        .select('id, quantity, unit_price, line_total_cost, master_item_id, raw_name, iva_percent, is_envase_retornable, ai_interpretation, review_status')
        .eq('document_id', id)

    if (linesError) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
                <AlertCircle className="h-10 w-10 text-destructive" />
                <p className="text-sm text-muted-foreground">{linesError.message}</p>
            </div>
        )
    }

    // ── 3.5 Auto-mapeo via erp_item_aliases ──
    // For each unmapped line (master_item_id = NULL), check if an alias matches by raw_name
    // (case-insensitive). If found, persist the link to the DB and update the local object
    // so the rest of this request treats the line as already mapped.
    const mutableLines = (linesRaw ?? []).map((l) => ({ ...l }))
    const unmappedLines = mutableLines.filter((l) => !l.master_item_id && l.raw_name)

    if (unmappedLines.length > 0) {
        await Promise.all(unmappedLines.map(async (line) => {
            let aliasQuery = supabase
                .from('erp_item_aliases')
                .select('master_item_id')
                .ilike('raw_name', line.raw_name!)
                .not('master_item_id', 'is', null)
            if (docRaw.provider_id) aliasQuery = aliasQuery.eq('provider_id', docRaw.provider_id)
            const { data: alias } = await aliasQuery.limit(1).maybeSingle()

            if (alias?.master_item_id) {
                const { error: updateError } = await supabase
                    .from('erp_purchase_lines')
                    .update({ master_item_id: alias.master_item_id })
                    .eq('id', line.id)

                if (!updateError) {
                    line.master_item_id = alias.master_item_id
                }
            }
        }))
    }

    // ── 4. Fetch master items for every line that has one (including newly auto-mapped) ──
    const linkedItemIds = mutableLines
        .map((l) => l.master_item_id)
        .filter((id): id is string => id !== null)

    const { data: linkedItems } = linkedItemIds.length > 0
        ? await supabase
            .from('erp_master_items')
            .select('id, official_name, base_unit, category')
            .in('id', linkedItemIds)
        : { data: [] }

    const linkedItemMap = new Map(
        (linkedItems ?? []).map((item) => [item.id, item])
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lines: PurchaseLineWithItem[] = (mutableLines as any[]).map((l) => ({
        id: l.id,
        quantity: l.quantity,
        unit_price: l.unit_price,
        line_total_cost: l.line_total_cost,
        master_item_id: l.master_item_id,
        raw_name: l.raw_name,
        iva_percent: l.iva_percent ?? null,
        is_envase_retornable: l.is_envase_retornable ?? null,
        ai_interpretation: l.ai_interpretation ?? null,
        review_status: l.review_status ?? null,
        erp_master_items: l.master_item_id ? (linkedItemMap.get(l.master_item_id) ?? null) : null,
    }))

    // ── 5. Fetch all master items for the combobox ──
    const { data: masterItems } = await supabase
        .from('erp_master_items')
        .select('id, official_name, base_unit, category')
        .order('official_name', { ascending: true })

    // ── 6. Fetch last active price per mapped item for this provider ──
    const priceHistory: Record<string, number> = {}
    if (linkedItemIds.length > 0 && docRaw.provider_id) {
        const { data: priceRows } = await supabase
            .from('erp_price_history')
            .select('master_item_id, unit_price')
            .in('master_item_id', linkedItemIds)
            .eq('provider_id', docRaw.provider_id)
            .eq('status', 'active')

        for (const row of priceRows ?? []) {
            if (row.master_item_id && row.unit_price != null) {
                priceHistory[row.master_item_id] = row.unit_price
            }
        }
    }

    const fromProvider =
        from === 'proveedor' && providerId && currentProvider
            ? { id: providerId, name: currentProvider.name }
            : undefined

    return (
        <RevisionClient
            document={doc}
            lines={lines}
            masterItems={masterItems ?? []}
            providers={providers}
            venues={venues}
            priceHistory={priceHistory}
            fromProvider={fromProvider}
        />
    )
}
