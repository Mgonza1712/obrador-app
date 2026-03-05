'use client'

import { useState, useRef, useTransition } from 'react'
import Link from 'next/link'
import Sidebar from '@/components/layout/Sidebar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
    ArrowLeft, Clock, Utensils, Scale,
    Minus, Plus, PlusCircle, Trash2, Pencil, Settings, Save, X, Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { addIngredient, removeIngredient, deleteRecipe, updateRecipeIngredientsBulk } from '@/app/actions/recipe'

// ─── Tipos ────────────────────────────────────────────────────────────────────
type Ingrediente = {
    recipe_ingredient_id: string
    name: string
    unit: string
    quantity: number
}

type CatalogoItem = { name: string; unit: string }

type Receta = {
    id: string
    title: string
    prep_time_minutes: number | null
    base_yield: number
    yield_unit: string | null
    instructions: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatCantidad(quantity: number, base: number, porciones: number, unit: string): string {
    const scaled = (quantity / base) * porciones
    const u = unit.toLowerCase()
    if (u === 'g' && scaled >= 1000) return `${parseFloat((scaled / 1000).toPrecision(3))} kg`
    if (u === 'ml' && scaled >= 1000) return `${parseFloat((scaled / 1000).toPrecision(3))} L`
    return `${parseFloat(scaled.toPrecision(3))} ${unit}`
}

// ─── View ─────────────────────────────────────────────────────────────────────
export default function CalculadoraView({
    receta,
    ingredientes,
    catalogo,
}: {
    receta: Receta
    ingredientes: Ingrediente[]
    catalogo: CatalogoItem[]
}) {
    // ── Calculadora ──
    const [inputVal, setInputVal] = useState(String(receta.base_yield))
    const porciones = Math.max(1, parseInt(inputVal) || 0)
    const unitRef = useRef<HTMLInputElement>(null)
    const formRef = useRef<HTMLFormElement>(null)

    // ── Modo edición (Draft State) ──
    const [isEditing, setIsEditing] = useState(false)
    const [draft, setDraft] = useState<Ingrediente[]>([])
    const [deletedIds, setDeletedIds] = useState<string[]>([])
    const [isPending, startTransition] = useTransition()

    // ── Estado de guardado del formulario de ingrediente ──
    const [isSaving, setIsSaving] = useState(false)

    const handleAddIngredient = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setIsSaving(true)
        try {
            const formData = new FormData(e.currentTarget)
            await addIngredient(formData)
            formRef.current?.reset()
        } finally {
            setIsSaving(false)
        }
    }

    const startEditing = () => {
        setDraft([...ingredientes])   // copia actual como borrador
        setDeletedIds([])
        setIsEditing(true)
    }

    const cancelEditing = () => {
        setIsEditing(false)
        setDraft([])
        setDeletedIds([])
    }

    const updateDraft = (id: string, field: 'quantity' | 'unit', value: string) => {
        setDraft(prev =>
            prev.map(ing =>
                ing.recipe_ingredient_id === id
                    ? { ...ing, [field]: field === 'quantity' ? parseFloat(value) || 0 : value }
                    : ing
            )
        )
    }

    // Eliminación silenciosa: solo filtra el draft, no toca la BD aún
    const removeFromDraft = (id: string) => {
        setDraft(prev => prev.filter(ing => ing.recipe_ingredient_id !== id))
        setDeletedIds(prev => [...prev, id])
    }

    const handleSaveConfirm = () => {
        startTransition(async () => {
            await updateRecipeIngredientsBulk(receta.id, draft, deletedIds)
            setIsEditing(false)
            setDraft([])
            setDeletedIds([])
        })
    }

    // ── Calculadora helpers ──
    const cambiar = (delta: number) =>
        setInputVal(prev => String(Math.max(1, (parseInt(prev) || 1) + delta)))
    const handleBlur = () => {
        if (!inputVal || parseInt(inputVal) < 1) setInputVal('1')
    }
    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.trim().toLowerCase()
        const match = catalogo.find(c => c.name.toLowerCase() === val)
        if (match && unitRef.current) unitRef.current.value = match.unit
    }

    const pasos = receta.instructions
        ? receta.instructions.split('\n').map(l => l.trim()).filter(Boolean)
        : []

    return (
        <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-background">
            <Sidebar />
            <main className="flex flex-1 flex-col overflow-y-auto pb-16 md:pb-0">

                {/* ── Header ── */}
                <div className="border-b border-border bg-background/80 px-4 py-4 md:px-8 md:py-5 backdrop-blur">
                    <Link
                        href="/recetario"
                        className="mb-3 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Volver al Recetario
                    </Link>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-3">
                            <h1 className="text-2xl font-bold tracking-tight text-foreground">{receta.title}</h1>
                            {receta.yield_unit && <Badge variant="secondary">{receta.yield_unit}</Badge>}
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                {receta.prep_time_minutes && (
                                    <span className="flex items-center gap-1">
                                        <Clock className="h-3.5 w-3.5" />
                                        {receta.prep_time_minutes} min
                                    </span>
                                )}
                                <span className="flex items-center gap-1">
                                    <Utensils className="h-3.5 w-3.5" />
                                    Base: {receta.base_yield} {receta.yield_unit}
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" className="gap-1.5" asChild>
                                <Link href={`/recetario/${receta.id}/editar`}>
                                    <Pencil className="h-3.5 w-3.5" />
                                    Editar
                                </Link>
                            </Button>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive">
                                        <Trash2 className="h-3.5 w-3.5" />
                                        Eliminar
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>¿Eliminar esta receta?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            ¿Estás seguro que deseas eliminar{' '}
                                            <strong className="text-foreground">&quot;{receta.title}&quot;</strong>{' '}
                                            y todos sus ingredientes? Esta acción no se puede deshacer.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                        <form action={deleteRecipe}>
                                            <input type="hidden" name="recipe_id" value={receta.id} />
                                            <AlertDialogAction type="submit" className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                                Eliminar receta
                                            </AlertDialogAction>
                                        </form>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </div>
                </div>

                <div className="grid flex-1 grid-cols-1 gap-4 p-4 md:gap-6 md:p-6 lg:grid-cols-2">

                    {/* ── Calculadora ── */}
                    <Card className={`h-fit border-border shadow-sm transition-opacity duration-200 ${isEditing ? 'opacity-40 pointer-events-none' : ''}`}>
                        <CardHeader className="pb-4">
                            <CardTitle className="flex items-center gap-2 text-base font-semibold">
                                <Scale className="h-5 w-5 text-amber-500" />
                                Calculadora de Porciones
                                {isEditing && <Badge variant="secondary" className="ml-auto text-xs">Bloqueada</Badge>}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col items-center gap-6 py-6">
                            {isEditing ? (
                                <div className="flex flex-col items-center gap-3">
                                    <div className="flex h-28 w-28 items-center justify-center rounded-xl border border-border bg-muted/50">
                                        <span className="text-5xl font-extrabold tabular-nums text-muted-foreground">
                                            {receta.base_yield}
                                        </span>
                                    </div>
                                    <span className="text-xs text-muted-foreground">{receta.yield_unit}</span>
                                    <p className="flex items-center gap-1.5 rounded-md bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-600">
                                        <Settings className="h-3.5 w-3.5" />
                                        Editando receta base
                                    </p>
                                </div>
                            ) : (
                                <>
                                    <p className="text-center text-sm font-medium text-muted-foreground">
                                        ¿Cuántas {receta.yield_unit ?? 'porciones'} vas a preparar hoy?
                                    </p>
                                    <div className="flex items-center gap-5">
                                        <Button variant="outline" size="icon" className="h-11 w-11 rounded-full" onClick={() => cambiar(-1)}>
                                            <Minus className="h-4 w-4" />
                                        </Button>
                                        <div className="flex flex-col items-center">
                                            <input
                                                type="number" min={1} value={inputVal}
                                                onChange={e => setInputVal(e.target.value)}
                                                onBlur={handleBlur}
                                                className="w-28 rounded-xl border border-border bg-muted/30 px-3 py-3 text-center text-5xl font-extrabold tracking-tight text-foreground outline-none focus:ring-2 focus:ring-ring"
                                            />
                                            <span className="mt-1.5 text-xs text-muted-foreground">{receta.yield_unit}</span>
                                        </div>
                                        <Button variant="outline" size="icon" className="h-11 w-11 rounded-full" onClick={() => cambiar(1)}>
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <div className="rounded-lg bg-muted/50 px-5 py-2.5 text-sm text-muted-foreground">
                                        Factor:{' '}
                                        <strong className="text-foreground">
                                            ×{parseFloat((porciones / receta.base_yield).toPrecision(3))}
                                        </strong>
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>

                    {/* ── Ingredientes ── */}
                    <Card className="h-fit border-border shadow-sm">
                        <CardHeader className="pb-4">
                            <CardTitle className="flex items-center gap-2 text-base font-semibold">
                                🧂 Ingredientes
                                <span className="ml-1 text-sm font-normal text-muted-foreground">
                                    {isEditing ? '— modo edición base' : `para ${porciones} ${receta.yield_unit}`}
                                </span>
                                <Button
                                    variant="ghost" size="icon"
                                    className={`ml-auto h-7 w-7 ${isEditing ? 'text-primary' : 'text-muted-foreground'}`}
                                    onClick={isEditing ? cancelEditing : startEditing}
                                    title={isEditing ? 'Cancelar' : 'Editar cantidades base'}
                                >
                                    <Settings className="h-4 w-4" />
                                </Button>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-0">

                            {/* ── Lista MODO NORMAL ── */}
                            {!isEditing && (
                                <>
                                    {ingredientes.length > 0 ? (
                                        <ul className="divide-y divide-border">
                                            {ingredientes.map((ing) => (
                                                <li key={ing.recipe_ingredient_id} className="flex items-center justify-between gap-2 py-3">
                                                    <span className="flex-1 text-sm font-medium capitalize text-foreground">{ing.name}</span>
                                                    <span className="tabular-nums text-sm font-semibold text-foreground">
                                                        {formatCantidad(ing.quantity, receta.base_yield, porciones, ing.unit)}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="py-4 text-center text-sm text-muted-foreground">
                                            Sin ingredientes aún. Añade el primero ↓
                                        </p>
                                    )}
                                </>
                            )}

                            {/* ── Lista MODO EDICIÓN ── */}
                            {isEditing && (
                                <>
                                    {draft.length > 0 ? (
                                        <ul className="divide-y divide-border">
                                            {draft.map((ing) => (
                                                <li key={ing.recipe_ingredient_id} className="flex items-center gap-2 py-3">
                                                    <span className="flex-1 text-sm font-medium capitalize text-foreground">{ing.name}</span>
                                                    <input
                                                        type="number" step="any" min="0"
                                                        value={ing.quantity}
                                                        onChange={e => updateDraft(ing.recipe_ingredient_id, 'quantity', e.target.value)}
                                                        className="w-20 rounded-md border border-border bg-background px-2 py-1 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-ring"
                                                    />
                                                    <input
                                                        type="text" value={ing.unit}
                                                        onChange={e => updateDraft(ing.recipe_ingredient_id, 'unit', e.target.value)}
                                                        className="w-14 rounded-md border border-border bg-background px-2 py-1 text-center text-sm outline-none focus:ring-2 focus:ring-ring"
                                                    />
                                                    {/* Eliminación silenciosa: solo filtra el draft */}
                                                    <button
                                                        type="button"
                                                        onClick={() => removeFromDraft(ing.recipe_ingredient_id)}
                                                        className="ml-1 rounded-md p-1.5 text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
                                                        title="Quitar del borrador"
                                                    >
                                                        <X className="h-3.5 w-3.5" />
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="py-4 text-center text-sm text-muted-foreground">
                                            No quedan ingredientes en el borrador.
                                        </p>
                                    )}

                                    {/* Botones de acción del modo edición */}
                                    <div className="mt-4 flex items-center gap-2">
                                        <Button
                                            variant="ghost" size="sm"
                                            className="gap-1.5 text-muted-foreground"
                                            onClick={cancelEditing}
                                            disabled={isPending}
                                        >
                                            <X className="h-3.5 w-3.5" />
                                            Cancelar edición
                                        </Button>

                                        {/* Único AlertDialog de confirmación */}
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button className="ml-auto gap-2" disabled={isPending}>
                                                    {isPending
                                                        ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando...</>
                                                        : <><Save className="h-4 w-4" /> Guardar Cambios</>
                                                    }
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>¿Guardar cambios?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        ¿Confirmas guardar las nuevas cantidades y eliminaciones para la receta base de{' '}
                                                        <strong className="text-foreground">{receta.base_yield} {receta.yield_unit}</strong>?
                                                        {deletedIds.length > 0 && (
                                                            <span className="mt-1 block text-destructive">
                                                                Se eliminarán {deletedIds.length} ingrediente(s) de la receta.
                                                            </span>
                                                        )}
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                    <AlertDialogAction onClick={handleSaveConfirm} disabled={isPending}>
                                                        Confirmar y Guardar
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                </>
                            )}

                            {/* ── Datalist + Formulario Agregar (solo en modo normal) ── */}
                            {!isEditing && (
                                <>
                                    <datalist id="ing-catalog">
                                        {catalogo.map(item => <option key={item.name} value={item.name} />)}
                                    </datalist>

                                    <form ref={formRef} onSubmit={handleAddIngredient} className="mt-5 flex flex-col gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-4">
                                        <input type="hidden" name="recipe_id" value={receta.id} />
                                        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                            <PlusCircle className="h-3.5 w-3.5" />
                                            Agregar ingrediente
                                        </p>
                                        <div className="grid grid-cols-2 gap-2">
                                            <input
                                                name="name" required list="ing-catalog" autoComplete="off"
                                                placeholder="Nombre" onChange={handleNameChange}
                                                className="col-span-2 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                                            />
                                            <input
                                                name="quantity" type="number" step="any" min="0" required
                                                placeholder={`Cant. p/ ${receta.base_yield} ${receta.yield_unit}`}
                                                className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                                            />
                                            <input
                                                ref={unitRef} name="unit" required placeholder="Unidad (g, ml, un…)"
                                                className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                                            />
                                        </div>
                                        <Button type="submit" variant="outline" size="sm" className="w-full gap-2" disabled={isSaving}>
                                            {isSaving
                                                ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando...</>
                                                : <><PlusCircle className="h-4 w-4" /> Guardar ingrediente</>
                                            }
                                        </Button>
                                        <p className="text-center text-xs leading-relaxed text-muted-foreground/70">
                                            💡 Recomendación: Utiliza unidades mínimas{' '}
                                            <span className="font-medium">(g, ml, un)</span>.
                                            El sistema convierte kg → g y l → ml automáticamente.
                                        </p>
                                    </form>
                                </>
                            )}

                        </CardContent>
                    </Card>

                    {/* ── Instrucciones ── */}
                    {pasos.length > 0 && (
                        <Card className="border-border shadow-sm lg:col-span-2">
                            <CardHeader className="pb-4">
                                <CardTitle className="text-base font-semibold">📋 Instrucciones</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ol className="flex flex-col gap-4">
                                    {pasos.map((paso, i) => (
                                        <li key={i} className="flex items-start gap-4">
                                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                                                {i + 1}
                                            </span>
                                            <p className="pt-0.5 text-sm leading-relaxed text-foreground">{paso}</p>
                                        </li>
                                    ))}
                                </ol>
                            </CardContent>
                        </Card>
                    )}

                    {/* Eliminación individual (modo normal) via Server Action */}
                    {!isEditing && ingredientes.map(ing => (
                        <AlertDialog key={`del-${ing.recipe_ingredient_id}`}>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>¿Eliminar ingrediente?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        ¿Estás seguro que deseas eliminar{' '}
                                        <strong className="capitalize text-foreground">&quot;{ing.name}&quot;</strong>?
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <form action={removeIngredient}>
                                        <input type="hidden" name="recipe_ingredient_id" value={ing.recipe_ingredient_id} />
                                        <input type="hidden" name="recipe_id" value={receta.id} />
                                        <AlertDialogAction type="submit" className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                            Eliminar
                                        </AlertDialogAction>
                                    </form>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    ))}

                </div>
            </main>
        </div>
    )
}
