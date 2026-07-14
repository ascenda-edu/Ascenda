import { DashboardShell } from '@/components/layout/shell';
import { PageHero } from '@/components/layout/page-hero';
import { Skeleton } from '@/components/ui/skeleton';
import { DeadlinesSkeleton, RecommendedProgramsSkeleton, StatsCardSkeleton, TaskListSkeleton } from '@/components/dashboard/dashboard-skeletons';

export default function DashboardLoading() {
    return (
        <DashboardShell>
            <PageHero
                tone="student"
                eyebrow="Your dashboard"
                title="Welcome back"
                description="Pulling together your tasks, deadlines, and matches. One sec."
                highlight="Loading"
                stats={[
                    { label: 'Profile', value: '—', detail: 'Loading' },
                    { label: 'Checklist', value: '—', detail: 'Loading' },
                    { label: 'Signals', value: '—', detail: 'Loading' }
                ]}
                actions={
                    <div className="flex gap-2">
                        <Skeleton className="h-9 w-32" />
                        <Skeleton className="h-9 w-32" />
                        <Skeleton className="h-9 w-32" />
                    </div>
                }
            />

            <div className="grid gap-4 sm:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                    <StatsCardSkeleton key={i} />
                ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-2">
                    <TaskListSkeleton />
                </div>
                <aside className="space-y-6">
                    <DeadlinesSkeleton />
                </aside>
                <div className="lg:col-span-3">
                    <RecommendedProgramsSkeleton />
                </div>
            </div>
        </DashboardShell>
    );
}
