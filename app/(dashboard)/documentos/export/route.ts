/**
 * GET /documentos/export
 * Downloads the current filtered document list as an .xlsx file.
 * Accepts the same query params as the documents table page.
 * Max 1000 rows; X-Export-Limit-Reached: true header is set if limit hit.
 */
import { createClient } from '@/lib/supabase/server'
import { applyDocumentFilters } from '../_lib/applyDocumentFilters'
import * as XLSX from 'xlsx'

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const supabase = await createClient()

    // Parse filters — same logic as page.tsx
    const sort = searchParams.get('sort') ?? 'date_desc'
    const status = searchParams.get('status') ?? ''
    const reconcStatus = searchParams.get('reconciliation_status') ?? ''
    const providerId = searchParams.get('provider_id') ?? ''
    const dateFrom = searchParams.get('date_from') ?? ''
    const dateTo = searchParams.get('date_to') ?? ''
    const amountMinRaw = searchParams.get('amount_min')
    const amountMaxRaw = searchParams.get('amount_max')
    const amountMin = amountMinRaw ? parseFloat(amountMinRaw) : null
    const amountMax = amountMaxRaw ? parseFloat(amountMaxRaw) : null
    const documentNumber = searchParams.get('document_number') ?? ''
    const docTypesRaw = searchParams.get('doc_type')
    const docTypes = docTypesRaw ? docTypesRaw.split(',').filter(Boolean) : []

    const providerIds = providerId ? [providerId] : null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase as any)
        .from('erp_documents')
        .select(
            'id, doc_type, document_number, document_date, total_amount, status, reconciliation_status, reconciliation_delta, provider_id, drive_url, created_at, erp_providers(name), erp_venues(name)',
            { count: 'exact' },
        )

    query = applyDocumentFilters(query, {
        sort,
        status,
        reconciliationStatus: reconcStatus,
        providerIds,
        dateFrom,
        dateTo,
        amountMin,
        amountMax,
        documentNumber,
        docTypes,
    })

    // Cap at 1000 rows
    const { data, error, count } = await query.limit(1000)

    if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        })
    }

    // Build worksheet rows
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = ((data as any[]) ?? []).map((d) => ({
        'Tipo': d.doc_type ?? '',
        'Nº Documento': d.document_number ?? '',
        'Proveedor': d.erp_providers?.name ?? '',
        'Local': d.erp_venues?.name ?? '',
        'Fecha': d.document_date ?? '',
        'Total (€)': d.total_amount ?? '',
        'Estado': d.status === 'approved' ? 'Aprobado' : 'Pendiente',
        'Estado Conciliación': d.reconciliation_status ?? '',
        'URL Drive': d.drive_url ?? '',
    }))

    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Documentos')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as any

    const today = new Date().toISOString().slice(0, 10)
    const limitReached = (count ?? 0) > 1000

    return new Response(buffer, {
        headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="documentos_export_${today}.xlsx"`,
            ...(limitReached ? { 'X-Export-Limit-Reached': 'true' } : {}),
        },
    })
}
