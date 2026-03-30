import { createClient } from '@/lib/supabase/server'
import { TrendingDown, TrendingUp } from 'lucide-react'
import Link from 'next/link'

export async function SemaforoRentabilidad() {
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

    const { data: assembliesStats } = await supabase
      .from('assemblies')
      .select('margin_pct, margin_target_pct, sale_price')
      .eq('tenant_id', tenantId)

    const bajosObjetivo = assembliesStats?.filter(a =>
      a.sale_price !== null &&
      a.margin_pct !== null &&
      a.margin_pct < (a.margin_target_pct ?? 0)
    ) ?? []

    if (bajosObjetivo.length === 0) {
      return (
        <Link
          href="/alertas-rentabilidad"
          className="block rounded-xl border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/40 p-5 flex items-center gap-3 hover:opacity-90 transition-opacity"
        >
          <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
          <p className="text-sm font-medium text-green-700 dark:text-green-300">
            Todos los platos por encima del objetivo ✓
          </p>
        </Link>
      )
    }

    return (
      <Link
        href="/alertas-rentabilidad"
        className="block rounded-xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/40 p-5 hover:opacity-90 transition-opacity"
      >
        <div className="flex items-center gap-3">
          <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />
          <p className="text-sm font-medium text-red-700 dark:text-red-300">
            {bajosObjetivo.length} plato{bajosObjetivo.length !== 1 ? 's' : ''} bajo objetivo →
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
