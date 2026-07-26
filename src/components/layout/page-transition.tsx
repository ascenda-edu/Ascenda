'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { EASE, DURATION } from '@/lib/motion';

/**
 * Route-change entrance for the app shell's content area.
 *
 * ── Why this and not `app/template.tsx` ─────────────────────────────────────
 * A root `template.tsx` was the first attempt, and it worked — but it sits ABOVE
 * every section layout in Next's nesting order (RootLayout > RootTemplate >
 * SectionLayout > Page), so it remounted the entire chrome on every navigation:
 * navbar, sidebar and section nav included. That made the `layoutId` sliding
 * indicator on the nav permanently inert — framer needs the outgoing and incoming
 * pill in the same commit to animate between them, and a remount gives it neither.
 *
 * Keying on the pathname HERE, inside the shell, puts the animation below the chrome
 * instead of above it — the right place for it regardless.
 *
 * IMPORTANT, verified in a browser: this does NOT yet make the nav indicator slide.
 * `DashboardShell` is rendered inside each PAGE for most sections rather than in a
 * `layout.tsx` (only counsellor, parent and university-search have it in a layout),
 * so navigating between two sibling pages still remounts the whole shell, navbar
 * included. I tagged the header node and watched it disappear across
 * /applications -> /applications/tasks.
 *
 * The `layoutId` indicator on the nav is therefore correct-but-inert: it paints in
 * the right place and costs nothing, and it starts animating for free the day
 * `DashboardShell` moves into per-section layouts. That hoist touches 16 pages and is
 * deliberately NOT bundled into this branch.
 *
 * ── Why the animation is so small ──────────────────────────────────────────
 * Opacity plus 4px. This fires on every single navigation, so anything more
 * assertive becomes tiring by the tenth click. It's a different job from the scroll
 * reveals in lib/motion, which fire once per element.
 *
 * Reduced motion is handled globally by `MotionConfig reducedMotion="user"` in
 * providers.tsx, which snaps the transform for users who ask for it.
 */
export function PageTransition({ children, className }: { children: React.ReactNode; className?: string }) {
  const pathname = usePathname();
  // First paint must NOT animate. `initial={{opacity:0}}` is serialised into the SSR
  // HTML, and MotionConfig's reduced-motion handling is client-side, so on a cold load
  // the entire main content area shipped invisible until hydration finished. Animate
  // only on subsequent pathname changes — which is also the correct semantics: a route
  // transition is a transition *between* routes, not an entrance for the first one.
  const isFirstPaint = useRef(true);
  useEffect(() => {
    isFirstPaint.current = false;
  }, []);

  return (
    <motion.div
      key={pathname}
      initial={isFirstPaint.current ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.fast, ease: EASE }}
      // The page's vertical rhythm lives HERE, not on <main>. `space-y-*` compiles to
      // `> :not([hidden]) ~ :not([hidden])`, so it needs siblings — and inserting this
      // wrapper made <main> single-child, which silently killed the spacing between
      // SectionNav / PageHero / content on ~35 pages.
      className={className}
    >
      {children}
    </motion.div>
  );
}
