import { DashboardShell } from '@/components/layout/shell';
import { SectionNav } from '@/components/layout/section-nav';
import { PLANNER_SECTION_ITEMS } from '@/components/layout/navigation';
import { Skeleton } from '@/components/ui/skeleton';

export default function DocumentsLoading() {
    return (
        <DashboardShell>
            <SectionNav items={PLANNER_SECTION_ITEMS} />

            <div className="surface-card space-y-4 p-6">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-72" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="space-y-3 rounded-3xl border border-border bg-card p-5">
                        <div className="flex items-center gap-3">
                            <Skeleton className="h-10 w-10 rounded-xl" />
                            <div className="space-y-1.5 flex-1">
                                <Skeleton className="h-4 w-32" />
                                <Skeleton className="h-3 w-24" />
                            </div>
                        </div>
                        <Skeleton className="h-2 w-full rounded-full" />
                        <Skeleton className="h-8 w-full rounded-lg" />
                    </div>
                ))}
            </div>
        </DashboardShell>
    );
}
