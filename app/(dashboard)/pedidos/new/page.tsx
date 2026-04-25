import { createClient } from '@/lib/supabase/server'
import NuevoPedidoClient from './_components/NuevoPedidoClient'

export default async function NuevoPedidoPage() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()

    const [masterItemsResult, providersResult, venuesResult, profileResult] = await Promise.all([
        supabase
            .from('erp_master_items')
            .select('id, official_name, base_unit, category')
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
        user
            ? supabase
                .from('profiles')
                .select('venue_id')
                .eq('id', user.id)
                .single()
            : Promise.resolve({ data: null }),
    ])

    // All active prices (not just preferred) so user can choose provider per product
    const { data: activePrices } = await (supabase as any)
        .from('erp_price_history')
        .select('master_item_id, provider_id, unit_price, is_preferred, erp_providers(name, channel)')
        .eq('status', 'active')

    // Alias formats so we can auto-fill formato_compra per product+provider combo
    const { data: aliasFormats } = await (supabase as any)
        .from('erp_item_aliases')
        .select('master_item_id, provider_id, formato_compra')

    const venues: { id: string; name: string }[] = venuesResult.data ?? []
    const defaultVenueId: string | null = (profileResult as any)?.data?.venue_id ?? null

    return (
        <NuevoPedidoClient
            masterItems={masterItemsResult.data ?? []}
            providers={providersResult.data ?? []}
            activePrices={activePrices ?? []}
            aliasFormats={aliasFormats ?? []}
            venues={venues}
            defaultVenueId={defaultVenueId}
        />
    )
}
