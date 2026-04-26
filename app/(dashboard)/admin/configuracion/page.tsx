import { createServiceClient } from '@/lib/supabase/service'
import AdminTabNav from '../_components/AdminTabNav'
import QRVenuesPanel from './_components/QRVenuesPanel'

export interface VenueQR {
    id: string
    name: string
    type: string | null
    reception_token: string
}

function getBaseUrl(): string {
    // 1. Custom env var (set once in Vercel, never changes between deploys)
    if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
    // 2. Vercel stable production URL (system var, available automatically)
    if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
        return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    // 3. Vercel deployment URL (changes per deploy — fallback)
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
    return 'http://localhost:3000'
}

export default async function ConfiguracionPage() {
    const supabase = createServiceClient()
    const { data: venues } = await (supabase as any)
        .from('erp_venues')
        .select('id, name, type, reception_token')
        .order('name')

    const venueList: VenueQR[] = ((venues ?? []) as any[]).filter(
        (v: any) => v.type !== 'generic'
    )

    const baseUrl = getBaseUrl()

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
                <QRVenuesPanel venues={venueList} baseUrl={baseUrl} />
            </div>
        </div>
    )
}
