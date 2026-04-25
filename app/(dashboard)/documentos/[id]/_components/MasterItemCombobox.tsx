'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { Search, ChevronDown, Loader2 } from 'lucide-react'
import { updateQuoteLineMasterItem } from '@/app/actions/presupuestos'

interface MasterItemOption {
    id: string
    official_name: string
    base_unit: string
    category: string | null
}

interface Props {
    purchaseLineId: string
    priceHistoryId: string
    currentMasterItemId: string | null
    currentMasterItemName: string | null
    masterItems: MasterItemOption[]
    quoteCase: 'A' | 'B' | 'C' | 'D'
    onUpdated: (masterItemId: string, masterItemName: string, baseUnit: string) => void
}

export default function MasterItemCombobox({
    purchaseLineId,
    priceHistoryId,
    currentMasterItemId,
    currentMasterItemName,
    masterItems,
    quoteCase,
    onUpdated,
}: Props) {
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    const isEditable = quoteCase !== 'A'

    useEffect(() => {
        function handle(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handle)
        return () => document.removeEventListener('mousedown', handle)
    }, [])

    const filtered = masterItems.filter((i) =>
        i.official_name.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 60)

    function handleSelect(item: MasterItemOption) {
        if (item.id === currentMasterItemId) { setOpen(false); return }
        setError(null)
        startTransition(async () => {
            const res = await updateQuoteLineMasterItem(purchaseLineId, priceHistoryId, item.id)
            if (res.success) {
                onUpdated(item.id, item.official_name, item.base_unit)
                setOpen(false)
                setQuery('')
            } else {
                setError(res.error ?? 'Error al actualizar producto')
            }
        })
    }

    if (!isEditable) {
        return (
            <span className="text-sm font-medium">{currentMasterItemName ?? '—'}</span>
        )
    }

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                onClick={() => { setOpen((o) => !o); setTimeout(() => inputRef.current?.focus(), 50) }}
                className={`flex items-center justify-between rounded-md border px-2.5 py-1.5 text-sm transition-colors max-w-[220px] ${
                    currentMasterItemId
                        ? 'border-input bg-background text-foreground'
                        : 'border-amber-300 bg-amber-50 text-amber-700'
                }`}
            >
                <span className="truncate mr-1">
                    {currentMasterItemName ?? 'Sin asignar'}
                </span>
                {isPending
                    ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                    : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                }
            </button>

            {open && (
                <div className="absolute left-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-md border border-border bg-popover shadow-lg">
                    <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Buscar producto..."
                            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                        />
                    </div>
                    <ul className="max-h-52 overflow-y-auto py-1">
                        {filtered.map((item) => (
                            <li key={item.id}>
                                <button
                                    type="button"
                                    onClick={() => handleSelect(item)}
                                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent ${
                                        item.id === currentMasterItemId ? 'bg-accent font-medium' : ''
                                    }`}
                                >
                                    <span className="truncate">{item.official_name}</span>
                                    <span className="ml-2 shrink-0 text-xs text-muted-foreground">{item.base_unit}</span>
                                </button>
                            </li>
                        ))}
                        {filtered.length === 0 && (
                            <li className="px-3 py-4 text-center text-sm text-muted-foreground">
                                {query ? 'Sin resultados' : 'Escribe para buscar...'}
                            </li>
                        )}
                    </ul>
                    {error && (
                        <p className="border-t border-border px-3 py-2 text-xs text-red-600">{error}</p>
                    )}
                </div>
            )}
        </div>
    )
}
