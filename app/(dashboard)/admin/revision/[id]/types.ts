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
    // Estructura nueva del extractor v2 (normalization_step anidado)
    extraction_step?: {
        cantidad_comprada?: { value?: number; confidence?: number } | null
        precio_total?: { value?: number; confidence?: number } | null
        unidad_tal_como_aparece?: { value?: string | null; confidence?: number } | null
    } | null
    normalization_step?: {
        official_name?: string | null
        categoria?: string | null
        base_unit?: string | null
        formato_compra?: string | null
        envases_por_formato?: string | number | null
        contenido_por_envase?: string | number | null
        iva_percent?: number | null
    } | null

    // Campos de control
    alias_match?: boolean
    is_new_product?: boolean
    is_existing_master?: boolean
    suggested_master_item_id?: string | null
    needs_review?: boolean
    review_reasons?: string[]
    model_version?: string | null
    prompt_version?: string | null

    // Estructura legacy (campos directos — compatibilidad hacia atrás)
    producto_normalizado?: string | null
    categoria?: string | null
    unidad_base?: string | null
    formato_compra?: string | null
    envases_por_formato?: number | null
    contenido_por_envase?: number | null
    iva_percent?: number | null

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
    iva_percent: number | null
    is_envase_retornable: boolean | null
    ai_interpretation: LineAiInterpretation | null
    review_status: 'auto_approved' | 'pending_review' | 'reviewed' | 'skipped' | null
    erp_master_items: MasterItemRef | null
}
