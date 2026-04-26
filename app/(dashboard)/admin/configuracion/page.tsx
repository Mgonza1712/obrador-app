import { createServiceClient } from '@/lib/supabase/service'
import AdminTabNav from '../_components/AdminTabNav'
import QRVenuesPanel from './_components/QRVenuesPanel'

export interface VenueQR {
    id: string
    name: string
    type: string | null
    reception_token: string
}

export default async function ConfiguracionPage() {
    const supabase = createServiceClient()
    const { data: venues } = await (supabase as any)
        .from('erp_venues')
        .select('id, name, type, reception_token')
        .order('name')

    const venueList: VenueQR[] = (venues ?? []).filter(
        (v: any) => v.type !== 'generic' // excluir Sede Central del QR
    )

    return (
        <div>
            <AdminTabNav />
            <div className="max-w-4xl">
                <div className="mb-6">
                    <h1 className="text-xl font-semibold">Configuración</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Gestión de QR de recepción por local
                    </p>
                </div>
                <QRVenuesPanel venues={venueList} />
            </div>
        </div>
    )
}
