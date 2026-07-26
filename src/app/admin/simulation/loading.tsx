import { DashboardShell } from '@/components/layout/shell';
import { SectionNav } from '@/components/layout/section-nav';
import { ADMIN_SECTION_ITEMS } from '@/components/layout/navigation';
import { PageHeroSkeleton } from '@/components/layout/page-hero-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

// Its own file because /admin/loading.tsx would otherwise cover this route, and the
// two pages are shaped differently: simulation's hero has ONE stat (not two) and its
// body is a 4-up summary plus a wide scrolling table, not an import panel over a
// source list.
export default function AdminSimulationLoading() {
  return (
    <DashboardShell>
      <div className="space-y-6" aria-busy>
        <SectionNav items={ADMIN_SECTION_ITEMS} />
        <PageHeroSkeleton breadcrumbs eyebrow stats={1} />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[3.75rem] rounded-xl" />
          ))}
        </div>
        <div className="surface-card space-y-3">
          <Skeleton className="h-5 w-48" />
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
