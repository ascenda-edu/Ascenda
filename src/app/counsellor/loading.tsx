import { SectionNav } from '@/components/layout/section-nav';
import { COUNSELLOR_SECTION_ITEMS } from '@/components/layout/navigation';
import { PageHeroSkeleton } from '@/components/layout/page-hero-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Mirrors `_dashboard-client.tsx`: the SectionNav row (rendered for real — it has
 * its own Suspense fallback, and this is what the student sections' loading files
 * do), then a hero with an eyebrow and FOUR stat tiles (they live inside PageHero;
 * there is no separate stats bar), then the at-risk / help-requests pair, the
 * widget grid, and the roster.
 */
export default function CounsellorLoading() {
  return (
    <div className="space-y-6">
      <SectionNav items={COUNSELLOR_SECTION_ITEMS} />
      <PageHeroSkeleton stats={4} />
      {/* At-risk panel + live help requests */}
      <div className="grid gap-6 lg:grid-cols-2">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-56 rounded-2xl" />
        ))}
      </div>
      {/* Widget grid toolbar + widgets (2-col, matching WidgetGrid) */}
      <Skeleton className="h-10 rounded-full" />
      <div className="grid gap-6 md:grid-cols-2">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-64 rounded-2xl" />
        ))}
      </div>
      {/* Student roster */}
      <Skeleton className="h-12 rounded-xl" />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-56 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
