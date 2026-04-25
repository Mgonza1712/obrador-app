import Link from 'next/link'
import { Package, Plus } from 'lucide-react'
import { getOrders } from '@/app/actions/pedidos'
import OrdersTable from './_components/OrdersTable'

export default async function PedidosPage() {
    const orders = await getOrders()

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Package className="h-6 w-6 text-muted-foreground" />
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Pedidos</h1>
                        <p className="text-sm text-muted-foreground">
                            {orders.length} pedido{orders.length !== 1 ? 's' : ''} en total
                        </p>
                    </div>
                </div>
                <Link
                    href="/pedidos/new"
                    className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                    <Plus className="h-4 w-4" />
                    Nuevo pedido
                </Link>
            </div>

            <OrdersTable orders={orders} />
        </div>
    )
}
