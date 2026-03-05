import { Loader2 } from 'lucide-react'

export default function Loading() {
    return (
        <div className="flex h-screen w-full flex-col items-center justify-center gap-3 bg-background">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Cargando recetas...</p>
        </div>
    )
}
