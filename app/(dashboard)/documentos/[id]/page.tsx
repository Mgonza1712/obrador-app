import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import DocumentoDetailClient from './DocumentoDetailClient'
import type { ComparacionData } from './_components/ComparacionTab'
import type { ComparisonRowData } from './_components/ComparisonRow'

export type PurchaseLine = {
    id: string
    raw_name: string | null
    quantity: number | null
    unit_price: number | null
    line_total_cost: number | null
    master_item_id: string | null
    review_status: string | null
    iva_percent: number | null
    ai_interpretation: Record<string, unknown> | null
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
                'id, doc_type, document_number, document_date, total_amount, status, reconciliation_status, reconciliation_delta, referenced_delivery_notes, parent_invoice_id, drive_url, provider_id, venue_id, tenant_id, created_at, ai_interpretation, erp_providers(name)',
            )
            .eq('id', id)
            .single(),
        supabase
            .from('erp_purchase_lines')
            .select('id, raw_name, quantity, unit_price, line_total_cost, master_item_id, review_status, iva_percent, ai_interpretation')
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

    // ── #18: Signed URL para archivos del bucket privado "facturas" ──
    let resolvedDriveUrl: string | null = raw.drive_url ?? null
    if (resolvedDriveUrl && !resolvedDriveUrl.startsWith('http')) {
        const { data: signedData } = await supabase.storage
            .from('facturas')
            .createSignedUrl(resolvedDriveUrl, 3600)
        resolvedDriveUrl = signedData?.signedUrl ?? null
    }

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
        drive_url: resolvedDriveUrl,
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
            review_status: l.review_status,
            iva_percent: l.iva_percent,
            ai_interpretation: l.ai_interpretation,
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        linkedAlbaranes: (albaranesResult.data ?? []).map((a: any) => ({
            id: a.id,
            document_number: a.document_number,
            document_date: a.document_date,
            total_amount: a.total_amount,
        })),
    }

    // ── Comparación data — only for Presupuesto ──────────────────────────────
    let comparacion: ComparacionData | null = null

    if (raw.doc_type === 'Presupuesto') {
        const lines = linesResult.data ?? []

        // Get quote price history for this document
        const { data: quotePrices } = await sb
            .from('erp_price_history')
            .select('id, master_item_id, unit_price, cost_per_base_unit, cost_per_packaged_unit, provider_id')
            .eq('document_id', id)
            .eq('status', 'quote')

        // Collect master_item_ids with quotes
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const masterItemIds = [...new Set((quotePrices ?? []).map((p: any) => p.master_item_id).filter(Boolean))]

        // Get current active prices for those master_items (for comparison)
        let activePrices: any[] = []
        if (masterItemIds.length > 0) {
            const { data: ap } = await sb
                .from('erp_price_history')
                .select('id, master_item_id, unit_price, cost_per_base_unit, provider_id, is_preferred, erp_providers(name)')
                .in('master_item_id', masterItemIds)
                .eq('status', 'active')
                .eq('is_preferred', true)
            activePrices = ap ?? []
        }

        // Get master item details (official_name, base_unit) for all IDs
        let masterItemsData: any[] = []
        if (masterItemIds.length > 0) {
            const { data: mi } = await supabase
                .from('erp_master_items')
                .select('id, official_name, base_unit, category')
                .in('id', masterItemIds as string[])
            masterItemsData = mi ?? []
        }

        // Get all master items for combobox
        const { data: allMasterItems } = await supabase
            .from('erp_master_items')
            .select('id, official_name, base_unit, category')
            .order('official_name')

        // Get providers for combobox
        const { data: allProviders } = await supabase
            .from('erp_providers')
            .select('id, name, channel')
            .eq('is_active', true)
            .order('name')

        // Get item aliases for current provider+master_item combos (for format in current)
        let aliases: any[] = []
        if (masterItemIds.length > 0 && raw.provider_id) {
            const { data: al } = await sb
                .from('erp_item_aliases')
                .select('master_item_id, envases_por_formato, contenido_por_envase')
                .eq('provider_id', raw.provider_id)
                .in('master_item_id', masterItemIds as string[])
            aliases = al ?? []
        }

        // Build quote_path from doc.ai_interpretation
        const docAi = raw.ai_interpretation as Record<string, unknown> | null
        const quotePath = typeof docAi?.quote_path === 'number' ? docAi.quote_path : null

        // Build ComparisonRowData for each line that has a price_history quote
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const quoteByLine = new Map<string, any>()
        for (const qp of (quotePrices ?? [])) {
            // Match by master_item_id (SQL v4 links purchase_line → price_history via master_item_id + document_id)
            quoteByLine.set(qp.master_item_id, qp)
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const activeByMaster = new Map<string, any>()
        for (const ap of activePrices) {
            activeByMaster.set(ap.master_item_id, ap)
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const masterByID = new Map<string, any>()
        for (const mi of masterItemsData) {
            masterByID.set(mi.id, mi)
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const aliasesByMaster = new Map<string, any>()
        for (const al of aliases) {
            aliasesByMaster.set(al.master_item_id, al)
        }

        const rows: ComparisonRowData[] = []
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const line of lines as any[]) {
            const ai = line.ai_interpretation as Record<string, unknown> | null
            const quoteCase = (ai?.quote_case as 'A' | 'B' | 'C' | 'D') ?? 'D'
            const normStep = ai?.normalization_step as Record<string, unknown> | null

            // Find quote price_history for this line's master_item
            const qp = line.master_item_id ? quoteByLine.get(line.master_item_id) : null
            if (!qp) continue  // No quote price_history → skip (Caso D without master_item)

            const mi = masterByID.get(line.master_item_id) ?? { official_name: null, base_unit: 'ud' }
            const activePh = activeByMaster.get(line.master_item_id)
            const currentAlias = aliasesByMaster.get(line.master_item_id)

            // Envases/contenido: prefer normalization_step in ai_interpretation, fallback to alias
            const quoteEnvases = (normStep?.envases_por_formato as number | null)
                ?? (currentAlias?.envases_por_formato ?? null)
            const quoteContenido = (normStep?.contenido_por_envase as number | null)
                ?? (currentAlias?.contenido_por_envase ?? null)

            rows.push({
                purchaseLineId: line.id,
                priceHistoryId: qp.id,
                rawName: line.raw_name ?? '',
                quoteCase,
                masterItemId: line.master_item_id,
                masterItemName: mi.official_name,
                masterItemBaseUnit: mi.base_unit ?? 'ud',
                quoteUnitPrice: qp.unit_price,
                quoteEnvases,
                quoteContenido,
                quoteCostPerBase: qp.cost_per_base_unit ?? null,
                currentProviderName: activePh?.erp_providers?.name ?? null,
                currentCostPerBase: activePh?.cost_per_base_unit ?? null,
                currentEnvases: currentAlias?.envases_por_formato ?? null,
                currentContenido: currentAlias?.contenido_por_envase ?? null,
                providerId: raw.provider_id,
                providerName: raw.erp_providers?.name ?? null,
            })
        }

        // Also include lines with Caso D (master_item_id = null) so user can assign them
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const line of lines as any[]) {
            if (line.master_item_id) continue  // Already handled above
            const ai = line.ai_interpretation as Record<string, unknown> | null
            const quoteCase = (ai?.quote_case as 'A' | 'B' | 'C' | 'D') ?? 'D'
            if (quoteCase !== 'D') continue

            // For Caso D, we may not have a price_history yet (SQL v4 skips them)
            // Find a quote ph without master_item for this line — use a placeholder
            rows.push({
                purchaseLineId: line.id,
                priceHistoryId: '',  // Will be empty for Caso D without ph
                rawName: line.raw_name ?? '',
                quoteCase: 'D',
                masterItemId: null,
                masterItemName: null,
                masterItemBaseUnit: 'ud',
                quoteUnitPrice: line.unit_price ?? 0,
                quoteEnvases: null,
                quoteContenido: null,
                quoteCostPerBase: null,
                currentProviderName: null,
                currentCostPerBase: null,
                currentEnvases: null,
                currentContenido: null,
                providerId: raw.provider_id,
                providerName: raw.erp_providers?.name ?? null,
            })
        }

        comparacion = {
            documentId: id,
            docStatus: raw.status,
            quotePath,
            providerId: raw.provider_id,
            providerName: raw.erp_providers?.name ?? null,
            extractedProviderName: (docAi?.provider_name as string | null) ?? null,
            rows,
            providers: (allProviders ?? []).map((p: any) => ({ id: p.id, name: p.name, channel: p.channel })),
            masterItems: (allMasterItems ?? []).map((m: any) => ({
                id: m.id,
                official_name: m.official_name,
                base_unit: m.base_unit,
                category: m.category,
            })),
        }
    }

    return <DocumentoDetailClient doc={doc} comparacion={comparacion} />
}
