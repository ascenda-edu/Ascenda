import { PageHeroSkeleton } from '@/components/layout/page-hero-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

// Mirrors `parent/deadlines/page.tsx` below the nav row (the layout owns that): a hero with an eyebrow, three
// stat tiles and the child switcher, then the urgency groups.
export default function ParentDeadlinesLoading() {
  return (
    <div className="space-y-6">
      <PageHeroSkeleton stats={3} actions />
      {[1, 2].map((i) => (
        <Skeleton key={i} className="h-40 rounded-2xl" />
      ))}
    </div>
  );
}
