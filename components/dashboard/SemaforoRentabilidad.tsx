import { createClient } from '@/lib/supabase/server'
import { TrendingDown, TrendingUp } from 'lucide-react'

export async function SemaforoRentabilidad() {
  try {
    const supabase = await createClient()

    const { data } = await supabase
      .from('assemblies_with_financials')
      .select('id, title, margin_pct, margin_target_pct, margin_status')
      .eq('is_active', true)
      .eq('margin_status', 'below_target')
      .order('margin_pct', { ascending: true })
      .limit(5)

    const platos = data ?? []

    if (platos.length === 0) {
      return (
        <div className="rounded-xl border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/40 p-5 flex items-center gap-3">
          <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
          <p className="text-sm font-medium text-green-700 dark:text-green-300">
            Todos los platos por encima del objetivo ✓
          </p>
        </div>
      )
    }

    return (
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <TrendingDown className="h-5 w-5 text-red-500 shrink-0" />
          <h2 className="font-semibold text-foreground">Semáforo de rentabilidad</h2>
        </div>
        <ul className="space-y-2">
          {platos.map((p) => {
            const current = p.margin_pct ?? 0
            const target = p.margin_target_pct ?? 1
            const pct = Math.min(100, Math.max(0, (current / target) * 100))
            return (
              <li key={p.id} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-foreground truncate max-w-[60%]">{p.title}</span>
                  <span className="text-red-500 font-medium">
                    {current.toFixed(1)}% / {target.toFixed(1)}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-red-500" style={{ width: `${pct}%` }} />
                </div>
              </li>
            )
          })}
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
