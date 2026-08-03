'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { markOnboardingStep } from '@/lib/onboarding/actions';

/**
 * A first-run spotlight tour, built on what the repo already has.
 *
 * WHY NOT A LIBRARY
 * -----------------
 * `driver.js`, `react-joyride` and `intro.js` all solve this, and all three
 * were the wrong trade here. Each ships its own positioning engine, its own
 * overlay DOM and its own stylesheet, and every one of those has to be fought
 * back into this design system — the token palette in globals.css, the radius
 * ladder, `MotionConfig reducedMotion="user"` in providers.tsx, the `z-overlay`
 * layer. react-joyride in particular is still React-18-era and this app is on
 * React 19. The whole mechanism is a rect, a box-shadow and a popover; it is
 * roughly 200 lines against a dependency that would need wrapping anyway.
 *
 * HOW THE SPOTLIGHT WORKS
 * -----------------------
 * There is no clip-path and no SVG mask. The highlight is a transparent,
 * pointer-events-none div positioned over the target with a **very large
 * spread box-shadow** — the shadow paints everything outside the rect and the
 * rect itself stays clear. One element, no reflow of the page, and the target
 * keeps its real styling because nothing is cloned or moved.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 * It does not scroll-lock and it does not drive navigation. A tour that traps
 * you is worse than no tour: Escape closes it, the backdrop closes it, arrow
 * keys move through it, and every step is skippable. The only thing it persists
 * is "finished or dismissed", so it never reappears.
 *
 * It does NOT leave the highlighted element clickable — the scrim covers the
 * hole. See the backdrop comment in the render for why that trade was taken.
 */

export interface TourStep {
  /** Matched against `[data-tour="…"]`. A step whose anchor is absent is skipped. */
  anchor: string;
  title: string;
  body: string;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 8;
const CARD_WIDTH = 340;
const CARD_GAP = 14;

const readRect = (anchor: string): Rect | null => {
  const node = document.querySelector<HTMLElement>(`[data-tour="${CSS.escape(anchor)}"]`);
  if (!node) return null;

  const box = node.getBoundingClientRect();
  // A node that is present but collapsed (a closed accordion, a `hidden`
  // sibling) has a zero box. Spotlighting that draws a 0×0 hole in the middle
  // of a dark overlay and points a card at nothing, so treat it as absent.
  if (box.width === 0 || box.height === 0) return null;

  return {
    top: box.top - PADDING,
    left: box.left - PADDING,
    width: box.width + PADDING * 2,
    height: box.height + PADDING * 2
  };
};

/**
 * Place the card below the target, flipping above when it would overflow, and
 * clamped horizontally so it never leaves the viewport. Viewport coordinates
 * throughout — the overlay is `position: fixed`.
 */
const placeCard = (rect: Rect, cardHeight: number) => {
  const viewportH = window.innerHeight;
  const viewportW = window.innerWidth;

  const below = rect.top + rect.height + CARD_GAP;
  const above = rect.top - cardHeight - CARD_GAP;
  const fitsBelow = below + cardHeight <= viewportH - 8;

  const top = fitsBelow ? below : Math.max(8, above);
  const left = Math.min(
    Math.max(8, rect.left + rect.width / 2 - CARD_WIDTH / 2),
    Math.max(8, viewportW - CARD_WIDTH - 8)
  );

  return { top, left };
};

export function ProductTour({ steps, autoStart }: { steps: TourStep[]; autoStart: boolean }) {
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [mounted, setMounted] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [cardHeight, setCardHeight] = useState(180);
  const titleId = useId();
  const bodyId = useId();

  // Portals need a DOM. Rendering the overlay during SSR would also mean the
  // server deciding where a client-measured rect goes, which it cannot know.
  useEffect(() => setMounted(true), []);

  // Only steps whose anchor actually exists on this page. A tour that points at
  // a card the user's dashboard does not render (no counsellor, no
  // applications) would spotlight empty space.
  const [visibleSteps, setVisibleSteps] = useState<TourStep[]>([]);

  useEffect(() => {
    if (!mounted || !autoStart) return;

    // One frame's grace so the dashboard's entry animations have committed
    // their layout — measuring mid-animation captures a transform-offset rect
    // and the spotlight lands slightly off its target.
    const timer = window.setTimeout(() => {
      const present = steps.filter((step) => readRect(step.anchor) !== null);
      if (present.length === 0) return; // nothing to show; don't flash an overlay
      setVisibleSteps(present);
      setIndex(0);
      setActive(true);
    }, 600);

    return () => window.clearTimeout(timer);
  }, [mounted, autoStart, steps]);

  const current = visibleSteps[index] ?? null;

  // Re-measure on scroll and resize. `position: fixed` means the overlay does
  // not move with the page, so without this the spotlight detaches from its
  // target the moment anything scrolls.
  useLayoutEffect(() => {
    if (!active || !current) return;

    const measure = () => setRect(readRect(current.anchor));
    measure();

    window.addEventListener('scroll', measure, { passive: true, capture: true });
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, { capture: true });
      window.removeEventListener('resize', measure);
    };
  }, [active, current]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardHeight(cardRef.current.offsetHeight);
  }, [index, active]);

  // Bring the target into view before spotlighting it.
  useEffect(() => {
    if (!active || !current) return;
    const node = document.querySelector<HTMLElement>(`[data-tour="${CSS.escape(current.anchor)}"]`);
    node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [active, current]);

  const finish = useCallback(() => {
    setActive(false);
    // Fire-and-forget: the overlay is already gone, and a failed write only
    // means the tour offers itself once more. Never make the user wait to close.
    void markOnboardingStep('tour_completed_at');
  }, []);

  const next = useCallback(() => {
    setIndex((prev) => {
      if (prev + 1 >= visibleSteps.length) {
        finish();
        return prev;
      }
      return prev + 1;
    });
  }, [visibleSteps.length, finish]);

  const back = useCallback(() => setIndex((prev) => Math.max(0, prev - 1)), []);

  // Escape always exits. A modal overlay with no keyboard exit is a trap, and
  // this one covers the entire app.
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish();
      else if (event.key === 'ArrowRight') next();
      else if (event.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, finish, next, back]);

  // Move focus to the card so the tour is reachable by keyboard and announced.
  useEffect(() => {
    if (active && cardRef.current) cardRef.current.focus();
  }, [active, index]);

  if (!mounted || !active || !current || !rect) return null;

  const { top: cardTop, left: cardLeft } = placeCard(rect, cardHeight);
  const isLast = index === visibleSteps.length - 1;

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-overlay" role="presentation">
        {/* The spotlight. Transparent centre, enormous shadow spread painting
            the rest of the screen — see the header. `pointer-events-none` so
            this layer itself intercepts nothing; the dismiss backdrop below is
            what actually covers the hole, so the highlighted control is NOT
            clickable through it. See that element's comment for why. */}
        <motion.div
          key="spotlight"
          className="pointer-events-none absolute rounded-2xl"
          initial={{ opacity: 0 }}
          animate={{
            opacity: 1,
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height
          }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          style={{ boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.62)' }}
        />

        {/* Backdrop click target — a full-screen dismiss.
            It covers the spotlight hole too, so a click on the highlighted
            element closes the tour rather than reaching the element. That is a
            deliberate simplification over cutting the backdrop into four rects
            around the target: the seams around a rounded highlight are visible,
            and "click the thing to dismiss, then click it again for real" is a
            fine outcome for a five-step orientation. Every exit still works —
            Escape, Skip, the ✕, and anywhere on the scrim. */}
        <button
          type="button"
          className="absolute inset-0 h-full w-full cursor-default"
          onClick={finish}
          tabIndex={-1}
          aria-label="Close the tour"
        />

        <motion.div
          key={`card-${index}`}
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={bodyId}
          tabIndex={-1}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0, top: cardTop, left: cardLeft }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          // e-4 is the modal elevation in tailwind.config.ts, and this card floats
          // above a full-screen scrim — e-3 (a raised card) reads as sitting
          // below the thing it is on top of.
          className="absolute rounded-3xl border border-border bg-card p-5 shadow-e-4 focus:outline-none"
          style={{ width: CARD_WIDTH }}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-label font-semibold uppercase tracking-widest text-muted-foreground">
              {index + 1} of {visibleSteps.length}
            </p>
            <button
              type="button"
              onClick={finish}
              className="-mr-1 -mt-1 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Skip the tour"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <h2 id={titleId} className="mt-2 font-heading text-base font-semibold text-foreground">
            {current.title}
          </h2>
          <p id={bodyId} className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {current.body}
          </p>

          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={finish}
              className="text-xs font-medium text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Skip
            </button>
            <div className="flex items-center gap-2">
              {index > 0 ? (
                <Button type="button" variant="outline" size="sm" onClick={back} className="gap-1">
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                  Back
                </Button>
              ) : null}
              <Button type="button" size="sm" onClick={next} className="gap-1">
                {isLast ? 'Got it' : 'Next'}
                {isLast ? null : <ArrowRight className="h-3.5 w-3.5" aria-hidden />}
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
