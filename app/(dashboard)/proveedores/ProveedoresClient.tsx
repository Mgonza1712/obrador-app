'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Search, Truck, GitMerge, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { PROVIDER_CHANNEL_LABELS } from '@/lib/constants'
import { updateProviderToggle, mergeProviders } from '@/app/actions/proveedores'
import type { ProveedorRow } from './page'

type Filter = 'all' | 'active' | 'inactive' | 'unknown'

const CHANNEL_COLORS: Record<string, string> = {
    email: 'border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    whatsapp: 'border-green-400 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
    telegram: 'border-sky-400 bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
    telefono: 'border-orange-400 bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
}

function Toggle({
    checked,
    onChange,
    disabled,
}: {
    checked: boolean
    onChange: (v: boolean) => void
    disabled?: boolean
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:opacity-50 ${checked ? 'bg-primary' : 'bg-muted-foreground/30'}`}
        >
            <span
                className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`}
            />
        </button>
    )
}

export default function ProveedoresClient({ providers: initial }: { providers: ProveedorRow[] }) {
    const router = useRouter()
    const [providers, setProviders] = useState(initial)
    const [search, setSearch] = useState('')
    const [filter, setFilter] = useState<Filter>('all')
    const [mergeOpen, setMergeOpen] = useState(false)
    const [primaryId, setPrimaryId] = useState('')
    const [navigatingId, setNavigatingId] = useState<string | null>(null)
    const [isNavigating, startNavigating] = useTransition()
    const [mergedId, setMergedId] = useState('')
    const [mergeError, setMergeError] = useState('')
    const [isPending, startTransition] = useTransition()

    function handleToggle(
        id: string,
        field: 'shared_pricing' | 'is_trusted' | 'is_active',
        value: boolean,
    ) {
        setProviders((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)))
        startTransition(async () => {
            try {
                await updateProviderToggle(id, field, value)
            } catch {
                setProviders((prev) =>
                    prev.map((p) => (p.id === id ? { ...p, [field]: !value } : p)),
                )
            }
        })
    }

    const filtered = providers.filter((p) => {
        const matchSearch = p.name.toLowerCase().includes(search.toLowerCase())
        const matchFilter =
            filter === 'all'
                ? true
                : filter === 'active'
                  ? p.is_active === true
                  : filter === 'inactive'
                    ? p.is_active === false
                    : p.name === 'Proveedor Desconocido'
        return matchSearch && matchFilter
    })

    const primaryProvider = providers.find((p) => p.id === primaryId)
    const mergedProvider = providers.find((p) => p.id === mergedId)

    function closeMerge() {
        setMergeOpen(false)
        setPrimaryId('')
        setMergedId('')
        setMergeError('')
    }

    function handleMergeConfirm() {
        if (!primaryId || !mergedId || primaryId === mergedId) {
            setMergeError('Seleccioná dos proveedores distintos.')
            return
        }
        setMergeError('')
        startTransition(async () => {
            try {
                const result = await mergeProviders(primaryId, mergedId)
                if (!result.success) {
                    setMergeError(
                        result.code === 'DUPLICATE_DOCUMENT'
                            ? 'Hay documentos con el mismo número en ambos proveedores. Revisá el historial antes de fusionar.'
                            : 'Ocurrió un error al fusionar. Intentá de nuevo.',
                    )
                    return
                }
                setProviders((prev) =>
                    prev
                        .filter((p) => p.id !== mergedId)
                        .map((p) =>
                            p.id === primaryId
                                ? { ...p, productCount: p.productCount + (mergedProvider?.productCount ?? 0) }
                                : p,
                        ),
                )
                closeMerge()
            } catch {
                setMergeError('Ocurrió un error al fusionar. Intentá de nuevo.')
            }
        })
    }

    return (
        <>
            {/* Filters */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Buscar proveedor..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                </div>
                <div className="flex items-center gap-1 rounded-lg border border-border bg-muted p-1">
                    {(['all', 'active', 'inactive', 'unknown'] as Filter[]).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${filter === f ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            {f === 'all'
                                ? 'Todos'
                                : f === 'active'
                                  ? 'Activos'
                                  : f === 'inactive'
                                    ? 'Inactivos'
                                    : 'Desconocidos'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Meta + merge button */}
            <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                    {filtered.length} proveedor{filtered.length !== 1 ? 'es' : ''}
                </p>
                <button
                    onClick={() => setMergeOpen(true)}
                    className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                    <GitMerge className="h-4 w-4" />
                    Fusionar
                </button>
            </div>

            {/* Table */}
            {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-20 text-center">
                    <Truck className="h-12 w-12 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">No se encontraron proveedores.</p>
                </div>
            ) : (
                <div className="rounded-lg border border-border bg-card overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border">
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                    Proveedor
                                </th>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                    Contacto
                                </th>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                    Canal
                                </th>
                                <th className="px-4 py-3 text-center font-medium text-muted-foreground">
                                    Productos
                                </th>
                                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                                    Último Doc.
                                </th>
                                <th className="px-4 py-3 text-center font-medium text-muted-foreground">
                                    Precio compartido
                                </th>
                                <th className="px-4 py-3 text-center font-medium text-muted-foreground">
                                    Confiable
                                </th>
                                <th className="px-4 py-3 text-center font-medium text-muted-foreground">
                                    Activo
                                </th>
                                <th className="px-4 py-3" />
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((p) => (
                                <tr
                                    key={p.id}
                                    className="border-b border-border last:border-0 transition-colors hover:bg-accent/40"
                                >
                                    <td className="px-4 py-3 font-medium">{p.name}</td>
                                    <td className="px-4 py-3 text-muted-foreground">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-xs">{p.email ?? '—'}</span>
                                            <span className="text-xs">{p.phone ?? '—'}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        {p.channel ? (
                                            <Badge
                                                variant="outline"
                                                className={CHANNEL_COLORS[p.channel] ?? ''}
                                            >
                                                {PROVIDER_CHANNEL_LABELS[p.channel] ?? p.channel}
                                            </Badge>
                                        ) : (
                                            <span className="text-muted-foreground/50">—</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-center text-muted-foreground">
                                        {p.productCount}
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground">
                                        {p.lastDocument
                                            ? new Date(p.lastDocument).toLocaleDateString('es-ES', {
                                                  day: '2-digit',
                                                  month: 'short',
                                                  year: 'numeric',
                                              })
                                            : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <Toggle
                                            checked={p.shared_pricing ?? false}
                                            onChange={(v) => handleToggle(p.id, 'shared_pricing', v)}
                                        />
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <Toggle
                                            checked={p.is_trusted ?? false}
                                            onChange={(v) => handleToggle(p.id, 'is_trusted', v)}
                                        />
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <Toggle
                                            checked={p.is_active ?? false}
                                            onChange={(v) => handleToggle(p.id, 'is_active', v)}
                                        />
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <button
                                            onClick={() => {
                                                setNavigatingId(p.id)
                                                startNavigating(() => {
                                                    router.push(`/proveedores/${p.id}`)
                                                })
                                            }}
                                            disabled={isNavigating && navigatingId === p.id}
                                            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-60"
                                        >
                                            {isNavigating && navigatingId === p.id ? (
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                            ) : null}
                                            Editar
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Merge Modal */}
            {mergeOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                    <div className="relative w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
                        <button
                            onClick={closeMerge}
                            className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
                        >
                            <X className="h-4 w-4" />
                        </button>
                        <h2 className="text-lg font-semibold">Fusionar Proveedores</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            El proveedor fusionado quedará inactivo. Sus documentos, productos y
                            precios pasarán al proveedor principal.
                        </p>

                        <div className="mt-4 space-y-3">
                            <div>
                                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    Proveedor principal (sobrevive)
                                </label>
                                <select
                                    value={primaryId}
                                    onChange={(e) => setPrimaryId(e.target.value)}
                                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                >
                                    <option value="">Seleccionar...</option>
                                    {providers
                                        .filter((p) => p.id !== mergedId)
                                        .map((p) => (
                                            <option key={p.id} value={p.id}>
                                                {p.name}
                                            </option>
                                        ))}
                                </select>
                            </div>

                            <div>
                                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    Proveedor a fusionar (desaparece)
                                </label>
                                <select
                                    value={mergedId}
                                    onChange={(e) => setMergedId(e.target.value)}
                                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                >
                                    <option value="">Seleccionar...</option>
                                    {providers
                                        .filter((p) => p.id !== primaryId)
                                        .map((p) => (
                                            <option key={p.id} value={p.id}>
                                                {p.name}
                                            </option>
                                        ))}
                                </select>
                            </div>

                            {primaryProvider && mergedProvider && primaryId !== mergedId && (
                                <div className="rounded-md border border-border bg-muted/50 p-3 text-sm space-y-1">
                                    <p className="font-medium">
                                        Se moverá de{' '}
                                        <span className="text-primary">{mergedProvider.name}</span>{' '}
                                        →{' '}
                                        <span className="text-primary">{primaryProvider.name}</span>:
                                    </p>
                                    <p className="text-muted-foreground">
                                        • {mergedProvider.productCount} producto
                                        {mergedProvider.productCount !== 1 ? 's' : ''} en catálogo
                                    </p>
                                    {mergedProvider.lastDocument && (
                                        <p className="text-muted-foreground">• Documentos asociados</p>
                                    )}
                                </div>
                            )}

                            {mergeError && (
                                <p className="text-sm text-destructive">{mergeError}</p>
                            )}
                        </div>

                        <div className="mt-6 flex justify-end gap-2">
                            <button
                                onClick={closeMerge}
                                className="rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleMergeConfirm}
                                disabled={
                                    isPending || !primaryId || !mergedId || primaryId === mergedId
                                }
                                className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                            >
                                {isPending ? 'Fusionando...' : 'Confirmar fusión'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
