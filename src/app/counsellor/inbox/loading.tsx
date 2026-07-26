import { SectionNav } from '@/components/layout/section-nav';
import { COUNSELLOR_SECTION_ITEMS } from '@/components/layout/navigation';
import { PageHeroSkeleton } from '@/components/layout/page-hero-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

// Mirrors `counsellor/inbox/page.tsx`: hero with an eyebrow and no stats, then
// the inbox filter row and conversation rows. This file used to hand-roll its
// own `animate-pulse bg-muted/50` blocks instead of using `Skeleton`, so it
// didn't even share the app's shimmer.
export default function CounsellorInboxLoading() {
  return (
    <div className="space-y-6">
      <SectionNav items={COUNSELLOR_SECTION_ITEMS} />
      <PageHeroSkeleton />
      <Skeleton className="h-10 rounded-2xl" />
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-20 rounded-2xl" />
      ))}
    </div>
  );
}
