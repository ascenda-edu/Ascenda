import { DashboardShell } from '@/components/layout/shell';
import { PageHeroSkeleton } from '@/components/layout/page-hero-skeleton';
import { Skeleton } from '@/components/ui/skeleton';
import { DeadlinesSkeleton, RecommendedProgramsSkeleton, TaskListSkeleton } from '@/components/dashboard/dashboard-skeletons';

/**
 * Mirrors `dashboard/page.tsx`: hero with an eyebrow, four stat tiles and two
 * actions, then the three hub rows.
 *
 * The hero used to be the REAL `PageHero` filled with placeholder copy
 * ("Welcome back", four em-dash stats), which reads as content that then gets
 * replaced — and animates its count-up on values that don't exist. It's a
 * skeleton now, like every other route.
 */
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
            <PageHeroSkeleton stats={4} actions />

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
