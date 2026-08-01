import { PageHeroSkeleton } from '@/components/layout/page-hero-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Mirrors `_dashboard-client.tsx`. The nav row is NOT here — `counsellor/layout.tsx`
 * owns it now, and a loading file renders INSIDE its layout, so repeating it would
 * paint two nav rows on every load. Then a hero with an eyebrow and FOUR stat tiles
 * (they live inside PageHero; there is no separate stats bar), then the at-risk /
 * help-requests pair, the widget grid, and the roster.
 */
export default function CounsellorLoading() {
  return (
    <div className="space-y-6">
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
