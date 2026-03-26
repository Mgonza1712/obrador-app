import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import ProveedorDetailClient from './ProveedorDetailClient'

export type ProveedorDetail = {
    id: string
    name: string
    email: string | null
    phone: string | null
    contact_name: string | null
    channel: string | null
    notes: string | null
    is_trusted: boolean | null
    is_active: boolean | null
    shared_pricing: boolean | null
}

export type ProductRow = {
    aliasId: string
    rawName: string
    officialName: string | null
    masterItemId: string | null
    lastPrice: number | null
    lastPriceDate: string | null
}

export type DocumentRow = {
    id: string
    doc_type: string | null
    document_number: string | null
    document_date: string | null
    total_amount: number | null
    status: string | null
}

export default async function ProveedorDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const supabase = await createClient()

    const [providerResult, aliasesResult, docsResult, pricesResult] = await Promise.all([
        supabase.from('erp_providers').select('*').eq('id', id).single(),
        supabase
            .from('erp_item_aliases')
            .select('id, raw_name, master_item_id, erp_master_items(official_name)')
            .eq('provider_id', id),
        supabase
            .from('erp_documents')
            .select('id, doc_type, document_number, document_date, total_amount, status')
            .eq('provider_id', id)
            .order('document_date', { ascending: false }),
        supabase
            .from('erp_price_history')
            .select('master_item_id, unit_price, effective_date')
            .eq('provider_id', id)
            .order('effective_date', { ascending: false }),
    ])

    if (providerResult.error || !providerResult.data) {
        if (providerResult.error?.code === 'PGRST116') notFound()
        return (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
                <AlertCircle className="h-10 w-10 text-destructive" />
                <p className="text-sm text-muted-foreground">
                    Error al cargar proveedor: {providerResult.error?.message}
                </p>
            </div>
        )
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = providerResult.data as any
    const provider: ProveedorDetail = {
        id: raw.id,
        name: raw.name,
        email: raw.email ?? null,
        phone: raw.phone ?? null,
        contact_name: raw.contact_name ?? null,
        channel: raw.channel ?? null,
        notes: raw.notes ?? null,
        is_trusted: raw.is_trusted ?? null,
        is_active: raw.is_active ?? null,
        shared_pricing: raw.shared_pricing ?? null,
    }

    // Build latest price per master_item_id map (already sorted desc)
    const latestPriceMap: Record<string, { price: number; date: string | null }> = {}
    for (const ph of pricesResult.data ?? []) {
        const p = ph as { master_item_id: string | null; unit_price: number; effective_date: string | null }
        if (p.master_item_id && !latestPriceMap[p.master_item_id]) {
            latestPriceMap[p.master_item_id] = { price: p.unit_price, date: p.effective_date }
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const products: ProductRow[] = (aliasesResult.data ?? []).map((a: any) => ({
        aliasId: a.id,
        rawName: a.raw_name,
        officialName: a.erp_master_items?.official_name ?? null,
        masterItemId: a.master_item_id ?? null,
        lastPrice: a.master_item_id ? (latestPriceMap[a.master_item_id]?.price ?? null) : null,
        lastPriceDate: a.master_item_id ? (latestPriceMap[a.master_item_id]?.date ?? null) : null,
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const documents: DocumentRow[] = (docsResult.data ?? []).map((d: any) => ({
        id: d.id,
        doc_type: d.doc_type ?? null,
        document_number: d.document_number ?? null,
        document_date: d.document_date ?? null,
        total_amount: d.total_amount ?? null,
        status: d.status ?? null,
    }))

    return (
        <div className="space-y-8 max-w-3xl">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Link href="/proveedores" className="hover:text-foreground transition-colors">
                    Proveedores
                </Link>
                <span>/</span>
                <span className="text-foreground font-medium">{provider.name}</span>
            </div>

            <div>
                <h1 className="text-2xl font-bold tracking-tight">{provider.name}</h1>
            </div>

            {/* Section 1 — Edit form */}
            <ProveedorDetailClient provider={provider} />

            {/* Section 2 — Products */}
            <section className="space-y-3">
                <h2 className="text-lg font-semibold">Productos en catálogo</h2>
                {products.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4">
                        Este proveedor no tiene productos vinculados.
                    </p>
                ) : (
                    <div className="rounded-lg border border-border bg-card overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border">
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                        Producto
                                    </th>
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                        Nombre en factura
                                    </th>
                                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                                        Último precio
                                    </th>
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                        Fecha precio
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {products.map((prod) => (
                                    <tr
                                        key={prod.aliasId}
                                        className="border-b border-border last:border-0 hover:bg-accent/40"
                                    >
                                        <td className="px-4 py-3 font-medium">
                                            {prod.officialName ?? (
                                                <span className="text-muted-foreground/50 italic">
                                                    Sin vincular
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                            {prod.rawName}
                                        </td>
                                        <td className="px-4 py-3 text-right font-medium">
                                            {prod.lastPrice != null
                                                ? `$${prod.lastPrice.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`
                                                : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                            {prod.lastPriceDate
                                                ? new Date(prod.lastPriceDate).toLocaleDateString(
                                                      'es-ES',
                                                      {
                                                          day: '2-digit',
                                                          month: 'short',
                                                          year: 'numeric',
                                                      },
                                                  )
                                                : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* Section 3 — Documents */}
            <section className="space-y-3">
                <h2 className="text-lg font-semibold">Historial de documentos</h2>
                {documents.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4">
                        No hay documentos registrados para este proveedor.
                    </p>
                ) : (
                    <div className="rounded-lg border border-border bg-card overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border">
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                        Tipo
                                    </th>
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                        Nº Documento
                                    </th>
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                        Fecha
                                    </th>
                                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                                        Total
                                    </th>
                                    <th className="px-4 py-3 text-center font-medium text-muted-foreground">
                                        Estado
                                    </th>
                                    <th className="px-4 py-3" />
                                </tr>
                            </thead>
                            <tbody>
                                {documents.map((doc) => (
                                    <tr
                                        key={doc.id}
                                        className="border-b border-border last:border-0 hover:bg-accent/40"
                                    >
                                        <td className="px-4 py-3 capitalize font-medium">
                                            {doc.doc_type ?? '—'}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                                            {doc.document_number ?? '—'}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                            {doc.document_date
                                                ? new Date(doc.document_date).toLocaleDateString(
                                                      'es-ES',
                                                      {
                                                          day: '2-digit',
                                                          month: 'short',
                                                          year: 'numeric',
                                                      },
                                                  )
                                                : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-right font-medium">
                                            {doc.total_amount != null && doc.total_amount > 0
                                                ? `$${doc.total_amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`
                                                : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {doc.status === 'approved' ? (
                                                <Badge
                                                    variant="outline"
                                                    className="border-green-400 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                                                >
                                                    Aprobado
                                                </Badge>
                                            ) : (
                                                <Badge
                                                    variant="outline"
                                                    className="border-yellow-400 bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300"
                                                >
                                                    Pendiente
                                                </Badge>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <Link
                                                href={`/admin/revision/${doc.id}?from=proveedor&providerId=${id}`}
                                                className="text-xs font-medium text-primary hover:underline"
                                            >
                                                Ver →
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    )
}
