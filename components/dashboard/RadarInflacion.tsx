import { createClient } from '@/lib/supabase/server'
import { Flame, ShieldCheck } from 'lucide-react'

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })

export async function RadarInflacion() {
  try {
    const supabase = await createClient()

    const { data } = await supabase
      .from('vw_dashboard_inflacion')
      .select('*')
      .eq('is_read', false)
      .order('pct_change', { ascending: false })
      .limit(3)

    const alertas = data ?? []

    if (alertas.length === 0) {
      return (
        <div className="rounded-xl border border-border bg-card p-5 flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-muted-foreground shrink-0" />
          <p className="text-sm text-muted-foreground">Sin subidas de precio recientes.</p>
        </div>
      )
    }

    return (
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-orange-500 shrink-0" />
          <h2 className="font-semibold text-foreground">Radar de inflación</h2>
        </div>
        <ul className="space-y-2">
          {alertas.map((a, i) => (
            <li key={i} className="flex items-center justify-between text-sm">
              <span className="font-medium text-foreground truncate max-w-[50%]">
                {a.ingredient_name ?? '—'}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-muted-foreground">
                  {eur.format(Number(a.old_value ?? 0))} → {eur.format(Number(a.new_value ?? 0))}
                </span>
                <span className="rounded-full bg-red-100 dark:bg-red-900/40 px-2 py-0.5 text-xs font-semibold text-red-600 dark:text-red-400">
                  +{Number(a.pct_change ?? 0).toFixed(1)}%
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    )
  } catch {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">No se pudo cargar este widget.</p>
      </div>
    )
  }
}
