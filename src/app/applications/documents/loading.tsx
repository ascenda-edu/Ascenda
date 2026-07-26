import { PageHeroSkeleton } from '@/components/layout/page-hero-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Mirrors `applications/documents/page.tsx`: a 2-stat hero, then TWO full-width
 * cards (letter tracker, then uploaded documents). This used to draw a three-column
 * grid of four small cards, which the page never renders.
 *
 * No SectionNav here: `applications/layout.tsx` owns it, and a loading file renders
 * INSIDE its layout, so drawing one would paint two nav rows on every load.
 */
const DocRow = () => (
  <div className="flex items-center gap-4 rounded-2xl border border-border/60 bg-background/60 px-5 py-4">
    <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
    <div className="min-w-0 flex-1 space-y-2">
      <Skeleton className="h-4 w-48 max-w-full" />
      <Skeleton className="h-3 w-32" />
    </div>
    <Skeleton className="h-3 w-16 shrink-0" />
  </div>
);

export default function DocumentsLoading() {
  return (
    <>
      <PageHeroSkeleton stats={2} />

      {/* Letter tracker */}
      <div className="surface-card space-y-3">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-3 w-full max-w-lg" />
        <div className="space-y-3 pt-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <DocRow key={i} />
          ))}
        </div>
      </div>

      {/* Uploaded documents */}
      <div className="surface-card space-y-3">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-3 w-full max-w-lg" />
        <div className="space-y-3 pt-3">
          <Skeleton className="h-10 w-full max-w-md rounded-xl" />
          {Array.from({ length: 3 }).map((_, i) => (
            <DocRow key={i} />
          ))}
        </div>
      </div>
    </>
  );
}
