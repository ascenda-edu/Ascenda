import { PageHeroSkeleton } from '@/components/layout/page-hero-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

// Mirrors `parent/messages/page.tsx` below the nav row (parent/layout.tsx owns that): a hero with an eyebrow, TWO
// stat tiles and the child switcher, then the thread panel.
export default function ParentMessagesLoading() {
  return (
    <div className="space-y-6">
      <PageHeroSkeleton stats={2} actions />
      <Skeleton className="h-[480px] rounded-2xl" />
    </div>
  );
}
