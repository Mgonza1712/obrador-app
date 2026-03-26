import { createClient } from '@/lib/supabase/server'
import { CheckCircle2, Inbox } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export async function BandejaAtencion() {
  try {
    const supabase = await createClient()

    const [{ count: draftCount }, { count: orphanCount }] = await Promise.all([
      supabase
        .from('erp_documents')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'draft'),
      supabase
        .from('erp_purchase_lines')
        .select('id', { count: 'exact', head: true })
        .is('master_item_id', null),
    ])

    const facturas = draftCount ?? 0
    const lineas = orphanCount ?? 0

    if (facturas === 0 && lineas === 0) {
      return (
        <div className="rounded-xl border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/40 p-5 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
          <p className="text-sm font-medium text-green-700 dark:text-green-300">Todo al día ✓</p>
        </div>
      )
    }

    return (
      <div className="rounded-xl border border-l-4 border-red-500 bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Inbox className="h-5 w-5 text-red-500 shrink-0" />
          <h2 className="font-semibold text-foreground">Bandeja de atención</h2>
        </div>
        <ul className="space-y-1 text-sm text-muted-foreground">
          {facturas > 0 && (
            <li className="text-red-600 dark:text-red-400 font-medium">
              {facturas} {facturas === 1 ? 'factura pendiente' : 'facturas pendientes'} de revisión
            </li>
          )}
          {lineas > 0 && (
            <li className="text-red-600 dark:text-red-400 font-medium">
              {lineas} {lineas === 1 ? 'línea sin producto' : 'líneas sin producto'} asignado
            </li>
          )}
        </ul>
        <Button asChild variant="destructive" size="sm">
          <Link href="/admin/revision">Ir a revisión</Link>
        </Button>
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
