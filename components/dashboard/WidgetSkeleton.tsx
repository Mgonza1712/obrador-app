import { Skeleton } from '@/components/ui/skeleton'

export function WidgetSkeleton({ tall = false }: { tall?: boolean }) {
  return (
    <div className={`rounded-xl border p-5 space-y-3 ${tall ? 'h-64' : 'h-36'}`}>
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-8 w-16" />
      <Skeleton className="h-3 w-48" />
      {tall && <Skeleton className="h-3 w-40 mt-2" />}
      {tall && <Skeleton className="h-3 w-36" />}
    </div>
  )
}
