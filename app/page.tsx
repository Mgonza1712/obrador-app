import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChefHat, BookOpen, Layers, Factory, Zap, Clock, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Sidebar from '@/components/layout/Sidebar'
import { createClient } from '@/lib/supabase/server'

// ─── Page (async Server Component) ───────────────────────────────────────────
export default async function DashboardPage() {
  const supabase = await createClient()

  // 1. Verificar sesión
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // 2. Obtener organization_id del usuario
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  const orgId = profile?.organization_id

  // 3. Métricas en paralelo
  const [
    { count: totalRecetas },
    { count: totalIngredientes },
    { data: recentesRaw },
  ] = await Promise.all([
    supabase
      .from('recipes')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId),
    supabase
      .from('ingredients')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId),
    supabase
      .from('recipes')
      .select('id, title, prep_time_minutes, base_yield, yield_unit, created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(3),
  ])

  const recientes = recentesRaw ?? []
  const emailLabel = user.email?.split('@')[0] ?? 'Chef'

  // KPI cards config
  const kpis = [
    {
      label: 'Total Recetas',
      value: totalRecetas ?? 0,
      icon: BookOpen,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
      href: '/recetario',
    },
    {
      label: 'Ingredientes en Catálogo',
      value: totalIngredientes ?? 0,
      icon: Layers,
      color: 'text-sky-500',
      bg: 'bg-sky-500/10',
      href: null,
    },
    {
      label: 'Producciones Hoy',
      value: 0,
      icon: Factory,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
      href: null,
      badge: 'Próximamente',
    },
  ]

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-y-auto pb-16 md:pb-0">

        {/* ── Hero header ── */}
        <div className="border-b border-border bg-background/80 px-4 py-5 md:px-8 md:py-8 backdrop-blur">
          <p className="mb-1 text-sm font-medium text-muted-foreground">
            Bienvenido de nuevo, <span className="text-foreground font-semibold">{emailLabel}</span> 👋
          </p>
          <div className="flex items-end gap-3">
            <Zap className="mb-1 h-8 w-8 text-amber-500" />
            <h1 className="text-2xl font-extrabold tracking-tighter text-foreground md:text-4xl lg:text-5xl">
              Cerebro del{' '}
              <span className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 bg-clip-text text-transparent">
                Obrador
              </span>
            </h1>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Tu centro de operaciones gastronómico. Todo en un solo lugar.
          </p>
        </div>

        <div className="flex flex-col gap-6 p-4 md:gap-8 md:p-8">

          {/* ── KPI Cards ── */}
          <section>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Vista General
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {kpis.map(({ label, value, icon: Icon, color, bg, href, badge }) => (
                <Card
                  key={label}
                  className="relative overflow-hidden border-border shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${bg}`}>
                        <Icon className={`h-4.5 w-4.5 ${color}`} />
                      </div>
                      {badge && (
                        <Badge variant="secondary" className="text-xs">{badge}</Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-4xl font-extrabold tabular-nums text-foreground">{value}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{label}</p>
                    {href && (
                      <Link
                        href={href}
                        className={`mt-3 flex items-center gap-1 text-xs font-medium ${color} hover:underline`}
                      >
                        Ver todos <ArrowRight className="h-3 w-3" />
                      </Link>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* ── Recetas Recientes ── */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Añadidas Recientemente
              </h2>
              <Button variant="ghost" size="sm" className="gap-1 text-xs" asChild>
                <Link href="/recetario">
                  Ver todas <ArrowRight className="h-3 w-3" />
                </Link>
              </Button>
            </div>

            {recientes.length === 0 ? (
              <Card className="border-dashed border-border">
                <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                  <ChefHat className="h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">Aún no has creado ninguna receta</p>
                  <Button size="sm" asChild>
                    <Link href="/recetario/nueva">+ Nueva Receta</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col gap-3">
                {recientes.map((receta) => (
                  <Link key={receta.id} href={`/recetario/${receta.id}`}>
                    <Card className="group border-border shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md">
                      <CardContent className="flex items-center justify-between py-4">
                        <div className="flex items-center gap-4">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <ChefHat className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="font-semibold text-foreground group-hover:text-primary transition-colors">
                              {receta.title}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Rinde {receta.base_yield} {receta.yield_unit}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          {receta.prep_time_minutes && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" />
                              {receta.prep_time_minutes} min
                            </span>
                          )}
                          <ArrowRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </section>

        </div>
      </main>
    </div>
  )
}
