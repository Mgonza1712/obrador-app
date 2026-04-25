'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

type ActionResult<T = void> = { success: true; data?: T } | { success: false; error: string }

// ─── User profiles ───────────────────────────────────────────────────────────

export interface VenueSector {
    venue_id: string
    venue_name: string
    sector: string
}

export interface UserProfile {
    id: string
    email: string | null
    full_name: string | null
    role: string | null
    phone: string | null
    whatsapp_jid: string | null
    venue_sectors: VenueSector[]
    tenant_id: string | null
}

// ─── Auth guard ──────────────────────────────────────────────────────────────
// All admin actions must verify the caller is admin or owner before proceeding.

async function requireAdminRole(): Promise<{ tenantId: string } | null> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data: profile } = await supabase
        .from('profiles')
        .select('role, tenant_id')
        .eq('id', user.id)
        .single()
    if (!profile || !['admin', 'owner'].includes(profile.role ?? '')) return null
    return { tenantId: profile.tenant_id ?? '' }
}

export async function getAdminUsers(): Promise<UserProfile[]> {
    if (!await requireAdminRole()) return []
    // Use admin client to bypass RLS — caller verified above
    const admin = createAdminClient()

    const [{ data: profiles, error }, { data: venueSectors }, { data: venues }, { data: authData }] = await Promise.all([
        admin.from('profiles').select('id, full_name, role, phone, whatsapp_jid, tenant_id').order('full_name'),
        admin.from('user_venue_sectors').select('user_id, venue_id, sector'),
        admin.from('erp_venues').select('id, name'),
        admin.auth.admin.listUsers(),
    ])

    if (error || !profiles) return []

    const emailMap = new Map<string, string>(
        (authData?.users ?? []).map((u) => [u.id, u.email ?? ''])
    )

    // Build venue name lookup
    const venueMap = new Map<string, string>(
        (venues ?? []).map((v) => [v.id, v.name])
    )

    // Group venue_sectors by user_id
    const vsMap = new Map<string, VenueSector[]>()
    for (const vs of venueSectors ?? []) {
        const arr = vsMap.get(vs.user_id) ?? []
        arr.push({
            venue_id: vs.venue_id,
            venue_name: venueMap.get(vs.venue_id) ?? '',
            sector: vs.sector,
        })
        vsMap.set(vs.user_id, arr)
    }

    return profiles.map((p) => ({
        id: p.id,
        email: emailMap.get(p.id) ?? null,
        full_name: p.full_name,
        role: p.role,
        phone: p.phone,
        whatsapp_jid: p.whatsapp_jid,
        venue_sectors: vsMap.get(p.id) ?? [],
        tenant_id: p.tenant_id,
    }))
}

export async function updateUserProfile(
    userId: string,
    data: {
        full_name?: string
        role?: string
        phone?: string
    }
): Promise<ActionResult> {
    if (!await requireAdminRole()) return { success: false, error: 'Sin permisos' }
    const admin = createAdminClient()
    const { error } = await admin
        .from('profiles')
        .update(data)
        .eq('id', userId)
    if (error) return { success: false, error: error.message }
    revalidatePath('/admin/usuarios')
    return { success: true }
}

export async function updateUserVenueSectors(
    userId: string,
    venueSectors: { venue_id: string; sector: string }[]
): Promise<ActionResult> {
    if (!await requireAdminRole()) return { success: false, error: 'Sin permisos' }
    const admin = createAdminClient()

    // Delete existing scopes for this user
    const { error: delError } = await admin
        .from('user_venue_sectors')
        .delete()
        .eq('user_id', userId)
    if (delError) return { success: false, error: delError.message }

    // Insert new scopes
    if (venueSectors.length > 0) {
        const { error: insError } = await admin
            .from('user_venue_sectors')
            .insert(venueSectors.map((vs) => ({ user_id: userId, ...vs })))
        if (insError) return { success: false, error: insError.message }
    }

    revalidatePath('/admin/usuarios')
    return { success: true }
}

// Generate a PIZCA-XXXX link code, store it, and send via Evolution API bot instance
export async function sendWALinkCode(userId: string): Promise<ActionResult> {
    if (!await requireAdminRole()) return { success: false, error: 'Sin permisos' }
    const admin = createAdminClient()

    // Get user profile + tenant config
    const { data: profile } = await admin
        .from('profiles')
        .select('phone, tenant_id')
        .eq('id', userId)
        .single()

    if (!profile?.phone) return { success: false, error: 'El usuario no tiene número de teléfono' }
    if (!profile.tenant_id) return { success: false, error: 'Usuario sin tenant' }

    const { data: tenant } = await admin
        .from('erp_tenants')
        .select('evolution_api_url, evolution_bot_instance')
        .eq('id', profile.tenant_id)
        .single()

    if (!tenant?.evolution_api_url || !tenant?.evolution_bot_instance) {
        return { success: false, error: 'Evolution API no configurada para este tenant' }
    }

    // Generate 8-char alphanumeric code
    const code = Math.random().toString(36).substring(2, 6).toUpperCase() +
        Math.random().toString(36).substring(2, 6).toUpperCase()
    const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString()

    await admin
        .from('profiles')
        .update({ whatsapp_link_code: code, whatsapp_link_code_expires_at: expires })
        .eq('id', userId)

    // Normalize phone → WA number (strip +, spaces, dashes)
    const waNumber = profile.phone.replace(/[\s\-\+]/g, '')

    const apiKey = process.env.EVOLUTION_API_KEY ?? ''
    const res = await fetch(
        `${tenant.evolution_api_url}/message/sendText/${tenant.evolution_bot_instance}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: apiKey },
            body: JSON.stringify({
                number: waNumber,
                text: `Hola! Para vincular tu cuenta Pizca respondé este mensaje con el código:\n\n*PIZCA-${code}*\n\nExpira en 15 minutos.`,
            }),
        }
    )

    if (!res.ok) return { success: false, error: 'No se pudo enviar el mensaje de WhatsApp' }
    return { success: true }
}

// ─── Tenant WA config ─────────────────────────────────────────────────────────

export interface TenantConfig {
    id: string
    name: string
    evolution_api_url: string | null
    evolution_bot_instance: string | null
    evolution_ordering_instance: string | null
    chatwoot_inbox_id: number | null
    chatwoot_account_id: number | null
}

export async function getTenantConfig(): Promise<TenantConfig | null> {
    const supabase = await createClient()

    // Get tenant_id from current user's profile
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single()

    if (!profile?.tenant_id) return null

    const { data } = await supabase
        .from('erp_tenants')
        .select('id, name, evolution_api_url, evolution_bot_instance, evolution_ordering_instance, chatwoot_inbox_id, chatwoot_account_id')
        .eq('id', profile.tenant_id)
        .single()

    return data ?? null
}

export async function updateTenantWAConfig(data: {
    evolution_api_url?: string
    evolution_bot_instance?: string
    evolution_ordering_instance?: string
    chatwoot_inbox_id?: number | null
    chatwoot_account_id?: number | null
}): Promise<ActionResult> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'No autenticado' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single()

    if (!profile?.tenant_id) return { success: false, error: 'Sin tenant' }

    const { error } = await supabase
        .from('erp_tenants')
        .update(data)
        .eq('id', profile.tenant_id)

    if (error) return { success: false, error: error.message }
    revalidatePath('/admin/whatsapp')
    return { success: true }
}

// ─── Evolution API proxy (server-side, hides API key) ────────────────────────

export interface WAInstanceStatus {
    state: 'open' | 'connecting' | 'close' | 'qr'
    qrBase64: string | null
}

export async function getWAInstanceStatus(instanceName: string): Promise<WAInstanceStatus> {
    const apiUrl = process.env.EVOLUTION_API_URL
    const apiKey = process.env.EVOLUTION_API_KEY

    if (!apiUrl || !apiKey || !instanceName) {
        return { state: 'close', qrBase64: null }
    }

    try {
        const stateRes = await fetch(`${apiUrl}/instance/connectionState/${instanceName}`, {
            headers: { apikey: apiKey },
            cache: 'no-store',
        })

        if (!stateRes.ok) return { state: 'close', qrBase64: null }
        const stateData = await stateRes.json()
        const state = stateData?.instance?.state ?? 'close'

        if (state === 'open') return { state: 'open', qrBase64: null }

        // Not connected — fetch QR
        const qrRes = await fetch(`${apiUrl}/instance/connect/${instanceName}`, {
            headers: { apikey: apiKey },
            cache: 'no-store',
        })

        if (!qrRes.ok) return { state: 'connecting', qrBase64: null }
        const qrData = await qrRes.json()
        const qrBase64 = qrData?.qrcode?.base64 ?? null

        return { state: qrBase64 ? 'qr' : 'connecting', qrBase64 }
    } catch {
        return { state: 'close', qrBase64: null }
    }
}

// ─── Venues list ──────────────────────────────────────────────────────────────

export async function getVenues(): Promise<{ id: string; name: string }[]> {
    const supabase = await createClient()
    const { data } = await supabase
        .from('erp_venues')
        .select('id, name')
        .order('name')
    return data ?? []
}
