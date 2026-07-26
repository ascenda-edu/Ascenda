import { PageHeroSkeleton } from '@/components/layout/page-hero-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * `/toolbox/chances` used to inherit the hub's `loading.tsx` — a grid of tool
 * cards, which is not remotely this page. It renders a 3-stat hero,
 * then the calculator: a score panel and a list of university rows.
  *
 * No SectionNav here: `(shell)/layout.tsx` owns it, and a loading file renders
 * INSIDE its layout, so drawing one would paint two nav rows on every load.
*/
export default function ChancesLoading() {
  return (
    <>
      <PageHeroSkeleton stats={3} />

      <div className="space-y-6">
        {/* Predicted-score panel */}
        <div className="surface-subcard space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-9 w-32" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
        </div>

        {/* University chance rows */}
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      </div>
    </>
  );
}
