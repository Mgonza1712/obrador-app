'use client'

import { useState, useTransition } from 'react'
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { updateTenantWAConfig } from '@/app/actions/admin'
import type { TenantConfig } from '@/app/actions/admin'

export default function WAConfigForm({ config }: { config: TenantConfig | null }) {
    const [isPending, startTransition] = useTransition()
    const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
    const [form, setForm] = useState({
        evolution_api_url: config?.evolution_api_url ?? '',
        evolution_bot_instance: config?.evolution_bot_instance ?? '',
        evolution_ordering_instance: config?.evolution_ordering_instance ?? '',
        chatwoot_inbox_id: config?.chatwoot_inbox_id?.toString() ?? '',
        chatwoot_account_id: config?.chatwoot_account_id?.toString() ?? '',
    })

    function handleSave() {
        startTransition(async () => {
            const res = await updateTenantWAConfig({
                evolution_api_url: form.evolution_api_url || undefined,
                evolution_bot_instance: form.evolution_bot_instance || undefined,
                evolution_ordering_instance: form.evolution_ordering_instance || undefined,
                chatwoot_inbox_id: form.chatwoot_inbox_id ? parseInt(form.chatwoot_inbox_id) : null,
                chatwoot_account_id: form.chatwoot_account_id ? parseInt(form.chatwoot_account_id) : null,
            })
            if (res.success) {
                setToast({ type: 'success', msg: 'Configuración guardada' })
            } else {
                setToast({ type: 'error', msg: res.error })
            }
            setTimeout(() => setToast(null), 3500)
        })
    }

    const field = (label: string, key: keyof typeof form, placeholder?: string) => (
        <div>
            <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
            <input
                type="text"
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                placeholder={placeholder}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
        </div>
    )

    return (
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <h3 className="font-medium text-sm">Configuración de Evolution API</h3>

            <div className="grid gap-3 sm:grid-cols-2">
                {field('URL de Evolution API', 'evolution_api_url', 'https://evolution.tudominio.com')}
                {field('Instancia bot (usuarios internos)', 'evolution_bot_instance', 'pizca-bot')}
                {field('Instancia ordering (proveedores)', 'evolution_ordering_instance', 'pizca-ordering')}
            </div>

            <div className="border-t border-border pt-3">
                <h4 className="text-xs font-medium text-muted-foreground mb-2">Chatwoot (opcional)</h4>
                <div className="grid gap-3 sm:grid-cols-2">
                    {field('Account ID', 'chatwoot_account_id', '1')}
                    {field('Inbox ID', 'chatwoot_inbox_id', '2')}
                </div>
            </div>

            {toast && (
                <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${
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

            <div className="flex justify-end">
                <Button size="sm" onClick={handleSave} disabled={isPending}>
                    {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                    Guardar
                </Button>
            </div>
        </div>
    )
}
