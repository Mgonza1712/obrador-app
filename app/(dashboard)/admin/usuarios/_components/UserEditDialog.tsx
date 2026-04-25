'use client'

import { useState, useTransition } from 'react'
import { Pencil, Loader2, CheckCircle, AlertCircle, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { updateUserProfile, updateUserVenueSectors, sendWALinkCode } from '@/app/actions/admin'
import type { UserProfile } from '@/app/actions/admin'

const ROLES = [
    {
        value: 'buyer',
        label: 'Comprador',
        desc: 'Crea pedidos, gestiona proveedores, compara precios, escanea documentos, arma escandallos (recetas y costes).',
    },
    {
        value: 'shift_manager',
        label: 'Encargado de turno',
        desc: 'Solo lectura: ve pedidos activos. Puede registrar recepciones de mercadería.',
    },
    {
        value: 'local_admin',
        label: 'Admin de local',
        desc: 'Todo lo del Comprador + aprueba pedidos, revisa documentos, concilia facturas, ve dashboard del local.',
    },
    {
        value: 'admin',
        label: 'Administración',
        desc: 'Acceso cross-local, gestión de catálogo y usuarios, alertas de rentabilidad.',
    },
    {
        value: 'owner',
        label: 'Dueño',
        desc: 'Todo el acceso + configura integraciones (WhatsApp, Chatwoot) y bot WPP.',
    },
]

const SECTOR_OPTIONS = [
    { value: 'cocina', label: 'Cocina' },
    { value: 'barra', label: 'Barra' },
    { value: 'salon', label: 'Salón' },
    { value: 'todos', label: 'Todos' },
]

interface Props {
    user: UserProfile
    venues: { id: string; name: string }[]
    currentUserId: string
}

function buildInitialVS(user: UserProfile): Record<string, string[]> {
    const initial: Record<string, string[]> = {}
    for (const vs of user.venue_sectors) {
        if (!initial[vs.venue_id]) initial[vs.venue_id] = []
        initial[vs.venue_id].push(vs.sector)
    }
    return initial
}

export default function UserEditDialog({ user, venues, currentUserId }: Props) {
    const isSelf = user.id === currentUserId
    const [open, setOpen] = useState(false)
    const [isPending, startTransition] = useTransition()
    const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

    const [form, setForm] = useState({
        full_name: user.full_name ?? '',
        role: user.role ?? 'buyer',
        phone: user.phone ?? '',
    })

    const [venueSectors, setVenueSectors] = useState<Record<string, string[]>>(
        () => buildInitialVS(user)
    )

    function showToast(type: 'success' | 'error', msg: string) {
        setToast({ type, msg })
        setTimeout(() => setToast(null), 3500)
    }

    function toggleVenue(venueId: string) {
        setVenueSectors((prev) => {
            const next = { ...prev }
            if (next[venueId]) {
                delete next[venueId]
            } else {
                next[venueId] = ['todos']
            }
            return next
        })
    }

    function toggleSector(venueId: string, sector: string) {
        setVenueSectors((prev) => {
            const current = prev[venueId] ?? []
            let updated: string[]

            if (sector === 'todos') {
                updated = current.includes('todos') ? [] : ['todos']
            } else {
                updated = current.filter((s) => s !== 'todos')
                if (updated.includes(sector)) {
                    updated = updated.filter((s) => s !== sector)
                } else {
                    updated = [...updated, sector]
                }
            }

            if (updated.length === 0) {
                const next = { ...prev }
                delete next[venueId]
                return next
            }

            return { ...prev, [venueId]: updated }
        })
    }

    function handleSave() {
        startTransition(async () => {
            const pairs: { venue_id: string; sector: string }[] = []
            for (const [venueId, sectors] of Object.entries(venueSectors)) {
                for (const sector of sectors) {
                    pairs.push({ venue_id: venueId, sector })
                }
            }

            const [profileRes, vsRes] = await Promise.all([
                updateUserProfile(user.id, {
                    full_name: form.full_name,
                    role: form.role,
                    phone: form.phone,
                }),
                updateUserVenueSectors(user.id, pairs),
            ])

            if (profileRes.success && vsRes.success) {
                showToast('success', 'Perfil actualizado')
                setOpen(false)
            } else {
                const err = !profileRes.success ? profileRes.error : !vsRes.success ? vsRes.error : ''
                showToast('error', err)
            }
        })
    }

    function handleSendLinkCode() {
        startTransition(async () => {
            const res = await sendWALinkCode(user.id)
            if (res.success) {
                showToast('success', 'Código enviado por WhatsApp')
            } else {
                showToast('error', res.error)
            }
        })
    }

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="Editar perfil"
            >
                <Pencil className="h-4 w-4" />
            </button>

            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-xl max-h-[90vh] overflow-y-auto">
                        <h2 className="mb-4 text-base font-semibold">Editar perfil</h2>
                        <p className="mb-4 text-xs text-muted-foreground">{user.email}</p>

                        <div className="space-y-3">
                            <div>
                                <label className="mb-1 block text-xs text-muted-foreground">Nombre completo</label>
                                <input
                                    type="text"
                                    value={form.full_name}
                                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-1 block text-xs text-muted-foreground">Rol</label>
                                    <select
                                        value={form.role}
                                        onChange={(e) => setForm({ ...form, role: e.target.value })}
                                        disabled={isSelf}
                                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                                    </select>
                                    {isSelf ? (
                                        <p className="mt-1 text-xs text-muted-foreground">No podés cambiar tu propio rol</p>
                                    ) : (
                                        <p className="mt-1 text-xs text-muted-foreground leading-snug">
                                            {ROLES.find(r => r.value === form.role)?.desc}
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs text-muted-foreground">Teléfono</label>
                                    <input
                                        type="tel"
                                        value={form.phone}
                                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                                        placeholder="+34 612 345 678"
                                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                    />
                                </div>
                            </div>

                            {/* Venue-Sector matrix */}
                            <div>
                                <label className="mb-1.5 block text-xs text-muted-foreground">Locales y sectores</label>
                                <div className="space-y-2 rounded-md border border-input p-3">
                                    {venues.map((v) => {
                                        const enabled = !!venueSectors[v.id]
                                        const sectors = venueSectors[v.id] ?? []
                                        return (
                                            <div key={v.id}>
                                                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                                                    <input
                                                        type="checkbox"
                                                        checked={enabled}
                                                        onChange={() => toggleVenue(v.id)}
                                                        className="rounded border-input accent-primary"
                                                    />
                                                    <span className={enabled ? 'font-medium' : 'text-muted-foreground'}>
                                                        {v.name}
                                                    </span>
                                                </label>
                                                {enabled && (
                                                    <div className="ml-6 mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                                                        {SECTOR_OPTIONS.map(({ value, label }) => (
                                                            <label key={value} className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={sectors.includes(value)}
                                                                    onChange={() => toggleSector(v.id, value)}
                                                                    className="rounded border-input accent-primary"
                                                                />
                                                                {label}
                                                            </label>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                    {venues.length === 0 && (
                                        <p className="text-xs text-muted-foreground">No hay locales configurados</p>
                                    )}
                                </div>
                            </div>

                            {/* WA linking */}
                            <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-medium">WhatsApp vinculado</p>
                                        <p className="text-xs text-muted-foreground">
                                            {user.whatsapp_jid ? (
                                                <span className="text-green-600">Vinculado ✓</span>
                                            ) : (
                                                'Sin vincular'
                                            )}
                                        </p>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleSendLinkCode}
                                        disabled={isPending || !form.phone}
                                        className="flex items-center gap-1.5 text-xs"
                                    >
                                        <Send className="h-3 w-3" />
                                        Enviar código WA
                                    </Button>
                                </div>
                                {!form.phone && (
                                    <p className="text-xs text-amber-600">Ingresá el teléfono primero</p>
                                )}
                            </div>
                        </div>

                        {toast && (
                            <div className={`mt-3 flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${
                                toast.type === 'success'
                                    ? 'border-green-200 bg-green-50 text-green-700'
                                    : 'border-red-200 bg-red-50 text-red-700'
                            }`}>
                                {toast.type === 'success'
                                    ? <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                                    : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
                                {toast.msg}
                            </div>
                        )}

                        <div className="mt-4 flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={isPending}>
                                Cancelar
                            </Button>
                            <Button size="sm" onClick={handleSave} disabled={isPending}>
                                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Guardar'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
