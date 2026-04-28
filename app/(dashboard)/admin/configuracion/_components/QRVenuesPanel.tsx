'use client'

import { useRef, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Download, Copy, Check, QrCode, ExternalLink } from 'lucide-react'
import type { VenueQR } from '../page'

interface Props {
    venues: VenueQR[]
    baseUrl: string
}

export default function QRVenuesPanel({ venues, baseUrl }: Props) {
    if (venues.length === 0) {
        return (
            <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
                <QrCode className="mx-auto mb-3 h-8 w-8 opacity-40" />
                <p>No hay locales configurados.</p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="rounded-md bg-muted/40 border px-4 py-3 text-sm text-muted-foreground">
                <strong className="text-foreground">¿Cómo funciona?</strong> Cada local tiene un QR único.
                Imprímelo y pégalo en el punto de recepción de mercancía. El personal escanea el QR con
                el móvil y puede registrar la recepción de pedidos sin necesidad de cuenta.
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {venues.map((venue) => (
                    <VenueQRCard key={venue.id} venue={venue} baseUrl={baseUrl} />
                ))}
            </div>
        </div>
    )
}

function VenueQRCard({ venue, baseUrl }: { venue: VenueQR; baseUrl: string }) {
    const wrapperRef = useRef<HTMLDivElement>(null)
    const [copied, setCopied] = useState(false)

    const url = `${baseUrl}/scan/${venue.reception_token}`

    function handleDownload() {
        // qrcode.react renders a <canvas> inside a wrapper div
        const canvas = wrapperRef.current?.querySelector('canvas')
        if (!canvas) return
        const dataUrl = canvas.toDataURL('image/png')
        const link = document.createElement('a')
        link.download = `QR-Recepcion-${venue.name.replace(/\s+/g, '-')}.png`
        link.href = dataUrl
        link.click()
    }

    async function handleCopy() {
        if (!url) return
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const TYPE_LABELS: Record<string, string> = {
        restaurante: 'Restaurante',
        bar: 'Bar',
        cafeteria: 'Cafetería',
        generic: 'General',
    }

    return (
        <div className="rounded-lg border bg-card p-4 flex flex-col gap-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
                <div>
                    <p className="font-medium leading-tight">{venue.name}</p>
                    {venue.type && (
                        <Badge variant="secondary" className="mt-1 text-xs">
                            {TYPE_LABELS[venue.type] ?? venue.type}
                        </Badge>
                    )}
                </div>
            </div>

            {/* QR code */}
            <div className="flex justify-center">
                <div ref={wrapperRef}>
                    <QRCodeCanvas
                        value={url}
                        size={180}
                        level="M"
                        marginSize={2}
                        style={{ display: 'block' }}
                    />
                </div>
            </div>

            {/* URL */}
            <p className="break-all rounded bg-muted px-2 py-1.5 text-xs text-muted-foreground font-mono">
                {url}
            </p>

            {/* Actions */}
            <div className="flex gap-2">
                <Button
                    variant="default"
                    size="sm"
                    className="flex-1"
                    onClick={handleDownload}
                >
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    Descargar PNG
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopy}
                    className="shrink-0"
                    title="Copiar enlace"
                >
                    {copied ? (
                        <Check className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                        <Copy className="h-3.5 w-3.5" />
                    )}
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="shrink-0"
                    title="Abrir en nueva pestaña"
                >
                    <a href={url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                </Button>
            </div>
        </div>
    )
}
