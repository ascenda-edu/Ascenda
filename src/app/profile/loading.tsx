import { DashboardShell } from '@/components/layout/shell';
import { PageHeroSkeleton } from '@/components/layout/page-hero-skeleton';
import { Skeleton } from '@/components/ui/skeleton';
import { PROFILE_STEPS } from '@/lib/profile/steps';

/**
 * Mirrors `profile/page.tsx` IN ORDER: hero (breadcrumbs, eyebrow, three stat
 * tiles, actions) → the profile-progress card → the two-column section cards.
 *
 * The progress card used to be drawn LAST, as a pair of `h-48` blocks in a
 * `[2fr,1fr]` grid the page has never rendered, so the whole page swapped
 * top-to-bottom on load.
 */
export default function ProfileLoading() {
  return (
    <DashboardShell>
      <PageHeroSkeleton breadcrumbs eyebrow stats={3} actions />

      {/* Profile completion card — first on the page, not last. */}
      <div className="surface-card rounded-4xl border-l-4 border-l-border p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <Skeleton className="h-11 w-11 shrink-0 rounded-2xl" />
            <div className="space-y-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
          <Skeleton className="h-9 w-40 rounded-full" />
        </div>
        <Skeleton className="mt-4 h-2 w-full rounded-full" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {PROFILE_STEPS.map((step) => (
            <Skeleton key={step.key} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>

      {/* Two-column section cards */}
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="surface-card space-y-4 border-l-4 border-l-border">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-40" />
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        </div>
        <div className="space-y-8">
          <div className="surface-card space-y-3 border-l-4 border-l-border">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-32" />
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-xl" />
              ))}
            </div>
          </div>
          <div className="surface-card space-y-3 border-l-4 border-l-border">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-5 w-40" />
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
