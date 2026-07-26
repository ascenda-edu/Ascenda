import { DashboardShell } from '@/components/layout/shell';
import { PageHeroSkeleton } from '@/components/layout/page-hero-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Mirrors `appointment/page.tsx`: hero (breadcrumbs, eyebrow, three stats) then
 * the three form cards — topic picker, date/duration/time, notes + submit. The
 * hero's stats used to be drawn as a row of tiles BELOW the description; in the
 * real hero they sit to the right of it from `md` up.
 */
export default function AppointmentLoading() {
  return (
    <DashboardShell>
      <PageHeroSkeleton breadcrumbs eyebrow stats={3} />

      <div className="mt-6 space-y-6">
        {/* Topic */}
        <div className="surface-card space-y-4">
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-56" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-2xl" />
            ))}
          </div>
        </div>

        {/* When works for you */}
        <div className="surface-card space-y-4">
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-10 rounded-xl" />
            <Skeleton className="h-10 rounded-xl" />
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-20 rounded-full" />
            ))}
          </div>
        </div>

        {/* Notes + submit */}
        <div className="surface-card space-y-3">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-10 w-40 rounded-full" />
        </div>
      </div>
    </DashboardShell>
  );
}
