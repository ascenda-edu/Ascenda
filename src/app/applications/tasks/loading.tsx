import { DashboardShell } from '@/components/layout/shell';
import { SectionNav } from '@/components/layout/section-nav';
import { PLANNER_SECTION_ITEMS } from '@/components/layout/navigation';
import { PageHeroSkeleton } from '@/components/layout/page-hero-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Mirrors `applications/tasks/page.tsx`: SectionNav, a hero with breadcrumbs and
 * no stats, then `CrossApplicationTasks` — a filter/add toolbar card followed by
 * grouped task lists. The hero used to be two bare skeleton bars with no card
 * around them at all.
 */
export default function TasksLoading() {
  return (
    <DashboardShell>
      <SectionNav items={PLANNER_SECTION_ITEMS} />
      <PageHeroSkeleton breadcrumbs eyebrow />

      <div className="space-y-6">
        {/* Filter + add-task toolbar card */}
        <div className="surface-card space-y-4 rounded-4xl p-5">
          <div className="flex flex-wrap items-center gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-24 rounded-full" />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-10 min-w-[200px] flex-1 rounded-full" />
            <Skeleton className="h-10 w-36 rounded-full" />
            <Skeleton className="h-10 w-20 rounded-full" />
          </div>
        </div>

        {/* Grouped task lists */}
        <div className="space-y-6">
          {Array.from({ length: 2 }).map((_, group) => (
            <section key={group} className="space-y-3">
              <div className="space-y-1.5">
                <Skeleton className="h-5 w-56 max-w-full" />
                <Skeleton className="h-3 w-32" />
              </div>
              <ul className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/60 px-4 py-3"
                  >
                    <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-5 w-20 shrink-0 rounded-full" />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
