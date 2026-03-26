import { createClient } from '@/lib/supabase/server'

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })

export async function TopFlopPlatos() {
  try {
    const supabase = await createClient()

    const [{ data: topData }, { data: flopData }] = await Promise.all([
      supabase
        .from('vw_dashboard_top_platos')
        .select('*')
        .order('rentabilidad_absoluta_30d', { ascending: false })
        .limit(3),
      supabase
        .from('vw_dashboard_top_platos')
        .select('*')
        .order('rentabilidad_absoluta_30d', { ascending: true })
        .limit(3),
    ])

    const top = topData ?? []
    const flop = flopData ?? []
    const allZero = [...top, ...flop].every((p) => (p.rentabilidad_absoluta_30d ?? 0) === 0)

    const renderItem = (p: Record<string, unknown>, key: string) => (
      <li key={key} className="flex items-center justify-between text-sm py-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate font-medium text-foreground">{String(p.title ?? p.nombre ?? '—')}</span>
          {!!p.categoria && (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              {String(p.categoria)}
            </span>
          )}
        </div>
        <span className="shrink-0 ml-2 font-semibold">
          {eur.format(Number(p.rentabilidad_absoluta_30d ?? p.margin_pct ?? 0))}
        </span>
      </li>
    )

    return (
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="bg-green-50 dark:bg-green-950/40 p-5 border-b border-border">
          <h2 className="font-semibold text-foreground mb-2">Top 3 🏆</h2>
          {allZero ? (
            <p className="text-xs text-muted-foreground">Sin datos de ventas registrados aún</p>
          ) : (
            <ul className="divide-y divide-border">
              {top.map((p, i) => renderItem(p as Record<string, unknown>, `top-${i}`))}
            </ul>
          )}
        </div>
        <div className="bg-red-50 dark:bg-red-950/40 p-5">
          <h2 className="font-semibold text-foreground mb-2">Flop 3 ⚠️</h2>
          {allZero ? (
            <p className="text-xs text-muted-foreground">Sin datos de ventas registrados aún</p>
          ) : (
            <ul className="divide-y divide-border">
              {flop.map((p, i) => renderItem(p as Record<string, unknown>, `flop-${i}`))}
            </ul>
          )}
        </div>
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
