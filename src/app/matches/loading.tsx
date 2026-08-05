import { DashboardShell } from '@/components/layout/shell';
import { SectionNav } from '@/components/layout/section-nav';
import { EXPLORE_SECTION_ITEMS } from '@/components/layout/navigation';
import { PageHeroSkeleton } from '@/components/layout/page-hero-skeleton';
import { Skeleton } from '@/components/ui/skeleton';
import { UniversityCardSkeleton } from '@/components/university-card-skeleton';

/**
 * Mirrors `matches/page.tsx` + `MatchList`: SectionNav, a hero with breadcrumbs,
 * an eyebrow, three stat tiles and two actions, then MatchList's sort/view
 * toolbar and its tier blocks.
 *
 * The tier blocks are `surface-stage` (rounded-2xl, `shadow-e-1`) — this file
 * drew `rounded-4xl … shadow-e-3`, the popover elevation, and skipped the
 * toolbar row entirely, so the whole results column shifted up on load.
 */
const TierBlock = ({ count = 3 }: { count?: number }) => (
  <div className="surface-stage space-y-5">
    <div className="flex flex-col gap-3 border-b border-border pb-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <Skeleton className="h-7 w-24 shrink-0 rounded-full" />
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
      <PageHeroSkeleton breadcrumbs eyebrow stats={3} actions />

      <div className="space-y-8 pb-24">
        {/* MatchList's sort / view toolbar */}
        <div className="surface-toolbar flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-4 w-64 max-w-full" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-11 w-48 rounded-2xl" />
            <Skeleton className="h-11 w-24 rounded-2xl" />
          </div>
        </div>

        <div className="space-y-6">
          <TierBlock />
          <TierBlock count={2} />
        </div>
      </div>
    </DashboardShell>
  );
}
