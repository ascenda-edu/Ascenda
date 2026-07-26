'use client';

import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { EASE, DURATION } from '@/lib/motion';

/**
 * Route-change entrance, so navigation reads as arrival rather than a hard cut.
 *
 * ── Why a template and not React's <ViewTransition> ──────────────────────────
 * React's ViewTransition API is NOT available in this project. Verified, not
 * assumed: `react` 19.2.8 doesn't export it, and neither does Next 15.5.21's own
 * vendored experimental build (19.2.0-experimental-0bdb9206-20250818) — checked both
 * for `ViewTransition` and `addTransitionType`. `experimental.viewTransition` is
 * accepted by Next's config schema, which makes it look available when it isn't, so
 * enabling the flag and importing the component would have shipped a crash.
 *
 * `template.tsx` is the stable mechanism for this: unlike a layout, it remounts on
 * every navigation, which is exactly the hook a route transition needs. No
 * experimental flags, no browser support caveats.
 *
 * ── Why the guard ───────────────────────────────────────────────────────────
 * A root template wraps EVERY route, including the marketing pages. `/` runs its own
 * scroll choreography — Lenis smooth scroll, pinned scrubbed sections that measure
 * document height, a FLIP morph — and remounting a motion wrapper around all of that
 * on entry would fight it. Those routes opt out and render children untouched.
 *
 * Deliberately subtle: opacity plus 4px of travel. This fires on every navigation,
 * so anything more assertive becomes tiring by the tenth click. It is a different
 * job from the scroll reveals in lib/motion, which fire once per element.
 *
 * Reduced motion is handled globally by `MotionConfig reducedMotion="user"` in
 * providers.tsx, which snaps the transform for users who ask for it.
 */

/** Routes that own their own entrance choreography. */
const SELF_CHOREOGRAPHED = ['/', '/login', '/role-select'];

export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (SELF_CHOREOGRAPHED.includes(pathname)) return <>{children}</>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.fast, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}
