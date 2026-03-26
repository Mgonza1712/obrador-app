import { createClient } from '@/lib/supabase/server'
import { AlertCircle } from 'lucide-react'
import CatalogoClient from './CatalogoClient'

export const metadata = {
    title: 'Catálogo | Obrador',
    description: 'Catálogo de productos normalizados con precios por proveedor.',
}

export type PriceOffer = {
    id: string
    providerId: string
    providerName: string
    unitPrice: number
    effectiveDate: string | null
    isPreferred: boolean
}

export type CatalogoItem = {
    id: string
    officialName: string
    category: string | null
    baseUnit: string
    offers: PriceOffer[]
}

export default async function CatalogoPage() {
    const supabase = await createClient()

    const [itemsResult, pricesResult] = await Promise.all([
        supabase
            .from('erp_master_items')
            .select('id, official_name, category, base_unit')
            .order('official_name'),
        supabase
            .from('erp_price_history')
            .select('id, master_item_id, unit_price, effective_date, is_preferred, provider_id, erp_providers(name)')
            .eq('status', 'active')
            .order('effective_date', { ascending: false }),
    ])

    if (itemsResult.error) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
                <AlertCircle className="h-10 w-10 text-destructive" />
                <p className="text-sm text-muted-foreground">
                    Error al cargar el catálogo: {itemsResult.error.message}
                </p>
            </div>
        )
    }

    // Group active price offers by master_item_id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const offersByItem = new Map<string, PriceOffer[]>()
    for (const ph of (pricesResult.data ?? []) as any[]) {
        if (!ph.master_item_id) continue
        const offer: PriceOffer = {
            id: ph.id,
            providerId: ph.provider_id ?? '',
            providerName: ph.erp_providers?.name ?? 'Proveedor desconocido',
            unitPrice: ph.unit_price,
            effectiveDate: ph.effective_date ?? null,
            isPreferred: ph.is_preferred ?? false,
        }
        const list = offersByItem.get(ph.master_item_id) ?? []
        list.push(offer)
        offersByItem.set(ph.master_item_id, list)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: CatalogoItem[] = (itemsResult.data as any[]).map((item) => ({
        id: item.id,
        officialName: item.official_name,
        category: item.category ?? null,
        baseUnit: item.base_unit,
        offers: offersByItem.get(item.id) ?? [],
    }))

    // Auto-mark: items with exactly one active offer and no preferred set
    const toAutoMark = items.filter(
        (item) => item.offers.length === 1 && !item.offers[0].isPreferred,
    )

    if (toAutoMark.length > 0) {
        await Promise.all(
            toAutoMark.map((item) =>
                supabase
                    .from('erp_price_history')
                    .update({ is_preferred: true })
                    .eq('id', item.offers[0].id),
            ),
        )
        // Reflect auto-mark in local data so client gets current state
        for (const item of toAutoMark) {
            item.offers[0].isPreferred = true
        }
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Catálogo</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Productos normalizados con precios y proveedores preferidos.
                </p>
            </div>
            <CatalogoClient items={items} />
        </div>
    )
}
