import { PageHeroSkeleton } from '@/components/layout/page-hero-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Mirrors `counsellor/students/[id]/page.tsx`: hero with breadcrumbs, an
 * eyebrow, four stat tiles and actions (message button + flag badges), then the
 * `StudentDetailTabs` toolbar row and its two-column panel.
 *
 * No `SectionNav` here — the counsellor portal has no section-nav row at all; its
 * destinations live in the top bar (see `counsellor/layout.tsx`).
 */
export default function StudentDetailLoading() {
  return (
    <div className="space-y-6">
      <PageHeroSkeleton breadcrumbs eyebrow stats={4} actions />

      {/* StudentDetailTabs: the TabsList toolbar row, then the active panel
          (TabsContent supplies the `mt-6` between them). */}
      <div>
        <div className="surface-toolbar flex items-center gap-2 rounded-4xl px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-8 w-24 shrink-0 rounded-lg" />
          ))}
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
