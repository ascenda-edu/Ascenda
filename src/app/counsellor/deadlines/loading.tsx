import { SectionNav } from '@/components/layout/section-nav';
import { COUNSELLOR_SECTION_ITEMS } from '@/components/layout/navigation';
import { PageHeroSkeleton } from '@/components/layout/page-hero-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

// Mirrors `counsellor/deadlines/page.tsx`: hero with an eyebrow and four stat
// tiles, then the DeadlineMonitor's filter row and urgency groups.
export default function DeadlinesLoading() {
  return (
    <div className="space-y-6">
      <SectionNav items={COUNSELLOR_SECTION_ITEMS} />
      <PageHeroSkeleton stats={4} />
      <Skeleton className="h-14 rounded-2xl" />
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-32 rounded-2xl" />
      ))}
    </div>
  );
}
