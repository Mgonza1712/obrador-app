'use client'

import { useState, useTransition, useId, useEffect } from 'react'
import { X, Save, Loader2, AlertCircle, CheckCircle } from 'lucide-react'
import { BASE_UNITS, PRODUCT_CATEGORIES } from '@/lib/constants'
import { getItemWithAliases, updateItemMetadata } from '@/app/actions/catalogo'

// ── Types ─────────────────────────────────────────────────────────────────────

export type AliasEdit = {
    id: string
    provider_id: string | null
    provider_name: string
    raw_name: string
    envases_por_formato: number
    contenido_por_envase: number
    formato_compra: string
    conversion_multiplier: number
}

export type ItemEditData = {
    id: string
    official_name: string
    category: string | null
    base_unit: string
    aliases: AliasEdit[]
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ItemEditDrawerProps {
    itemId: string | null
    onClose: () => void
    onSaved?: () => void
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ItemEditDrawer({ itemId, onClose, onSaved }: ItemEditDrawerProps) {
    const uid = useId()
    const [isPending, startTransition] = useTransition()
    const [isLoading, setIsLoading] = useState(false)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [saveError, setSaveError] = useState<string | null>(null)
    const [saveSuccess, setSaveSuccess] = useState(false)

    // Item fields
    const [officialName, setOfficialName] = useState('')
    const [category, setCategory] = useState<string>('')
    const [baseUnit, setBaseUnit] = useState<string>('ud')
    const [aliases, setAliases] = useState<AliasEdit[]>([])
    const [isDirty, setIsDirty] = useState(false)

    // Fetch item data when drawer opens
    useEffect(() => {
        if (!itemId) return

        setIsLoading(true)
        setLoadError(null)
        setSaveError(null)
        setSaveSuccess(false)
        setIsDirty(false)

        getItemWithAliases(itemId)
            .then((data) => {
                if (!data) {
                    setLoadError('No se pudo cargar el producto.')
                    return
                }
                setOfficialName(data.official_name)
                setCategory(data.category ?? '')
                setBaseUnit(data.base_unit)
                setAliases(data.aliases)
            })
            .catch((e) => setLoadError(e instanceof Error ? e.message : 'Error al cargar'))
            .finally(() => setIsLoading(false))
    }, [itemId])

    function markDirty() {
        setIsDirty(true)
        setSaveSuccess(false)
        setSaveError(null)
    }

    function handleAliasChange(index: number, field: keyof AliasEdit, value: number | string) {
        setAliases((prev) =>
            prev.map((a, i) => {
                if (i !== index) return a
                const updated = { ...a, [field]: value }
                // Recalculate conversion_multiplier
                const pack = field === 'envases_por_formato' ? (value as number) : a.envases_por_formato
                const qty = field === 'contenido_por_envase' ? (value as number) : a.contenido_por_envase
                updated.conversion_multiplier = pack * qty
                return updated
            }),
        )
        markDirty()
    }

    function handleSave() {
        if (!itemId) return
        setSaveError(null)

        startTransition(async () => {
            const result = await updateItemMetadata({
                itemId,
                officialName: officialName.trim(),
                category: category || null,
                baseUnit: baseUnit as 'ml' | 'g' | 'ud',
                aliases: aliases.map((a) => ({
                    id: a.id,
                    envases_por_formato: a.envases_por_formato,
                    contenido_por_envase: a.contenido_por_envase,
                    formato_compra: a.formato_compra,
                    conversion_multiplier: a.conversion_multiplier,
                })),
            })

            if (result.success) {
                setIsDirty(false)
                setSaveSuccess(true)
                onSaved?.()
            } else {
                setSaveError(result.error)
            }
        })
    }

    const isOpen = itemId !== null

    return (
        <>
            {/* Backdrop */}
            <div
                className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 ${isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Drawer panel */}
            <aside
                role="dialog"
                aria-modal="true"
                aria-label="Editar producto"
                className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-background shadow-xl transition-transform duration-200 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                    <h2 className="text-base font-semibold">Editar producto</h2>
                    <button
                        onClick={onClose}
                        aria-label="Cerrar panel"
                        className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-5 space-y-6">
                    {isLoading && (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    )}

                    {loadError && (
                        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            {loadError}
                        </div>
                    )}

                    {!isLoading && !loadError && (
                        <>
                            {/* Master item fields */}
                            <section className="space-y-4">
                                <h3 className="text-sm font-medium">Datos del producto</h3>

                                <div>
                                    <label htmlFor={`${uid}-name`} className="mb-1 block text-xs font-medium text-muted-foreground">
                                        Nombre oficial
                                    </label>
                                    <input
                                        id={`${uid}-name`}
                                        type="text"
                                        value={officialName}
                                        onChange={(e) => { setOfficialName(e.target.value); markDirty() }}
                                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                        placeholder="Nombre oficial del producto"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label htmlFor={`${uid}-category`} className="mb-1 block text-xs font-medium text-muted-foreground">
                                            Categoría
                                        </label>
                                        <select
                                            id={`${uid}-category`}
                                            value={category}
                                            onChange={(e) => { setCategory(e.target.value); markDirty() }}
                                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                        >
                                            <option value="">Sin categoría</option>
                                            {PRODUCT_CATEGORIES.map((c) => (
                                                <option key={c} value={c}>{c}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label htmlFor={`${uid}-unit`} className="mb-1 block text-xs font-medium text-muted-foreground">
                                            Unidad base
                                        </label>
                                        <select
                                            id={`${uid}-unit`}
                                            value={baseUnit}
                                            onChange={(e) => { setBaseUnit(e.target.value); markDirty() }}
                                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                        >
                                            {BASE_UNITS.map((u) => (
                                                <option key={u} value={u}>{u}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </section>

                            {/* Aliases by provider */}
                            {aliases.length > 0 && (
                                <section className="space-y-4">
                                    <h3 className="text-sm font-medium">Aliases por proveedor</h3>
                                    <div className="space-y-4">
                                        {aliases.map((alias, index) => (
                                            <div key={alias.id} className="rounded-lg border border-border p-4 space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <p className="text-sm font-medium">{alias.provider_name}</p>
                                                    <p className="text-xs text-muted-foreground font-mono">{alias.raw_name}</p>
                                                </div>

                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <label
                                                            htmlFor={`${uid}-alias-${alias.id}-pack`}
                                                            className="mb-1 block text-xs font-medium text-muted-foreground"
                                                        >
                                                            Envases por formato
                                                        </label>
                                                        <input
                                                            id={`${uid}-alias-${alias.id}-pack`}
                                                            type="number"
                                                            min="0"
                                                            step="0.001"
                                                            value={alias.envases_por_formato}
                                                            onChange={(e) => handleAliasChange(index, 'envases_por_formato', parseFloat(e.target.value) || 0)}
                                                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label
                                                            htmlFor={`${uid}-alias-${alias.id}-qty`}
                                                            className="mb-1 block text-xs font-medium text-muted-foreground"
                                                        >
                                                            Contenido por envase
                                                        </label>
                                                        <input
                                                            id={`${uid}-alias-${alias.id}-qty`}
                                                            type="number"
                                                            min="0"
                                                            step="0.001"
                                                            value={alias.contenido_por_envase}
                                                            onChange={(e) => handleAliasChange(index, 'contenido_por_envase', parseFloat(e.target.value) || 0)}
                                                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label
                                                            htmlFor={`${uid}-alias-${alias.id}-fmt`}
                                                            className="mb-1 block text-xs font-medium text-muted-foreground"
                                                        >
                                                            Formato de compra
                                                        </label>
                                                        <input
                                                            id={`${uid}-alias-${alias.id}-fmt`}
                                                            type="text"
                                                            value={alias.formato_compra}
                                                            onChange={(e) => handleAliasChange(index, 'formato_compra', e.target.value)}
                                                            placeholder="Ej: Caja, Barril, Unidad..."
                                                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label
                                                            htmlFor={`${uid}-alias-${alias.id}-conv`}
                                                            className="mb-1 block text-xs font-medium text-muted-foreground"
                                                        >
                                                            Multiplicador{' '}
                                                            <span className="text-muted-foreground/60 font-normal">
                                                                (pack × cantidad)
                                                            </span>
                                                        </label>
                                                        <input
                                                            id={`${uid}-alias-${alias.id}-conv`}
                                                            type="number"
                                                            value={alias.conversion_multiplier}
                                                            readOnly
                                                            aria-readonly="true"
                                                            className="w-full rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground cursor-not-allowed"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            )}

                            {aliases.length === 0 && !isLoading && (
                                <p className="text-sm text-muted-foreground">Sin aliases registrados para este producto.</p>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
                    <div className="text-sm">
                        {saveSuccess && (
                            <span className="flex items-center gap-1.5 text-green-700 dark:text-green-400">
                                <CheckCircle className="h-4 w-4" />
                                Guardado
                            </span>
                        )}
                        {saveError && (
                            <span role="alert" className="flex items-center gap-1.5 text-destructive text-xs">
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                {saveError}
                            </span>
                        )}
                        {isDirty && !saveError && !saveSuccess && (
                            <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                Cambios sin guardar
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onClose}
                            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={isPending || isLoading || !isDirty}
                            className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                        >
                            {isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Save className="h-4 w-4" />
                            )}
                            Guardar
                        </button>
                    </div>
                </div>
            </aside>
        </>
    )
}
