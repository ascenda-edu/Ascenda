import { DashboardShell } from '@/components/layout/shell';
import { Skeleton } from '@/components/ui/skeleton';

export default function ToolboxLoading() {
    return (
        <DashboardShell>
            {/* Hero skeleton */}
            <div className="surface-card space-y-4 p-6">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-8 w-40" />
                <Skeleton className="h-4 w-72" />
            </div>

            {/* Tool cards skeleton */}
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="space-y-4 rounded-4xl border border-border bg-card p-6">
                        <div className="flex items-center gap-3">
                            <Skeleton className="h-10 w-10 rounded-xl" />
                            <Skeleton className="h-5 w-32" />
                        </div>
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-3/4" />
                        <div className="flex items-center justify-between pt-2">
                            <Skeleton className="h-6 w-16 rounded-full" />
                            <Skeleton className="h-8 w-24 rounded-full" />
                        </div>
                    </div>
                ))}
            </div>
        </DashboardShell>
    );
}
