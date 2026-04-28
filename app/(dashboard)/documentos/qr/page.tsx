import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase/service'
import QRVenuesPanel from '@/app/(dashboard)/admin/configuracion/_components/QRVenuesPanel'
import type { VenueQR } from '@/app/(dashboard)/admin/configuracion/page'

function getBaseUrl(): string {
    if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
    if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
        return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
    return 'http://localhost:3000'
}

export const metadata = {
    title: 'QR de Recepción | Obrador',
}

export default async function DocumentosQRPage() {
    const supabase = createServiceClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: venues } = await (supabase as any)
        .from('erp_venues')
        .select('id, name, type, reception_token')
        .order('name')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const venueList: VenueQR[] = ((venues ?? []) as any[]).filter((v: any) => v.type !== 'generic')

    const baseUrl = getBaseUrl()

    return (
        <div className="max-w-4xl space-y-6">
            <div className="flex items-center gap-3">
                <Link
                    href="/documentos"
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Volver a Documentos
                </Link>
            </div>

            <div>
                <h1 className="text-2xl font-bold tracking-tight">QR de Recepción</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Imprime y pega el QR en el punto de recepción de cada local. El personal escanea el
                    código con el móvil para registrar recepciones sin necesidad de cuenta.
                </p>
            </div>

            <QRVenuesPanel venues={venueList} baseUrl={baseUrl} />
        </div>
    )
}
