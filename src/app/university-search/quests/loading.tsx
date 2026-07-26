import { PageHeroSkeleton } from '@/components/layout/page-hero-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * `/university-search/quests` used to inherit the search-shaped skeleton at the
 * segment root — facet rail, search toolbar, results grid — none of which this
 * page has. It renders a hero (breadcrumbs, eyebrow), a three-card totals row,
 * then one section per assigned deck with its quest cards two-up.
 */
export default function QuestsLoading() {
  return (
    <div className="space-y-8 pb-24">
      <div className="space-y-6">
        <PageHeroSkeleton breadcrumbs eyebrow />

        {/* Totals row */}
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      </div>

      {/* Deck sections */}
      <div className="space-y-8">
        {Array.from({ length: 2 }).map((_, deck) => (
          <section key={deck} className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
                <div className="space-y-2">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-64 max-w-full" />
                </div>
              </div>
              <Skeleton className="h-7 w-24 shrink-0 rounded-full" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-56 rounded-2xl" />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
