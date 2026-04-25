import { getAdminUsers, getVenues } from '@/app/actions/admin'
import AdminTabNav from '../_components/AdminTabNav'
import UserEditDialog from './_components/UserEditDialog'
import { MessageCircle, Shield, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'

const ROLE_LABELS: Record<string, string> = {
    buyer: 'Comprador',
    shift_manager: 'Encargado',
    local_admin: 'Admin local',
    admin: 'Administración',
    owner: 'Dueño',
}

const ROLE_COLORS: Record<string, string> = {
    buyer: 'bg-blue-50 text-blue-700 border-blue-200',
    shift_manager: 'bg-teal-50 text-teal-700 border-teal-200',
    local_admin: 'bg-purple-50 text-purple-700 border-purple-200',
    admin: 'bg-amber-50 text-amber-700 border-amber-200',
    owner: 'bg-green-50 text-green-700 border-green-200',
}

const SECTOR_LABELS: Record<string, string> = {
    cocina: 'Cocina',
    barra: 'Barra',
    salon: 'Salón',
    todos: 'Todos',
}

export default async function UsuariosPage() {
    const supabase = await createClient()
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    const [users, venues] = await Promise.all([getAdminUsers(), getVenues()])

    return (
        <div className="p-6">
            <AdminTabNav />

            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-xl font-semibold flex items-center gap-2">
                        <Users className="h-5 w-5 text-muted-foreground" />
                        Usuarios y permisos
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        {users.length} usuario{users.length !== 1 ? 's' : ''} registrado{users.length !== 1 ? 's' : ''}
                    </p>
                </div>
            </div>

            <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-border bg-muted/30">
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Usuario</th>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Rol</th>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Locales y sectores</th>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">WhatsApp</th>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground w-10" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {users.map((u) => {
                            // Group venue_sectors by venue
                            const grouped: Record<string, string[]> = {}
                            for (const vs of u.venue_sectors) {
                                if (!grouped[vs.venue_name]) grouped[vs.venue_name] = []
                                grouped[vs.venue_name].push(vs.sector)
                            }

                            return (
                                <tr key={u.id} className="hover:bg-muted/20 transition-colors">
                                    <td className="px-4 py-3">
                                        <p className="font-medium">{u.full_name ?? '—'}</p>
                                        <p className="text-xs text-muted-foreground">{u.email}</p>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[u.role ?? 'buyer'] ?? ''}`}>
                                            <Shield className="h-3 w-3" />
                                            {ROLE_LABELS[u.role ?? 'buyer'] ?? u.role}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        {Object.keys(grouped).length > 0 ? (
                                            <div className="flex flex-wrap gap-1">
                                                {Object.entries(grouped).map(([venueName, sectors]) => (
                                                    <span
                                                        key={venueName}
                                                        className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs"
                                                    >
                                                        <span className="font-medium">{venueName}</span>
                                                        <span className="text-muted-foreground">
                                                            ({sectors.map((s) => SECTOR_LABELS[s] ?? s).join(', ')})
                                                        </span>
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">Sin asignar</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        {u.whatsapp_jid ? (
                                            <span className="flex items-center gap-1 text-xs text-green-600">
                                                <MessageCircle className="h-3.5 w-3.5" />
                                                Vinculado
                                            </span>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">Sin vincular</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <UserEditDialog user={u} venues={venues} currentUserId={currentUser?.id ?? ''} />
                                    </td>
                                </tr>
                            )
                        })}
                        {users.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                                    No hay usuarios registrados
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="mt-4 rounded-md border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">
                    <strong className="text-foreground">Nota:</strong> Los usuarios se crean desde el panel de autenticación de Supabase.
                    Aquí podés asignarles roles, locales y vincular su WhatsApp.
                </p>
            </div>
        </div>
    )
}
