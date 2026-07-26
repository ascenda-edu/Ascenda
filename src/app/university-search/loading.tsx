import { Skeleton } from '@/components/ui/skeleton';
import { UniversityCardSkeleton } from '@/components/university-card-skeleton';

// Mirrors the unified search layout: PageHero block, sort/view toolbar, the
// desktop facet rail (lg+), and a grid of card skeletons.
export default function SearchLoading() {
  return (
    <div className="space-y-6">
      {/* PageHero-shaped block */}
      <div className="surface-card !px-4 !py-3 sm:!px-5 sm:!py-3.5">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-40" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-64 max-w-full" />
            <Skeleton className="h-3 w-80 max-w-full" />
            <Skeleton className="h-8 w-32 rounded-full" />
          </div>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[280px,1fr]">
        {/* Facet rail (lg+) */}
        <div className="hidden lg:block">
          <div className="surface-card !p-0">
            <div className="border-b border-border px-5 py-4">
              <Skeleton className="h-5 w-20" />
            </div>
            <div className="space-y-5 px-5 py-5">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="space-y-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-9 w-full rounded-xl" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-6">
          {/* Toolbar bar */}
          <div className="rounded-2xl border border-border bg-card p-3 dark:border-white/10">
            <div className="flex flex-wrap items-center gap-3">
              <Skeleton className="h-11 min-w-[12rem] flex-1 rounded-full" />
              <Skeleton className="h-11 w-32 rounded-full" />
              <Skeleton className="h-11 w-20 rounded-full" />
            </div>
          </div>

          {/* Card skeletons */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <UniversityCardSkeleton key={index} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
