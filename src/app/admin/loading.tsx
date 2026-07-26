import { SectionNav } from '@/components/layout/section-nav';
import { ADMIN_SECTION_ITEMS } from '@/components/layout/navigation';
import { PageHeroSkeleton } from '@/components/layout/page-hero-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

// /admin had no loading state at all. It does now that the route has a section nav
// and a hero to shift — matching what page.tsx actually renders: nav row, hero with
// breadcrumbs and two stats, then the import panel and the source list.
export default function AdminLoading() {
  return (
    <div className="space-y-6" aria-busy>
      <SectionNav items={ADMIN_SECTION_ITEMS} />
      <PageHeroSkeleton breadcrumbs eyebrow stats={2} />
      <div className="surface-card space-y-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-11 w-full rounded-2xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
      </div>
      <div className="surface-card space-y-3">
        <Skeleton className="h-5 w-32" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
