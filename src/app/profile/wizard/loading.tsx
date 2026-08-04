import { Skeleton } from '@/components/ui/skeleton';

/**
 * `/profile/wizard` had no `loading.tsx`, so it inherited `profile/loading.tsx`
 * — which renders `DashboardShell` (navbar + sidebar) and the profile hub's cards.
 * The wizard has NO shell, so loading it flashed an entire app chrome that then
 * vanished. That is still the reason this file exists.
 *
 * ── It must mirror `page.tsx`'s frame, and it previously did not ──────────────
 * This skeleton had drifted from the page it stands in for on three counts —
 * `pt-20` against the page's `pt-12`, `overflow-hidden` against `overflow-x-clip`,
 * and a `PageHeroSkeleton stats={3}` reserving a stats row the real hero had
 * stopped passing — so the wizard visibly jumped when the real content landed.
 * The page is now a full-height frame (sticky 56px bar, a bordered rail column, one
 * work card), and this reproduces that geometry exactly. **If you change the
 * frame in `page.tsx`, change it here in the same commit.**
 */
export default function ProfileWizardLoading() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-x-clip bg-background text-foreground">
      {/* Same wash as the page, so the background does not shift on hydration. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.12),transparent_55%)]"
      />

      {/* The utility bar. Real height (`h-14`) rather than a skeleton block —
        * reserving the exact box is what stops the reflow. */}
      <div className="sticky top-0 z-nav shrink-0 border-b border-border/60 bg-card/80 backdrop-blur-sm">
        <div className="shell-gutter mx-auto flex h-14 w-full max-w-[120rem] items-center gap-3">
          <Skeleton className="h-5 w-24" />
          <span aria-hidden className="h-4 w-px shrink-0 bg-primary/20" />
          <Skeleton className="h-5 w-32" />
          <div className="ml-auto flex items-center gap-2">
            <Skeleton className="h-8 w-32 rounded-full" />
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
        </div>
      </div>

      <div className="shell-gutter relative z-raised mx-auto flex w-full max-w-[120rem] flex-1 flex-col pb-16 pt-6">
        <div className="flex flex-1 flex-col gap-6 lg:flex-row">
          {/* The rail column — chrome, not a card, so no surface here either. */}
          <div className="hidden lg:flex lg:w-72 lg:shrink-0 lg:flex-col lg:border-r lg:border-border/60 lg:pr-6">
            <div className="flex items-center gap-4">
              <Skeleton className="h-16 w-16 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-full" />
              </div>
            </div>
            <div className="mt-5 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2">
                  <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
                  <Skeleton className="h-4 flex-1" />
                </div>
              ))}
            </div>
          </div>

          {/* The work card. `rounded-3xl` and `lg:self-start`, matching the page. */}
          <div className="surface-card min-w-0 flex-1 space-y-6 rounded-3xl lg:self-start">
            <div className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-64 max-w-full" />
              <Skeleton className="h-4 w-80 max-w-full" />
            </div>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-2xl" />
              ))}
            </div>
            <div className="flex flex-wrap justify-between gap-3 border-t border-border/50 pt-4">
              <Skeleton className="h-11 w-28 rounded-full" />
              <Skeleton className="h-11 w-28 rounded-full" />
            </div>
          </div>

          {/* The unlocks column, xl and up. */}
          <div className="hidden xl:block xl:w-80 xl:shrink-0">
            <Skeleton className="h-64 w-full rounded-3xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
