'use client'

import { useState, useTransition } from 'react'
import { AlertTriangle, ChevronsUpDown, Check, Loader2 } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { linkQuoteProvider } from '@/app/actions/presupuestos'

interface Provider {
    id: string
    name: string
}

interface Props {
    documentId: string
    extractedProviderName: string | null
    providers: Provider[]
    onLinked: (providerId: string, providerName: string) => void
}

export default function ProveedorVincularAlert({ documentId, extractedProviderName, providers, onLinked }: Props) {
    const [open, setOpen] = useState(false)
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')

    const filtered = search
        ? providers.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
        : providers

    const selectedName = providers.find((p) => p.id === selectedId)?.name ?? null

    function handleLink() {
        if (!selectedId) return
        setError(null)
        startTransition(async () => {
            const res = await linkQuoteProvider(documentId, selectedId)
            if (res.success) {
                onLinked(selectedId, selectedName ?? selectedId)
            } else {
                setError(res.error ?? 'Error al vincular el proveedor')
            }
        })
    }

    return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:bg-amber-950/30 dark:border-amber-800">
            <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div className="flex-1 space-y-3">
                    <div>
                        <p className="font-medium text-amber-800 dark:text-amber-200">Proveedor no identificado</p>
                        {extractedProviderName && (
                            <p className="mt-0.5 text-sm text-amber-700 dark:text-amber-300">
                                El extractor encontró: &quot;{extractedProviderName}&quot;
                            </p>
                        )}
                        <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">
                            Vincula el proveedor para desbloquear la tabla de comparación.
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch('') }}>
                            <PopoverTrigger asChild>
                                <button
                                    className="flex items-center justify-between rounded-md border border-amber-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 dark:bg-amber-950 dark:border-amber-700 min-w-48"
                                    role="combobox"
                                    aria-expanded={open}
                                >
                                    <span className={selectedName ? 'text-foreground' : 'text-muted-foreground'}>
                                        {selectedName ?? 'Buscar en catálogo de proveedores...'}
                                    </span>
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
                                </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-72 p-0" align="start">
                                <Command>
                                    <CommandInput
                                        placeholder="Buscar proveedor..."
                                        value={search}
                                        onValueChange={setSearch}
                                    />
                                    <CommandEmpty>Sin resultados.</CommandEmpty>
                                    <CommandGroup>
                                        {filtered.map((p) => (
                                            <CommandItem
                                                key={p.id}
                                                value={p.id}
                                                onSelect={() => { setSelectedId(p.id); setOpen(false); setSearch('') }}
                                            >
                                                <Check className={`mr-2 h-4 w-4 ${selectedId === p.id ? 'opacity-100' : 'opacity-0'}`} />
                                                {p.name}
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </Command>
                            </PopoverContent>
                        </Popover>

                        <Button
                            size="sm"
                            onClick={handleLink}
                            disabled={!selectedId || isPending}
                            className="shrink-0"
                        >
                            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                            Vincular proveedor
                        </Button>
                    </div>

                    {error && <p className="text-sm text-red-600">{error}</p>}
                </div>
            </div>
        </div>
    )
}
