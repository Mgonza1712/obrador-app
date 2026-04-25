'use client'

import { useState, useEffect, useTransition } from 'react'
import { Wifi, WifiOff, Loader2, RefreshCw, QrCode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getWAInstanceStatus } from '@/app/actions/admin'
import type { WAInstanceStatus } from '@/app/actions/admin'

interface Props {
    instanceName: string
    label: string
    description: string
}

export default function WAInstanceCard({ instanceName, label, description }: Props) {
    const [status, setStatus] = useState<WAInstanceStatus>({ state: 'close', qrBase64: null })
    const [isPending, startTransition] = useTransition()
    const [polling, setPolling] = useState(false)

    function refresh() {
        startTransition(async () => {
            const s = await getWAInstanceStatus(instanceName)
            setStatus(s)
        })
    }

    // Poll every 5s when showing QR or connecting
    useEffect(() => {
        refresh()
    }, [instanceName]) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (status.state === 'open' || status.state === 'close') {
            setPolling(false)
            return
        }
        setPolling(true)
        const interval = setInterval(refresh, 5000)
        return () => clearInterval(interval)
    }, [status.state]) // eslint-disable-line react-hooks/exhaustive-deps

    const isConnected = status.state === 'open'
    const isLoading = isPending || status.state === 'connecting'

    return (
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <div className="flex items-start justify-between">
                <div>
                    <h3 className="font-medium text-sm">{label}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                    {instanceName && (
                        <p className="text-xs font-mono text-muted-foreground/60 mt-1">{instanceName}</p>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {isConnected ? (
                        <span className="flex items-center gap-1.5 rounded-full bg-green-50 border border-green-200 px-2.5 py-1 text-xs font-medium text-green-700">
                            <Wifi className="h-3 w-3" />
                            Conectado
                        </span>
                    ) : isLoading ? (
                        <span className="flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-xs font-medium text-amber-700">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Conectando…
                        </span>
                    ) : (
                        <span className="flex items-center gap-1.5 rounded-full bg-red-50 border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700">
                            <WifiOff className="h-3 w-3" />
                            Desconectado
                        </span>
                    )}
                    <Button variant="outline" size="sm" onClick={refresh} disabled={isPending}>
                        <RefreshCw className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
            </div>

            {!instanceName && (
                <p className="text-xs text-amber-600">
                    Configurá el nombre de instancia en la sección de configuración.
                </p>
            )}

            {instanceName && !isConnected && (
                <div className="space-y-3">
                    {status.state === 'qr' && status.qrBase64 ? (
                        <div className="flex flex-col items-center gap-2">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <QrCode className="h-3.5 w-3.5" />
                                Escaneá este QR con WhatsApp → Dispositivos vinculados
                            </div>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={status.qrBase64}
                                alt="QR WhatsApp"
                                className="h-52 w-52 rounded-lg border border-border"
                            />
                            <p className="text-xs text-muted-foreground">
                                Actualizando automáticamente…
                            </p>
                        </div>
                    ) : (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={refresh}
                            disabled={isPending}
                            className="w-full"
                        >
                            <QrCode className="h-3.5 w-3.5 mr-1.5" />
                            Mostrar código QR
                        </Button>
                    )}
                </div>
            )}

            {isConnected && (
                <p className="text-xs text-green-600">
                    WhatsApp conectado y listo para enviar/recibir mensajes.
                </p>
            )}
        </div>
    )
}
