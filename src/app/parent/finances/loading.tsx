import { SectionNav } from '@/components/layout/section-nav';
import { PARENT_SECTION_ITEMS } from '@/components/layout/navigation';
import { PageHeroSkeleton } from '@/components/layout/page-hero-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

// Mirrors `parent/finances/page.tsx`: SectionNav, a hero with an eyebrow, three
// stat tiles and the child switcher, then the CostExplorer toolbar and cards.
export default function ParentFinancesLoading() {
  return (
    <div className="space-y-6">
      <SectionNav items={PARENT_SECTION_ITEMS} />
      <PageHeroSkeleton stats={3} actions />
      <Skeleton className="h-16 rounded-xl" />
      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-56 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
