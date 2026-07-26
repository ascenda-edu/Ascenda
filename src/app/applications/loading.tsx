import { DashboardShell } from '@/components/layout/shell';
import { SectionNav } from '@/components/layout/section-nav';
import { PLANNER_SECTION_ITEMS } from '@/components/layout/navigation';
import { Skeleton } from '@/components/ui/skeleton';

export default function ApplicationsLoading() {
    return (
        <DashboardShell>
            <SectionNav items={PLANNER_SECTION_ITEMS} />

            {/* Hero skeleton */}
            <div className="surface-card space-y-4 p-6">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-8 w-56" />
                <Skeleton className="h-4 w-80" />
                <div className="flex gap-3 pt-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-9 w-28 rounded-full" />
                    ))}
                </div>
            </div>

            {/* Board skeleton */}
            <div className="grid gap-6 lg:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="space-y-4 rounded-3xl border border-border bg-card p-5">
                        <Skeleton className="h-5 w-32" />
                        {Array.from({ length: 3 }).map((_, j) => (
                            <Skeleton key={j} className="h-20 w-full rounded-xl" />
                        ))}
                    </div>
                ))}
            </div>
        </DashboardShell>
    );
}
