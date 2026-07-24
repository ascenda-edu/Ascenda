import { Skeleton } from '@/components/ui/skeleton';

export const UniversityCardSkeleton = ({ variant = 'default' }: { variant?: 'default' | 'compact' }) => {
  const isCompact = variant === 'compact';

  if (isCompact) {
    return (
      <article
        className="group relative flex h-full items-center gap-3.5 rounded-2xl border border-border bg-card p-4 shadow-sm dark:border-white/10"
        aria-hidden
      >
        <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-4 w-44 max-w-full rounded-lg" />
            <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          </div>
          <Skeleton className="mt-1 h-3 w-40 rounded-lg" />
          <Skeleton className="mt-1.5 h-3 w-48 max-w-full rounded-lg" />
        </div>
      </article>
    );
  }

  return (
    <article
      className="group relative flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-sm dark:border-white/10"
      aria-hidden
    >
      {/* Top row: logo + fit ring / bookmark */}
      <div className="flex items-start justify-between gap-3">
        <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
        </div>
      </div>

      {/* Programme heading (2 lines) */}
      <Skeleton className="mt-3 h-4 w-48 max-w-full rounded-lg" />
      <Skeleton className="mt-1.5 h-4 w-32 rounded-lg" />

      {/* University name */}
      <Skeleton className="mt-2 h-3.5 w-40 max-w-full rounded-lg" />

      {/* Location */}
      <Skeleton className="mt-1.5 h-3 w-28 rounded-lg" />

      {/* Footer: 3-column stat strip */}
      <div className="mt-auto border-t border-border/60 pt-3">
        <div className="grid grid-cols-[auto_auto_auto] justify-between gap-x-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-2.5 w-12 rounded" />
              <Skeleton className="h-3.5 w-16 max-w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </article>
  );
};
