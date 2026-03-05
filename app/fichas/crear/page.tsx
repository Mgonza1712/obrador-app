'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Sidebar from '@/components/layout/Sidebar'
import { createClient } from '@/lib/supabase/client'
import {
    ArrowLeft, PlusCircle, Trash2, ChevronUp, ChevronDown,
    Flame, Carrot, Pipette, Utensils, Save, Loader2,
    Wheat, Thermometer, Snowflake, Upload, X,
} from 'lucide-react'

// ─── Fases ────────────────────────────────────────────────────────────────────
const FASES = [
    { value: 'coccion', label: 'Cocción', icon: Flame, border: 'border-rose-500', iconColor: 'text-rose-500', bg: 'bg-rose-500/8', badge: 'bg-rose-100 text-rose-700' },
    { value: 'vegetales', label: 'Vegetales', icon: Carrot, border: 'border-emerald-500', iconColor: 'text-emerald-500', bg: 'bg-emerald-500/8', badge: 'bg-emerald-100 text-emerald-700' },
    { value: 'sabor', label: 'Sabor / Sazón', icon: Pipette, border: 'border-amber-500', iconColor: 'text-amber-500', bg: 'bg-amber-500/8', badge: 'bg-amber-100 text-amber-700' },
    { value: 'emplatar', label: 'Emplatar', icon: Utensils, border: 'border-sky-500', iconColor: 'text-sky-500', bg: 'bg-sky-500/8', badge: 'bg-sky-100 text-sky-700' },
    { value: 'base', label: 'Base / Carbohidratos', icon: Wheat, border: 'border-stone-500', iconColor: 'text-stone-500', bg: 'bg-stone-500/8', badge: 'bg-stone-100 text-stone-700' },
    { value: 'fritura', label: 'Fritura', icon: Thermometer, border: 'border-yellow-500', iconColor: 'text-yellow-600', bg: 'bg-yellow-500/8', badge: 'bg-yellow-100 text-yellow-700' },
    { value: 'horno', label: 'Horno / Gratinado', icon: Flame, border: 'border-orange-600', iconColor: 'text-orange-600', bg: 'bg-orange-600/8', badge: 'bg-orange-100 text-orange-800' },
    { value: 'frio', label: 'Mise en Place / Frío', icon: Snowflake, border: 'border-cyan-500', iconColor: 'text-cyan-500', bg: 'bg-cyan-500/8', badge: 'bg-cyan-100 text-cyan-700' },
] as const

type FaseValue = (typeof FASES)[number]['value']
const getFase = (v: FaseValue) => FASES.find(f => f.value === v) ?? FASES[0]

// ─── Tipos ────────────────────────────────────────────────────────────────────
type MiseItem = { id: string; ingrediente: string; cantidad: string }
type Paso = {
    id: string
    fase: FaseValue
    instruccion: string
    detalle: string
    cantidad: string
    imagenFile: File | null
    imagenPreview: string | null
}

function newMise(): MiseItem { return { id: crypto.randomUUID(), ingrediente: '', cantidad: '' } }
function newPaso(): Paso {
    return { id: crypto.randomUUID(), fase: 'coccion', instruccion: '', detalle: '', cantidad: '', imagenFile: null, imagenPreview: null }
}

// ─── Upload imagen de paso (mini zona) ────────────────────────────────────────
function StepImageUpload({ preview, onChange, onClear }: {
    preview: string | null; onChange: (f: File) => void; onClear: () => void
}) {
    const ref = useRef<HTMLInputElement>(null)
    return (
        <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Foto del paso</label>
            <input ref={ref} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onChange(f) }} />
            {!preview ? (
                <button type="button" onClick={() => ref.current?.click()}
                    className="flex h-24 items-center justify-center gap-2 rounded-lg border border-dashed border-border text-muted-foreground/60 hover:border-primary/50 hover:text-primary text-xs transition-colors">
                    <Upload className="h-4 w-4" /> Subir foto
                </button>
            ) : (
                <div className="relative h-24 overflow-hidden rounded-lg border border-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preview} alt="Foto del paso" className="h-full w-full object-cover" />
                    <div className="absolute inset-0 flex items-end justify-end gap-1.5 bg-gradient-to-t from-black/40 to-transparent p-1.5">
                        <button type="button" onClick={() => ref.current?.click()} className="rounded bg-white/25 px-2 py-1 text-xs text-white backdrop-blur hover:bg-white/40">Cambiar</button>
                        <button type="button" onClick={onClear} className="rounded bg-white/25 p-1 text-white backdrop-blur hover:bg-destructive/70"><X className="h-3 w-3" /></button>
                    </div>
                </div>
            )}
        </div>
    )
}

// ─── Zona drag & drop ─────────────────────────────────────────────────────────
function DropZone({ preview, onFile, onClear, label }: {
    preview: string | null; onFile: (f: File) => void; onClear: () => void; label: string
}) {
    const ref = useRef<HTMLInputElement>(null)
    const [drag, setDrag] = useState(false)
    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">{label}</label>
            <input ref={ref} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
            {!preview ? (
                <div onClick={() => ref.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDrag(true) }}
                    onDragLeave={() => setDrag(false)}
                    onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f) }}
                    className={`flex h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-colors select-none ${drag ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-primary/50 hover:bg-muted/30'}`}>
                    <Upload className="h-6 w-6" />
                    <p className="text-sm font-medium">Arrastra o <span className="text-primary underline">haz clic</span></p>
                    <p className="text-xs text-muted-foreground/60">JPG, PNG, WEBP — máx. 10 MB</p>
                </div>
            ) : (
                <div className="relative overflow-hidden rounded-xl border border-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preview} alt={label} className="h-52 w-full object-cover" />
                    <div className="absolute inset-0 flex items-end justify-end gap-2 bg-gradient-to-t from-black/50 to-transparent p-3">
                        <button type="button" onClick={() => ref.current?.click()} className="rounded-lg bg-white/20 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur hover:bg-white/30">Cambiar</button>
                        <button type="button" onClick={onClear} className="rounded-lg bg-white/20 p-1.5 text-white backdrop-blur hover:bg-destructive/70"><X className="h-3.5 w-3.5" /></button>
                    </div>
                </div>
            )}
        </div>
    )
}

// ─── Helper de subida de imagen a Supabase Storage ───────────────────────────
async function uploadImage(
    supabase: ReturnType<typeof createClient>,
    file: File,
    orgId: string,
    prefix: string
): Promise<string | null> {
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${orgId}/${prefix}_${Date.now()}.${ext}`
    const { error } = await supabase.storage
        .from('fichas_imagenes')
        .upload(path, file, { cacheControl: '3600', upsert: false })
    if (error) { console.error('Error al subir imagen:', error.message); return null }
    const { data } = supabase.storage.from('fichas_imagenes').getPublicUrl(path)
    return data.publicUrl
}

// ─── Subcomponentes pequeños ──────────────────────────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
    return (
        <h2 className="mb-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            <span className="h-px flex-1 bg-border" />{children}<span className="h-px flex-1 bg-border" />
        </h2>
    )
}
function SimpleField({ label, value, onChange, placeholder, hint }: {
    label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">{label}</label>
            <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-ring transition-shadow" />
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
    )
}

// ─── Editor principal ─────────────────────────────────────────────────────────
export default function CrearFichaPage() {
    const router = useRouter()
    const supabase = createClient()


    // Campos básicos
    const [titulo, setTitulo] = useState('')
    const [rendimiento, setRendimiento] = useState('')
    const [tiempo, setTiempo] = useState('')

    // Imagen Gold Standard
    const [finalFile, setFinalFile] = useState<File | null>(null)
    const [finalPreview, setFinalPreview] = useState<string | null>(null)
    const handleFinalFile = (f: File) => { if (finalPreview) URL.revokeObjectURL(finalPreview); setFinalFile(f); setFinalPreview(URL.createObjectURL(f)) }
    const clearFinal = () => { if (finalPreview) URL.revokeObjectURL(finalPreview); setFinalFile(null); setFinalPreview(null) }

    // Mise en Place
    const [mise, setMise] = useState<MiseItem[]>([newMise()])
    const addMise = () => setMise(p => [...p, newMise()])
    const removeMise = (id: string) => setMise(p => p.filter(m => m.id !== id))
    const updateMise = (id: string, field: 'ingrediente' | 'cantidad', val: string) =>
        setMise(p => p.map(m => m.id === id ? { ...m, [field]: val } : m))

    // Pasos
    const [pasos, setPasos] = useState<Paso[]>([newPaso()])
    const addPaso = () => setPasos(p => [...p, newPaso()])
    const removePaso = (id: string) => setPasos(p => p.filter(x => x.id !== id))
    const updatePaso = useCallback((id: string, field: keyof Omit<Paso, 'id' | 'imagenFile' | 'imagenPreview'>, val: string) =>
        setPasos(p => p.map(x => x.id === id ? { ...x, [field]: val } : x)), [])
    const movePaso = (i: number, dir: -1 | 1) => {
        const j = i + dir
        if (j < 0 || j >= pasos.length) return
        setPasos(p => { const a = [...p];[a[i], a[j]] = [a[j], a[i]]; return a })
    }
    const setPasoImagen = (id: string, file: File) =>
        setPasos(p => p.map(x => { if (x.id !== id) return x; if (x.imagenPreview) URL.revokeObjectURL(x.imagenPreview); return { ...x, imagenFile: file, imagenPreview: URL.createObjectURL(file) } }))
    const clearPasoImagen = (id: string) =>
        setPasos(p => p.map(x => { if (x.id !== id) return x; if (x.imagenPreview) URL.revokeObjectURL(x.imagenPreview); return { ...x, imagenFile: null, imagenPreview: null } }))

    // Guardado
    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)

    const handleSave = async () => {
        if (!titulo) return
        setIsSaving(true)
        setSaveError(null)

        try {
            // 1. Obtener usuario + organization_id
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('Sesión expirada. Inicia sesión de nuevo.')

            const { data: profile, error: profileErr } = await supabase
                .from('profiles')
                .select('organization_id')
                .eq('id', user.id)
                .single()
            if (profileErr || !profile?.organization_id) throw new Error('No se pudo obtener la organización del usuario.')
            const orgId: string = profile.organization_id

            // 2. Subir imagen Gold Standard (si existe)
            let finalImageUrl: string | null = null
            if (finalFile) finalImageUrl = await uploadImage(supabase, finalFile, orgId, 'final')

            // 3. Subir imágenes de pasos y construir array steps
            const steps = await Promise.all(
                pasos.map(async (paso, i) => {
                    let imagenPasoUrl: string | null = null
                    if (paso.imagenFile) imagenPasoUrl = await uploadImage(supabase, paso.imagenFile, orgId, `paso_${i + 1}`)
                    return {
                        orden: i + 1,
                        fase: paso.fase,
                        instruccion: paso.instruccion,
                        detalle: paso.detalle,
                        cantidad: paso.cantidad,
                        imagen_paso: imagenPasoUrl,
                    }
                })
            )

            // 4. Mise en place sin ids internos
            const miseEnPlace = mise.map(({ ingrediente, cantidad }) => ({ ingrediente, cantidad }))

            // 5. Insertar en la tabla fichas
            const { error: insertErr } = await supabase.from('fichas').insert({
                organization_id: orgId,
                name: titulo,
                yield_text: rendimiento || null,
                prep_time: tiempo || null,
                final_image_url: finalImageUrl,
                mise_en_place: miseEnPlace,
                steps,
            })
            if (insertErr) throw new Error(insertErr.message)

            // 6. Redirigir al listado
            router.push('/fichas')
            router.refresh()

        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Error desconocido'
            setSaveError(msg)
            console.error('Error al guardar ficha:', msg)
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-background">
            <Sidebar />
            <main className="flex flex-1 flex-col overflow-y-auto pb-16 md:pb-0">

                {/* Header sticky */}
                <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-4 md:px-8 md:py-5 backdrop-blur">
                    <Link href="/fichas" className="mb-2 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                        <ArrowLeft className="h-3.5 w-3.5" /> Volver a Fichas
                    </Link>
                    <div className="flex items-center justify-between gap-3">
                        <h1 className="text-xl font-bold tracking-tight text-foreground">Nueva Ficha de Servicio</h1>
                        <button onClick={handleSave} disabled={isSaving || !titulo}
                            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow transition-all hover:opacity-90 active:scale-95 disabled:opacity-50">
                            {isSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando...</> : <><Save className="h-4 w-4" /> Guardar Ficha</>}
                        </button>
                    </div>
                    {saveError && (
                        <p className="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{saveError}</p>
                    )}
                </div>

                <div className="flex flex-col gap-8 p-4 md:p-8">

                    {/* ── Datos generales ── */}
                    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
                        <SectionTitle>Datos generales</SectionTitle>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="sm:col-span-2">
                                <SimpleField label="Nombre del Plato" value={titulo} onChange={setTitulo} placeholder="Ej: Arroz con Cerdo" />
                            </div>
                            <SimpleField label="Rendimiento" value={rendimiento} onChange={setRendimiento} placeholder="Ej: 1 porción = 350 g" hint="Cantidad final que produce la receta" />
                            <SimpleField label="Tiempo estimado" value={tiempo} onChange={setTiempo} placeholder="Ej: 15 min" />
                            <div className="sm:col-span-2">
                                <DropZone preview={finalPreview} onFile={handleFinalFile} onClear={clearFinal} label="📸 Gold Standard — foto del plato terminado" />
                            </div>
                        </div>
                    </section>

                    {/* ── Mise en Place ── */}
                    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
                        <SectionTitle>Mise en Place</SectionTitle>
                        <p className="mb-4 text-xs text-muted-foreground">Lista de ingredientes que deben estar listos antes de empezar.</p>
                        <div className="flex flex-col gap-2">
                            <div className="grid grid-cols-[1fr_7rem_2rem] gap-2 px-1">
                                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Ingrediente</span>
                                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Cantidad</span>
                                <span />
                            </div>
                            {mise.map(item => (
                                <div key={item.id} className="grid grid-cols-[1fr_7rem_2rem] items-center gap-2">
                                    <input type="text" value={item.ingrediente} placeholder="Ej: Cerdo lomo"
                                        onChange={e => updateMise(item.id, 'ingrediente', e.target.value)}
                                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
                                    <input type="text" value={item.cantidad} placeholder="80 g"
                                        onChange={e => updateMise(item.id, 'cantidad', e.target.value)}
                                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold tabular-nums outline-none focus:ring-2 focus:ring-ring" />
                                    <button type="button" onClick={() => removeMise(item.id)} disabled={mise.length === 1}
                                        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive disabled:opacity-25 transition-colors">
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                        <button type="button" onClick={addMise}
                            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/60 hover:bg-primary/5 hover:text-primary">
                            <PlusCircle className="h-4 w-4" /> Añadir ingrediente
                        </button>
                    </section>

                    {/* ── Pasos SOP ── */}
                    <section>
                        <SectionTitle>Pasos del SOP</SectionTitle>
                        <div className="flex flex-col gap-3">
                            {pasos.map((paso, index) => {
                                const fase = getFase(paso.fase)
                                const Icon = fase.icon
                                return (
                                    <div key={paso.id} className={`flex gap-0 overflow-hidden rounded-xl border border-border shadow-sm ${fase.bg}`}>
                                        <div className={`w-2 shrink-0 border-l-8 rounded-l-xl ${fase.border}`} />
                                        <div className="flex flex-1 flex-col gap-3 p-4 md:p-5">

                                            {/* Header del paso */}
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-background text-sm font-extrabold text-foreground shadow-sm border border-border">
                                                        {index + 1}
                                                    </div>
                                                    <Icon size={20} className={fase.iconColor} strokeWidth={1.8} />
                                                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-widest ${fase.badge}`}>{fase.label}</span>
                                                </div>
                                                <div className="flex items-center gap-0.5">
                                                    <button type="button" onClick={() => movePaso(index, -1)} disabled={index === 0} className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-25 transition-colors"><ChevronUp className="h-4 w-4" /></button>
                                                    <button type="button" onClick={() => movePaso(index, 1)} disabled={index === pasos.length - 1} className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-25 transition-colors"><ChevronDown className="h-4 w-4" /></button>
                                                    <button type="button" onClick={() => removePaso(paso.id)} disabled={pasos.length === 1} className="rounded p-1.5 text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive disabled:opacity-25 transition-colors"><Trash2 className="h-4 w-4" /></button>
                                                </div>
                                            </div>

                                            {/* Selector de fase */}
                                            <div className="flex flex-col gap-1">
                                                <label className="text-xs font-medium text-muted-foreground">Fase</label>
                                                <select value={paso.fase} onChange={e => updatePaso(paso.id, 'fase', e.target.value)}
                                                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-ring">
                                                    {FASES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                                                </select>
                                            </div>

                                            {/* Instrucción + Detalle + Cantidad | Imagen */}
                                            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_180px]">
                                                <div className="flex flex-col gap-3">
                                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                        <div className="flex flex-col gap-1">
                                                            <label className="text-xs font-medium text-muted-foreground">Instrucción</label>
                                                            <input type="text" value={paso.instruccion} onChange={e => updatePaso(paso.id, 'instruccion', e.target.value)} placeholder="Ej: Sellar cerdo en wok caliente"
                                                                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
                                                        </div>
                                                        <div className="flex flex-col gap-1">
                                                            <label className="text-xs font-medium text-muted-foreground">Detalle / Nota</label>
                                                            <input type="text" value={paso.detalle} onChange={e => updatePaso(paso.id, 'detalle', e.target.value)} placeholder="Ej: 2 min por lado a fuego alto"
                                                                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col gap-1 max-w-[8rem]">
                                                        <label className="text-xs font-medium text-muted-foreground">Cantidad</label>
                                                        <input type="text" value={paso.cantidad} onChange={e => updatePaso(paso.id, 'cantidad', e.target.value)} placeholder="80 g"
                                                            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-semibold tabular-nums outline-none focus:ring-2 focus:ring-ring" />
                                                    </div>
                                                </div>
                                                <StepImageUpload
                                                    preview={paso.imagenPreview}
                                                    onChange={f => setPasoImagen(paso.id, f)}
                                                    onClear={() => clearPasoImagen(paso.id)}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                        <button type="button" onClick={addPaso}
                            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/60 hover:bg-primary/5 hover:text-primary">
                            <PlusCircle className="h-4 w-4" /> Agregar Paso
                        </button>
                    </section>

                    {/* Botón guardar inferior */}
                    <div className="flex flex-col items-end gap-1.5 pb-4">
                        {saveError && <p className="text-sm text-destructive">{saveError}</p>}
                        <button onClick={handleSave} disabled={isSaving || !titulo}
                            className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition-all hover:opacity-90 active:scale-95 disabled:opacity-50">
                            {isSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando...</> : <><Save className="h-4 w-4" /> Guardar Ficha</>}
                        </button>
                        {!titulo && <p className="text-xs text-muted-foreground">El nombre del plato es obligatorio</p>}
                    </div>
                </div>
            </main>
        </div>
    )
}
