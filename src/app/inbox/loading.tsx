import { DashboardShell } from '@/components/layout/shell';
import { PageHeroSkeleton } from '@/components/layout/page-hero-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Mirrors `inbox/page.tsx`: hero with an eyebrow and no stats, then the
 * InboxList rows. The hero block used to force `!px-4 !py-3` — a "compact
 * PageHero" variant that no longer exists (the hero is `p-5 sm:p-6`), so this
 * placeholder was ~20px short at every breakpoint.
 */
export default function InboxLoading() {
  return (
    <DashboardShell>
      <PageHeroSkeleton />

      {/* Mirrors the InboxList rows. */}
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-start gap-4 rounded-2xl border border-border bg-card px-5 py-4"
          >
            <Skeleton className="mt-0.5 h-10 w-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-full max-w-md" />
              <div className="flex items-center gap-2 pt-0.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-4 w-16 rounded-full" />
              </div>
            </div>
            <Skeleton className="h-3 w-10 shrink-0" />
          </div>
        ))}
      </div>
    </DashboardShell>
  );
}
