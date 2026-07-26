import { DashboardShell } from '@/components/layout/shell';
import { Skeleton } from '@/components/ui/skeleton';

export default function ProfileLoading() {
  return (
    <DashboardShell>
      {/* Hero skeleton */}
      <div className="surface-card space-y-4 p-6">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-4 w-96" />
        <div className="flex flex-wrap gap-2 pt-2">
          <Skeleton className="h-9 w-40 rounded-full" />
          <Skeleton className="h-9 w-36 rounded-full" />
          <Skeleton className="h-9 w-36 rounded-full" />
        </div>
      </div>

      {/* Two-column card skeletons */}
      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <div className="surface-card space-y-4">
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
          <div className="surface-card space-y-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-32" />
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-xl" />
              ))}
            </div>
          </div>
          <div className="surface-card space-y-3">
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

      {/* Progress card skeleton */}
      <div className="mt-8 grid gap-8 lg:grid-cols-[2fr,1fr]">
        <Skeleton className="h-48 rounded-3xl" />
        <Skeleton className="h-48 rounded-3xl" />
      </div>
    </DashboardShell>
  );
}
