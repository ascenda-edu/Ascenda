import { DashboardShell } from '@/components/layout/shell';
import { PageHero } from '@/components/layout/page-hero';
import { Skeleton } from '@/components/ui/skeleton';
import { DeadlinesSkeleton, RecommendedProgramsSkeleton, TaskListSkeleton } from '@/components/dashboard/dashboard-skeletons';

const PanelSkeleton = ({ lines = 4 }: { lines?: number }) => (
    <div className="surface-card h-full">
        <div className="relative z-10 space-y-4">
            <div className="space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-6 w-44" />
            </div>
            <div className="space-y-3">
                {Array.from({ length: lines }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-xl" />
                ))}
            </div>
        </div>
    </div>
);

export default function DashboardLoading() {
    return (
        <DashboardShell>
            <PageHero
                tone="student"
                eyebrow="Home"
                title="Welcome back"
                description="Pulling together your tasks, deadlines, and matches. One sec."
                highlight="Loading"
                stats={[
                    { label: 'Applications', value: '—', detail: 'Loading' },
                    { label: 'Due this week', value: '—', detail: 'Loading' },
                    { label: 'Next deadline', value: '—', detail: 'Loading' },
                    { label: 'Profile', value: '—', detail: 'Loading' }
                ]}
                actions={
                    <div className="flex gap-2">
                        <Skeleton className="h-9 w-40" />
                        <Skeleton className="h-9 w-36" />
                    </div>
                }
            />

            <div className="space-y-6">
                {/* Row 1 — priority spine + profile progress */}
                <div className="grid gap-6 lg:grid-cols-12">
                    <div className="lg:col-span-8">
                        <PanelSkeleton lines={5} />
                    </div>
                    <div className="lg:col-span-4">
                        <PanelSkeleton lines={4} />
                    </div>
                </div>

                {/* Row 2 — pipeline, deadlines, counsellor */}
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    <PanelSkeleton lines={5} />
                    <DeadlinesSkeleton />
                    <div className="md:col-span-2 lg:col-span-1">
                        <PanelSkeleton lines={3} />
                    </div>
                </div>

                {/* Row 3 — tasks + top matches */}
                <div className="grid gap-6 lg:grid-cols-12">
                    <div className="lg:col-span-5">
                        <TaskListSkeleton />
                    </div>
                    <div className="lg:col-span-7">
                        <RecommendedProgramsSkeleton />
                    </div>
                </div>
            </div>
        </DashboardShell>
    );
}
