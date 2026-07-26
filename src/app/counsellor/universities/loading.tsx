import { SectionNav } from '@/components/layout/section-nav';
import { COUNSELLOR_SECTION_ITEMS } from '@/components/layout/navigation';
import { PageHeroSkeleton } from '@/components/layout/page-hero-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

// Mirrors `counsellor/universities/page.tsx`: hero with an eyebrow and four stat
// tiles, then the catalogue search (left) and deck library (right).
export default function UniversitiesLoading() {
  return (
    <div className="space-y-6">
      <SectionNav items={COUNSELLOR_SECTION_ITEMS} />
      <PageHeroSkeleton stats={4} />
      {/* Search catalogue (left) + deck library (right) */}
      <div className="grid gap-6 lg:grid-cols-[1.2fr,1fr]">
        <div className="space-y-3">
          <Skeleton className="h-12 rounded-2xl" />
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
        <div className="space-y-3">
          <Skeleton className="h-10 rounded-2xl" />
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
