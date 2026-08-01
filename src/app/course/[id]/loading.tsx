import { PageHeroSkeleton } from '@/components/layout/page-hero-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Renders inside `layout.tsx`'s `<DashboardShell>`, so it no longer draws its
 * own `min-h-screen` + `<Navbar>` (which used to double up on whatever chrome
 * the page had and shifted everything on hydration).
 *
 * `PageHeroSkeleton` mirrors the real `<PageHero>` box, so the swap doesn't move
 * the page — see the note in that file about the twenty-nine hand-guessed hero
 * placeholders it replaced.
 */
export default function CourseLoading() {
  return (
    <>
      <PageHeroSkeleton breadcrumbs eyebrow actions />

      {/* The quick-facts row: four `surface-stat` tiles. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[4.75rem] rounded-xl" />
        ))}
      </div>

      {/* The tab row: `surface-toolbar` + seven pills. */}
      <div className="surface-toolbar flex items-center gap-2 rounded-4xl px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-28 shrink-0 rounded-lg" />
        ))}
      </div>

      <div className="space-y-6">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    </>
  );
}
