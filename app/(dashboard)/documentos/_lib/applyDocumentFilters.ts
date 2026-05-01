/**
 * Shared filter/sort logic for erp_documents queries.
 * Used by both the documents table (page.tsx) and the export handler (export/route.ts)
 * to guarantee identical filter behaviour in both contexts.
 */

const SORT_MAP: Record<string, { column: string; ascending: boolean }> = {
    date_desc: { column: 'document_date', ascending: false },
    date_asc:  { column: 'document_date', ascending: true },
    total_desc: { column: 'total_amount', ascending: false },
    total_asc:  { column: 'total_amount', ascending: true },
    number_desc: { column: 'document_number', ascending: false },
    number_asc:  { column: 'document_number', ascending: true },
    created_desc: { column: 'created_at', ascending: false },
}

export type DocumentFilters = {
    sort?: string
    status?: string
    /** Reconciliation status value or '__null__' to match IS NULL */
    reconciliationStatus?: string
    /** Pre-resolved provider IDs; null means no provider filter */
    providerIds?: string[] | null
    /**
     * BUG FIX (date-timezone): These must be raw YYYY-MM-DD strings, never JS Date objects.
     * Converting through new Date() + toISOString() introduces a timezone offset
     * (e.g. 2026-03-24T00:00:00+02:00 → 2026-03-23T22:00:00Z) which causes Supabase
     * to exclude the user-selected end date when comparing `date` columns.
     */
    dateFrom?: string
    dateTo?: string
    /**
     * BUG FIX (amount): values are explicitly coerced to Number via Number() before
     * passing to .gte()/.lte() so Postgres receives a numeric literal, not a string,
     * for correct NUMERIC column comparison.
     */
    amountMin?: number | null
    amountMax?: number | null
    documentNumber?: string
    docTypes?: string[]
    venueId?: string | null
    /**
     * When true: restrict to documents that have at least one purchase_line
     * with review_status = 'skipped'. The caller (page.tsx) must pre-resolve this
     * into an .in('id', pendingDocIds) before calling applyDocumentFilters, since
     * PostgREST cannot express an EXISTS subquery as a plain column predicate.
     * This field is carried here only to keep the filter type co-located.
     * The actual .in() filter is applied in page.tsx before this function is called.
     */
    hasPendingLines?: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyDocumentFilters(query: any, filters: DocumentFilters) {
    if (filters.docTypes && filters.docTypes.length > 0) {
        query = query.in('doc_type', filters.docTypes)
    }
    if (filters.status) {
        query = query.eq('status', filters.status)
    }
    if (filters.reconciliationStatus === '__null__') {
        query = query.is('reconciliation_status', null)
    } else if (filters.reconciliationStatus) {
        query = query.eq('reconciliation_status', filters.reconciliationStatus)
    }
    if (filters.providerIds) {
        query = query.in('provider_id', filters.providerIds)
    }
    // Dates passed as YYYY-MM-DD strings directly — no Date conversion (see comment above)
    if (filters.dateFrom) {
        query = query.gte('document_date', filters.dateFrom)
    }
    if (filters.dateTo) {
        query = query.lte('document_date', filters.dateTo)
    }
    // Amount filters use explicit Number() coercion (see comment above)
    if (filters.amountMin != null) {
        query = query.gte('total_amount', Number(filters.amountMin))
    }
    if (filters.amountMax != null) {
        query = query.lte('total_amount', Number(filters.amountMax))
    }
    if (filters.documentNumber) {
        query = query.ilike('document_number', `%${filters.documentNumber}%`)
    }
    if (filters.venueId) {
        query = query.eq('venue_id', filters.venueId)
    }

    const sortConfig = SORT_MAP[filters.sort ?? 'date_desc'] ?? SORT_MAP.date_desc
    query = query.order(sortConfig.column, { ascending: sortConfig.ascending, nullsFirst: false })

    return query
}
