'use client'

import { useState, useTransition } from 'react'
import { Pencil, Check, X, Loader2 } from 'lucide-react'
import { updateQuoteLineFormat } from '@/app/actions/presupuestos'

interface Props {
    priceHistoryId: string
    purchaseLineId: string
    envases: number | null
    contenido: number | null
    unitBase: string
    readonly?: boolean
    onUpdated?: (envases: number, contenido: number, costPerBase: number | null) => void
}

export default function FormatoEditor({
    priceHistoryId,
    purchaseLineId,
    envases,
    contenido,
    unitBase,
    readonly = false,
    onUpdated,
}: Props) {
    const [editing, setEditing] = useState(false)
    const [localEnvases, setLocalEnvases] = useState(envases?.toString() ?? '')
    const [localContenido, setLocalContenido] = useState(contenido?.toString() ?? '')
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)

    const hasValues = envases != null && contenido != null

    function handleSave() {
        const env = parseFloat(localEnvases)
        const cont = parseFloat(localContenido)
        if (isNaN(env) || env <= 0 || isNaN(cont) || cont <= 0) {
            setError('Valores deben ser positivos')
            return
        }
        setError(null)
        startTransition(async () => {
            const res = await updateQuoteLineFormat(priceHistoryId, purchaseLineId, env, cont)
            if (res.success) {
                setEditing(false)
                onUpdated?.(env, cont, res.costPerBase ?? null)
            } else {
                setError(res.error ?? 'Error al actualizar formato')
            }
        })
    }

    if (readonly || !editing) {
        return (
            <div className="flex items-center gap-1">
                {hasValues ? (
                    <span className="text-xs tabular-nums text-muted-foreground">
                        {envases} × {contenido} {unitBase}
                    </span>
                ) : (
                    <span className="text-xs text-amber-600 italic">Formato desconocido</span>
                )}
                {!readonly && (
                    <button
                        onClick={() => {
                            setLocalEnvases(envases?.toString() ?? '')
                            setLocalContenido(contenido?.toString() ?? '')
                            setEditing(true)
                        }}
                        className="ml-0.5 text-muted-foreground hover:text-foreground transition-colors"
                        title="Editar formato"
                    >
                        <Pencil className="h-3 w-3" />
                    </button>
                )}
            </div>
        )
    }

    return (
        <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
                <input
                    type="number"
                    min="0"
                    step="any"
                    value={localEnvases}
                    onChange={(e) => setLocalEnvases(e.target.value)}
                    placeholder="Env."
                    className="w-16 rounded border border-ring bg-background px-2 py-0.5 text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <span className="text-xs text-muted-foreground">×</span>
                <input
                    type="number"
                    min="0"
                    step="any"
                    value={localContenido}
                    onChange={(e) => setLocalContenido(e.target.value)}
                    placeholder="Cont."
                    className="w-16 rounded border border-ring bg-background px-2 py-0.5 text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <span className="text-xs text-muted-foreground">{unitBase}</span>
                <button
                    onClick={handleSave}
                    disabled={isPending}
                    className="text-green-600 hover:text-green-700 transition-colors"
                    title="Guardar"
                >
                    {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </button>
                <button
                    onClick={() => { setEditing(false); setError(null) }}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title="Cancelar"
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            </div>
            {error && <p className="text-[10px] text-red-600">{error}</p>}
        </div>
    )
}
