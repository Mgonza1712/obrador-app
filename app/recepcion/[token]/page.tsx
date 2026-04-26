import { notFound } from 'next/navigation'
import { validateVenueToken, getPendingOrdersForVenue } from '@/app/actions/recepcion'
import RecepcionClient from './_components/RecepcionClient'

export const dynamic = 'force-dynamic'

export default async function RecepcionPage({
    params,
}: {
    params: Promise<{ token: string }>
}) {
    const { token } = await params

    const venue = await validateVenueToken(token)
    if (!venue) return notFound()

    const orders = await getPendingOrdersForVenue(venue.id)

    return (
        <div className="h-full overflow-y-auto bg-background">
            <RecepcionClient token={token} venue={venue} initialOrders={orders} />
        </div>
    )
}
