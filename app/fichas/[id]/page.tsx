// @ts-nocheck — módulo pendiente de reescritura para el nuevo schema (assemblies/bom_lines/components)
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Clock, Flame, Carrot, Pipette, Utensils, Scale, Wheat, Thermometer, Snowflake } from 'lucide-react'
import Sidebar from '@/components/layout/Sidebar'
import { createClient } from '@/lib/supabase/server'
import PrintButton from './PrintButton'

// ─── Fases ────────────────────────────────────────────────────────────────────
const FASE_META: Record<string, { icon: React.ElementType; border: string; iconColor: string; bg: string; badge: string }> = {
    coccion: { icon: Flame, border: 'border-rose-500', iconColor: 'text-rose-500', bg: 'bg-rose-500/8', badge: 'bg-rose-100 text-rose-700' },
    vegetales: { icon: Carrot, border: 'border-emerald-500', iconColor: 'text-emerald-500', bg: 'bg-emerald-500/8', badge: 'bg-emerald-100 text-emerald-700' },
    sabor: { icon: Pipette, border: 'border-amber-500', iconColor: 'text-amber-500', bg: 'bg-amber-500/8', badge: 'bg-amber-100 text-amber-700' },
    emplatar: { icon: Utensils, border: 'border-sky-500', iconColor: 'text-sky-500', bg: 'bg-sky-500/8', badge: 'bg-sky-100 text-sky-700' },
    base: { icon: Wheat, border: 'border-stone-500', iconColor: 'text-stone-500', bg: 'bg-stone-500/8', badge: 'bg-stone-100 text-stone-700' },
    fritura: { icon: Thermometer, border: 'border-yellow-500', iconColor: 'text-yellow-600', bg: 'bg-yellow-500/8', badge: 'bg-yellow-100 text-yellow-700' },
    horno: { icon: Flame, border: 'border-orange-600', iconColor: 'text-orange-600', bg: 'bg-orange-600/8', badge: 'bg-orange-100 text-orange-800' },
    frio: { icon: Snowflake, border: 'border-cyan-500', iconColor: 'text-cyan-500', bg: 'bg-cyan-500/8', badge: 'bg-cyan-100 text-cyan-700' },
}

type MiseItem = { ingrediente: string; cantidad: string }
type Paso = { orden: number; fase: string; instruccion: string; detalle: string; cantidad: string; imagen_paso: string | null }
type FichaRow = { id: string; name: string; yield_text: string | null; prep_time: string | null; final_image_url: string | null; mise_en_place: MiseItem[] | null; steps: Paso[] | null }

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function FichaDetallePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const supabase = await createClient()
    const { data, error } = await supabase.from('fichas').select('*').eq('id', id).single()
    if (error || !data) return notFound()

    const ficha = data as FichaRow
    const mise = ficha.mise_en_place ?? []
    const pasos = (ficha.steps ?? []).sort((a, b) => a.orden - b.orden)

    return (
        /*
         * CLAVE PARA IMPRESIÓN:
         * - Sin overflow-hidden ni h-screen en el wrapper raíz
         * - print:block fuerza display:block en cada flex container
         * - print:h-auto / print:overflow-visible eliminan cualquier clip
         */
        <div className="flex flex-col md:flex-row min-h-screen bg-background
                        print:block print:min-h-0 print:overflow-hidden print:max-h-[29cm]">

            {/* Sidebar oculto al imprimir */}
            <div className="print:hidden">
                <Sidebar />
            </div>

            <main className="flex flex-1 flex-col overflow-y-auto pb-16 md:pb-0
                             print:block print:overflow-visible print:h-auto print:pb-0 print:flex-none">

                {/* ── Header (pantalla) ── */}
                <div className="border-b border-border bg-background/80 px-4 py-4 md:px-8 md:py-5 backdrop-blur
                                print:border-b-2 print:border-foreground print:px-0 print:pt-0 print:pb-3 print:mb-3 print:backdrop-filter-none">

                    <Link href="/fichas"
                        className="mb-3 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors print:hidden">
                        <ArrowLeft className="h-3.5 w-3.5" /> Volver a Fichas
                    </Link>

                    <div className="flex items-start justify-between gap-4">
                        {/* Texto */}
                        <div className="flex-1 min-w-0">
                            <p className="hidden print:block text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">
                                Ficha de Servicio — SOP
                            </p>
                            <h1 className="text-2xl font-bold tracking-tight text-foreground print:text-2xl print:font-extrabold">
                                {ficha.name}
                            </h1>
                            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground print:text-[10px] print:mt-0.5 print:gap-2">
                                {ficha.yield_text && <span className="flex items-center gap-1"><Scale className="h-4 w-4 print:h-3 print:w-3" />{ficha.yield_text}</span>}
                                {ficha.prep_time && <span className="flex items-center gap-1"><Clock className="h-4 w-4 print:h-3 print:w-3" />{ficha.prep_time}</span>}
                            </div>
                        </div>

                        {/* Gold Standard — en el header */}
                        {ficha.final_image_url && (
                            <div className="shrink-0 overflow-hidden rounded-xl border-2 border-border shadow-md print:rounded-md print:border print:shadow-none">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={ficha.final_image_url} alt="Gold Standard"
                                    className="h-28 w-28 object-cover md:h-36 md:w-36 print:h-32 print:w-32" />
                                <div className="bg-muted/60 px-1.5 py-0.5 text-center text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    ⭐ Gold Standard
                                </div>
                            </div>
                        )}

                        <PrintButton />
                    </div>
                </div>

                {/* ── Ficha imprimible ── */}
                <div className="p-4 md:p-8 print:p-0 print:m-0 print:w-full print:max-w-none print:flex print:flex-col print:justify-between">

                    {/* Mise en Place */}
                    {mise.length > 0 && (
                        <section className="mb-5 overflow-hidden rounded-xl border border-border shadow-sm
                                           print:mb-2 print:overflow-visible print:rounded-none print:shadow-none">
                            <div className="bg-muted/40 px-4 py-2.5 border-b border-border print:px-2 print:py-1">
                                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground print:text-[9px]">
                                    🔪 Mise en Place — Ingredientes listos antes de empezar
                                </h2>
                            </div>
                            <div className="p-4 print:p-2">
                                <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3 lg:grid-cols-4
                                                print:grid-cols-4 print:gap-x-3 print:gap-y-0">
                                    {mise.map((item, i) => (
                                        <div key={i} className="flex items-baseline justify-between gap-1 border-b border-border/50 py-1.5 print:py-0.5">
                                            <span className="text-sm capitalize text-foreground print:text-[10px]">{item.ingrediente}</span>
                                            <span className="shrink-0 text-sm font-bold tabular-nums text-foreground print:text-[10px]">{item.cantidad}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>
                    )}

                    {/* Pasos SOP — sin break-inside-avoid global para que fluya en impresión */}
                    <div className="flex flex-col gap-4 print:flex print:flex-col print:flex-1 print:justify-evenly print:gap-2">
                        {pasos.map((paso) => {
                            const meta = FASE_META[paso.fase] ?? FASE_META.coccion
                            const Icon = meta.icon
                            return (
                                <div
                                    key={paso.orden}
                                    className={`relative flex gap-0 overflow-hidden rounded-xl border border-border shadow-sm
                                                print:overflow-visible print:rounded-none print:shadow-none print:border-border/40
                                                ${meta.bg}`}
                                >
                                    {/* Borde lateral */}
                                    <div className={`w-2 shrink-0 border-l-8 rounded-l-xl print:w-1 print:border-l-4 print:rounded-none ${meta.border}`} />

                                    <div className="flex flex-1 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 md:p-5
                                                    print:flex-row print:items-center print:gap-2 print:p-2">

                                        {/* Número + Icono */}
                                        <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-center sm:gap-1.5
                                                        print:flex-col print:items-center print:gap-1">
                                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-background text-sm font-extrabold text-foreground shadow-sm border border-border
                                                             print:h-7 print:w-7 print:text-sm print:shadow-none">
                                                {paso.orden}
                                            </span>
                                            <Icon size={28} className={`${meta.iconColor} print:hidden`} strokeWidth={1.8} />
                                            <Icon size={18} className={`${meta.iconColor} hidden print:block`} strokeWidth={2} />
                                        </div>

                                        {/* Texto */}
                                        <div className="flex flex-1 flex-col gap-1 print:gap-0.5">
                                            <span className={`w-fit rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-widest
                                                             print:px-2 print:py-0.5 print:text-xs ${meta.badge}`}>
                                                {paso.fase}
                                            </span>
                                            <p className="text-xl font-bold leading-snug text-foreground md:text-2xl
                                                          print:text-base print:font-semibold print:leading-tight">
                                                {paso.instruccion}
                                            </p>
                                            {paso.detalle && (
                                                <p className="text-sm text-muted-foreground print:text-sm print:leading-tight">
                                                    {paso.detalle}
                                                </p>
                                            )}
                                        </div>

                                        {/* Cantidad */}
                                        {paso.cantidad && (
                                            <div className="shrink-0 text-right sm:min-w-[5rem] print:min-w-[4rem]">
                                                <p className="text-3xl font-extrabold tabular-nums text-foreground
                                                              print:text-lg print:font-bold">
                                                    {paso.cantidad}
                                                </p>
                                            </div>
                                        )}

                                        {/* Imagen del paso — muy pequeña en impresión */}
                                        {paso.imagen_paso && (
                                            <div className="shrink-0 overflow-hidden rounded-lg border border-border/50 print:rounded-sm">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={paso.imagen_paso} alt={`Paso ${paso.orden}`}
                                                    className="h-32 w-full object-cover sm:w-40 md:w-48 print:h-16 print:w-24" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {/* Pie de página — solo impresión */}
                    <div className="hidden print:block mt-3 border-t border-border pt-2 text-center text-[9px] text-muted-foreground">
                        Obrador App · Ficha de Servicio · {ficha.name}
                    </div>
                </div>
            </main>
        </div>
    )
}
