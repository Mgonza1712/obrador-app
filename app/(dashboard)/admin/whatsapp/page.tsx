import { getTenantConfig } from '@/app/actions/admin'
import AdminTabNav from '../_components/AdminTabNav'
import WAInstanceCard from './_components/WAInstanceCard'
import WAConfigForm from './_components/WAConfigForm'
import { MessageCircle } from 'lucide-react'

export default async function WhatsAppPage() {
    const config = await getTenantConfig()

    return (
        <div className="p-6">
            <AdminTabNav />

            <div className="mb-6">
                <h1 className="text-xl font-semibold flex items-center gap-2">
                    <MessageCircle className="h-5 w-5 text-muted-foreground" />
                    Configuración de WhatsApp
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Gestioná las instancias de WhatsApp para el bot y el envío de pedidos.
                </p>
            </div>

            <div className="space-y-4 max-w-2xl">
                <div className="grid gap-4 sm:grid-cols-2">
                    <WAInstanceCard
                        instanceName={config?.evolution_bot_instance ?? ''}
                        label="Instancia Bot"
                        description="Conversaciones con usuarios internos (dueño, admins)"
                    />
                    <WAInstanceCard
                        instanceName={config?.evolution_ordering_instance ?? ''}
                        label="Instancia Ordering"
                        description="Envío de pedidos a proveedores · Chatwoot"
                    />
                </div>

                <WAConfigForm config={config} />
            </div>
        </div>
    )
}
