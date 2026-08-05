import { Skeleton } from '@/components/ui/skeleton';
import { UniversityCardSkeleton } from '@/components/university-card-skeleton';

export const StatsCardSkeleton = () => (
  <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6">
    <div className="flex items-center justify-between">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-10 w-10 rounded-xl" />
    </div>
    <div className="mt-4 space-y-2.5">
      <Skeleton className="h-9 w-20" />
      <Skeleton className="h-3.5 w-28" />
    </div>
    {/* Shimmer overlay */}
    <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
  </div>
);

export const TaskListSkeleton = () => (
  <div className="surface-card">
    <div className="relative z-10 space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-6 w-44" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 surface-subcard p-3.5">
            <Skeleton className="h-5 w-5 rounded-lg shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  </div>
);

export const DeadlinesSkeleton = () => (
  <div className="surface-card">
    <div className="relative z-10 space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-6 w-44" />
      </div>
      <div className="relative pl-4 border-l-2 border-border space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="relative ml-4 surface-subcard p-4">
            <Skeleton className="absolute -left-[calc(1rem+9px)] top-5 h-2.5 w-2.5 rounded-full" />
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3.5 w-28" />
              </div>
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export const RecommendedProgramsSkeleton = () => (
  <div className="surface-card">
    <div className="relative z-10 space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-6 w-52" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <UniversityCardSkeleton key={i} />
        ))}
      </div>
    </div>
  </div>
);
