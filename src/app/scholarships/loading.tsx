import { DashboardShell } from '@/components/layout/shell';
import { Skeleton } from '@/components/ui/skeleton';

export default function ScholarshipsLoading() {
    return (
        <DashboardShell>
            {/* Hero skeleton */}
            <div className="surface-card space-y-4 p-6">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-80" />
            </div>

            {/* Filter bar skeleton */}
            <div className="flex flex-wrap gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-32 rounded-full" />
                ))}
                <Skeleton className="ml-auto h-10 w-48 rounded-full" />
            </div>

            {/* Table skeleton */}
            <div className="space-y-2 rounded-3xl border border-border bg-card p-4">
                <div className="flex items-center gap-4 border-b border-border pb-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-4 w-24" />
                    ))}
                </div>
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 py-3">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-6 w-20 rounded-full" />
                        <Skeleton className="h-4 w-24" />
                    </div>
                ))}
            </div>
        </DashboardShell>
    );
}
