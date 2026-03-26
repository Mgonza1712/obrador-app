// @ts-nocheck — módulo pendiente de reescritura para el nuevo schema (assemblies/bom_lines/components)
import Link from 'next/link'
import { ConciergeBell, ChefHat, Clock, Utensils, PlusCircle } from 'lucide-react'
import Sidebar from '@/components/layout/Sidebar'
import { createClient } from '@/lib/supabase/server'

// ─── Tipos ─────────────────────────────────────────────────────────────────────
type Ficha = {
    id: string
    name: string
    yield_text: string | null
    prep_time: string | null
    steps: { fase: string }[] | null
    final_image_url: string | null
}

// ─── Page (Server Component) ───────────────────────────────────────────────────
export default async function FichasPage() {
    const supabase = await createClient()

    // Se obtiene el usuario para filtrar por organization_id
    const { data: { user } } = await supabase.auth.getUser()
    let fichas: Ficha[] = []

    if (user) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('organization_id')
            .eq('id', user.id)
            .single()

        if (profile?.organization_id) {
            const { data, error } = await supabase
                .from('fichas')
                .select('id, name, yield_text, prep_time, steps, final_image_url')
                .eq('organization_id', profile.organization_id)
                .order('created_at', { ascending: false })

            if (error) console.error('Error fetching fichas:', error.message)
            else fichas = (data as Ficha[]) ?? []
        }
    }

    return (
        <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-background">
            <Sidebar />
            <main className="flex flex-1 flex-col overflow-y-auto pb-16 md:pb-0">

                {/* Header */}
                <div className="border-b border-border bg-background/80 px-4 py-4 md:px-8 md:py-6 backdrop-blur">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                                <ConciergeBell className="h-5 w-5" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                                    Fichas de Servicio
                                </h1>
                                <p className="text-sm text-muted-foreground">
                                    SOPs visuales para la línea de servicio
                                </p>
                            </div>
                        </div>
                        <Link
                            href="/fichas/crear"
                            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow transition-all hover:opacity-90 active:scale-95"
                        >
                            <PlusCircle className="h-4 w-4" />
                            Nueva Ficha
                        </Link>
                    </div>
                </div>

                {/* Grid / Empty State */}
                <div className="p-4 md:p-8">
                    {fichas.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border py-20 text-center">
                            <ConciergeBell className="h-10 w-10 text-muted-foreground/40" />
                            <div>
                                <p className="font-semibold text-foreground">Sin fichas todavía</p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Crea tu primer SOP haciendo clic en &quot;Nueva Ficha&quot;.
                                </p>
                            </div>
                            <Link
                                href="/fichas/crear"
                                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:opacity-90"
                            >
                                <PlusCircle className="h-4 w-4" /> Crear primera ficha
                            </Link>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                            {fichas.map((ficha) => {
                                const stepCount = Array.isArray(ficha.steps) ? ficha.steps.length : 0
                                return (
                                    <Link key={ficha.id} href={`/fichas/${ficha.id}`}>
                                        <div className="group relative overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:-translate-y-1 hover:shadow-lg cursor-pointer">
                                            {/* Imagen de portada */}
                                            {ficha.final_image_url ? (
                                                /* eslint-disable-next-line @next/next/no-img-element */
                                                <img
                                                    src={ficha.final_image_url}
                                                    alt={ficha.name}
                                                    className="h-40 w-full object-cover"
                                                />
                                            ) : (
                                                <div className="flex h-40 w-full items-center justify-center bg-gradient-to-br from-rose-500/10 to-orange-500/10">
                                                    <ChefHat className="h-10 w-10 text-muted-foreground/30" />
                                                </div>
                                            )}

                                            {/* Info */}
                                            <div className="p-5">
                                                <h2 className="text-lg font-bold text-foreground">{ficha.name}</h2>
                                                {ficha.yield_text && (
                                                    <p className="mt-0.5 text-sm text-muted-foreground">{ficha.yield_text}</p>
                                                )}

                                                <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
                                                    {ficha.prep_time && (
                                                        <span className="flex items-center gap-1">
                                                            <Clock className="h-4 w-4" />
                                                            {ficha.prep_time}
                                                        </span>
                                                    )}
                                                    {stepCount > 0 && (
                                                        <span className="flex items-center gap-1">
                                                            <Utensils className="h-4 w-4" />
                                                            {stepCount} pasos
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="mt-4">
                                                    <span className="text-xs font-semibold uppercase tracking-widest text-primary">
                                                        Ver Ficha →
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </Link>
                                )
                            })}
                        </div>
                    )}
                </div>
            </main>
        </div>
    )
}
