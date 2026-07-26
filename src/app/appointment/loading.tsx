import { DashboardShell } from '@/components/layout/shell';
import { Skeleton } from '@/components/ui/skeleton';

export default function AppointmentLoading() {
  return (
    <DashboardShell>
      <div className="surface-card space-y-4 p-6">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-4 w-96" />
        <div className="flex flex-wrap gap-3 pt-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-44 rounded-2xl" />
          ))}
        </div>
      </div>

      <div className="mt-6 space-y-6">
        <div className="surface-card space-y-4">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-4 w-48" />
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-2xl" />
            ))}
          </div>
        </div>

        <div className="surface-card space-y-4">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-4 w-64" />
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

        <div className="surface-card space-y-3">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
      </div>
    </DashboardShell>
  );
}
