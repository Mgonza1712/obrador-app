'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function createRecipe(formData: FormData) {
    const supabase = await createClient()

    // 1. Verificar usuario autenticado
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
        redirect('/login')
    }

    // 2. Obtener organization_id desde la tabla profiles
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single()

    if (profileError || !profile?.organization_id) {
        throw new Error('No se encontró el perfil de organización del usuario.')
    }

    // 3. Parsear campos del formulario
    const title = formData.get('title') as string
    const prep_time_minutes = parseInt(formData.get('prep_time_minutes') as string)
    const base_yield = parseFloat(formData.get('base_yield') as string)
    const yield_unit = formData.get('yield_unit') as string
    const instructions = formData.get('instructions') as string

    // 4. Insertar en tabla recipes y obtener el id generado
    const { data: newRecipe, error: insertError } = await supabase
        .from('recipes')
        .insert({
            title,
            prep_time_minutes,
            base_yield,
            yield_unit,
            instructions,
            organization_id: profile.organization_id,
        })
        .select('id')
        .single()

    if (insertError || !newRecipe) {
        throw new Error(`Error al guardar la receta: ${insertError?.message}`)
    }

    // 5. Redirigir directamente a la vista de la nueva receta para agregar ingredientes
    revalidatePath('/recetario')
    redirect(`/recetario/${newRecipe.id}`)
}

export async function addIngredient(formData: FormData) {
    const supabase = await createClient()

    // 1. Verificar sesión
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) redirect('/login')

    // 2. Obtener organization_id
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single()

    if (profileError || !profile?.organization_id) {
        throw new Error('No se encontró el perfil de organización.')
    }

    const recipe_id = formData.get('recipe_id') as string
    const name = (formData.get('name') as string).trim().toLowerCase()
    const rawUnit = (formData.get('unit') as string).trim().toLowerCase()
    const rawQty = parseFloat(formData.get('quantity') as string)

    // ── Motor de conversión de unidades ──────────────────────────────────────
    // El catálogo always almacena en la unidad mínima (g, ml, un).
    let quantity = rawQty
    let unit = rawUnit

    if (rawUnit === 'kg') {
        quantity = rawQty * 1000
        unit = 'g'
    } else if (['l', 'litro', 'litros', 'liter', 'liters'].includes(rawUnit)) {
        quantity = rawQty * 1000
        unit = 'ml'
    }
    // g, ml, un y el resto se guardan tal cual

    // 3. Buscar si el ingrediente ya existe en la organización
    const { data: existing } = await supabase
        .from('ingredients')
        .select('id')
        .eq('organization_id', profile.organization_id)
        .ilike('name', name)
        .maybeSingle()

    let ingredientId: string

    if (existing?.id) {
        // Ya existe → reutilizarlo
        ingredientId = existing.id
    } else {
        // No existe → crearlo con la unidad mínima
        const { data: newIng, error: ingError } = await supabase
            .from('ingredients')
            .insert({
                name,
                unit,
                organization_id: profile.organization_id,
            })
            .select('id')
            .single()

        if (ingError || !newIng) {
            throw new Error(`Error al crear el ingrediente: ${ingError?.message}`)
        }
        ingredientId = newIng.id
    }

    // 4. Insertar en recipe_ingredients con la quantity ya convertida
    const { error: riError } = await supabase
        .from('recipe_ingredients')
        .insert({
            recipe_id,
            ingredient_id: ingredientId,
            quantity,           // valor convertido (ej. 500 si el usuario mandó 0.5 kg)
        })

    if (riError) {
        throw new Error(`Error al vincular el ingrediente: ${riError.message}`)
    }

    // 5. Invalidar la vista de la receta
    revalidatePath(`/recetario/${recipe_id}`)
}

export async function removeIngredient(formData: FormData) {
    const supabase = await createClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) redirect('/login')

    const recipe_ingredient_id = formData.get('recipe_ingredient_id') as string
    const recipe_id = formData.get('recipe_id') as string

    const { error } = await supabase
        .from('recipe_ingredients')
        .delete()
        .eq('id', recipe_ingredient_id)

    if (error) {
        throw new Error(`Error al eliminar el ingrediente: ${error.message}`)
    }

    revalidatePath(`/recetario/${recipe_id}`)
}

export async function deleteRecipe(formData: FormData) {
    const supabase = await createClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) redirect('/login')

    const recipe_id = formData.get('recipe_id') as string

    const { error } = await supabase
        .from('recipes')
        .delete()
        .eq('id', recipe_id)

    if (error) {
        throw new Error(`Error al eliminar la receta: ${error.message}`)
    }

    revalidatePath('/recetario')
    redirect('/recetario')
}

export async function updateRecipe(formData: FormData) {
    const supabase = await createClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) redirect('/login')

    const recipe_id = formData.get('recipe_id') as string
    const title = formData.get('title') as string
    const prep_time_minutes = parseInt(formData.get('prep_time_minutes') as string)
    const base_yield = parseFloat(formData.get('base_yield') as string)
    const yield_unit = formData.get('yield_unit') as string
    const instructions = formData.get('instructions') as string

    const { error } = await supabase
        .from('recipes')
        .update({ title, prep_time_minutes, base_yield, yield_unit, instructions })
        .eq('id', recipe_id)

    if (error) {
        throw new Error(`Error al actualizar la receta: ${error.message}`)
    }

    revalidatePath(`/recetario/${recipe_id}`)
    redirect(`/recetario/${recipe_id}`)
}

// ── Actualización masiva de cantidades de ingredientes ──────────────────────
// Recibe el array final del borrador directamente (no FormData),
// lo que permite llamarla desde el cliente con useTransition.
export async function updateRecipeIngredientsBulk(
    recipeId: string,
    ingredients: { recipe_ingredient_id: string; quantity: number; unit: string }[],
    deletedIds: string[],
) {
    const supabase = await createClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) redirect('/login')

    // Motor de conversión de unidades
    function convertUnit(qty: number, unit: string) {
        const u = unit.trim().toLowerCase()
        if (u === 'kg') return { quantity: qty * 1000 }
        if (['l', 'litro', 'litros', 'liter', 'liters'].includes(u)) return { quantity: qty * 1000 }
        return { quantity: qty }
    }

    // 1. Eliminar los ingredientes borrados en el borrador
    if (deletedIds.length > 0) {
        await supabase.from('recipe_ingredients').delete().in('id', deletedIds)
    }

    // 2. Actualizar cantidades de los ingredientes restantes
    const updates = ingredients.map(({ recipe_ingredient_id, quantity, unit }) => {
        const { quantity: convertedQty } = convertUnit(quantity, unit)
        return supabase
            .from('recipe_ingredients')
            .update({ quantity: convertedQty })
            .eq('id', recipe_ingredient_id)
    })

    await Promise.all(updates)

    revalidatePath(`/recetario/${recipeId}`)
}

