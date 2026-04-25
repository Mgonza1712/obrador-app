'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { Link2, Search, ChevronDown, Loader2, Check, CheckCircle } from 'lucide-react'
import { linkOrderLine } from '@/app/actions/pedidos'
import type { OrderLineDetail } from '@/app/actions/pedidos'

interface MasterItemOption {
    id: string
    official_name: string
    base_unit: string
}

interface ProviderOption {
    id: string
    name: string
    channel: string | null
}

interface Props {
    line: OrderLineDetail
    masterItems: MasterItemOption[]
    providers: ProviderOption[]
    onLinked: (lineId: string, masterItemName: string) => void
}

export default function UnmatchedLineRow({ line, masterItems, providers, onLinked }: Props) {
    const [isOpen, setIsOpen] = useState(false)
    const [isPending, startTransition] = useTransition()
    const [selectedMasterItemId, setSelectedMasterItemId] = useState<string | null>(null)
    const [selectedProviderId, setSelectedProviderId] = useState<string | null>(line.provider_id)
    const [itemQuery, setItemQuery] = useState('')
    const [itemComboOpen, setItemComboOpen] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        function handle(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setItemComboOpen(false)
            }
        }
        document.addEventListener('mousedown', handle)
        return () => document.removeEventListener('mousedown', handle)
    }, [])

    const filteredItems = masterItems.filter((i) =>
        i.official_name.toLowerCase().includes(itemQuery.toLowerCase())
    )

    const selectedItemName = masterItems.find((i) => i.id === selectedMasterItemId)?.official_name

    function handleSave() {
        if (!selectedMasterItemId) {
            setError('Selecciona un producto del catálogo.')
            return
        }
        setError(null)
        startTransition(async () => {
            const res = await linkOrderLine(line.id, selectedMasterItemId, selectedProviderId)
            if (res.success) {
                setIsOpen(false)
                onLinked(line.id, selectedItemName ?? selectedMasterItemId)
            } else {
                setError(res.error ?? 'Error al vincular la línea')
            }
        })
    }

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800"
            >
                <Link2 className="h-3 w-3" />
                Vincular
            </button>
        )
    }

    return (
        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50/60 p-3 space-y-3 dark:bg-amber-950/20 dark:border-amber-900">
            {/* Master item combobox */}
            <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Producto del catálogo</label>
                <div ref={containerRef} className="relative">
                    <button
                        type="button"
                        onClick={() => { setItemComboOpen((o) => !o); setTimeout(() => inputRef.current?.focus(), 50) }}
                        className={`flex w-full items-center justify-between rounded-md border px-3 py-1.5 text-sm transition-colors ${
                            selectedMasterItemId
                                ? 'border-green-400 bg-green-50 text-green-800'
                                : 'border-input bg-background text-muted-foreground'
                        }`}
                    >
                        <span className="truncate">{selectedItemName || 'Buscar en catálogo...'}</span>
                        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
                    </button>
                    {itemComboOpen && (
                        <div className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-lg">
                            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                                <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={itemQuery}
                                    onChange={(e) => setItemQuery(e.target.value)}
                                    placeholder="Buscar producto..."
                                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                                />
                            </div>
                            <ul className="max-h-48 overflow-y-auto py-1">
                                {filteredItems.slice(0, 50).map((item) => (
                                    <li key={item.id}>
                                        <button
                                            type="button"
                                            onClick={() => { setSelectedMasterItemId(item.id); setItemQuery(''); setItemComboOpen(false) }}
                                            className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent ${
                                                selectedMasterItemId === item.id ? 'bg-accent font-medium' : ''
                                            }`}
                                        >
                                            <span>{item.official_name}</span>
                                            <span className="text-xs text-muted-foreground">{item.base_unit}</span>
                                        </button>
                                    </li>
                                ))}
                                {filteredItems.length === 0 && (
                                    <li className="px-3 py-4 text-center text-sm text-muted-foreground">
                                        Sin resultados
                                    </li>
                                )}
                            </ul>
                        </div>
                    )}
                </div>
            </div>

            {/* Provider select */}
            <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Proveedor</label>
                <select
                    value={selectedProviderId ?? ''}
                    onChange={(e) => setSelectedProviderId(e.target.value || null)}
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                    <option value="">— Sin proveedor —</option>
                    {providers.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                </select>
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="flex items-center gap-2">
                <button
                    onClick={handleSave}
                    disabled={isPending || !selectedMasterItemId}
                    className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                    {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                    Guardar
                </button>
                <button
                    onClick={() => setIsOpen(false)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                    Cancelar
                </button>
            </div>
        </div>
    )
}
