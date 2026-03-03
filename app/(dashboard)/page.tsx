import { CheckCircle2, Zap } from 'lucide-react'

export default function DashboardPage() {
    return (
        <div className="flex flex-1 flex-col items-start justify-center gap-8 px-2">
            {/* Status badge */}
            <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-sm font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                Conectado a Supabase exitosamente
            </div>

            {/* Hero title */}
            <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                    <Zap className="h-10 w-10 text-amber-500" />
                    <h1 className="text-6xl font-extrabold tracking-tighter text-foreground lg:text-7xl">
                        Cerebro del
                    </h1>
                </div>
                <h1 className="text-6xl font-extrabold tracking-tighter text-foreground lg:text-7xl">
                    <span className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 bg-clip-text text-transparent">
                        Obrador
                    </span>
                </h1>
            </div>

            {/* Subtitle */}
            <p className="max-w-lg text-lg leading-relaxed text-muted-foreground">
                Tu centro de operaciones gastronómico. Gestiona recetas, producción y
                costes desde un solo lugar.
            </p>

            {/* Stats cards */}
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                {[
                    { label: 'Recetas activas', value: '—', unit: '' },
                    { label: 'Producciones hoy', value: '—', unit: '' },
                    { label: 'Coste medio/plato', value: '—', unit: '' },
                ].map(({ label, value }) => (
                    <div
                        key={label}
                        className="flex flex-col gap-1 rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
                    >
                        <span className="text-3xl font-bold text-foreground">{value}</span>
                        <span className="text-sm text-muted-foreground">{label}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}
