import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Loading placeholder for `<PageHero>`.
 *
 * This exists because 29 `loading.tsx` files each guessed the hero's height, and
 * they disagreed: `h-20` across nine counsellor routes, `h-12` across five parent
 * routes, `h-16` across the assistant routes, and a dozen more hand-assembling it
 * out of `h-3 w-20` fragments — all standing in for the *same component*. Every one
 * of them was a layout shift on load, and every one of them silently went stale the
 * moment PageHero's padding or type scale changed (which it just did).
 *
 * So this mirrors PageHero's real structure rather than approximating its box:
 * the same `surface-card p-5 sm:p-6`, the same stacking order, the same element
 * heights. When the hero changes, change it here too — that's one edit instead of
 * twenty-nine, and the two can't drift apart unnoticed.
 *
 * Match the props to what the route's hero actually renders, or the shift comes back.
 */
export interface PageHeroSkeletonProps {
  /** Render a breadcrumb line above the title. */
  breadcrumbs?: boolean;
  /** Render an eyebrow line above the title. */
  eyebrow?: boolean;
  /** Number of stat tiles the real hero shows. 0 renders none. */
  stats?: number;
  /** Render a row of action buttons below the description. */
  actions?: boolean;
  className?: string;
}

export function PageHeroSkeleton({
  breadcrumbs = false,
  eyebrow = true,
  stats = 0,
  actions = false,
  className
}: PageHeroSkeletonProps) {
  return (
    <div
      className={cn('surface-card overflow-hidden p-5 sm:p-6', className)}
      aria-hidden
    >
      <div className="relative flex flex-col gap-2">
        {breadcrumbs ? <Skeleton className="h-3 w-40" /> : null}

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1.5">
            {eyebrow ? <Skeleton className="h-3 w-24" /> : null}
            {/* Title: the h2 step, 22px at leading-snug -> ~30px. */}
            <Skeleton className="h-[1.875rem] w-64 max-w-full" />
            {/* Description: 14px at leading-relaxed -> ~22px. */}
            <Skeleton className="h-[1.375rem] w-full max-w-md" />
            {actions ? (
              <div className="flex gap-2 pt-1">
                <Skeleton className="h-9 w-28 rounded-full" />
                <Skeleton className="h-9 w-24 rounded-full" />
              </div>
            ) : null}
          </div>

          {stats > 0 ? (
            <div className="border-t border-border pt-3 md:border-l md:border-t-0 md:pl-5 md:pt-0 md:shrink-0">
              <div className={cn('flex gap-2', stats >= 4 ? 'flex-wrap' : 'flex-row')}>
                {Array.from({ length: stats }).map((_, i) => (
                  // Mirrors surface-stat + the hero's !p-3 override.
                  <Skeleton key={i} className="h-[3.75rem] w-24 rounded-xl" />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
