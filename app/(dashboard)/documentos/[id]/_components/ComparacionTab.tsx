'use client'

import { useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { activateQuotePrices } from '@/app/actions/presupuestos'
import ProveedorVincularAlert from './ProveedorVincularAlert'
import ComparisonTable from './ComparisonTable'
import type { ComparisonRowData } from './ComparisonRow'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Provider {
    id: string
    name: string
    channel: string | null
}

interface MasterItemOption {
    id: string
    official_name: string
    base_unit: string
    category: string | null
}

export interface ComparacionData {
    documentId: string
    docStatus: string
    quotePath: number | null   // 1 = auto, 2 = comparación, 3 = comparación + revisión
    providerId: string | null
    providerName: string | null
    extractedProviderName: string | null  // name from ai_interpretation if provider_id=NULL
    rows: ComparisonRowData[]
    providers: Provider[]
    masterItems: MasterItemOption[]
}

// ── Camino 1 Banner ───────────────────────────────────────────────────────────

function Camino1Banner({ documentId, docStatus }: { documentId: string; docStatus: string }) {
    const [isActivating, setIsActivating] = useState(false)
    const [activated, setActivated] = useState(docStatus === 'approved')
    const [error, setError] = useState<string | null>(null)
    const [setPreferred, setSetPreferredState] = useState(true)

    async function handleActivate() {
        setIsActivating(true)
        setError(null)
        const res = await activateQuotePrices(documentId, setPreferred)
        if (res.success) {
            setActivated(true)
        } else {
            setError(res.error ?? 'Error al activar precios')
        }
        setIsActivating(false)
    }

    if (activated) {
        return (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:bg-green-950/30 dark:text-green-300">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Precios activados. Documento aprobado.
            </div>
        )
    }

    return (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:bg-blue-950/20 dark:border-blue-800">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="font-medium text-blue-800 dark:text-blue-200">
                        Presupuesto procesado automáticamente
                    </p>
                    <p className="mt-0.5 text-sm text-blue-700 dark:text-blue-300">
                        Todos los productos están en el catálogo y tienen confianza alta. Revisa la tabla y activa los precios cuando lo confirmes.
                    </p>
                    <label className="mt-2 flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={setPreferred}
                            onChange={(e) => setSetPreferredState(e.target.checked)}
                            className="rounded accent-blue-600"
                        />
                        Marcar como proveedor preferido para estos productos
                    </label>
                    {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
                </div>
                <Button
                    onClick={handleActivate}
                    disabled={isActivating}
                    className="shrink-0"
                >
                    {isActivating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Activar precios
                </Button>
            </div>
        </div>
    )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ComparacionTab({ data }: { data: ComparacionData }) {
    const [providerId, setProviderId] = useState(data.providerId)
    const [providerName, setProviderName] = useState(data.providerName)

    const isDraft = data.docStatus !== 'approved'
    const isLocked = providerId === null  // Camino 3: provider must be linked first

    return (
        <div className="space-y-4">
            {/* Paso 0: vincular proveedor si es NULL */}
            {isLocked && (
                <ProveedorVincularAlert
                    documentId={data.documentId}
                    extractedProviderName={data.extractedProviderName}
                    providers={data.providers}
                    onLinked={(id, name) => {
                        setProviderId(id)
                        setProviderName(name)
                    }}
                />
            )}

            {/* Camino 1 banner (auto-procesado) */}
            {data.quotePath === 1 && isDraft && !isLocked && (
                <Camino1Banner documentId={data.documentId} docStatus={data.docStatus} />
            )}

            {/* Aprobado */}
            {!isDraft && (
                <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:bg-green-950/30 dark:text-green-300">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    Presupuesto aprobado. Tabla en modo lectura.
                </div>
            )}

            {/* Comparison table — shown once provider is linked */}
            {(!isLocked || !isDraft) && data.rows.length > 0 && (
                <ComparisonTable
                    documentId={data.documentId}
                    rows={data.rows}
                    masterItems={data.masterItems}
                    isDraft={isDraft && (data.quotePath !== 1)}
                    providerId={providerId}
                />
            )}

            {data.rows.length === 0 && !isLocked && (
                <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
                    Sin líneas con producto identificado en este presupuesto.
                </div>
            )}
        </div>
    )
}
