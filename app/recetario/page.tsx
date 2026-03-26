// @ts-nocheck — módulo pendiente de reescritura para el nuevo schema (assemblies/bom_lines/components)
import Link from 'next/link'
import { ChefHat, Clock, Utensils, Calculator } from 'lucide-react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Sidebar from '@/components/layout/Sidebar'
import { createClient } from '@/lib/supabase/server'

// ─── Colores por categoría (por ahora yield_unit define el color) ─────────────
const colorMap: Record<string, string> = {
    porciones: 'from-rose-500/10 to-orange-500/10',
    bases: 'from-amber-500/10 to-yellow-500/10',
    piezas: 'from-emerald-500/10 to-teal-500/10',
    kg: 'from-sky-500/10 to-blue-500/10',
    litros: 'from-violet-500/10 to-purple-500/10',
}

function getColor(unit: string) {
    return colorMap[unit] ?? 'from-zinc-500/10 to-slate-500/10'
}

// ─── Page (Server Component) ──────────────────────────────────────────────────
export default async function RecetarioPage() {
    const supabase = await createClient()

    const { data: recipes, error } = await supabase
        .from('recipes')
        .select('id, title, prep_time_minutes, base_yield, yield_unit')
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error fetching recipes:', error.message)
    }

    const recetas = recipes ?? []

    return (
        <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-background">
            <Sidebar />
            <main className="flex flex-1 flex-col overflow-y-auto pb-16 md:pb-0">

                {/* Header */}
                <div className="border-b border-border bg-background/80 px-4 py-4 md:px-8 md:py-6 backdrop-blur">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                                <ChefHat className="h-5 w-5" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                                    Recetario
                                </h1>
                                <p className="text-sm text-muted-foreground">
                                    {recetas.length} {recetas.length === 1 ? 'receta' : 'recetas'}
                                </p>
                            </div>
                        </div>
                        <Button className="gap-2" asChild>
                            <Link href="/recetario/nueva">
                                <span className="text-base leading-none">+</span>
                                Nueva Receta
                            </Link>
                        </Button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-4 md:p-8">
                    {recetas.length === 0 ? (
                        /* Estado vacío */
                        <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
                            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                                <ChefHat className="h-8 w-8 text-muted-foreground" />
                            </div>
                            <div>
                                <p className="font-medium text-foreground">Aún no tienes recetas</p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Crea tu primera receta para empezar
                                </p>
                            </div>
                            <Button asChild>
                                <Link href="/recetario/nueva">+ Nueva Receta</Link>
                            </Button>
                        </div>
                    ) : (
                        /* Grid de cards */
                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                            {recetas.map((receta) => (
                                <Card
                                    key={receta.id}
                                    className={`group relative overflow-hidden border-border bg-gradient-to-br ${getColor(receta.yield_unit ?? '')} transition-all duration-200 hover:-translate-y-1 hover:shadow-lg`}
                                >
                                    <CardHeader className="pb-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <CardTitle className="text-lg font-bold leading-tight text-foreground">
                                                {receta.title}
                                            </CardTitle>
                                            <Badge variant="secondary" className="shrink-0 text-xs">
                                                {receta.yield_unit ?? '—'}
                                            </Badge>
                                        </div>
                                        <CardDescription className="text-sm">
                                            &nbsp;
                                        </CardDescription>
                                    </CardHeader>

                                    <CardContent className="pb-4">
                                        <div className="flex items-center gap-6 text-sm">
                                            <div className="flex items-center gap-1.5 text-muted-foreground">
                                                <Clock className="h-4 w-4" />
                                                <span>
                                                    <strong className="text-foreground">{receta.prep_time_minutes ?? '—'}</strong> min
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1.5 text-muted-foreground">
                                                <Utensils className="h-4 w-4" />
                                                <span>
                                                    Rinde <strong className="text-foreground">{receta.base_yield}</strong> {receta.yield_unit}
                                                </span>
                                            </div>
                                        </div>
                                    </CardContent>

                                    <CardFooter className="border-t border-border/50 pt-4">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="w-full gap-2 font-medium"
                                            asChild
                                        >
                                            <Link href={`/recetario/${receta.id}`}>
                                                <Calculator className="h-4 w-4" />
                                                Calcular Porciones
                                            </Link>
                                        </Button>
                                    </CardFooter>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>

            </main>
        </div>
    )
}
