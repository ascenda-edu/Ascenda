import { DashboardShell } from '@/components/layout/shell';
import { PageHeroSkeleton } from '@/components/layout/page-hero-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Mirrors the toolbox HUB (`toolbox/page.tsx`) and nothing else.
 *
 * It used to draw five cards in a three-column grid; the hub renders a
 * next-action + progress-ring row followed by FOUR tool cards in a
 * `md:2 / lg:3 / 2xl:4` grid. It also sat at the segment root, so it covered
 * `/toolbox/chances|requirements|timeline|essay-workshop` — none of which look
 * like a tool-card grid. Those four now have their own `loading.tsx`.
 */
export default function ToolboxLoading() {
  return (
    <DashboardShell>
      <PageHeroSkeleton stats={3} />

      {/* Next action + requirements ring */}
      <div className="grid gap-4 sm:grid-cols-[1fr,auto]">
        <div className="surface-card border-l-4 border-l-primary">
          <div className="flex items-center gap-4">
            <Skeleton className="h-14 w-14 shrink-0 rounded-2xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-6 w-56 max-w-full" />
              <Skeleton className="h-4 w-40" />
            </div>
          </div>
        </div>
        <div className="surface-card flex items-center gap-4 sm:min-w-[200px]">
          <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      </div>

      {/* Four tool cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="surface-card flex h-full flex-col gap-4 border-l-4 border-l-border">
            <div className="flex items-start gap-3">
              <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2 pt-0.5">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
            <div className="mt-auto grid grid-cols-3 gap-2">
              {Array.from({ length: 3 }).map((_, j) => (
                <Skeleton key={j} className="h-[3.25rem] rounded-xl" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </DashboardShell>
  );
}
