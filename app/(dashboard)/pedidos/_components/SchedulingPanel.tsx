'use client'

import { useState, useTransition } from 'react'
import { Calendar, RefreshCw, Clock, CheckCircle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { scheduleOrder, setRecurrence } from '@/app/actions/pedidos'

interface Props {
    orderId: string
    venueId: string | null
    scheduledFor: string | null
    isTemplate: boolean
    recurrenceCron: string | null
    recurrenceLabel: string | null
    nextRunAt: string | null
    onScheduleChange: (scheduledFor: string | null) => void
    onRecurrenceChange: (isTemplate: boolean, cron: string | null, label: string | null, nextRunAt: string | null) => void
}

const WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const WEEKDAY_ISO = [0, 1, 2, 3, 4, 5, 6] // 0=Sun, 1=Mon...

function buildCron(weekdays: number[], hour: number, minute: number): string {
    if (weekdays.length === 0) return `${minute} ${hour} * * *`
    const days = weekdays.map((d) => (d === 0 ? 7 : d)).sort().join(',')
    return `${minute} ${hour} * * ${days}`
}

function buildLabel(weekdays: number[], hour: number, minute: number): string {
    const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    if (weekdays.length === 0) return `Todos los días a las ${timeStr}`
    if (weekdays.length === 7) return `Todos los días a las ${timeStr}`
    const sortedDays = [...weekdays].sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
    const names = sortedDays.map((d) => WEEKDAY_LABELS[d])
    return `Cada ${names.join(', ')} a las ${timeStr}`
}

function formatDateTime(iso: string | null): string {
    if (!iso) return ''
    return new Date(iso).toLocaleString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}

// Convert local datetime-local input value to ISO string
function localToIso(local: string): string {
    return new Date(local).toISOString()
}

// Convert ISO string to datetime-local input value
function isoToLocal(iso: string): string {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function SchedulingPanel({
    orderId,
    venueId,
    scheduledFor,
    isTemplate,
    recurrenceCron,
    recurrenceLabel,
    nextRunAt,
    onScheduleChange,
    onRecurrenceChange,
}: Props) {
    const [isPending, startTransition] = useTransition()
    const [expanded, setExpanded] = useState(!!(scheduledFor || isTemplate))
    const [activeTab, setActiveTab] = useState<'once' | 'recurring'>(isTemplate ? 'recurring' : 'once')
    const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

    // One-time scheduling state
    const [scheduledInput, setScheduledInput] = useState(
        scheduledFor ? isoToLocal(scheduledFor) : ''
    )

    // Recurrence state
    const [selectedDays, setSelectedDays] = useState<number[]>(() => {
        if (!recurrenceCron) return [1, 3, 5] // default Mon/Wed/Fri
        const parts = recurrenceCron.split(' ')
        const daysPart = parts[4]
        if (daysPart === '*') return []
        return daysPart.split(',').map((d) => { const n = parseInt(d); return n === 7 ? 0 : n })
    })
    const [recHour, setRecHour] = useState(() => {
        if (!recurrenceCron) return 8
        return parseInt(recurrenceCron.split(' ')[1])
    })
    const [recMinute, setRecMinute] = useState(() => {
        if (!recurrenceCron) return 0
        return parseInt(recurrenceCron.split(' ')[0])
    })

    function showToast(type: 'success' | 'error', msg: string) {
        setToast({ type, msg })
        setTimeout(() => setToast(null), 4000)
    }

    function toggleDay(day: number) {
        setSelectedDays((prev) =>
            prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
        )
    }

    function handleSaveSchedule() {
        if (!venueId) {
            showToast('error', 'Selecciona un local antes de programar el envío')
            return
        }
        startTransition(async () => {
            const isoValue = scheduledInput ? localToIso(scheduledInput) : null
            const res = await scheduleOrder(orderId, isoValue)
            if (res.success) {
                onScheduleChange(isoValue)
                // Server action clears recurrence — reflect in parent
                if (isoValue) onRecurrenceChange(false, null, null, null)
                showToast('success', isoValue ? `Programado para el ${formatDateTime(isoValue)}` : 'Programación eliminada')
            } else {
                showToast('error', res.error ?? 'Error al programar')
            }
        })
    }

    function handleClearSchedule() {
        setScheduledInput('')
        startTransition(async () => {
            const res = await scheduleOrder(orderId, null)
            if (res.success) {
                onScheduleChange(null)
                showToast('success', 'Programación eliminada')
            } else {
                showToast('error', res.error ?? 'Error')
            }
        })
    }

    function handleSaveRecurrence() {
        if (!venueId) {
            showToast('error', 'Selecciona un local antes de activar la recurrencia')
            return
        }
        const cron = buildCron(selectedDays, recHour, recMinute)
        const label = buildLabel(selectedDays, recHour, recMinute)
        startTransition(async () => {
            const res = await setRecurrence(orderId, cron, label)
            if (res.success) {
                onRecurrenceChange(true, cron, label, null)
                // Server action clears scheduled_for — reflect in parent
                onScheduleChange(null)
                showToast('success', `Recurrencia activada: ${label}`)
            } else {
                showToast('error', res.error ?? 'Error al configurar recurrencia')
            }
        })
    }

    function handleDisableRecurrence() {
        startTransition(async () => {
            const res = await setRecurrence(orderId, null, null)
            if (res.success) {
                onRecurrenceChange(false, null, null, null)
                showToast('success', 'Recurrencia desactivada')
            } else {
                showToast('error', res.error ?? 'Error')
            }
        })
    }

    const previewLabel = buildLabel(selectedDays, recHour, recMinute)

    return (
        <div className="rounded-lg border border-border bg-card">
            <button
                onClick={() => setExpanded((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:text-foreground transition-colors"
            >
                <span className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    Programación
                    {isTemplate && recurrenceLabel && (
                        <span className="flex items-center gap-1 text-xs font-normal text-purple-600 bg-purple-50 rounded px-1.5 py-0.5 border border-purple-200 dark:bg-purple-950 dark:text-purple-300">
                            <RefreshCw className="h-2.5 w-2.5" />
                            {recurrenceLabel}
                        </span>
                    )}
                    {scheduledFor && !isTemplate && (
                        <span className="flex items-center gap-1 text-xs font-normal text-blue-600 bg-blue-50 rounded px-1.5 py-0.5 border border-blue-200 dark:bg-blue-950 dark:text-blue-300">
                            <Clock className="h-2.5 w-2.5" />
                            {formatDateTime(scheduledFor)}
                        </span>
                    )}
                </span>
                {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>

            {expanded && (
                <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
                    {/* Venue warning */}
                    {!venueId && (
                        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                            Asigna un local al pedido antes de programar el envío.
                        </div>
                    )}
                    {/* Tab selector */}
                    <div className="flex gap-1 rounded-md border border-border bg-muted/30 p-0.5 w-fit text-xs">
                        {(['once', 'recurring'] as const).map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`rounded px-3 py-1.5 transition-colors ${
                                    activeTab === tab
                                        ? 'bg-background text-foreground shadow-sm'
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                {tab === 'once' ? (
                                    <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" />Envío único</span>
                                ) : (
                                    <span className="flex items-center gap-1.5"><RefreshCw className="h-3 w-3" />Recurrente</span>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* One-time scheduling */}
                    {activeTab === 'once' && (
                        <div className="space-y-3">
                            <p className="text-xs text-muted-foreground">
                                El pedido se enviará automáticamente en la fecha y hora elegidas. Hasta entonces permanece en borrador.
                            </p>
                            <div className="flex flex-wrap items-end gap-3">
                                <div className="flex-1 min-w-[200px]">
                                    <label className="mb-1 block text-xs text-muted-foreground">Fecha y hora de envío</label>
                                    <input
                                        type="datetime-local"
                                        value={scheduledInput}
                                        onChange={(e) => setScheduledInput(e.target.value)}
                                        min={new Date().toISOString().slice(0, 16)}
                                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                    />
                                </div>
                                <div className="flex gap-2 shrink-0">
                                    {scheduledFor && (
                                        <Button variant="outline" size="sm" onClick={handleClearSchedule} disabled={isPending}>
                                            Quitar programación
                                        </Button>
                                    )}
                                    <Button size="sm" onClick={handleSaveSchedule} disabled={isPending || !scheduledInput}>
                                        Guardar
                                    </Button>
                                </div>
                            </div>
                            {scheduledFor && (
                                <p className="text-xs text-blue-600">
                                    Programado: {formatDateTime(scheduledFor)}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Recurring */}
                    {activeTab === 'recurring' && (
                        <div className="space-y-3">
                            <p className="text-xs text-muted-foreground">
                                Este pedido se convierte en una <strong>plantilla</strong>. n8n creará y enviará una copia automáticamente según el horario definido.
                            </p>

                            <div className="space-y-2">
                                <label className="block text-xs text-muted-foreground">Días de la semana</label>
                                <div className="flex gap-1.5">
                                    {WEEKDAY_ISO.map((day) => (
                                        <button
                                            key={day}
                                            onClick={() => toggleDay(day)}
                                            className={`h-8 w-10 rounded text-xs font-medium transition-colors ${
                                                selectedDays.includes(day)
                                                    ? 'bg-primary text-primary-foreground'
                                                    : 'border border-border text-muted-foreground hover:border-primary hover:text-foreground'
                                            }`}
                                        >
                                            {WEEKDAY_LABELS[day]}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex flex-wrap items-end gap-3">
                                <div>
                                    <label className="mb-1 block text-xs text-muted-foreground">Hora</label>
                                    <div className="flex items-center gap-1">
                                        <input
                                            type="number"
                                            min={0}
                                            max={23}
                                            value={recHour}
                                            onChange={(e) => setRecHour(Math.min(23, Math.max(0, parseInt(e.target.value) || 0)))}
                                            className="w-14 rounded-md border border-input bg-background px-2 py-2 text-sm text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                                        />
                                        <span className="text-muted-foreground">:</span>
                                        <input
                                            type="number"
                                            min={0}
                                            max={59}
                                            step={5}
                                            value={recMinute}
                                            onChange={(e) => setRecMinute(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                                            className="w-14 rounded-md border border-input bg-background px-2 py-2 text-sm text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                                        />
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    {isTemplate && (
                                        <Button variant="outline" size="sm" onClick={handleDisableRecurrence} disabled={isPending}>
                                            Desactivar
                                        </Button>
                                    )}
                                    <Button size="sm" onClick={handleSaveRecurrence} disabled={isPending}>
                                        {isTemplate ? 'Actualizar' : 'Activar recurrencia'}
                                    </Button>
                                </div>
                            </div>

                            <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                                <span className="font-medium text-foreground">{previewLabel}</span>
                                {isTemplate && nextRunAt && (
                                    <span className="ml-2">· próximo envío: {formatDateTime(nextRunAt)}</span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Toast */}
                    {toast && (
                        <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${
                            toast.type === 'success'
                                ? 'border-green-200 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300'
                                : 'border-red-200 bg-red-50 text-red-700'
                        }`}>
                            {toast.type === 'success'
                                ? <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                                : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
                            {toast.msg}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
