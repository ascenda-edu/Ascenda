import { PageHeroSkeleton } from '@/components/layout/page-hero-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * `/university-search/shortlist` used to inherit the search-shaped skeleton at
 * the segment root — facet rail, search toolbar, a four-across results grid —
 * none of which this page has. It renders a hero (breadcrumbs, eyebrow,
 * actions), a four-card metrics row, then the saved-course cards two-up.
 */
export default function ShortlistLoading() {
  return (
    <div className="space-y-8 pb-24">
      <div className="space-y-6">
        <PageHeroSkeleton breadcrumbs eyebrow actions />

        {/* Metrics row */}
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      </div>

      {/* Saved courses */}
      <section className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-6 w-56 max-w-full" />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      </section>
    </div>
  );
}
