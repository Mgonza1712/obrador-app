import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { AlertCircle, QrCode } from 'lucide-react'
import DocumentosClient from './DocumentosClient'
import { applyDocumentFilters } from './_lib/applyDocumentFilters'
import { getProviders } from './_actions'
import { UploadDropZone, type VenueOption } from './_components/UploadDropZone'

export const metadata = {
    title: 'Documentos | Obrador',
    description: 'Gestión de facturas, albaranes y presupuestos.',
}

export type DocumentRow = {
    id: string
    doc_type: string | null
    document_number: string | null
    document_date: string | null
    total_amount: number | null
    status: string | null
    reconciliation_status: string | null
    reconciliation_delta: number | null
    provider_id: string | null
    provider_name: string | null
    venue_id: string | null
    venue_name: string | null
    referenced_delivery_notes: string[] | null
    parent_invoice_id: string | null
    created_at: string
    has_skipped_lines: boolean
}

const PAGE_SIZE = 25

export default async function DocumentosPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
    const params = await searchParams
    const supabase = await createClient()

    const page = Math.max(1, parseInt((params.page as string) ?? '1', 10))
    const sort = (params.sort as string) ?? 'date_desc'
    const status = (params.status as string) ?? ''
    const reconcStatus = (params.reconciliation_status as string) ?? ''
    const providerId = (params.provider_id as string) ?? ''
    // dateFrom/dateTo kept as raw YYYY-MM-DD strings — never converted via new Date()
    // to avoid timezone-induced day offsets.
    const dateFrom = (params.date_from as string) ?? ''
    const dateTo = (params.date_to as string) ?? ''
    const amountMinRaw = params.amount_min as string | undefined
    const amountMaxRaw = params.amount_max as string | undefined
    // explicit parseFloat so Supabase receives a number, not a string
    const amountMin = amountMinRaw ? parseFloat(amountMinRaw) : null
    const amountMax = amountMaxRaw ? parseFloat(amountMaxRaw) : null
    const documentNumber = (params.document_number as string) ?? ''
    const docTypesRaw = params.doc_type as string | undefined
    const docTypes = docTypesRaw ? docTypesRaw.split(',').filter(Boolean) : []
    const hasPendingLines = params.has_pending_lines === 'true'
    const venueId = (params.venue_id as string) ?? ''

    const providers = await getProviders()

    const serviceClient = createServiceClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: venuesRaw } = await (serviceClient as any)
        .from('erp_venues')
        .select('id, name, reception_token')
        .neq('type', 'generic')
        .order('name')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const venues: VenueOption[] = (venuesRaw ?? []) as any[]

    // When filtering by pending lines: first fetch the document IDs that qualify.
    // (PostgREST cannot express EXISTS as a column predicate, so we pre-resolve the IDs.)
    let pendingLinesDocIds: string[] | null = null
    if (hasPendingLines) {
        const { data: pendingRows } = await supabase
            .from('erp_purchase_lines')
            .select('document_id')
            .eq('review_status', 'skipped')
        pendingLinesDocIds = [...new Set((pendingRows ?? []).map((r) => (r as { document_id: string }).document_id))]
    }

    // Build query — select defined here, filters applied via shared helper
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase as any)
        .from('erp_documents')
        .select(
            'id, doc_type, document_number, document_date, total_amount, status, reconciliation_status, reconciliation_delta, provider_id, venue_id, referenced_delivery_notes, parent_invoice_id, created_at, erp_providers(name), erp_venues(name)',
            { count: 'exact' },
        )

    // Apply pending-lines ID filter before shared filters
    if (hasPendingLines) {
        if (pendingLinesDocIds && pendingLinesDocIds.length > 0) {
            query = query.in('id', pendingLinesDocIds)
        } else {
            // No documents qualify — short-circuit with impossible condition
            query = query.in('id', ['00000000-0000-0000-0000-000000000000'])
        }
    }

    query = applyDocumentFilters(query, {
        sort,
        status,
        reconciliationStatus: reconcStatus,
        providerIds: providerId ? [providerId] : null,
        dateFrom,
        dateTo,
        amountMin,
        amountMax,
        documentNumber,
        docTypes,
        venueId: venueId || null,
    })

    const from = (page - 1) * PAGE_SIZE
    query = query.range(from, from + PAGE_SIZE - 1)

    const { data, error, count } = await query

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
                <AlertCircle className="h-10 w-10 text-destructive" />
                <p className="text-sm text-muted-foreground">Error al cargar documentos: {error.message}</p>
            </div>
        )
    }

    // Secondary query: which of the current page's documents have skipped lines?
    // Used to show the "⚠ Líneas pendientes" badge without affecting the main filter.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const currentPageIds = (data as any[]).map((d) => d.id as string)
    let skippedDocIds = new Set<string>()
    if (currentPageIds.length > 0) {
        const { data: skippedRows } = await supabase
            .from('erp_purchase_lines')
            .select('document_id')
            .eq('review_status', 'skipped')
            .in('document_id', currentPageIds)
        skippedDocIds = new Set((skippedRows ?? []).map((r) => (r as { document_id: string }).document_id))
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const documents: DocumentRow[] = (data as any[]).map((d) => ({
        id: d.id,
        doc_type: d.doc_type,
        document_number: d.document_number,
        document_date: d.document_date,
        total_amount: d.total_amount,
        status: d.status,
        reconciliation_status: d.reconciliation_status,
        reconciliation_delta: d.reconciliation_delta,
        provider_id: d.provider_id,
        provider_name: d.erp_providers?.name ?? null,
        venue_id: d.venue_id ?? null,
        venue_name: d.erp_venues?.name ?? null,
        referenced_delivery_notes: d.referenced_delivery_notes,
        parent_invoice_id: d.parent_invoice_id,
        created_at: d.created_at,
        has_skipped_lines: skippedDocIds.has(d.id),
    }))

    return (
        <div className="space-y-6">
            <PageHeader />
            <UploadDropZone venues={venues} />
            <DocumentosClient documents={documents} total={count ?? 0} page={page} pageSize={PAGE_SIZE} providers={providers} venues={venues} />
        </div>
    )
}

function PageHeader() {
    return (
        <div className="flex items-start justify-between gap-4">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Documentos</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Facturas, albaranes y presupuestos del sistema.
                </p>
            </div>
            <Link
                href="/documentos/qr"
                className="flex shrink-0 items-center gap-1.5 rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
                <QrCode className="h-4 w-4" />
                QR de recepción
            </Link>
        </div>
    )
}
