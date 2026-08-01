import { PageHeroSkeleton } from '@/components/layout/page-hero-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * `/toolbox/requirements` used to inherit the hub's tool-card grid. It renders
 * A 3-stat hero, then the requirements checker: an overall-readiness
 * panel with a progress ring, followed by the requirements matrix.
  *
 * No SectionNav here: `(shell)/layout.tsx` owns it, and a loading file renders
 * INSIDE its layout, so drawing one would paint two nav rows on every load.
*/
export default function RequirementsLoading() {
  return (
    <>
      <PageHeroSkeleton stats={3} />

      <div className="space-y-6">
        {/* Overall readiness */}
        <div className="surface-subcard flex flex-col items-center gap-6 rounded-2xl p-5 sm:flex-row">
          <Skeleton className="h-28 w-28 shrink-0 rounded-full" />
          <div className="flex-1 space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56 max-w-full" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
        </div>

        {/* Requirements matrix */}
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    </>
  );
}
