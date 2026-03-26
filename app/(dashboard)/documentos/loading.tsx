export default function DocumentosLoading() {
    return (
        <div className="space-y-6">
            <div>
                <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
                <div className="mt-1 h-4 w-64 animate-pulse rounded-md bg-muted" />
            </div>
            <div className="h-9 w-24 animate-pulse rounded-md bg-muted" />
            <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="border-b border-border px-4 py-3">
                    <div className="flex gap-4">
                        {[80, 120, 140, 80, 80, 80, 60].map((w, i) => (
                            <div key={i} className={`h-4 w-${w} animate-pulse rounded bg-muted`} style={{ width: w }} />
                        ))}
                    </div>
                </div>
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="border-b border-border px-4 py-3 last:border-0">
                        <div className="flex items-center gap-4">
                            <div className="h-5 w-20 animate-pulse rounded-full bg-muted" />
                            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                            <div className="ml-auto h-4 w-16 animate-pulse rounded bg-muted" />
                            <div className="h-5 w-20 animate-pulse rounded-full bg-muted" />
                            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
