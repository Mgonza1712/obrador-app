import { createClient } from '@/lib/supabase/server'
import { AlertCircle } from 'lucide-react'
import ProveedoresClient from './ProveedoresClient'

export const metadata = {
    title: 'Proveedores | Obrador',
    description: 'Gestión del catálogo de proveedores del sistema.',
}

export type ProveedorRow = {
    id: string
    name: string
    email: string | null
    phone: string | null
    contact_name: string | null
    channel: string | null
    is_trusted: boolean | null
    is_active: boolean | null
    shared_pricing: boolean | null
    merged_into: string | null
    productCount: number
    lastDocument: string | null
}

export default async function ProveedoresPage() {
    const supabase = await createClient()

    const [providersResult, aliasesResult, docsResult] = await Promise.all([
        supabase.from('erp_providers').select('*').order('name'),
        supabase.from('erp_item_aliases').select('provider_id'),
        supabase.from('erp_documents').select('provider_id, document_date'),
    ])

    if (providersResult.error) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
                <AlertCircle className="h-10 w-10 text-destructive" />
                <p className="text-sm text-muted-foreground">
                    Error al cargar proveedores: {providersResult.error.message}
                </p>
            </div>
        )
    }

    if (aliasesResult.error) console.error('[proveedores] erp_item_aliases query error:', aliasesResult.error)
    if (docsResult.error) console.error('[proveedores] erp_documents query error:', docsResult.error)

    // Count products per provider
    const productCountMap: Record<string, number> = {}
    for (const alias of aliasesResult.data ?? []) {
        const pid = (alias as { provider_id: string | null }).provider_id
        if (pid) productCountMap[pid] = (productCountMap[pid] ?? 0) + 1
    }

    // Max document_date per provider
    const lastDocMap: Record<string, string> = {}
    for (const doc of docsResult.data ?? []) {
        const d = doc as { provider_id: string | null; document_date: string | null }
        if (d.provider_id && d.document_date) {
            const cur = lastDocMap[d.provider_id]
            if (!cur || d.document_date > cur) lastDocMap[d.provider_id] = d.document_date
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const providers: ProveedorRow[] = (providersResult.data as any[]).map((p) => ({
        id: p.id,
        name: p.name,
        email: p.email ?? null,
        phone: p.phone ?? null,
        contact_name: p.contact_name ?? null,
        channel: p.channel ?? null,
        is_trusted: p.is_trusted ?? null,
        is_active: p.is_active ?? null,
        shared_pricing: p.shared_pricing ?? null,
        merged_into: p.merged_into ?? null,
        productCount: productCountMap[p.id] ?? 0,
        lastDocument: lastDocMap[p.id] ?? null,
    }))

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Proveedores</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Gestión del catálogo de proveedores del sistema.
                </p>
            </div>
            <ProveedoresClient providers={providers} />
        </div>
    )
}
