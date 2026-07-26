import { SectionNav } from '@/components/layout/section-nav';
import { COUNSELLOR_SECTION_ITEMS } from '@/components/layout/navigation';
import { PageHeroSkeleton } from '@/components/layout/page-hero-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

// Mirrors `counsellor/documents/page.tsx`: hero with an eyebrow and four stat
// tiles, then the document board's filter row and rows.
export default function DocumentsLoading() {
  return (
    <div className="space-y-6">
      <SectionNav items={COUNSELLOR_SECTION_ITEMS} />
      <PageHeroSkeleton stats={4} />
      {/* Filter / toolbar row */}
      <Skeleton className="h-12 rounded-2xl" />
      {/* Document rows */}
      <div className="space-y-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-16 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
