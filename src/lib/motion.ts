import type { Transition, Variants } from 'framer-motion';

/**
 * The app's motion vocabulary. ONE easing curve, ONE set of state names.
 *
 * Before this there were four competing vocabularies:
 *   landing-preview/section-reveal   [0.22, 1, 0.36, 1]        32px / 0.5s
 *   lib/motion.ts                    [0.25, 0.46, 0.45, 0.94]  20px / 0.5s
 *   layout/page-hero.tsx             [0.25, 0.46, 0.45, 0.94]   6px / 0.18s
 *   course/CoursePageClient          tailwindcss-animate        16px / 0.5s
 *
 * ...and this file used TWO state-name conventions at once: `hidden → visible` for
 * the landing variants and `hidden → show` for the app ones, which meant you had to
 * know which half of an 80-line file a variant came from to use it.
 *
 * The curve is the landing page's, because that page is the quality bar the rest of
 * the app is being brought up to. It's a strong ease-out: quick to leave, slow to
 * settle, which reads as "the content arrived" rather than "something is sliding".
 * The old curve was near-symmetric and, at PageHero's 6px over 180ms, below the
 * threshold where movement reads as anything but a flicker.
 *
 * State names are `hidden → show` throughout (that was the majority convention:
 * ~57 usages against 2).
 *
 * Five variants are gone as dead code: scaleIn, blockFade, slideRight, popIn and
 * blurIn all had zero call sites.
 */

/** The single easing curve. Cubic-bezier, strong ease-out. */
export const EASE: Transition['ease'] = [0.22, 1, 0.36, 1];

/**
 * The one sanctioned exception to `EASE`: an overshoot curve (y peaks above 1, so the
 * value passes its target and settles back). It exists for small elements that pop
 * INTO existence at a new scale — the assistant's floating trigger button and the
 * search filter chips. On those, the overshoot is the whole point: it reads as the
 * thing announcing itself, which is the difference between a chip "appearing" and a
 * chip "being added".
 *
 * Only ever use it on scale-up entrances of small elements. On an exit to scale 0 it
 * drives the value negative before settling, and on anything card-sized or larger it
 * reads as wobble. Entrances pop, exits use `EASE`.
 */
export const EASE_POP: Transition['ease'] = [0.34, 1.56, 0.64, 1];

/**
 * Travel distances. Two amplitudes, one curve — matched to content density rather
 * than invented per component. A marketing section can afford 32px of travel; a
 * dashboard card in a dense grid cannot, and reads as noise if it tries.
 */
export const TRAVEL = { app: 16, section: 32 } as const;

/** Durations. Entrances settle; exits are faster, so dismissal feels responsive. */
export const DURATION = { fast: 0.25, base: 0.4, slow: 0.5, exit: 0.2 } as const;

/* ─── Entrances ───────────────────────────────────────────────────────────── */

/** The default entrance for app sections and cards. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: TRAVEL.app },
  show: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE } }
};

/** Larger-amplitude entrance for full-width marketing/landing sections. */
export const fadeUpSection: Variants = {
  hidden: { opacity: 0, y: TRAVEL.section },
  show: { opacity: 1, y: 0, transition: { duration: DURATION.slow, ease: EASE } }
};

/** Container that staggers its children. Pair with `childFade` or `cardFade`. */
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } }
};

/** Child entrance for staggered grids and lists. */
export const childFade: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: DURATION.fast, ease: EASE } }
};

/**
 * Card entrance with a touch of scale. Kept distinct from `childFade` because the
 * scale reads as "this is a surface" rather than "this is a line of content".
 */
export const cardFade: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: DURATION.base, ease: EASE } },
  exit: { opacity: 0, scale: 0.98, transition: { duration: DURATION.exit, ease: EASE } }
};

/** Horizontal entrance for list rows that slide in from the leading edge. */
export const itemSlide: Variants = {
  hidden: { opacity: 0, x: -12 },
  show: { opacity: 1, x: 0, transition: { duration: DURATION.fast, ease: EASE } }
};

/**
 * Legacy alias. Two landing files still say `fadeIn` with a `visible` state; this
 * keeps them working on the unified curve without a rename churn through the
 * marketing pages. Prefer `fadeUpSection` in new code.
 */
export const fadeIn: Variants = {
  hidden: { opacity: 0, y: TRAVEL.section },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION.slow, ease: EASE } }
};
