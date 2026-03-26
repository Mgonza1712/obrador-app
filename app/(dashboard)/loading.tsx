import { WidgetSkeleton } from '@/components/dashboard/WidgetSkeleton'
import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardLoading() {
  return (
    <div className="p-6 space-y-6">
      <div className="space-y-1">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <WidgetSkeleton />
        <WidgetSkeleton />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <WidgetSkeleton tall />
        <WidgetSkeleton tall />
      </div>
      <div className="grid grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
    </div>
  )
}
