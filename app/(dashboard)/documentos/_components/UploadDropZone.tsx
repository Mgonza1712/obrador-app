'use client'

import { useRef, useState, useCallback } from 'react'
import { Upload, FileText, X, CheckCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'

export interface VenueOption {
    id: string
    name: string
    reception_token: string
}

interface Props {
    venues: VenueOption[]
}

export function UploadDropZone({ venues }: Props) {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [dragging, setDragging]           = useState(false)
    const [file, setFile]                   = useState<File | null>(null)
    const [dialogOpen, setDialogOpen]       = useState(false)
    const [selectedToken, setSelectedToken] = useState(venues[0]?.reception_token ?? '')
    const [submitting, setSubmitting]       = useState(false)
    const [done, setDone]                   = useState(false)
    const [errorMsg, setErrorMsg]           = useState('')

    const openFile = useCallback((f: File) => {
        if (f.size > 20 * 1024 * 1024) {
            alert('El archivo supera los 20 MB.')
            return
        }
        setFile(f)
        setDone(false)
        setErrorMsg('')
        setDialogOpen(true)
    }, [])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setDragging(false)
        const f = e.dataTransfer.files[0]
        if (f) openFile(f)
    }, [openFile])

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0]
        if (f) openFile(f)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }, [openFile])

    const handleSubmit = async () => {
        if (!file || !selectedToken) return
        setSubmitting(true)
        setErrorMsg('')

        const isImage = file.type.startsWith('image/')
        const formData = new FormData()
        formData.append('photo', file)
        formData.append('doc_type', isImage ? 'albaran' : 'factura')

        try {
            const res = await fetch(`/api/recepcion/${selectedToken}/submit`, {
                method: 'POST',
                body: formData,
            })
            const data = await res.json()
            if (!res.ok || !data.success) {
                setErrorMsg(data.error ?? `Error ${res.status}`)
            } else {
                setDone(true)
            }
        } catch {
            setErrorMsg('No se pudo conectar. Verifica tu conexión.')
        } finally {
            setSubmitting(false)
        }
    }

    const handleClose = () => {
        setDialogOpen(false)
        setFile(null)
        setDone(false)
        setErrorMsg('')
    }

    return (
        <>
            <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
                    dragging
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50 hover:bg-muted/40'
                }`}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,image/*"
                    className="hidden"
                    onChange={handleFileChange}
                />
                <Upload className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">Arrastra una factura o albarán aquí</p>
                <p className="mt-1 text-xs text-muted-foreground">
                    PDF, JPG, PNG · máx. 20 MB · o haz clic para seleccionar
                </p>
            </div>

            <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) handleClose() }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Enviar documento</DialogTitle>
                    </DialogHeader>

                    {done ? (
                        <div className="flex flex-col items-center gap-3 py-4 text-center">
                            <CheckCircle className="h-12 w-12 text-green-500" />
                            <p className="font-medium">Documento enviado</p>
                            <p className="text-sm text-muted-foreground">
                                Aparecerá en la lista en unos minutos una vez procesado.
                            </p>
                            <Button className="mt-2 w-full" onClick={handleClose}>
                                Cerrar
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* File info */}
                            <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3">
                                <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium">{file?.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {file ? `${Math.round(file.size / 1024)} KB` : ''}
                                    </p>
                                </div>
                                <button
                                    onClick={handleClose}
                                    className="text-muted-foreground hover:text-foreground"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>

                            {/* Venue selector */}
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium">Local</label>
                                <select
                                    value={selectedToken}
                                    onChange={(e) => setSelectedToken(e.target.value)}
                                    className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                >
                                    {venues.map((v) => (
                                        <option key={v.id} value={v.reception_token}>
                                            {v.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Error */}
                            {errorMsg && (
                                <p className="text-sm text-destructive">{errorMsg}</p>
                            )}

                            {/* Submit */}
                            <Button
                                className="w-full"
                                disabled={submitting || !selectedToken}
                                onClick={handleSubmit}
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Enviando…
                                    </>
                                ) : (
                                    'Enviar documento'
                                )}
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    )
}
