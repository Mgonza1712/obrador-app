import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { FileText, AlertCircle, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export const metadata = {
    title: 'Revisión de Documentos | Obrador',
    description: 'Validación y revisión de documentos extraídos por la IA.',
}

export default async function RevisionPage() {
    const supabase = await createClient()

    const { data: documents, error } = await supabase
        .from('erp_documents')
        .select(`
      id,
      doc_type,
      document_date,
      document_number,
      total_amount,
      status,
      drive_url,
      erp_providers ( name ),
      erp_venues ( name ),
      erp_purchase_lines ( line_total_cost )
    `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
                <AlertCircle className="h-10 w-10 text-destructive" />
                <p className="text-sm text-muted-foreground">
                    Error al cargar documentos: {error.message}
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* ── Header ── */}
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Revisión de Documentos</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Valida y aprueba las extracciones de la IA antes de que ingresen al sistema.
                </p>
            </div>

            {/* ── Stats strip ── */}
            <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-yellow-500" />
                <span className="text-sm font-medium">
                    {documents?.length ?? 0} documento{documents?.length !== 1 ? 's' : ''} pendiente{documents?.length !== 1 ? 's' : ''}
                </span>
            </div>

            {/* ── Document list ── */}
            {!documents || documents.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed py-20 text-center">
                    <FileText className="h-12 w-12 text-muted-foreground/40" />
                    <div>
                        <p className="font-medium text-muted-foreground">No hay documentos pendientes</p>
                        <p className="mt-1 text-sm text-muted-foreground/60">Cuando la IA extraiga nuevos documentos aparecerán aquí.</p>
                    </div>
                </div>
            ) : (
                <div className="rounded-lg border border-border bg-card">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border">
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tipo</th>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Nº Documento</th>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Proveedor</th>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Local</th>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Fecha</th>
                                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Total</th>
                                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Estado</th>
                                <th className="px-4 py-3" />
                            </tr>
                        </thead>
                        <tbody>
                            {documents.map((doc) => (
                                <tr
                                    key={doc.id}
                                    className="border-b border-border last:border-0 transition-colors hover:bg-accent/40"
                                >
                                    <td className="px-4 py-3 font-medium capitalize">{doc.doc_type}</td>
                                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                                        {doc.document_number ?? '—'}
                                    </td>
                                    <td className="px-4 py-3">
                                        {doc.erp_providers?.name ?? <span className="text-muted-foreground/50">Sin proveedor</span>}
                                    </td>
                                    <td className="px-4 py-3">
                                        {doc.erp_venues?.name ?? <span className="text-muted-foreground/50">Sin local</span>}
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground">
                                        {doc.document_date
                                            ? new Date(doc.document_date).toLocaleDateString('es-ES', {
                                                day: '2-digit',
                                                month: 'short',
                                                year: 'numeric',
                                            })
                                            : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-right font-medium">
                                        {(() => {
                                            const amount = (!doc.total_amount || doc.total_amount === 0)
                                                ? (doc.erp_purchase_lines ?? []).reduce((sum, l) => sum + (l.line_total_cost ?? 0), 0)
                                                : doc.total_amount
                                            return amount > 0
                                                ? `$${amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`
                                                : '—'
                                        })()}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <Badge variant="outline" className="border-yellow-400 bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300">
                                            Pendiente
                                        </Badge>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <Link
                                            href={`/admin/revision/${doc.id}`}
                                            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
                                        >
                                            Revisar →
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
