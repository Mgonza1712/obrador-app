'use client'

import { useTransition, useState } from 'react'
import Link from 'next/link'
import { Send, Loader2, CheckCircle, AlertCircle, Phone, Mail, MessageCircle, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { sendOrder } from '@/app/actions/pedidos'
import type { OrderLineDetail } from '@/app/actions/pedidos'

interface Props {
    orderId: string
    lines: OrderLineDetail[]
}

const CHANNEL_LABELS: Record<string, string> = {
    whatsapp: 'WhatsApp',
    email: 'Email',
    telefono: 'Teléfono',
    telegram: 'Telegram',
}

function ChannelDot({ channel }: { channel: string }) {
    const colors: Record<string, string> = {
        whatsapp: 'bg-green-500',
        email: 'bg-blue-500',
        telegram: 'bg-sky-500',
        telefono: 'bg-orange-400',
    }
    return <span className={`inline-flex h-2 w-2 rounded-full ${colors[channel] ?? 'bg-muted-foreground'}`} />
}

function ChannelIcon({ channel, className }: { channel: string; className?: string }) {
    if (channel === 'email') return <Mail className={className} />
    if (channel === 'telefono') return <Phone className={className} />
    return <MessageCircle className={className} />
}

interface ProviderEntry {
    id: string
    name: string
    preferredChannel: string | null
    phone: string | null
    email: string | null
    lineCount: number
}

function availableChannels(p: ProviderEntry): string[] {
    const channels: string[] = []
    if (p.phone) channels.push('whatsapp')
    if (p.email) channels.push('email')
    if (p.phone) channels.push('telefono')
    return channels
}

function ProviderChannelRow({
    provider,
    selectedChannel,
    onSelect,
}: {
    provider: ProviderEntry
    selectedChannel: string | null
    onSelect: (channel: string) => void
}) {
    const available = availableChannels(provider)
    const hasNoContact = available.length === 0
    const allChannels = ['whatsapp', 'email', 'telefono']

    return (
        <div className="rounded-md border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
                <div>
                    <span className="font-medium text-sm">{provider.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{provider.lineCount} línea{provider.lineCount !== 1 ? 's' : ''}</span>
                </div>
                {hasNoContact && (
                    <Link
                        href={`/proveedores/${provider.id}`}
                        target="_blank"
                        className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700"
                    >
                        <ExternalLink className="h-3 w-3" />
                        Completar datos
                    </Link>
                )}
            </div>

            {hasNoContact ? (
                <div className="flex items-start gap-1.5 rounded bg-amber-50 border border-amber-200 px-2 py-1.5 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    Sin datos de contacto — este proveedor no recibirá el pedido automáticamente.
                </div>
            ) : (
                <div className="flex gap-1.5">
                    {allChannels.map((ch) => {
                        const isAvailable = available.includes(ch)
                        const isSelected = selectedChannel === ch
                        return (
                            <button
                                key={ch}
                                onClick={() => isAvailable && onSelect(ch)}
                                disabled={!isAvailable}
                                title={isAvailable ? CHANNEL_LABELS[ch] : `Sin ${CHANNEL_LABELS[ch]} configurado`}
                                className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
                                    isSelected
                                        ? 'bg-green-100 border border-green-400 text-green-700 dark:bg-green-900 dark:text-green-300'
                                        : isAvailable
                                        ? 'border border-border text-muted-foreground hover:border-green-300 hover:text-green-700'
                                        : 'border border-dashed border-border text-muted-foreground/40 cursor-not-allowed'
                                }`}
                            >
                                <ChannelIcon channel={ch} className="h-3 w-3" />
                                {CHANNEL_LABELS[ch]}
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

export default function SendOrderButton({ orderId, lines }: Props) {
    const [isPending, startTransition] = useTransition()
    const [open, setOpen] = useState(false)
    const [result, setResult] = useState<{ sent: string[]; manual: string[] } | null>(null)
    const [error, setError] = useState<string | null>(null)

    // Build provider map
    const providerMap = new Map<string, ProviderEntry>()
    for (const line of lines) {
        if (!line.provider_id) continue
        const existing = providerMap.get(line.provider_id)
        if (existing) {
            existing.lineCount += 1
        } else {
            providerMap.set(line.provider_id, {
                id: line.provider_id,
                name: line.provider_name ?? line.provider_id,
                preferredChannel: line.provider_channel,
                phone: line.provider_phone,
                email: line.provider_email,
                lineCount: 1,
            })
        }
    }

    const providers = Array.from(providerMap.values())
    const unmatchedCount = lines.filter((l) => !l.provider_id).length

    // Channel selections: default to preferred channel if available
    const [channelSelections, setChannelSelections] = useState<Record<string, string>>(() => {
        const initial: Record<string, string> = {}
        for (const [id, p] of providerMap.entries()) {
            const avail = availableChannels(p)
            if (p.preferredChannel && avail.includes(p.preferredChannel)) {
                initial[id] = p.preferredChannel
            } else if (avail.length > 0) {
                initial[id] = avail[0]
            }
        }
        return initial
    })

    function handleSelect(providerId: string, channel: string) {
        setChannelSelections((prev) => ({ ...prev, [providerId]: channel }))
    }

    function handleConfirm() {
        startTransition(async () => {
            const res = await sendOrder(orderId)
            if (res.success) {
                setResult({ sent: res.sent ?? [], manual: res.manual ?? [] })
                setError(null)
            } else {
                setError(res.error ?? 'Error al enviar el pedido')
            }
        })
    }

    if (result) {
        return (
            <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
                <CheckCircle className="h-4 w-4 shrink-0" />
                Pedido enviado correctamente
                {result.manual.length > 0 && (
                    <span className="ml-1 text-xs text-muted-foreground">
                        (Llamar manualmente a: {result.manual.join(', ')})
                    </span>
                )}
            </div>
        )
    }

    return (
        <>
            <Button onClick={() => setOpen(true)} className="flex items-center gap-1.5">
                <Send className="h-4 w-4" />
                Enviar pedido
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Send className="h-5 w-5" />
                            Confirmar envío del pedido
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-3 py-2">
                        {providers.length === 0 ? (
                            <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                Ninguna línea tiene proveedor asignado. Vincula los productos antes de enviar.
                            </div>
                        ) : (
                            providers.map((p) => (
                                <ProviderChannelRow
                                    key={p.id}
                                    provider={p}
                                    selectedChannel={channelSelections[p.id] ?? null}
                                    onSelect={(ch) => handleSelect(p.id, ch)}
                                />
                            ))
                        )}

                        {unmatchedCount > 0 && (
                            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                <span>
                                    {unmatchedCount} línea{unmatchedCount !== 1 ? 's' : ''} sin proveedor asignado no se enviarán.
                                </span>
                            </div>
                        )}

                        {error && (
                            <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                {error}
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
                            Cancelar
                        </Button>
                        <Button onClick={handleConfirm} disabled={isPending || providers.length === 0}>
                            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            Confirmar envío
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
