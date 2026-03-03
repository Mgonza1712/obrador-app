import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CalculadoraView from './CalculadoraView'

export default async function RecetaDetallePage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    const supabase = await createClient()

    // 1. Query receta
    const { data: receta, error: recetaError } = await supabase
        .from('recipes')
        .select('id, title, prep_time_minutes, base_yield, yield_unit, instructions')
        .eq('id', id)
        .single()

    if (recetaError || !receta) {
        notFound()
    }

    // 2. Query ingredientes vinculados a esta receta (incluye el id de la fila puente)
    const { data: ingredientesRaw } = await supabase
        .from('recipe_ingredients')
        .select('id, quantity, ingredients(name, unit)')
        .eq('recipe_id', id)

    const ingredientes = (ingredientesRaw ?? []).map((ri) => {
        const ing = Array.isArray(ri.ingredients) ? ri.ingredients[0] : ri.ingredients
        return {
            recipe_ingredient_id: ri.id as string,
            name: ing?.name ?? '—',
            unit: ing?.unit ?? '',
            quantity: ri.quantity as number,
        }
    })

    // 3. Obtener sesión para la query del catálogo
    const { data: { user } } = await supabase.auth.getUser()

    let catalogo: { name: string; unit: string }[] = []
    if (user) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('organization_id')
            .eq('id', user.id)
            .single()

        if (profile?.organization_id) {
            const { data: catalogoData } = await supabase
                .from('ingredients')
                .select('name, unit')
                .eq('organization_id', profile.organization_id)
                .order('name')

            catalogo = catalogoData ?? []
        }
    }

    return (
        <CalculadoraView
            receta={receta}
            ingredientes={ingredientes}
            catalogo={catalogo}
        />
    )
}
