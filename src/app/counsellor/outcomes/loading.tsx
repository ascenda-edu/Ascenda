import { PageHeroSkeleton } from '@/components/layout/page-hero-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

// Mirrors `counsellor/outcomes/page.tsx`: hero with an eyebrow and three stat
// tiles, then the outcome dashboard's own tiles, tier cards and results table.
export default function OutcomesLoading() {
  return (
    <div className="space-y-6">
      <PageHeroSkeleton stats={3} />
      {/* Summary stat tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-16 rounded-2xl" />
        ))}
      </div>
      {/* Acceptance rate + tier cards */}
      <Skeleton className="h-24 rounded-2xl" />
      <div className="grid gap-3 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      {/* Results table */}
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}
