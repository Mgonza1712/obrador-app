/**
 * Shared types for the Document Revision feature.
 * These are hand-crafted interfaces that align with the Supabase query results
 * without relying on the QueryBuilder's complex join inference.
 */

// Represents data suggested by the LLM, stored as JSONB in erp_documents.ai_interpretation
export interface DocumentAiInterpretation {
    proveedor_nombre?: string | null
    fecha?: string | null
    numero_documento?: string | null
    total?: number | null
    [key: string]: unknown
}

// Represents data suggested by the LLM, stored as JSONB in erp_purchase_lines.ai_interpretation
export interface LineAiInterpretation {
    producto_normalizado?: string | null
    categoria?: string | null
    unidad_base?: string | null
    unidades_por_pack?: number | null
    cantidad_por_unidad?: number | null
    unidad_precio?: string | null
    [key: string]: unknown
}

export interface MasterItemRef {
    id: string
    official_name: string
    base_unit: string
    category: string | null
}

export interface ReferenceLookup {
    id: string
    name: string
}

export interface DocumentWithRelations {
    id: string
    doc_type: string
    document_date: string | null
    document_number: string | null
    total_amount: number | null
    status: string | null
    drive_url: string | null
    provider_id: string | null
    ai_interpretation: DocumentAiInterpretation | null
    erp_providers: { id: string; name: string } | null
    erp_venues: { id: string; name: string } | null
}

export interface PurchaseLineWithItem {
    id: string
    quantity: number
    unit_price: number | null
    line_total_cost: number
    master_item_id: string | null
    raw_name: string | null
    ai_interpretation: LineAiInterpretation | null
    erp_master_items: MasterItemRef | null
}
