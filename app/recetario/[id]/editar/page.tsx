import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ChefHat } from 'lucide-react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Sidebar from '@/components/layout/Sidebar'
import { createClient } from '@/lib/supabase/server'
import { updateRecipe } from '@/app/actions/recipe'

function Field({
    label, name, type = 'text', placeholder, defaultValue, hint,
}: {
    label: string; name: string; type?: string; placeholder?: string
    defaultValue?: string | number; hint?: string
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <label htmlFor={name} className="text-sm font-medium text-foreground">{label}</label>
            <input
                id={name} name={name} type={type} required
                placeholder={placeholder}
                defaultValue={defaultValue}
                min={type === 'number' ? 0 : undefined}
                step={type === 'number' ? 'any' : undefined}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-ring transition-shadow"
            />
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
    )
}

export default async function EditarRecetaPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    const supabase = await createClient()

    const { data: receta, error } = await supabase
        .from('recipes')
        .select('id, title, prep_time_minutes, base_yield, yield_unit, instructions')
        .eq('id', id)
        .single()

    if (error || !receta) notFound()

    return (
        <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-background">
            <Sidebar />
            <main className="flex flex-1 flex-col overflow-y-auto pb-16 md:pb-0">

                {/* Header */}
                <div className="border-b border-border bg-background/80 px-4 py-4 md:px-8 md:py-5 backdrop-blur">
                    <Link
                        href={`/recetario/${id}`}
                        className="mb-3 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Volver a la receta
                    </Link>
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                            <ChefHat className="h-4 w-4" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-foreground">Editar Receta</h1>
                            <p className="text-sm text-muted-foreground">{receta.title}</p>
                        </div>
                    </div>
                </div>

                {/* Form */}
                <div className="flex flex-1 justify-center p-4 md:p-8">
                    <div className="w-full max-w-2xl">
                        <form action={updateRecipe} className="flex flex-col gap-6">
                            {/* Campo oculto con el id de la receta */}
                            <input type="hidden" name="recipe_id" value={receta.id} />

                            {/* Datos básicos */}
                            <Card className="border-border shadow-sm">
                                <CardHeader className="pb-4">
                                    <CardTitle className="text-base font-semibold">Información básica</CardTitle>
                                    <CardDescription>Modifica los datos principales de la receta</CardDescription>
                                </CardHeader>
                                <CardContent className="flex flex-col gap-4">
                                    <Field
                                        label="Título de la receta"
                                        name="title"
                                        placeholder="Ej: Salsa Fileto…"
                                        defaultValue={receta.title}
                                    />
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                        <Field
                                            label="Tiempo de preparación (min)"
                                            name="prep_time_minutes"
                                            type="number"
                                            placeholder="45"
                                            defaultValue={receta.prep_time_minutes ?? ''}
                                        />
                                        <Field
                                            label="Rendimiento base"
                                            name="base_yield"
                                            type="number"
                                            placeholder="10"
                                            defaultValue={receta.base_yield}
                                            hint="Cantidad que produce la receta base"
                                        />
                                    </div>
                                    <Field
                                        label="Unidad de rendimiento"
                                        name="yield_unit"
                                        placeholder="porciones, bases, kg…"
                                        defaultValue={receta.yield_unit ?? ''}
                                    />
                                </CardContent>
                            </Card>

                            {/* Instrucciones */}
                            <Card className="border-border shadow-sm">
                                <CardHeader className="pb-4">
                                    <CardTitle className="text-base font-semibold">Paso a paso</CardTitle>
                                    <CardDescription>Instrucciones de elaboración</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex flex-col gap-1.5">
                                        <label htmlFor="instructions" className="text-sm font-medium text-foreground">
                                            Instrucciones
                                        </label>
                                        <textarea
                                            id="instructions" name="instructions" required rows={8}
                                            defaultValue={receta.instructions ?? ''}
                                            placeholder="Describe el proceso paso a paso…"
                                            className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-ring transition-shadow leading-relaxed"
                                        />
                                        <p className="text-xs text-muted-foreground">Separa cada paso en una línea nueva</p>
                                    </div>
                                </CardContent>
                                <CardFooter className="flex items-center justify-between border-t border-border pt-5">
                                    <Button variant="outline" type="button" asChild>
                                        <Link href={`/recetario/${id}`}>Cancelar</Link>
                                    </Button>
                                    <Button type="submit" className="gap-2 px-6">
                                        <ChefHat className="h-4 w-4" />
                                        Guardar cambios
                                    </Button>
                                </CardFooter>
                            </Card>

                        </form>
                    </div>
                </div>

            </main>
        </div>
    )
}
