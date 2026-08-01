import { PageHeroSkeleton } from '@/components/layout/page-hero-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * `/profile/wizard` had no `loading.tsx`, so it inherited `profile/loading.tsx`
 * — which renders `DashboardShell` (navbar + sidebar) and the profile hub's
 * cards. The wizard has NO shell: it's a standalone `min-h-screen` page with its
 * own `max-w-5xl` column, a back-link row, the hero, and one form card. Loading
 * the wizard therefore flashed an entire app chrome that then vanished.
 */
export default function ProfileWizardLoading() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pb-16 pt-20 sm:px-6 lg:px-10">
        {/* Back-links row + CSV export */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-32 rounded-xl" />
            <Skeleton className="h-9 w-40 rounded-xl" />
          </div>
          <Skeleton className="h-9 w-36 rounded-xl" />
        </div>

        <PageHeroSkeleton stats={3} />

        <div className="surface-card space-y-6 rounded-4xl p-6">
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-64 max-w-full" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-10 w-full rounded-xl" />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap justify-between gap-3">
            <Skeleton className="h-10 w-28 rounded-full" />
            <Skeleton className="h-10 w-28 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
