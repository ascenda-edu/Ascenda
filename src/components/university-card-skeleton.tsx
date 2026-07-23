import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export const UniversityCardSkeleton = ({ variant = 'default' }: { variant?: 'default' | 'compact' }) => {
  const isCompact = variant === 'compact';

  if (isCompact) {
    return (
      <article
        className="group relative flex h-full items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm dark:border-white/10"
        aria-hidden
      >
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
              <div className="min-w-0 space-y-1.5">
                <Skeleton className="h-4 w-40 max-w-full rounded-lg" />
                <Skeleton className="h-3 w-28 rounded-lg" />
              </div>
            </div>
            <Skeleton className="h-6 w-14 rounded-full" />
          </div>
          <div className="flex gap-4">
            <Skeleton className="h-3 w-16 rounded-lg" />
            <Skeleton className="h-3 w-14 rounded-lg" />
          </div>
        </div>
        <Skeleton className="h-9 w-24 shrink-0 rounded-full" />
      </article>
    );
  }

  return (
    <article
      className="group relative flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-sm dark:border-white/10"
      aria-hidden
    >
      {/* Identity + fit badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
          <div className="min-w-0 space-y-2">
            <Skeleton className="h-4 w-44 max-w-full rounded-lg" />
            <Skeleton className="h-3.5 w-32 rounded-lg" />
          </div>
        </div>
        <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
      </div>

      {/* Meta line */}
      <Skeleton className="mt-3 h-3 w-36 rounded-lg" />

      {/* Footer: stats strip + actions */}
      <div className="mt-auto flex flex-col gap-4 pt-4">
        <div className={cn('flex flex-wrap gap-4 border-t border-border/60 pt-3')}>
          <Skeleton className="h-3.5 w-20 rounded-lg" />
          <Skeleton className="h-3.5 w-16 rounded-lg" />
          <Skeleton className="h-3.5 w-16 rounded-lg" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 flex-1 rounded-full" />
          <Skeleton className="h-9 w-24 rounded-full" />
        </div>
      </div>
    </article>
  );
};
