import { createClient } from '@/lib/supabase/server'
import { FileText, Package } from 'lucide-react'
import Link from 'next/link'

export async function TopFlopPlatos() {
  try {
    const supabase = await createClient()

    const [
      { count: facturasPendientes },
      { count: albaranesHuerfanos },
    ] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('erp_documents')
        .select('id', { count: 'exact' })
        .eq('doc_type', 'Factura Resumen')
        .eq('status', 'pending'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('erp_documents')
        .select('id', { count: 'exact' })
        .eq('doc_type', 'Albaran')
        .is('parent_invoice_id', null),
    ])

    const pendientes = facturasPendientes ?? 0
    const huerfanos = albaranesHuerfanos ?? 0

    return (
      <div className="flex flex-col gap-4">
        {/* Widget A — Facturas Resumen pendientes */}
        <Link
          href="/documentos"
          className="block rounded-xl border p-5 hover:bg-accent/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <FileText
              className={`h-5 w-5 shrink-0 ${pendientes > 0 ? 'text-orange-500' : 'text-muted-foreground'}`}
            />
            <div>
              <p className={`text-sm font-medium ${pendientes > 0 ? 'text-orange-700 dark:text-orange-300' : 'text-muted-foreground'}`}>
                {pendientes > 0
                  ? `${pendientes} factura${pendientes !== 1 ? 's' : ''} resumen pendiente${pendientes !== 1 ? 's' : ''} →`
                  : 'Sin facturas resumen pendientes ✓'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Facturas Resumen por conciliar</p>
            </div>
          </div>
        </Link>

        {/* Widget B — Albaranes huérfanos */}
        <Link
          href="/documentos"
          className="block rounded-xl border p-5 hover:bg-accent/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Package
              className={`h-5 w-5 shrink-0 ${huerfanos > 0 ? 'text-amber-500' : 'text-muted-foreground'}`}
            />
            <div>
              <p className={`text-sm font-medium ${huerfanos > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}>
                {huerfanos > 0
                  ? `${huerfanos} albarán${huerfanos !== 1 ? 'es' : ''} sin conciliar →`
                  : 'Todos los albaranes conciliados ✓'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Albaranes sin vincular a factura</p>
            </div>
          </div>
        </Link>
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
