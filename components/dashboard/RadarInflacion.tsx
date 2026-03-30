import { createClient } from '@/lib/supabase/server'
import { Bell, Settings, ShieldCheck } from 'lucide-react'
import Link from 'next/link'

export async function RadarInflacion() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single()

    const tenantId = profile?.tenant_id
    if (!tenantId) return null

    const { count: alertasNoLeidas } = await supabase
      .from('cost_alerts')
      .select('id', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('is_read', false)

    if (!alertasNoLeidas || alertasNoLeidas === 0) {
      return (
        <Link
          href="/alertas-rentabilidad"
          className="block rounded-xl border border-border bg-card p-5 hover:opacity-80 transition-opacity"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-muted-foreground shrink-0" />
              <p className="text-sm text-muted-foreground">Sin alertas pendientes ✓</p>
            </div>
            <Settings className="h-4 w-4 text-muted-foreground/60 shrink-0" />
          </div>
        </Link>
      )
    }

    return (
      <Link
        href="/alertas-rentabilidad"
        className="block rounded-xl border border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/40 p-5 hover:opacity-90 transition-opacity"
      >
        <div className="flex items-center gap-3">
          <Bell className="h-5 w-5 text-orange-600 dark:text-orange-400 shrink-0" />
          <p className="text-sm font-medium text-orange-700 dark:text-orange-300">
            {alertasNoLeidas} alerta{alertasNoLeidas !== 1 ? 's' : ''} pendiente{alertasNoLeidas !== 1 ? 's' : ''} →
          </p>
        </div>
      </Link>
    )
  } catch {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">No se pudo cargar este widget.</p>
      </div>
    )
  }
}
