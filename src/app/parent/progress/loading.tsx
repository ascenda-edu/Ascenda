import { PageHeroSkeleton } from '@/components/layout/page-hero-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

// Mirrors `parent/progress/page.tsx` below the nav row (parent/layout.tsx owns that): a hero with an eyebrow, three
// stat tiles and the child switcher, then the ProgressBoard rows.
export default function ParentProgressLoading() {
  return (
    <div className="space-y-6">
      <PageHeroSkeleton stats={3} actions />
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
