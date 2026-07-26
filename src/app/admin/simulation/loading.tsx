import { PageHeroSkeleton } from '@/components/layout/page-hero-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

// Its own file because /admin/loading.tsx would otherwise cover this route, and the
// two pages are shaped differently: simulation's hero has ONE stat (not two) and its
// body is a 4-up summary plus a wide scrolling table, not an import panel over a
// source list.
//
// No DashboardShell and no SectionNav here: layout.tsx owns both, and a loading file
// renders INSIDE its layout, so drawing them again would paint two nav rows on every
// load. The fragment keeps these blocks as direct siblings of the shell's transition
// wrapper, which is what carries the vertical rhythm.
export default function AdminSimulationLoading() {
  return (
    <>
      <PageHeroSkeleton breadcrumbs eyebrow stats={1} />
      <div className="space-y-4" aria-busy>
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
    </>
  );
}
