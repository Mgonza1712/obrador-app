import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getOrderDetail } from '@/app/actions/pedidos'
import OrderDetailClient from '../_components/OrderDetailClient'

export default async function PedidoDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    const supabase = await createClient()

    const [order, masterItemsResult, providersResult, venuesResult] = await Promise.all([
        getOrderDetail(id),
        supabase
            .from('erp_master_items')
            .select('id, official_name, base_unit')
            .order('official_name'),
        supabase
            .from('erp_providers')
            .select('id, name, channel')
            .eq('is_active', true)
            .order('name'),
        (supabase as any)
            .from('erp_venues')
            .select('id, name')
            .order('name'),
    ])

    if (!order) return notFound()

    const [activePricesResult, aliasFormatsResult] = await Promise.all([
        (supabase as any)
            .from('erp_price_history')
            .select('master_item_id, provider_id, unit_price, is_preferred, erp_providers(name, channel)')
            .eq('status', 'active'),
        (supabase as any)
            .from('erp_item_aliases')
            .select('master_item_id, provider_id, formato_compra'),
    ])

    return (
        <OrderDetailClient
            order={order}
            masterItems={masterItemsResult.data ?? []}
            providers={providersResult.data ?? []}
            activePrices={activePricesResult.data ?? []}
            aliasFormats={aliasFormatsResult.data ?? []}
            venues={venuesResult.data ?? []}
        />
    )
}
