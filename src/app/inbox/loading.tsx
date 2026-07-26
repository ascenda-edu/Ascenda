import { DashboardShell } from '@/components/layout/shell';
import { Skeleton } from '@/components/ui/skeleton';

export default function InboxLoading() {
  return (
    <DashboardShell>
      {/* Mirrors the compact PageHero (eyebrow · title · description). */}
      <div className="surface-card !px-4 !py-3 sm:!px-5 sm:!py-3.5">
        <div className="space-y-1.5">
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-72 max-w-full" />
        </div>
      </div>

      {/* Mirrors the InboxList rows. */}
      <div className="mt-4 space-y-2">
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
