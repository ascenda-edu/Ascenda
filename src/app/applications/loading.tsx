import { PageHeroSkeleton } from '@/components/layout/page-hero-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Mirrors `applications/page.tsx`. It used to draw a three-column kanban board;
 * the page renders two STACKED list sections — "What's next" (up to three
 * next-action rows) and "All applications" (a list of application rows) — so
 * every load shoved the real content down and across.
 */
const ListRow = ({ progress = false }: { progress?: boolean }) => (
  <li className="rounded-2xl border border-border/60 bg-card/60 px-4 py-3">
    <div className="flex items-center gap-4">
      <Skeleton className="h-2.5 w-2.5 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-56 max-w-full" />
        <Skeleton className="h-3 w-40 max-w-full" />
      </div>
      <div className="hidden shrink-0 space-y-1.5 sm:block">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="ml-auto h-3 w-14" />
      </div>
      <Skeleton className="h-9 w-28 shrink-0 rounded-full" />
    </div>
    {progress ? (
      <div className="mt-2.5 flex items-center gap-3">
        <Skeleton className="h-1.5 flex-1 rounded-full" />
        <Skeleton className="h-3 w-16 shrink-0" />
      </div>
    ) : null}
  </li>
);

const SectionHeading = () => (
  <div className="space-y-1.5">
    <Skeleton className="h-3 w-28" />
    <Skeleton className="h-6 w-64 max-w-full" />
  </div>
);

export default function ApplicationsLoading() {
  return (
    <>
      <PageHeroSkeleton breadcrumbs eyebrow stats={3} actions />

      <div className="space-y-6 sm:space-y-8">
        {/* What's next */}
        <section className="space-y-3">
          <SectionHeading />
          <ul className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <ListRow key={i} />
            ))}
          </ul>
        </section>

        {/* All applications */}
        <section className="space-y-3">
          <SectionHeading />
          <ul className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <ListRow key={i} progress />
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
