import { PageHeroSkeleton } from '@/components/layout/page-hero-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

// /admin had no loading state at all. It does now that the route has a section nav
// and a hero to shift — matching what page.tsx actually renders: a hero with
// breadcrumbs and two stats, then the import panel and the source list.
//
// No DashboardShell and no SectionNav here: layout.tsx owns both, and a loading file
// renders INSIDE its layout, so drawing them again would paint two nav rows on every
// load. Returning a fragment rather than a wrapper div keeps these blocks as direct
// siblings of the shell's transition wrapper, which is what carries the vertical
// rhythm — `space-y-*` needs siblings, so a wrapper here would swallow it.
export default function AdminLoading() {
  return (
    <>
      <PageHeroSkeleton breadcrumbs eyebrow stats={2} />
      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]" aria-busy>
        <div className="surface-card space-y-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-11 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
        </div>
        <div className="surface-card space-y-3">
          <Skeleton className="h-5 w-32" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </>
  );
}
