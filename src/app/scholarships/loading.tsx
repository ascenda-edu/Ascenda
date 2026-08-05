import { DashboardShell } from '@/components/layout/shell';
import { PageHeroSkeleton } from '@/components/layout/page-hero-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Mirrors `scholarships/page.tsx` + `ScholarshipExplorer`: hero (breadcrumbs,
 * eyebrow, three stat tiles), a sample-data notice, then the search + filter
 * card, a result-count row, and a LIST OF CARDS.
 *
 * This file used to draw a five-column table with a header row — the explorer
 * has never been a table, so the entire body re-flowed on every load.
 */
export default function ScholarshipsLoading() {
  return (
    <DashboardShell>
      <PageHeroSkeleton breadcrumbs eyebrow stats={3} />

      {/* Sample-data notice */}
      <Skeleton className="h-16 rounded-2xl" />

      <div className="space-y-5">
        {/* Search + filter toggle card */}
        <div className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-e-1">
          <div className="flex gap-2">
            <Skeleton className="h-11 flex-1 rounded-xl" />
            <Skeleton className="h-11 w-28 rounded-xl" />
          </div>
        </div>

        {/* Result count row */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-3 w-24" />
        </div>

        {/* Scholarship cards */}
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-border bg-card p-4 shadow-e-1 sm:p-5"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
                  <div className="min-w-0 space-y-2">
                    <Skeleton className="h-5 w-24 rounded-full" />
                    <Skeleton className="h-5 w-64 max-w-full" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <div className="space-y-1.5">
                    <Skeleton className="h-6 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <Skeleton className="h-9 w-9 rounded-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
