'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Bot } from 'lucide-react';

/**
 * Ascendi going home.
 *
 * The last beat of a tour: the avatar detaches from the coach card and arcs down
 * to the chat launcher in the bottom-right corner, landing exactly on it. It is
 * the one moment that makes the tour and the chat button legibly the same
 * assistant rather than two unrelated pieces of UI.
 *
 * WHY THE POSITIONS ARE MEASURED AND PASSED IN
 * --------------------------------------------
 * Neither end is hardcoded. `from` is the avatar's real rect inside the coach
 * card, read at hand-off; `to` is the launcher's real rect, read from the DOM at
 * the same moment. The launcher's own position is a fluid Tailwind expression —
 * `right-5 bottom-[calc(env(safe-area-inset-bottom,8px)+72px)] md:bottom-6
 * md:right-6` — and re-deriving that here in JS would mean two sources of truth
 * for one position, one of which silently rots the next time the mobile nav
 * changes height. Measuring costs one `getBoundingClientRect` and cannot drift.
 *
 * THE FALLBACK IS NOT OPTIONAL
 * ----------------------------
 * There is frequently no launcher to fly to, and the caller signals that with a
 * `null` `to`:
 *
 *   - `/assistant`, `/counsellor/assistant`, `/parent/assistant` — the widget
 *     returns `null` on its own routes, because the full workspace replaces it.
 *   - The widget is `next/dynamic` with `ssr: false`, so on a fast tour its chunk
 *     may not have mounted yet.
 *   - The launcher unmounts entirely while the chat panel is open (it lives inside
 *     an `AnimatePresence` keyed on `!isOpen`).
 *
 * In all three the avatar fades out where it stands and `onArrive` still fires, so
 * the tour always completes and the breadcrumb always gets written. Flying to a
 * zeroed rect — the bug this shape exists to prevent — would fling the avatar into
 * the top-left corner of the screen and leave it there.
 */

const SIZE = 36;
/** Where it lands: 48px launcher, so a hair smaller reads as "inside" it. */
const LANDED_SIZE = 44;

export function AscendiFlight({
  from,
  to,
  onArrive
}: {
  from: DOMRect;
  /** The launcher's rect, or `null` when there is nothing to fly to. */
  to: DOMRect | null;
  onArrive: () => void;
}) {
  const reduced = useReducedMotion();

  /**
   * The no-animation paths both resolve on a timer rather than an animation
   * callback.
   *
   * `onAnimationComplete` is the natural place for this and it is not reliable
   * here: with `reducedMotion` active framer collapses the transition to a
   * zero-duration commit, and a zero-duration animation on a just-mounted element
   * can settle before React attaches the callback — which strands the flow with no
   * breadcrumb written and no way to finish. A timeout always fires.
   */
  const skip = to === null || reduced;

  useEffect(() => {
    if (!skip) return;
    const timer = window.setTimeout(onArrive, 260);
    return () => window.clearTimeout(timer);
  }, [skip, onArrive]);

  if (skip) {
    return createPortal(
      <motion.div
        className="pointer-events-none fixed z-modal flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-e-3"
        style={{ width: SIZE, height: SIZE, top: from.top, left: from.left }}
        initial={{ opacity: 1, scale: 1 }}
        animate={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.24, ease: 'easeOut' }}
      >
        <Bot className="h-4 w-4" aria-hidden />
      </motion.div>,
      document.body
    );
  }

  // Centre-to-centre, then converted back to a top-left origin at the landing
  // size. Animating the raw rects instead lands the avatar off by half the size
  // difference — visibly beside the launcher rather than on it.
  const target = {
    top: to.top + to.height / 2 - LANDED_SIZE / 2,
    left: to.left + to.width / 2 - LANDED_SIZE / 2
  };

  // The arc. A straight diagonal reads as a UI element being repositioned; a lift
  // at the midpoint reads as something moving under its own steam. Held to ~10% of
  // the travel so it stays a suggestion of weight rather than a cartoon hop.
  const lift = Math.min(90, Math.abs(target.top - from.top) * 0.28);
  const midTop = Math.min(from.top, target.top) - lift;

  return createPortal(
    <motion.div
      className="pointer-events-none fixed z-modal flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-e-4 shadow-primary/30"
      initial={{ top: from.top, left: from.left, width: SIZE, height: SIZE, opacity: 1 }}
      animate={{
        top: [from.top, midTop, target.top],
        left: [from.left, (from.left + target.left) / 2, target.left],
        width: LANDED_SIZE,
        height: LANDED_SIZE,
        opacity: 1
      }}
      transition={{
        // `top`/`left` are keyframe arrays and `width`/`height` are not, so they
        // need separate transitions — one shared spring would be applied to the
        // keyframes too, and framer ignores keyframes under a spring, which
        // silently reduces the arc to a straight line.
        top: { duration: 0.72, ease: [0.32, 0, 0.24, 1], times: [0, 0.45, 1] },
        left: { duration: 0.72, ease: [0.32, 0, 0.24, 1], times: [0, 0.45, 1] },
        width: { duration: 0.72, ease: 'easeOut' },
        height: { duration: 0.72, ease: 'easeOut' }
      }}
      onAnimationComplete={onArrive}
    >
      <Bot className="h-4 w-4" aria-hidden />
    </motion.div>,
    document.body
  );
}
