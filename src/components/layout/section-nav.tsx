'use client';

import Link from 'next/link';
import { Suspense, useId } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { DURATION, EASE } from '@/lib/motion';
import { Skeleton } from '@/components/ui/skeleton';
import type { SectionNavItem } from './navigation';

interface SectionNavProps {
  items: SectionNavItem[];
  getIsActive?: (item: SectionNavItem, pathname: string, searchParams: URLSearchParams) => boolean;
}

const TOOLBAR = 'surface-toolbar flex items-center gap-2 sm:gap-3 rounded-4xl overflow-x-auto scrollbar-none -mx-1 px-1';

// `.nav-pill` styles colour/background/border but declares no focus ring, so
// keyboard focus on a section tab was invisible. These are the same ring
// utilities nav-link.tsx uses, applied at the call site rather than in
// globals.css (which this pass does not touch).
const PILL_FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

/**
 * The active pill's non-moving half — border, weight, ink. The FILL is a
 * `layoutId` element instead (see below), so `.nav-pill-active` is no longer
 * applied here: it carries `bg-primary`, which would double-paint the slider.
 *
 * Driven off `aria-current` rather than a plain conditional class for a
 * specificity reason: `.nav-pill` declares `hover:text-foreground` in
 * @layer components at (0,2,0), which outranks a bare `text-primary-foreground`
 * utility (0,1,0) regardless of source order — hovering the active pill would
 * swap its label to `foreground` on top of a `primary` fill. `aria-[current=…]`
 * compiles to class+attribute (0,2,0) in @layer utilities, so it ties on
 * specificity and wins on order. (`.nav-pill-active` lost this fight too; this
 * is a fix, not a new constraint.)
 *
 * `font-semibold` is deliberate and matches `<TabsTrigger>`: active is carried
 * by weight AND fill, so it survives a greyscale or CVD read.
 */
const PILL_ACTIVE =
  'aria-[current=page]:border-primary/20 aria-[current=page]:font-semibold aria-[current=page]:text-primary-foreground aria-[current=page]:hover:text-primary-foreground';

// Same curve as the landing nav's pill — see lib/motion.ts. `MotionConfig
// reducedMotion="user"` (providers.tsx) drops the transform for users who ask
// for less motion, which correctly leaves the indicator snapping between pills
// rather than sliding; there is nothing to gate per-component.
const INDICATOR_TRANSITION = { duration: DURATION.fast, ease: EASE } as const;

export const SectionNav = (props: SectionNavProps) => (
  <Suspense fallback={
    // A loading state, not a convincing fake: this used to render <span>s
    // wearing `.nav-pill`, pixel-identical to the real tabs but unfocusable and
    // inert. Skeletons keep each tab's exact width (so hydration doesn't shift
    // the row) while reading unmistakably as "not ready yet".
    <nav aria-busy="true" aria-label="Loading section navigation" className={TOOLBAR}>
      {props.items.map((item) => (
        <Skeleton
          key={item.href}
          aria-hidden
          className="inline-flex h-8 shrink-0 items-center px-3 text-xs text-transparent sm:text-sm"
        >
          {item.label}
        </Skeleton>
      ))}
    </nav>
  }>
    <SectionNavInner {...props} />
  </Suspense>
);

const SectionNavInner = ({ items, getIsActive }: SectionNavProps) => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Scoped per row: two SectionNav rows on one page (or a SectionNav above a
  // <TabsList>) each get their own `layoutId`, so their indicators can't
  // capture each other and fly across the page. Same reason as Tabs.
  const indicatorId = useId();

  return (
    <nav className={TOOLBAR}>
      {items.map((item) => {
        const active = getIsActive
          ? getIsActive(item, pathname, searchParams)
          : item.matchParam
            ? (() => {
              const value = searchParams.get(item.matchParam.key);
              if (!value && item.matchParam.value === 'personal') {
                return pathname.startsWith('/profile');
              }
              return value === item.matchParam.value;
            })()
            : item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn('nav-pill shrink-0', PILL_FOCUS, PILL_ACTIVE)}
          >
            {/* The fill is a sibling of the label, and an absolutely-positioned
                sibling paints above a statically-positioned one whatever the DOM
                order — so the label needs its own stacking position or the pill
                swallows its own text. Hence `relative z-raised` below. */}
            {active ? (
              <motion.span
                layoutId={indicatorId}
                transition={INDICATOR_TRANSITION}
                // Radius matches `.nav-pill`'s own `rounded-lg`.
                className="absolute inset-0 rounded-lg bg-primary shadow-e-1"
                aria-hidden
              />
            ) : null}
            <span className="relative z-raised whitespace-nowrap">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
};
