'use client'

import { useState, useRef, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
    Package,
    Camera,
    Upload,
    ChevronLeft,
    CheckCircle,
    AlertCircle,
    Loader2,
    ClipboardList,
    ScanLine,
    X,
    AlertTriangle,
    Plus,
} from 'lucide-react'
import type { VenueInfo, PendingOrder, PendingOrderLine } from '@/app/actions/recepcion'
import { anonRegisterDelivery } from '@/app/actions/recepcion'
import { DocumentScanner } from '@/app/scan/components/DocumentScanner'
import { getPendingQuantity, isLinePending } from '@/lib/orders/deliveryTolerance'

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 'orders' | 'reception' | 'no-order-confirm' | 'manual-qty' | 'success' | 'error'

/** null = scanner closed; 'order' = scanning for a selected order; 'no-order' = scanning without linked order */
type ScanContext = 'order' | 'no-order' | null

type DocType = 'albaran' | 'factura' | 'ticket' | 'otro'

type ScannedPage = { dataUrl: string }

const DOC_TYPES: { value: DocType; label: string }[] = [
    { value: 'albaran', label: 'Albarán' },
    { value: 'factura', label: 'Factura' },
    { value: 'ticket', label: 'Ticket' },
    { value: 'otro', label: 'No sé' },
]

const N8N_SCANNER_URL = 'https://n8n.wescaleops.com/webhook/scanner-intake'

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function compressImage(dataUrl: string): Promise<string> {
    const imageCompression = (await import('browser-image-compression')).default
    // Use atob instead of fetch(dataUrl) — more compatible with mobile browsers
    const arr = dataUrl.split(',')
    const mime = arr[0].match(/:(.*?);/)?.[1] ?? 'image/jpeg'
    const bstr = atob(arr[1])
    const u8arr = new Uint8Array(bstr.length)
    for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i)
    const file = new File([u8arr], 'image.jpg', { type: mime })
    const compressed = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
    })
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (e) => {
            const result = e.target?.result as string
            resolve(result.includes(',') ? result.split(',')[1] : result)
        }
        reader.onerror = reject
        reader.readAsDataURL(compressed)
    })
}

async function buildPdf(pages: ScannedPage[]): Promise<string> {
    const { jsPDF } = await import('jspdf')
    const getImgSize = (dataUrl: string): Promise<{ w: number; h: number }> =>
        new Promise((res) => {
            const img = new Image()
            img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight })
            img.src = dataUrl
        })

    const firstSize = await getImgSize(pages[0].dataUrl)
    const pdf = new jsPDF({
        orientation: firstSize.w > firstSize.h ? 'landscape' : 'portrait',
        unit: 'px',
        format: [firstSize.w, firstSize.h],
        compress: true,
    })

    for (let i = 0; i < pages.length; i++) {
        if (i > 0) {
            const size = await getImgSize(pages[i].dataUrl)
            pdf.addPage([size.w, size.h], size.w > size.h ? 'landscape' : 'portrait')
        }
        const size = await getImgSize(pages[i].dataUrl)
        pdf.addImage(pages[i].dataUrl, 'JPEG', 0, 0, size.w, size.h)
    }

    const output = pdf.output('datauristring')
    return output.includes(',') ? output.split(',')[1] : output
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
    token: string
    venue: VenueInfo
    initialOrders: PendingOrder[]
}

export default function RecepcionClient({ token, venue, initialOrders }: Props) {
    const router = useRouter()

    const [step, setStep]                   = useState<Step>('orders')
    const [selectedOrder, setSelectedOrder] = useState<PendingOrder | null>(null)
    const [docType, setDocType]             = useState<DocType>('albaran')
    const [pages, setPages]                 = useState<ScannedPage[]>([])
    const [observations, setObservations]   = useState('')
    const [manualQtys, setManualQtys]       = useState<Record<string, number>>({})
    const [successMsg, setSuccessMsg]       = useState('')
    const [errorMsg, setErrorMsg]           = useState('')
    const [isPending, startTransition]      = useTransition()
    const [isSubmitting, setIsSubmitting]   = useState(false)
    const [lightboxSrc, setLightboxSrc]     = useState<string | null>(null)
    const [jobId, setJobId]                 = useState<string | null>(null)
    const [jobStatus, setJobStatus]         = useState<'polling' | 'success' | 'duplicate' | 'failed' | 'timeout' | null>(null)
    const pollingRef   = useRef<ReturnType<typeof setInterval> | null>(null)
    const pollCountRef = useRef(0)

    const [scanContext, setScanContext] = useState<ScanContext>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // ── Job polling ───────────────────────────────────────────────────────────

    useEffect(() => {
        if (!jobId) return
        const MAX_POLLS = 60 // 3 min at 3s intervals
        pollCountRef.current = 0
        setJobStatus('polling')

        const poll = async () => {
            pollCountRef.current += 1
            try {
                const res = await fetch(`/api/job-status/${jobId}`, { cache: 'no-store' })
                const data = await res.json()
                if (data.status === 'success') {
                    clearInterval(pollingRef.current!)
                    setJobStatus('success')
                    setSuccessMsg('Documento procesado correctamente.')
                } else if (data.status === 'duplicate') {
                    clearInterval(pollingRef.current!)
                    setJobStatus('duplicate')
                    setSuccessMsg('Este documento ya había sido procesado anteriormente.')
                } else if (data.status === 'failed') {
                    clearInterval(pollingRef.current!)
                    setJobStatus('failed')
                    setSuccessMsg(data.error || 'Error durante la extracción.')
                } else if (pollCountRef.current >= MAX_POLLS) {
                    clearInterval(pollingRef.current!)
                    setJobStatus('timeout')
                    setSuccessMsg('El documento fue enviado y se procesará en breve.')
                }
            } catch {
                if (pollCountRef.current >= MAX_POLLS) {
                    clearInterval(pollingRef.current!)
                    setJobStatus('timeout')
                    setSuccessMsg('El documento fue enviado y se procesará en breve.')
                }
            }
        }

        // Poll immediately (job may already be done by the time browser gets job_id)
        poll()
        pollingRef.current = setInterval(poll, 3000)

        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current)
        }
    }, [jobId])

    // ── Handlers ──────────────────────────────────────────────────────────────

    function handleSelectOrder(order: PendingOrder) {
        setSelectedOrder(order)
        setDocType('albaran')
        setPages([])
        setObservations('')
        setStep('reception')
    }

    function handleOpenScanner(ctx: ScanContext) {
        setScanContext(ctx)
    }

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = (ev) => {
            const dataUrl = ev.target?.result as string
            setPages([{ dataUrl }])
        }
        reader.readAsDataURL(file)
        e.target.value = ''
    }

    function handleScannerCapture(processedDataUrl: string) {
        const ctx = scanContext
        setPages(prev => [...prev, { dataUrl: processedDataUrl }])
        setScanContext(null)
        if (ctx === 'no-order') {
            setStep('no-order-confirm')
        }
    }

    function handleRemovePage(index: number) {
        setPages(prev => prev.filter((_, i) => i !== index))
    }

    function handleGoManual() {
        if (!selectedOrder) return
        const qtys: Record<string, number> = {}
        for (const l of selectedOrder.lines) qtys[l.id] = getPendingQuantity(l)
        setManualQtys(qtys)
        setStep('manual-qty')
    }

    async function handleSubmitRecepcion() {
        setIsSubmitting(true)
        setErrorMsg('')

        try {
            // Step 1: Validate on server (fast <2s — auth + order check only, no photo)
            const res = await fetch(`/api/recepcion/${token}/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    order_id: selectedOrder?.id ?? null,
                    observations,
                    doc_type: docType,
                    has_photo: pages.length > 0,
                }),
            })
            const data = await res.json()

            if (!res.ok || !data.success) {
                setErrorMsg(data.error ?? 'Error al enviar la recepción')
                setStep('error')
                return
            }

            if (pages.length === 0) {
                setSuccessMsg('Observaciones registradas.')
                setStep('success')
                return
            }

            // Step 2: Prepare document client-side (compress or build PDF)
            let document_base64: string
            let filename: string
            let is_image: boolean

            if (pages.length === 1) {
                document_base64 = await compressImage(pages[0].dataUrl)
                filename = `recepcion_${Date.now()}.jpg`
                is_image = true
            } else {
                document_base64 = await buildPdf(pages)
                filename = `recepcion_${Date.now()}.pdf`
                is_image = false
            }

            // Step 3: POST directly from browser to n8n — no Vercel timeout constraint
            const n8nRes = await fetch(N8N_SCANNER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    document_base64,
                    local: venue.name,
                    filename,
                    is_image,
                    order_id: selectedOrder?.id ?? null,
                    venue_id: venue.id,
                    observations: observations || null,
                    doc_type: docType,
                }),
            })

            if (!n8nRes.ok) {
                setErrorMsg('Error al enviar el documento a procesar. Inténtalo de nuevo.')
                setStep('error')
                return
            }

            const n8nData = await n8nRes.json()
            if (n8nData.job_id) setJobId(n8nData.job_id)
            setSuccessMsg('Foto enviada. El documento se está procesando...')
            setStep('success')

        } catch {
            setErrorMsg('No se pudo conectar. Verifica tu conexión e inténtalo de nuevo.')
            setStep('error')
        } finally {
            setIsSubmitting(false)
        }
    }

    function handleSubmitManual() {
        if (!selectedOrder) return
        const received = Object.entries(manualQtys).map(([line_id, qty_received]) => ({
            line_id,
            qty_received: (selectedOrder.lines.find((l) => l.id === line_id)?.qty_received ?? 0) + qty_received,
        }))
        startTransition(async () => {
            const result = await anonRegisterDelivery(
                token,
                selectedOrder.id,
                received,
                observations || null
            )
            if (!result.success) {
                setErrorMsg(result.error ?? 'Error al registrar las cantidades')
                setStep('error')
                return
            }
            setSuccessMsg('Recepción registrada. Las cantidades han sido actualizadas.')
            setStep('success')
        })
    }

    function handleReset() {
        if (pollingRef.current) clearInterval(pollingRef.current)
        setJobId(null)
        setJobStatus(null)
        setStep('orders')
        setSelectedOrder(null)
        setPages([])
        setObservations('')
        setManualQtys({})
        setErrorMsg('')
        setSuccessMsg('')
        setScanContext(null)
        router.refresh()
    }

    // ── Lightbox overlay ──────────────────────────────────────────────────────

    if (lightboxSrc) {
        return (
            <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
                onClick={() => setLightboxSrc(null)}
            >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={lightboxSrc}
                    alt="Vista completa"
                    className="max-w-full max-h-full object-contain p-4"
                    onClick={(e) => e.stopPropagation()}
                />
                <button
                    className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white"
                    onClick={() => setLightboxSrc(null)}
                >
                    <X className="h-5 w-5" />
                </button>
            </div>
        )
    }

    // ── Scanner overlay ────────────────────────────────────────────────────────

    if (scanContext !== null) {
        return (
            <DocumentScanner
                onCapture={handleScannerCapture}
                onCancel={() => setScanContext(null)}
            />
        )
    }

    // ── Normal UI ─────────────────────────────────────────────────────────────

    return (
        <div className="mx-auto max-w-md px-4 py-6 pb-12">
            <div className="mb-6">
                <div className="flex items-center gap-2">
                    <Package className="h-5 w-5 text-primary" />
                    <h1 className="text-lg font-semibold">{venue.name}</h1>
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">Recepción de mercancía</p>
            </div>

            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
            />

            {step === 'orders' && (
                <OrdersView
                    orders={initialOrders}
                    onSelectOrder={handleSelectOrder}
                    onScanWithoutOrder={() => handleOpenScanner('no-order')}
                />
            )}

            {step === 'reception' && selectedOrder && (
                <ReceptionView
                    order={selectedOrder}
                    docType={docType}
                    setDocType={setDocType}
                    pages={pages}
                    fileInputRef={fileInputRef}
                    onOpenScanner={() => handleOpenScanner('order')}
                    onOpenLightbox={setLightboxSrc}
                    onRemovePage={handleRemovePage}
                    observations={observations}
                    setObservations={setObservations}
                    isSubmitting={isSubmitting}
                    onBack={() => setStep('orders')}
                    onSubmit={handleSubmitRecepcion}
                    onGoManual={handleGoManual}
                />
            )}

            {step === 'no-order-confirm' && (
                <NoOrderConfirmView
                    docType={docType}
                    setDocType={setDocType}
                    pages={pages}
                    onOpenLightbox={setLightboxSrc}
                    onRemovePage={handleRemovePage}
                    observations={observations}
                    setObservations={setObservations}
                    isSubmitting={isSubmitting}
                    onBack={() => {
                        setStep('orders')
                        setPages([])
                    }}
                    onAddPage={() => handleOpenScanner('no-order')}
                    onSubmit={handleSubmitRecepcion}
                />
            )}

            {step === 'manual-qty' && selectedOrder && (
                <ManualQtyView
                    order={selectedOrder}
                    manualQtys={manualQtys}
                    setManualQtys={setManualQtys}
                    observations={observations}
                    setObservations={setObservations}
                    isPending={isPending}
                    onBack={() => setStep('reception')}
                    onSubmit={handleSubmitManual}
                />
            )}

            {step === 'success' && (
                <SuccessView message={successMsg} jobStatus={jobStatus} onReset={handleReset} />
            )}

            {step === 'error' && (
                <ErrorView
                    message={errorMsg}
                    onRetry={() => setStep(selectedOrder ? 'reception' : 'orders')}
                />
            )}
        </div>
    )
}

// ─── Orders view ──────────────────────────────────────────────────────────────

function OrdersView({
    orders,
    onSelectOrder,
    onScanWithoutOrder,
}: {
    orders: PendingOrder[]
    onSelectOrder: (o: PendingOrder) => void
    onScanWithoutOrder: () => void
}) {
    return (
        <div className="space-y-4">
            {orders.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center">
                    <ClipboardList className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                    <p className="font-medium">Sin pedidos pendientes</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                        No hay pedidos pendientes de entrega en este local.
                    </p>
                </div>
            ) : (
                <>
                    <p className="text-sm text-muted-foreground">
                        {orders.length} pedido{orders.length !== 1 ? 's' : ''} pendiente
                        {orders.length !== 1 ? 's' : ''} de recibir
                    </p>
                    {orders.map((order) => (
                        <OrderCard key={order.id} order={order} onSelect={onSelectOrder} />
                    ))}
                </>
            )}

            <div className="mt-6 border-t pt-4">
                <button
                    onClick={onScanWithoutOrder}
                    className="flex w-full items-center justify-center gap-2 rounded-md border px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                    <ScanLine className="h-4 w-4" />
                    Escanear documento sin pedido
                </button>
            </div>
        </div>
    )
}

function OrderCard({
    order,
    onSelect,
}: {
    order: PendingOrder
    onSelect: (o: PendingOrder) => void
}) {
    const providersLabel =
        order.providers.length > 0 ? order.providers.join(', ') : 'Proveedor desconocido'
    const pendingLines = order.lines.filter(isLinePending)
    const sentDate = order.sent_at
        ? new Date(order.sent_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
        : null

    return (
        <div className="rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{providersLabel}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                        {pendingLines.length} producto{pendingLines.length !== 1 ? 's' : ''} pendiente
                        {pendingLines.length !== 1 ? 's' : ''}
                        {sentDate ? ` · Pedido el ${sentDate}` : ''}
                    </p>
                </div>
                <DeliveryBadge status={order.delivery_status} scanSubmittedAt={order.scan_submitted_at} />
            </div>
            <Button className="mt-3 w-full" size="sm" onClick={() => onSelect(order)}>
                Recibir
            </Button>
        </div>
    )
}

function DeliveryBadge({ status, scanSubmittedAt }: { status: string; scanSubmittedAt: string | null }) {
    if (status === 'partially_delivered') {
        return (
            <Badge variant="outline" className="border-amber-400 text-amber-600 shrink-0">
                Parcial
            </Badge>
        )
    }
    if (status === 'pending' && scanSubmittedAt) {
        return (
            <Badge variant="outline" className="border-amber-400 text-amber-600 shrink-0">
                En proceso
            </Badge>
        )
    }
    return (
        <Badge variant="outline" className="border-blue-400 text-blue-600 shrink-0">
            Pendiente
        </Badge>
    )
}

// ─── Shared: photo capture section with multiscan ─────────────────────────────

function PhotoCaptureSection({
    pages,
    fileInputRef,
    onOpenScanner,
    onOpenLightbox,
    onRemovePage,
}: {
    pages: ScannedPage[]
    fileInputRef: React.RefObject<HTMLInputElement | null>
    onOpenScanner: () => void
    onOpenLightbox: (src: string) => void
    onRemovePage: (index: number) => void
}) {
    if (pages.length > 0) {
        return (
            <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                    {pages.map((page, i) => (
                        <div key={i} className="relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={page.dataUrl}
                                alt={`Página ${i + 1}`}
                                className="w-full aspect-[3/4] object-cover rounded-md border cursor-pointer bg-muted/30"
                                onClick={() => onOpenLightbox(page.dataUrl)}
                            />
                            <button
                                className="absolute -top-1.5 -right-1.5 rounded-full bg-destructive p-0.5 text-destructive-foreground shadow"
                                onClick={() => onRemovePage(i)}
                            >
                                <X className="h-3 w-3" />
                            </button>
                            <span className="absolute bottom-1 left-1 rounded bg-black/50 px-1 text-[10px] text-white">
                                {i + 1}
                            </span>
                        </div>
                    ))}
                </div>
                <p className="text-center text-xs text-muted-foreground">Toca una imagen para verla completa</p>
                <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" className="w-full" onClick={onOpenScanner}>
                        <Plus className="mr-1 h-4 w-4" />
                        Añadir página
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <Upload className="mr-1 h-4 w-4" />
                        Desde galería
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className="grid grid-cols-2 gap-3">
            <Button
                variant="outline"
                className="flex-col h-20 gap-2 border-dashed"
                onClick={onOpenScanner}
            >
                <Camera className="h-6 w-6" />
                <span className="text-xs">Cámara</span>
            </Button>
            <Button
                variant="outline"
                className="flex-col h-20 gap-2 border-dashed"
                onClick={() => fileInputRef.current?.click()}
            >
                <Upload className="h-6 w-6" />
                <span className="text-xs">Galería</span>
            </Button>
        </div>
    )
}

// ─── Reception view (selected order) ─────────────────────────────────────────

function ReceptionView({
    order,
    docType,
    setDocType,
    pages,
    fileInputRef,
    onOpenScanner,
    onOpenLightbox,
    onRemovePage,
    observations,
    setObservations,
    isSubmitting,
    onBack,
    onSubmit,
    onGoManual,
}: {
    order: PendingOrder
    docType: DocType
    setDocType: (d: DocType) => void
    pages: ScannedPage[]
    fileInputRef: React.RefObject<HTMLInputElement | null>
    onOpenScanner: () => void
    onOpenLightbox: (src: string) => void
    onRemovePage: (index: number) => void
    observations: string
    setObservations: (v: string) => void
    isSubmitting: boolean
    onBack: () => void
    onSubmit: () => void
    onGoManual: () => void
}) {
    const pendingLines = order.lines.filter(isLinePending)

    return (
        <div className="space-y-5">
            <div>
                <button
                    onClick={onBack}
                    className="mb-3 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                    <ChevronLeft className="h-4 w-4" />
                    Volver a pedidos
                </button>
                <h2 className="font-semibold">
                    {order.providers.length > 0 ? order.providers.join(', ') : 'Pedido'}
                </h2>
            </div>

            <div className="rounded-lg border bg-muted/30 p-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Productos pedidos
                </p>
                <div className="space-y-1.5">
                    {pendingLines.map((l) => (
                        <OrderLineRow key={l.id} line={l} />
                    ))}
                    {pendingLines.length === 0 && (
                        <p className="text-sm text-muted-foreground">Todos los productos recibidos</p>
                    )}
                </div>
            </div>

            <div>
                <Label className="mb-2 block text-sm">Tipo de documento</Label>
                <div className="grid grid-cols-4 gap-1">
                    {DOC_TYPES.map((dt) => (
                        <button
                            key={dt.value}
                            onClick={() => setDocType(dt.value)}
                            className={`rounded-md border px-2 py-2 text-xs font-medium transition-colors ${
                                docType === dt.value
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : 'border-border bg-background text-muted-foreground hover:border-primary/50'
                            }`}
                        >
                            {dt.label}
                        </button>
                    ))}
                </div>
            </div>

            <div>
                <Label className="mb-2 block text-sm">
                    Foto del documento
                    {pages.length > 1 && (
                        <span className="ml-2 text-xs text-muted-foreground">
                            ({pages.length} páginas — se envía como PDF)
                        </span>
                    )}
                </Label>
                <PhotoCaptureSection
                    pages={pages}
                    fileInputRef={fileInputRef}
                    onOpenScanner={onOpenScanner}
                    onOpenLightbox={onOpenLightbox}
                    onRemovePage={onRemovePage}
                />
            </div>

            <div>
                <Label htmlFor="obs" className="mb-2 block text-sm">
                    Observaciones <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Textarea
                    id="obs"
                    placeholder="Ej: faltaron 2 cajas, producto en mal estado..."
                    value={observations}
                    onChange={(e) => setObservations(e.target.value)}
                    rows={3}
                />
            </div>

            <Button className="w-full" size="lg" onClick={onSubmit} disabled={isSubmitting}>
                {isSubmitting ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Enviando...
                    </>
                ) : (
                    'Confirmar recepción'
                )}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
                ¿No llegó documento?{' '}
                <button onClick={onGoManual} className="underline hover:text-foreground">
                    Registrar cantidades manualmente
                </button>
            </p>
        </div>
    )
}

// ─── No-order confirm view ────────────────────────────────────────────────────

function NoOrderConfirmView({
    docType,
    setDocType,
    pages,
    onOpenLightbox,
    onRemovePage,
    observations,
    setObservations,
    isSubmitting,
    onBack,
    onAddPage,
    onSubmit,
}: {
    docType: DocType
    setDocType: (d: DocType) => void
    pages: ScannedPage[]
    onOpenLightbox: (src: string) => void
    onRemovePage: (index: number) => void
    observations: string
    setObservations: (v: string) => void
    isSubmitting: boolean
    onBack: () => void
    onAddPage: () => void
    onSubmit: () => void
}) {
    return (
        <div className="space-y-5">
            <div>
                <button
                    onClick={onBack}
                    className="mb-3 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                    <ChevronLeft className="h-4 w-4" />
                    Volver
                </button>
                <h2 className="font-semibold">Escanear sin pedido</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    El documento se procesará y vinculará manualmente desde el panel.
                </p>
            </div>

            {pages.length > 0 && (
                <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                        {pages.map((page, i) => (
                            <div key={i} className="relative">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={page.dataUrl}
                                    alt={`Página ${i + 1}`}
                                    className="w-full aspect-[3/4] object-cover rounded-md border cursor-pointer bg-muted/30"
                                    onClick={() => onOpenLightbox(page.dataUrl)}
                                />
                                <button
                                    className="absolute -top-1.5 -right-1.5 rounded-full bg-destructive p-0.5 text-destructive-foreground shadow"
                                    onClick={() => onRemovePage(i)}
                                >
                                    <X className="h-3 w-3" />
                                </button>
                                <span className="absolute bottom-1 left-1 rounded bg-black/50 px-1 text-[10px] text-white">
                                    {i + 1}
                                </span>
                            </div>
                        ))}
                    </div>
                    <p className="text-center text-xs text-muted-foreground">
                        Toca una imagen para verla completa
                        {pages.length > 1 && ' · Se enviarán como PDF'}
                    </p>
                    <Button variant="outline" size="sm" className="w-full" onClick={onAddPage}>
                        <Plus className="mr-2 h-4 w-4" />
                        Añadir página
                    </Button>
                </div>
            )}

            <div>
                <Label className="mb-2 block text-sm">Tipo de documento</Label>
                <div className="grid grid-cols-4 gap-1">
                    {DOC_TYPES.map((dt) => (
                        <button
                            key={dt.value}
                            onClick={() => setDocType(dt.value)}
                            className={`rounded-md border px-2 py-2 text-xs font-medium transition-colors ${
                                docType === dt.value
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : 'border-border bg-background text-muted-foreground hover:border-primary/50'
                            }`}
                        >
                            {dt.label}
                        </button>
                    ))}
                </div>
            </div>

            <div>
                <Label htmlFor="obs-noorder" className="mb-2 block text-sm">
                    Observaciones <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Textarea
                    id="obs-noorder"
                    placeholder="Ej: llegó sin pedido previo, proveedor X..."
                    value={observations}
                    onChange={(e) => setObservations(e.target.value)}
                    rows={3}
                />
            </div>

            <Button className="w-full" size="lg" onClick={onSubmit} disabled={isSubmitting || pages.length === 0}>
                {isSubmitting ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Enviando...
                    </>
                ) : (
                    'Enviar documento'
                )}
            </Button>
        </div>
    )
}

function OrderLineRow({ line }: { line: PendingOrderLine }) {
    const remaining = getPendingQuantity(line)
    const unit = line.unit ? ` ${line.unit}` : ''
    return (
        <div className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{line.raw_text}</span>
            <span className="shrink-0 text-muted-foreground">
                {remaining > 0 ? (
                    <>
                        {remaining}
                        {unit} pendiente{remaining !== 1 ? 's' : ''}
                    </>
                ) : (
                    <span className="text-green-600">Recibido</span>
                )}
            </span>
        </div>
    )
}

// ─── Manual qty view ──────────────────────────────────────────────────────────

function ManualQtyView({
    order,
    manualQtys,
    setManualQtys,
    observations,
    setObservations,
    isPending,
    onBack,
    onSubmit,
}: {
    order: PendingOrder
    manualQtys: Record<string, number>
    setManualQtys: React.Dispatch<React.SetStateAction<Record<string, number>>>
    observations: string
    setObservations: (v: string) => void
    isPending: boolean
    onBack: () => void
    onSubmit: () => void
}) {
    const pendingLines = order.lines.filter(isLinePending)

    function updateQty(lineId: string, value: string) {
        const n = parseFloat(value)
        setManualQtys((prev) => ({ ...prev, [lineId]: isNaN(n) ? 0 : Math.max(0, n) }))
    }

    return (
        <div className="space-y-5">
            <div>
                <button
                    onClick={onBack}
                    className="mb-3 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                    <ChevronLeft className="h-4 w-4" />
                    Volver
                </button>
                <h2 className="font-semibold">Registrar cantidades</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    Indica cuánto recibiste de cada producto
                </p>
            </div>

            <div className="space-y-3">
                {pendingLines.map((line) => {
                    const remaining = getPendingQuantity(line)
                    return (
                        <div key={line.id} className="rounded-lg border bg-card p-3">
                            <p className="mb-2 text-sm font-medium">{line.raw_text}</p>
                            <div className="flex items-center gap-3">
                                <div className="flex-1">
                                    <Label className="mb-1 block text-xs text-muted-foreground">
                                        Cantidad recibida{line.unit ? ` (${line.unit})` : ''}
                                    </Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        max={remaining}
                                        step={1}
                                        value={manualQtys[line.id] ?? remaining}
                                        onChange={(e) => updateQty(line.id, e.target.value)}
                                        className="text-base"
                                    />
                                </div>
                                <div className="text-right text-xs text-muted-foreground">
                                    <p>Pedido</p>
                                    <p className="font-medium">
                                        {line.quantity}
                                        {line.unit ? ` ${line.unit}` : ''}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>

            <div>
                <Label htmlFor="obs-manual" className="mb-2 block text-sm">
                    Observaciones <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Textarea
                    id="obs-manual"
                    placeholder="Ej: faltaron 2 cajas, llegaron mañana..."
                    value={observations}
                    onChange={(e) => setObservations(e.target.value)}
                    rows={2}
                />
            </div>

            <Button className="w-full" size="lg" onClick={onSubmit} disabled={isPending}>
                {isPending ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Guardando...
                    </>
                ) : (
                    'Confirmar recepción sin documento'
                )}
            </Button>
        </div>
    )
}

// ─── Success / Error views ────────────────────────────────────────────────────

function SuccessView({ message, jobStatus, onReset }: {
    message: string
    jobStatus: 'polling' | 'success' | 'duplicate' | 'failed' | 'timeout' | null
    onReset: () => void
}) {
    const isPolling = jobStatus === 'polling'

    const icon = jobStatus === 'duplicate'
        ? <AlertTriangle className="mx-auto mb-4 h-14 w-14 text-amber-500" />
        : jobStatus === 'failed'
        ? <AlertCircle className="mx-auto mb-4 h-14 w-14 text-destructive" />
        : <CheckCircle className="mx-auto mb-4 h-14 w-14 text-green-500" />

    const title = jobStatus === 'duplicate'
        ? 'Documento duplicado'
        : jobStatus === 'failed'
        ? 'Error en el procesamiento'
        : '¡Recepción confirmada!'

    return (
        <div className="py-12 text-center">
            {icon}
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="mt-2 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                {isPolling && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />}
                {message}
            </p>
            <Button className="mt-8 w-full" variant="outline" onClick={onReset}>
                Volver a pedidos
            </Button>
        </div>
    )
}

function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
    return (
        <div className="py-12 text-center">
            <AlertCircle className="mx-auto mb-4 h-14 w-14 text-destructive" />
            <h2 className="text-xl font-semibold">Error</h2>
            <p className="mt-2 text-sm text-muted-foreground">{message}</p>
            <Button className="mt-8 w-full" onClick={onRetry}>
                Intentar de nuevo
            </Button>
        </div>
    )
}
