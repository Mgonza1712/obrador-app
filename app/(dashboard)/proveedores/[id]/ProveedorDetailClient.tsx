'use client'

import { useState, useTransition } from 'react'
import { Check, Info } from 'lucide-react'
import { PROVIDER_CHANNELS, PROVIDER_CHANNEL_LABELS } from '@/lib/constants'
import { updateProvider } from '@/app/actions/proveedores'
import type { ProveedorDetail } from './page'

function Toggle({
    checked,
    onChange,
    disabled,
}: {
    checked: boolean
    onChange?: (v: boolean) => void
    disabled?: boolean
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onChange?.(!checked)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'bg-primary' : 'bg-muted-foreground/30'}`}
        >
            <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`}
            />
        </button>
    )
}

export default function ProveedorDetailClient({ provider }: { provider: ProveedorDetail }) {
    const [form, setForm] = useState({
        name: provider.name,
        email: provider.email ?? '',
        phone: provider.phone ?? '',
        contact_name: provider.contact_name ?? '',
        channel: provider.channel ?? '',
        notes: provider.notes ?? '',
        shared_pricing: provider.shared_pricing ?? false,
        is_trusted: provider.is_trusted ?? false,
        is_active: provider.is_active ?? true,
    })
    const [saved, setSaved] = useState(false)
    const [error, setError] = useState('')
    const [isPending, startTransition] = useTransition()

    function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
        setForm((prev) => ({ ...prev, [key]: value }))
        setSaved(false)
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError('')
        setSaved(false)
        startTransition(async () => {
            try {
                await updateProvider(provider.id, {
                    name: form.name,
                    email: form.email || null,
                    phone: form.phone || null,
                    contact_name: form.contact_name || null,
                    channel: form.channel || null,
                    notes: form.notes || null,
                    shared_pricing: form.shared_pricing,
                    is_trusted: form.is_trusted,
                    is_active: form.is_active,
                })
                setSaved(true)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Error al guardar.')
            }
        })
    }

    return (
        <section className="space-y-4">
            <h2 className="text-lg font-semibold">Datos de contacto</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Name */}
                <div className="grid gap-1.5">
                    <label className="text-sm font-medium">Nombre</label>
                    <input
                        type="text"
                        value={form.name}
                        onChange={(e) => set('name', e.target.value)}
                        required
                        className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                </div>

                {/* Email + Phone */}
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                        <label className="text-sm font-medium">Email</label>
                        <input
                            type="email"
                            value={form.email}
                            onChange={(e) => set('email', e.target.value)}
                            placeholder="proveedor@ejemplo.com"
                            className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                    </div>
                    <div className="grid gap-1.5">
                        <label className="text-sm font-medium">Teléfono</label>
                        <input
                            type="text"
                            value={form.phone}
                            onChange={(e) => set('phone', e.target.value)}
                            placeholder="+54 11 1234-5678"
                            className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                    </div>
                </div>

                {/* Contact name + Channel */}
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                        <label className="text-sm font-medium">Persona de contacto</label>
                        <input
                            type="text"
                            value={form.contact_name}
                            onChange={(e) => set('contact_name', e.target.value)}
                            placeholder="Nombre del contacto"
                            className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                    </div>
                    <div className="grid gap-1.5">
                        <label className="text-sm font-medium">Canal preferido</label>
                        <select
                            value={form.channel}
                            onChange={(e) => set('channel', e.target.value)}
                            className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                            <option value="">Sin especificar</option>
                            {PROVIDER_CHANNELS.map((c) => (
                                <option key={c} value={c}>
                                    {PROVIDER_CHANNEL_LABELS[c]}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Notes */}
                <div className="grid gap-1.5">
                    <label className="text-sm font-medium">Notas</label>
                    <textarea
                        value={form.notes}
                        onChange={(e) => set('notes', e.target.value)}
                        rows={3}
                        placeholder="Notas internas sobre el proveedor..."
                        className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    />
                </div>

                {/* Toggles */}
                <div className="space-y-3 rounded-lg border border-border p-4">
                    {/* Shared pricing */}
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-sm font-medium">Precio compartido para todos los locales</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Las facturas de este proveedor se asignarán a Sede Central.
                                Los albaranes siempre van al local receptor.
                            </p>
                        </div>
                        <Toggle
                            checked={form.shared_pricing}
                            onChange={(v) => set('shared_pricing', v)}
                        />
                    </div>

                    <div className="border-t border-border" />

                    {/* is_trusted */}
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2">
                                <p className="text-sm font-medium">
                                    Proveedor confiable
                                </p>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Los documentos se aprobarán automáticamente si no contienen productos
                                nuevos.
                            </p>
                        </div>
                        <Toggle
                            checked={form.is_trusted}
                            onChange={(v) => set('is_trusted', v)}
                        />
                    </div>

                    <div className="border-t border-border" />

                    {/* is_active */}
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-sm font-medium">Activo</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Los proveedores inactivos no aparecen en sugerencias automáticas.
                            </p>
                        </div>
                        <Toggle
                            checked={form.is_active}
                            onChange={(v) => set('is_active', v)}
                        />
                    </div>
                </div>

                {/* Submit */}
                <div className="flex items-center gap-3">
                    <button
                        type="submit"
                        disabled={isPending}
                        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                        {isPending ? 'Guardando...' : 'Guardar cambios'}
                    </button>
                    {saved && (
                        <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                            <Check className="h-4 w-4" />
                            Guardado
                        </span>
                    )}
                    {error && <span className="text-sm text-destructive">{error}</span>}
                </div>
            </form>
        </section>
    )
}
