import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BandejaAtencion } from '@/components/dashboard/BandejaAtencion'
import { SemaforoRentabilidad } from '@/components/dashboard/SemaforoRentabilidad'
import { TopFlopPlatos } from '@/components/dashboard/TopFlopPlatos'
import { RadarInflacion } from '@/components/dashboard/RadarInflacion'
import { AccesosDirectos } from '@/components/dashboard/AccesosDirectos'
import { Suspense } from 'react'
import { WidgetSkeleton } from '@/components/dashboard/WidgetSkeleton'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const nombre = user?.user_metadata?.full_name?.split(' ')[0]
    ?? user?.email?.split('@')[0]
    ?? 'Chef'

  return (
    <div className="p-6 space-y-6">
      {/* Header con saludo dinámico */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Hola, {nombre} 👋
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Cocina con pasión. Gestiona con precisión.
        </p>
      </div>

      {/* Fila 1: Alertas urgentes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Suspense fallback={<WidgetSkeleton />}>
          <BandejaAtencion />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton />}>
          <SemaforoRentabilidad />
        </Suspense>
      </div>

      {/* Fila 2: Rankings y radar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Suspense fallback={<WidgetSkeleton tall />}>
          <TopFlopPlatos />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton tall />}>
          <RadarInflacion />
        </Suspense>
      </div>

      {/* Fila 3: Accesos directos */}
      <AccesosDirectos />
    </div>
  )
}
