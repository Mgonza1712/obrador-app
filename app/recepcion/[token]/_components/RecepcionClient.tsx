'use client'

import { useState, useRef, useTransition } from 'react'
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
} from 'lucide-react'
import type { VenueInfo, PendingOrder, PendingOrderLine } from '@/app/actions/recepcion'
import { anonRegisterDelivery } from '@/app/actions/recepcion'
import { CameraCapture } from '@/app/scan/components/CameraCapture'
import { PerspectiveEditor } from '@/app/scan/components/PerspectiveEditor'

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 'orders' | 'reception' | 'no-order-confirm' | 'manual-qty' | 'success' | 'error'

/** null = scanner closed; 'order' = scanning for a selected order; 'no-order' = scanning without linked order */
type ScanContext = 'order' | 'no-order' | null

type DocType = 'albaran' | 'factura' | 'ticket' | 'otro'

const DOC_TYPES: { value: DocType; label: string }[] = [
    { value: 'albaran', label: 'Albarán' },
    { value: 'factura', label: 'Factura' },
    { value: 'ticket', label: 'Ticket' },
    { value: 'otro', label: 'No sé' },
]

function dataUrlToFile(dataUrl: string, filename: string): File {
    const arr = dataUrl.split(',')
    const mime = arr[0].match(/:(.*?);/)?.[1] ?? 'image/jpeg'
    const bstr = atob(arr[1])
    const u8arr = new Uint8Array(bstr.length)
    for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i)
    return new File([u8arr], filename, { type: mime })
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
    token: string
    venue: VenueInfo
    initialOrders: PendingOrder[]
}

export default function RecepcionClient({ token, venue, initialOrders }: Props) {
    const [step, setStep]                   = useState<Step>('orders')
    const [selectedOrder, setSelectedOrder] = useState<PendingOrder | null>(null)
    const [docType, setDocType]             = useState<DocType>('albaran')
    const [photo, setPhoto]                 = useState<File | null>(null)
    const [photoPreview, setPhotoPreview]   = useState<string | null>(null)
    const [observations, setObservations]   = useState('')
    const [manualQtys, setManualQtys]       = useState<Record<string, number>>({})
    const [successMsg, setSuccessMsg]       = useState('')
    const [errorMsg, setErrorMsg]           = useState('')
    const [isPending, startTransition]      = useTransition()
    const [isSubmitting, setIsSubmitting]   = useState(false)

    // ── Scanner state ─────────────────────────────────────────────────────────
    const [scanContext, setScanContext]       = useState<ScanContext>(null)
    const [scanRawCapture, setScanRawCapture] = useState<string | null>(null)

    const fileInputRef = useRef<HTMLInputElement>(null)

    // ── Handlers ──────────────────────────────────────────────────────────────

    function handleSelectOrder(order: PendingOrder) {
        setSelectedOrder(order)
        setDocType('albaran')
        setPhoto(null)
        setPhotoPreview(null)
        setObservations('')
        setStep('reception')
    }

    function handleOpenScanner(ctx: ScanContext) {
        setScanRawCapture(null)
        setScanContext(ctx)
    }

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        setPhoto(file)
        setPhotoPreview(URL.createObjectURL(file))
    }

    // Called when PerspectiveEditor confirms the corrected image
    function handlePerspectiveConfirm(processedDataUrl: string, ctx: ScanContext) {
        const file = dataUrlToFile(processedDataUrl, `scan_${Date.now()}.jpg`)
        setPhoto(file)
        setPhotoPreview(processedDataUrl)
        setScanRawCapture(null)
        setScanContext(null)

        if (ctx === 'no-order') {
            setStep('no-order-confirm')
        }
        // For 'order' context the user is already in the 'reception' step
    }

    function handleGoManual() {
        if (!selectedOrder) return
        const qtys: Record<string, number> = {}
        for (const l of selectedOrder.lines) {
            qtys[l.id] = Math.max(0, l.quantity - l.qty_received)
        }
        setManualQtys(qtys)
        setStep('manual-qty')
    }

    // Photo submission (works for both order and no-order flows)
    async function handleSubmitRecepcion() {
        setIsSubmitting(true)
        setErrorMsg('')

        const formData = new FormData()
        formData.append('order_id', selectedOrder?.id ?? '')
        formData.append('observations', observations)
        formData.append('doc_type', docType)
        if (photo) formData.append('photo', photo)

        try {
            const res = await fetch(`/api/recepcion/${token}/submit`, {
                method: 'POST',
                body: formData,
            })
            const data = await res.json()

            if (!res.ok || !data.success) {
                setErrorMsg(data.error ?? 'Error al enviar la recepción')
                setStep('error')
                return
            }

            setSuccessMsg(
                photo
                    ? 'Foto enviada correctamente. El documento se procesará en unos minutos y las cantidades se actualizarán automáticamente.'
                    : 'Observaciones registradas.'
            )
            setStep('success')
        } catch {
            setErrorMsg('No se pudo conectar. Verifica tu conexión e inténtalo de nuevo.')
            setStep('error')
        } finally {
            setIsSubmitting(false)
        }
    }

    // Manual qty submission (Server Action)
    function handleSubmitManual() {
        if (!selectedOrder) return
        const received = Object.entries(manualQtys).map(([line_id, qty_received]) => ({
            line_id,
            qty_received,
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
        setStep('orders')
        setSelectedOrder(null)
        setPhoto(null)
        setPhotoPreview(null)
        setObservations('')
        setManualQtys({})
        setErrorMsg('')
        setSuccessMsg('')
        setScanContext(null)
        setScanRawCapture(null)
    }

    // ── Scanner overlay (full-screen, takes over the whole render) ────────────

    if (scanContext !== null) {
        if (scanRawCapture === null) {
            // Step 1: Live camera
            return (
                <CameraCapture
                    onCapture={(dataUrl) => setScanRawCapture(dataUrl)}
                    onCancel={() => setScanContext(null)}
                />
            )
        }
        // Step 2: Perspective correction
        const ctx = scanContext // capture for closure
        return (
            <div className="fixed inset-0 z-40 bg-background flex flex-col">
                <PerspectiveEditor
                    imageDataUrl={scanRawCapture}
                    onConfirm={(processed) => handlePerspectiveConfirm(processed, ctx)}
                    onRetake={() => setScanRawCapture(null)}
                />
            </div>
        )
    }

    // ── Normal UI ─────────────────────────────────────────────────────────────

    return (
        <div className="mx-auto max-w-md px-4 py-6 pb-12">
            {/* Header */}
            <div className="mb-6">
                <div className="flex items-center gap-2">
                    <Package className="h-5 w-5 text-primary" />
                    <h1 className="text-lg font-semibold">{venue.name}</h1>
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">Recepción de mercancía</p>
            </div>

            {/* Hidden file input for gallery uploads */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
            />

            {/* Views */}
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
                    photoPreview={photoPreview}
                    fileInputRef={fileInputRef}
                    onOpenScanner={() => handleOpenScanner('order')}
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
                    photoPreview={photoPreview}
                    observations={observations}
                    setObservations={setObservations}
                    isSubmitting={isSubmitting}
                    onBack={() => {
                        setStep('orders')
                        setPhoto(null)
                        setPhotoPreview(null)
                    }}
                    onRetakePhoto={() => handleOpenScanner('no-order')}
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
                <SuccessView message={successMsg} onReset={handleReset} />
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
    const pendingLines = order.lines.filter((l) => l.qty_received < l.quantity)
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
                <DeliveryBadge status={order.delivery_status} />
            </div>
            <Button className="mt-3 w-full" size="sm" onClick={() => onSelect(order)}>
                Recibir
            </Button>
        </div>
    )
}

function DeliveryBadge({ status }: { status: string }) {
    if (status === 'partially_delivered') {
        return (
            <Badge variant="outline" className="border-amber-400 text-amber-600 shrink-0">
                Parcial
            </Badge>
        )
    }
    return (
        <Badge variant="outline" className="border-blue-400 text-blue-600 shrink-0">
            Pendiente
        </Badge>
    )
}

// ─── Shared: photo capture section ────────────────────────────────────────────

function PhotoCaptureSection({
    photoPreview,
    fileInputRef,
    onOpenScanner,
}: {
    photoPreview: string | null
    fileInputRef: React.RefObject<HTMLInputElement | null>
    onOpenScanner: () => void
}) {
    if (photoPreview) {
        return (
            <div className="space-y-2">
                {/* Tap to open full-screen */}
                <a href={photoPreview} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={photoPreview}
                        alt="Vista previa — toca para ver completa"
                        className="w-full rounded-lg border object-contain bg-muted/30"
                        style={{ maxHeight: 240 }}
                    />
                </a>
                <p className="text-center text-xs text-muted-foreground">Toca la imagen para verla completa</p>
                <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" className="w-full" onClick={onOpenScanner}>
                        <Camera className="mr-2 h-4 w-4" />
                        Repetir foto
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <Upload className="mr-2 h-4 w-4" />
                        Cambiar
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
    photoPreview,
    fileInputRef,
    onOpenScanner,
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
    photoPreview: string | null
    fileInputRef: React.RefObject<HTMLInputElement | null>
    onOpenScanner: () => void
    observations: string
    setObservations: (v: string) => void
    isSubmitting: boolean
    onBack: () => void
    onSubmit: () => void
    onGoManual: () => void
}) {
    const pendingLines = order.lines.filter((l) => l.qty_received < l.quantity)

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

            {/* Lines summary */}
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

            {/* Document type */}
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

            {/* Photo */}
            <div>
                <Label className="mb-2 block text-sm">Foto del documento</Label>
                <PhotoCaptureSection
                    photoPreview={photoPreview}
                    fileInputRef={fileInputRef}
                    onOpenScanner={onOpenScanner}
                />
            </div>

            {/* Observations */}
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
    photoPreview,
    observations,
    setObservations,
    isSubmitting,
    onBack,
    onRetakePhoto,
    onSubmit,
}: {
    docType: DocType
    setDocType: (d: DocType) => void
    photoPreview: string | null
    observations: string
    setObservations: (v: string) => void
    isSubmitting: boolean
    onBack: () => void
    onRetakePhoto: () => void
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

            {/* Photo preview */}
            {photoPreview && (
                <div className="space-y-2">
                    <a href={photoPreview} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={photoPreview}
                            alt="Documento escaneado — toca para ver completo"
                            className="w-full rounded-lg border object-contain bg-muted/30"
                            style={{ maxHeight: 260 }}
                        />
                    </a>
                    <p className="text-center text-xs text-muted-foreground">Toca la imagen para verla completa</p>
                    <Button variant="outline" size="sm" className="w-full" onClick={onRetakePhoto}>
                        <Camera className="mr-2 h-4 w-4" />
                        Repetir foto
                    </Button>
                </div>
            )}

            {/* Document type */}
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

            {/* Observations */}
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

            <Button className="w-full" size="lg" onClick={onSubmit} disabled={isSubmitting || !photoPreview}>
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
    const remaining = line.quantity - line.qty_received
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
    const pendingLines = order.lines.filter((l) => l.qty_received < l.quantity)

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
                    const remaining = line.quantity - line.qty_received
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
                                        max={line.quantity}
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

function SuccessView({ message, onReset }: { message: string; onReset: () => void }) {
    return (
        <div className="py-12 text-center">
            <CheckCircle className="mx-auto mb-4 h-14 w-14 text-green-500" />
            <h2 className="text-xl font-semibold">¡Recepción confirmada!</h2>
            <p className="mt-2 text-sm text-muted-foreground">{message}</p>
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
