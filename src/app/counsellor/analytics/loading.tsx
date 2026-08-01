import { PageHeroSkeleton } from '@/components/layout/page-hero-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

// Mirrors `_analytics-client.tsx`: hero with an eyebrow, four stat tiles and an
// export action, then the widget grid. `h-20` never came close to the real card.
export default function AnalyticsLoading() {
  return (
    <div className="space-y-6">
      <PageHeroSkeleton stats={4} actions />
      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-48 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
