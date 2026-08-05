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
 * The active tab's non-moving half — weight and ink. The RULE is a `layoutId`
 * element instead (see below), so `.nav-pill-active` is not applied here.
 *
 * Driven off `aria-current` rather than a plain conditional class for a
 * specificity reason: `.nav-pill` declares `hover:text-foreground` in
 * @layer components at (0,2,0), which outranks a bare `text-primary-ink`
 * utility (0,1,0) regardless of source order — hovering the active tab would
 * swap its label back to `foreground`. `aria-[current=…]` compiles to
 * class+attribute (0,2,0) in @layer utilities, so it ties on specificity and
 * wins on order. Do NOT simplify these to plain utilities; that is the bug.
 *
 * The ink is `primary-ink`, not `primary-foreground`: there is no longer a fill
 * for a foreground colour to sit on. `text-primary` would be wrong too — it is
 * tuned to carry white button text and measures 3.58:1 in dark.
 *
 * `font-semibold` is deliberate and matches `<TabsTrigger>`: active is carried
 * by weight AND rule, so it survives a greyscale or CVD read.
 */
const PILL_ACTIVE =
  'aria-[current=page]:font-semibold aria-[current=page]:text-primary-ink aria-[current=page]:hover:text-primary-ink';

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
          // Padding, not `h-8`: the comment above promises hydration doesn't shift
          // the row, but it only held for WIDTH. `h-8` is 32px against `.nav-pill`'s
          // 46px, so every navigation into a section jumped the row 14px taller.
          // Mirroring the pill's own recipe — same padding, same text steps, same
          // transparent border — makes the two byte-equal in height by construction
          // rather than by a hardcoded number that can drift from it again.
          className="inline-flex shrink-0 items-center border border-transparent px-3 py-3.5 text-xs text-transparent sm:py-3 sm:text-sm"
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
            {/* The indicator is a 2px RULE, not a fill. It keeps the same
                `layoutId`, so it still slides between tabs — it just slides an
                underline. Being 2px at the bottom edge it no longer overlaps the
                label, so the label's old `relative z-raised` stacking guard
                (which existed only because a full-bleed fill painted over it) is
                gone. `inset-x-1` insets it from the pill's own px-3 so the rule
                reads as belonging to the word, not to the padding box. */}
            {active ? (
              <motion.span
                layoutId={indicatorId}
                transition={INDICATOR_TRANSITION}
                className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-primary-ink"
                aria-hidden
              />
            ) : null}
            <span className="whitespace-nowrap">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
};
