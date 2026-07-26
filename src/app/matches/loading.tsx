import { DashboardShell } from '@/components/layout/shell';
import { SectionNav } from '@/components/layout/section-nav';
import { EXPLORE_SECTION_ITEMS } from '@/components/layout/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { UniversityCardSkeleton } from '@/components/university-card-skeleton';

const TierBlock = ({ count = 3 }: { count?: number }) => (
  <div className="space-y-5 rounded-4xl border border-border bg-card p-6 shadow-e-3">
    <div className="flex flex-col gap-3 border-b border-border pb-3">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-7 w-24 rounded-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
    </div>
    <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <UniversityCardSkeleton key={i} />
      ))}
    </div>
  </div>
);

export default function LoadingMatchesPage() {
  return (
    <DashboardShell>
      <SectionNav items={EXPLORE_SECTION_ITEMS} />
      <section className="surface-card text-foreground">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-3 w-24" />
          <div className="space-y-3">
            <Skeleton className="h-6 w-40 rounded-full" />
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-4 w-80" />
          </div>
          <div className="border-t border-border/70 pt-4 sm:border-l sm:border-t-0 sm:pl-4">
            <div className="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="min-w-[180px] rounded-2xl border border-border bg-background px-5 py-3">
                  <Skeleton className="h-7 w-16" />
                  <Skeleton className="mt-2 h-3 w-20" />
                  <Skeleton className="mt-2 h-3 w-24" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="space-y-6">
        <TierBlock />
        <TierBlock count={2} />
      </div>
    </DashboardShell>
  );
}
