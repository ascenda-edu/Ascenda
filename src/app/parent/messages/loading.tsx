import { SectionNav } from '@/components/layout/section-nav';
import { PARENT_SECTION_ITEMS } from '@/components/layout/navigation';
import { PageHeroSkeleton } from '@/components/layout/page-hero-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

// Mirrors `parent/messages/page.tsx`: SectionNav, a hero with an eyebrow, TWO
// stat tiles and the child switcher, then the thread panel.
export default function ParentMessagesLoading() {
  return (
    <div className="space-y-6">
      <SectionNav items={PARENT_SECTION_ITEMS} />
      <PageHeroSkeleton stats={2} actions />
      <Skeleton className="h-[480px] rounded-2xl" />
    </div>
  );
}
