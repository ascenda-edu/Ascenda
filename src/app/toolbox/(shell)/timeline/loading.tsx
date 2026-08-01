import { PageHeroSkeleton } from '@/components/layout/page-hero-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * `/toolbox/timeline` used to inherit the hub's tool-card grid. It renders
 * A 3-stat hero, then the timeline tool: a "next 14 days" card grid
 * followed by the chronological deadline list.
  *
 * No SectionNav here: `(shell)/layout.tsx` owns it, and a loading file renders
 * INSIDE its layout, so drawing one would paint two nav rows on every load.
*/
export default function TimelineLoading() {
  return (
    <>
      <PageHeroSkeleton stats={3} />

      <div className="space-y-6">
        <div className="space-y-3">
          <Skeleton className="h-3 w-28" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <Skeleton className="h-3 w-32" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      </div>
    </>
  );
}
