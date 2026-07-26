import { SectionNav } from '@/components/layout/section-nav';
import { COUNSELLOR_SECTION_ITEMS } from '@/components/layout/navigation';
import { PageHeroSkeleton } from '@/components/layout/page-hero-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

// Mirrors `counsellor/students/page.tsx`: hero with an eyebrow and four stat
// tiles, then the search/filter bar and the roster card grid.
export default function StudentsLoading() {
  return (
    <div className="space-y-6">
      <SectionNav items={COUNSELLOR_SECTION_ITEMS} />
      <PageHeroSkeleton stats={4} />
      {/* Search bar */}
      <Skeleton className="h-14 rounded-2xl" />
      {/* Card grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <Skeleton key={i} className="h-52 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
