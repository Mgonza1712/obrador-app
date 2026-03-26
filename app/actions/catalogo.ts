'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { AliasEdit, ItemEditData } from '@/components/catalog/ItemEditDrawer'

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getItemWithAliases(itemId: string): Promise<ItemEditData | null> {
    const supabase = await createClient()

    const [itemResult, aliasesResult] = await Promise.all([
        supabase
            .from('erp_master_items')
            .select('id, official_name, category, base_unit')
            .eq('id', itemId)
            .single(),
        supabase
            .from('erp_item_aliases')
            .select('id, provider_id, raw_name, unidades_por_pack, cantidad_por_unidad, formato, conversion_multiplier, erp_providers(name)')
            .eq('master_item_id', itemId)
            .order('id'),
    ])

    if (itemResult.error || !itemResult.data) return null

    const item = itemResult.data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aliases: AliasEdit[] = (aliasesResult.data ?? []).map((a: any) => ({
        id: a.id,
        provider_id: a.provider_id,
        provider_name: a.erp_providers?.name ?? 'Proveedor desconocido',
        raw_name: a.raw_name ?? '',
        unidades_por_pack: a.unidades_por_pack ?? 1,
        cantidad_por_unidad: a.cantidad_por_unidad ?? 1,
        formato: a.formato ?? '',
        conversion_multiplier: a.conversion_multiplier ?? (a.unidades_por_pack ?? 1) * (a.cantidad_por_unidad ?? 1),
    }))

    return {
        id: item.id,
        official_name: item.official_name,
        category: item.category ?? null,
        base_unit: item.base_unit,
        aliases,
    }
}

// ── Update ────────────────────────────────────────────────────────────────────

const UpdateItemSchema = z.object({
    itemId: z.string().uuid(),
    officialName: z.string().min(1, 'El nombre oficial es requerido'),
    category: z.string().nullable(),
    baseUnit: z.enum(['ml', 'g', 'ud']),
    aliases: z.array(z.object({
        id: z.string().uuid(),
        unidades_por_pack: z.number().nonnegative(),
        cantidad_por_unidad: z.number().nonnegative(),
        formato: z.string(),
        conversion_multiplier: z.number().nonnegative(),
    })),
})

type UpdateItemInput = z.infer<typeof UpdateItemSchema>
type ActionResult = { success: true } | { success: false; error: string }

export async function updateItemMetadata(input: UpdateItemInput): Promise<ActionResult> {
    const parsed = UpdateItemSchema.safeParse(input)
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0].message }
    }

    const { itemId, officialName, category, baseUnit, aliases } = parsed.data
    const supabase = await createClient()

    // Update master item
    const { error: itemErr } = await supabase
        .from('erp_master_items')
        .update({ official_name: officialName, category: category, base_unit: baseUnit })
        .eq('id', itemId)

    if (itemErr) return { success: false, error: `Error al actualizar producto: ${itemErr.message}` }

    // Update each alias
    for (const alias of aliases) {
        const { error } = await supabase
            .from('erp_item_aliases')
            .update({
                unidades_por_pack: alias.unidades_por_pack,
                cantidad_por_unidad: alias.cantidad_por_unidad,
                formato: alias.formato || null,
                conversion_multiplier: alias.conversion_multiplier,
            })
            .eq('id', alias.id)
        if (error) return { success: false, error: `Error al actualizar alias: ${error.message}` }
    }

    revalidatePath('/catalogo')
    return { success: true }
}

// ── Preferred provider ────────────────────────────────────────────────────────

export async function setPreferredProvider(priceHistoryId: string, masterItemId: string) {
    const supabase = await createClient()

    // Clear all preferred flags for this item's active entries
    const { error: e1 } = await supabase
        .from('erp_price_history')
        .update({ is_preferred: false })
        .eq('master_item_id', masterItemId)
        .eq('status', 'active')

    if (e1) throw new Error(e1.message)

    // Mark the selected entry as preferred
    const { error: e2 } = await supabase
        .from('erp_price_history')
        .update({ is_preferred: true })
        .eq('id', priceHistoryId)

    if (e2) throw new Error(e2.message)
}

export async function clearPreferredProvider(masterItemId: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('erp_price_history')
        .update({ is_preferred: false })
        .eq('master_item_id', masterItemId)
        .eq('status', 'active')

    if (error) throw new Error(error.message)
}
