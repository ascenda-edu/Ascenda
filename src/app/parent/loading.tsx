import { SectionNav } from '@/components/layout/section-nav';
import { PARENT_SECTION_ITEMS } from '@/components/layout/navigation';
import { PageHeroSkeleton } from '@/components/layout/page-hero-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Mirrors `parent/page.tsx`: the real SectionNav (it has its own Suspense
 * fallback, so rendering it here is both accurate and navigable), then a hero
 * with an eyebrow, four stat tiles and the child switcher in the actions slot,
 * then the three overview cards.
 */
export default function ParentLoading() {
  return (
    <div className="space-y-6">
      <SectionNav items={PARENT_SECTION_ITEMS} />
      <PageHeroSkeleton stats={4} actions />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-48 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
