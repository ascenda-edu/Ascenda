'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Bot, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TourStep } from '@/lib/onboarding/tours';

/**
 * The spotlight engine Ascendi narrates through.
 *
 * WHY NOT A LIBRARY
 * -----------------
 * `driver.js`, `react-joyride` and `intro.js` all solve this, and all three were
 * the wrong trade here. Each ships its own positioning engine, its own overlay
 * DOM and its own stylesheet, and every one of those has to be fought back into
 * this design system — the token palette in globals.css, the radius ladder,
 * `MotionConfig reducedMotion="user"` in providers.tsx, the `z-overlay` layer.
 * react-joyride in particular is still React-18-era and this app is on React 19.
 * The whole mechanism is a rect, a box-shadow and a popover.
 *
 * HOW THE SPOTLIGHT WORKS
 * -----------------------
 * There is no clip-path and no SVG mask. The highlight is a transparent,
 * pointer-events-none div positioned over the target with a **very large spread
 * box-shadow** — the shadow paints everything outside the rect and the rect itself
 * stays clear. One element, no reflow, and the target keeps its real styling
 * because nothing is cloned or moved.
 *
 * THE HIGHLIGHTED ELEMENT STAYS CLICKABLE, AND THAT IS THE POINT
 * -------------------------------------------------------------
 * An earlier version covered the whole viewport — spotlight hole included — with
 * a single dismiss button, so clicking the thing being pointed at closed the tour
 * instead of using it. That is the exact feeling of being trapped by your own
 * software, and it was the single biggest reason this flow read as aggressive.
 *
 * The dismiss layer is therefore FOUR rects tiled around the highlight rather
 * than one over everything. The old objection to this was visible seams at the
 * rounded corners — which does not apply, because these four rects are completely
 * transparent. They exist only to catch pointer events; every pixel of scrim is
 * painted by the one box-shadow above them. So the hole is live, the surrounding
 * scrim still dismisses on click, and there is nothing to see at the seams
 * because there is nothing there.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 * No scroll lock, no forced navigation, and no auto-start — the coach decides
 * when this opens, and only ever by invitation. Escape closes it, the scrim closes
 * it, arrow keys move through it, every step is skippable.
 */

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 8;
const CARD_WIDTH = 340;
const CARD_GAP = 14;

/** How long the farewell line sits on screen before the avatar flies home. */
const SIGN_OFF_DWELL_MS = 1500;

const readRect = (anchor: string): Rect | null => {
  const node = document.querySelector<HTMLElement>(`[data-tour="${CSS.escape(anchor)}"]`);
  if (!node) return null;

  const box = node.getBoundingClientRect();
  // A node that is present but collapsed (a closed accordion, a `hidden` sibling)
  // has a zero box. Spotlighting that draws a 0×0 hole in the middle of a dark
  // overlay and points a card at nothing, so treat it as absent.
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

/**
 * How far apart two anchors' tops can be and still count as the same row.
 *
 * Cards in a grid row rarely share an exact `top` — different content heights,
 * different paddings, a `delay` on one AnimatedSection that leaves it a few pixels
 * into its entry transform when measured. 24px is comfortably more than that drift
 * and comfortably less than the app's smallest row gap (`space-y-6`, 24px, plus the
 * cards' own padding).
 */
const ROW_TOLERANCE = 24;

/**
 * Put the steps in the order the page actually reads: top to bottom, and in the
 * AUTHORED order within a row.
 *
 * WHY THIS EXISTS
 * ---------------
 * A tour is a list in a registry file; the page is a layout. Nothing kept the two in
 * step, and they drifted immediately: the dashboard tour pointed at the matches card
 * (row three) before the counsellor card (row two), so it scrolled the user down the
 * page and then back up again. The matches and counsellor tours each had the same
 * inversion. It reads as the tour having lost its place, and no test could catch it
 * because both orders are perfectly valid data.
 *
 * Sorting by measured position rather than by DOM order is deliberate: DOM order is
 * not visual order the moment a grid uses explicit placement, `order`, or a
 * `col-start`, all of which this app does. What the user experiences is the scroll,
 * so the scroll is what gets sorted.
 *
 * WHY ONLY ROWS, AND NOT LEFT-TO-RIGHT WITHIN THEM
 * -----------------------------------------------
 * The complaint being fixed is vertical: the viewport jumping down and then back up.
 * Two cards side by side involve no scrolling at all, so ordering within a row costs
 * the user nothing and is worth spending on narrative instead — "here is the idea,
 * here is the detail beside it" is often better than strict left-to-right. So rows are
 * sorted and the author's order inside each is preserved, which `Array.prototype.sort`
 * gives for free by being stable (guaranteed since ES2019).
 *
 * Row assignment is done by walking a top-sorted copy and starting a new row whenever
 * the gap exceeds the tolerance — NOT by a comparator with a tolerance in it. A
 * "close enough" comparator is not transitive (a≈b and b≈c does not give a≈c), and a
 * non-transitive comparator makes `sort` produce implementation-defined nonsense.
 */
const orderByRow = <T extends { rect: Rect }>(entries: T[]): T[] => {
  if (entries.length < 2) return entries;

  const row = new Map<T, number>();
  let index = 0;
  let rowTop: number | null = null;

  for (const entry of [...entries].sort((a, b) => a.rect.top - b.rect.top)) {
    if (rowTop === null) {
      rowTop = entry.rect.top;
    } else if (entry.rect.top - rowTop > ROW_TOLERANCE) {
      index += 1;
      rowTop = entry.rect.top;
    }
    row.set(entry, index);
  }

  return [...entries].sort((a, b) => (row.get(a) ?? 0) - (row.get(b) ?? 0));
};

/**
 * Should this keypress drive the tour, or belong to whatever the user is typing
 * in?
 *
 * Only a question because the spotlight hole is live. With the target clickable, a
 * student can focus a search box the tour is pointing at, and every arrow key they
 * press to move the caret would otherwise skip a step. Escape is deliberately NOT
 * filtered — an unconditional exit is the one key that must always work,
 * everywhere, or the overlay is a trap again.
 */
const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
};

export interface ProductTourProps {
  steps: TourStep[];
  /** Left without finishing — Escape, Skip, the ✕, or a click on the scrim. */
  onDismiss: () => void;
  /**
   * Walked to the end.
   *
   * The `DOMRect` is where the Ascendi avatar was sitting at that moment, so the
   * caller can fly it home from exactly there. `null` when the avatar could not be
   * measured, which the caller must treat as "no flight" rather than as the
   * origin — animating from a zeroed rect launches the avatar out of the top-left
   * corner of the screen.
   */
  onComplete: (avatarRect: DOMRect | null) => void;
  /**
   * The farewell line, or `null` to end the moment the last step is acknowledged.
   *
   * This is how "you can ask me anything" stays a one-time introduction instead of
   * a sign-off replayed after every section tour. The caller passes a string on
   * the user's first completed tour and `null` on every one after it.
   */
  signOff: string | null;
}

export function ProductTour({ steps, onDismiss, onComplete, signOff }: ProductTourProps) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [mounted, setMounted] = useState(false);
  const [signingOff, setSigningOff] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const avatarRef = useRef<HTMLDivElement | null>(null);
  // The sign-off dwell timer, held so unmount can cancel it. Started from a click
  // handler rather than an effect, so there is no effect cleanup to hang it on — and
  // left uncancelled it fires `onComplete` on an unmounted tour after a navigation,
  // which writes a breadcrumb for a tour the user walked away from mid-farewell.
  const signOffTimer = useRef<number | null>(null);
  const [cardHeight, setCardHeight] = useState(180);
  const titleId = useId();
  const bodyId = useId();

  // Portals need a DOM, and the server cannot know where a client-measured rect
  // goes.
  useEffect(() => setMounted(true), []);

  /**
   * The steps whose anchor exists right now, in the order the page reads.
   *
   * Resolved once, when the tour opens, rather than on every render — for both the
   * filtering and the ordering. Re-filtering live would renumber the steps underneath
   * the user ("3 of 5" becoming "3 of 4" mid-read), because plenty of anchors
   * legitimately come and go while a tour is open (a card that finishes loading, a
   * panel the user collapses). Re-ordering live would be worse still: a card that grows
   * as its content arrives could move the user's current step behind them.
   */
  const [visibleSteps, setVisibleSteps] = useState<TourStep[]>([]);

  useEffect(() => {
    if (!mounted) return;

    const present = steps
      .map((step) => ({ step, rect: readRect(step.anchor) }))
      .filter((entry): entry is { step: TourStep; rect: Rect } => entry.rect !== null);

    // Sorted top-to-bottom so the tour never scrolls down and then back up. The
    // registry's order is a fallback, not the authority — see `orderByRow`.
    setVisibleSteps(orderByRow(present).map((entry) => entry.step));
    setIndex(0);
    // A tour whose every anchor is missing has nothing to show. Report it as
    // dismissed rather than flashing an empty overlay — that also stops the coach
    // re-offering a tour for a page whose anchors have all been renamed away.
    if (present.length === 0) onDismiss();
  }, [mounted, steps, onDismiss]);

  const current = signingOff ? null : (visibleSteps[index] ?? null);

  // Re-measure on scroll and resize. `position: fixed` means the overlay does not
  // move with the page, so without this the spotlight detaches from its target the
  // moment anything scrolls.
  useLayoutEffect(() => {
    if (!current) return;

    const measure = () => setRect(readRect(current.anchor));
    measure();

    window.addEventListener('scroll', measure, { passive: true, capture: true });
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, { capture: true });
      window.removeEventListener('resize', measure);
    };
  }, [current]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardHeight(cardRef.current.offsetHeight);
  }, [index, signingOff]);

  // Bring the target into view — but only when it is not already there.
  // `block: 'center'` unconditionally yanked the page on every step even when the
  // target was fully visible, which is most of them on a short page, and a
  // viewport that jumps for no visible reason is what makes a tour feel like it is
  // driving rather than pointing.
  useEffect(() => {
    if (!current) return;
    const node = document.querySelector<HTMLElement>(`[data-tour="${CSS.escape(current.anchor)}"]`);
    if (!node) return;

    const box = node.getBoundingClientRect();
    if (box.top >= 0 && box.bottom <= window.innerHeight) return;

    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [current]);

  /**
   * Finish properly: show the farewell if there is one, then hand the avatar's
   * position to the caller so it can fly home.
   *
   * The rect is read at the LAST possible moment, after the dwell, because a
   * scroll or resize during it may have moved the card.
   */
  const complete = useCallback(() => {
    const handOff = () => onComplete(avatarRef.current?.getBoundingClientRect() ?? null);

    if (!signOff) {
      handOff();
      return;
    }

    setSigningOff(true);
    signOffTimer.current = window.setTimeout(handOff, SIGN_OFF_DWELL_MS);
  }, [onComplete, signOff]);

  useEffect(
    () => () => {
      if (signOffTimer.current !== null) window.clearTimeout(signOffTimer.current);
    },
    []
  );

  const next = useCallback(() => {
    if (index + 1 >= visibleSteps.length) complete();
    else setIndex(index + 1);
  }, [index, visibleSteps.length, complete]);

  const back = useCallback(() => setIndex((prev) => Math.max(0, prev - 1)), []);

  // Escape always exits, unfiltered. Arrow keys only when the user is not typing
  // into the spotlit element — see `isTypingTarget`.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onDismiss();
        return;
      }
      if (signingOff || isTypingTarget(event.target)) return;
      if (event.key === 'ArrowRight') next();
      else if (event.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss, next, back, signingOff]);

  // Move focus to the card so the tour is reachable by keyboard and announced.
  useEffect(() => {
    if (cardRef.current) cardRef.current.focus();
  }, [index, signingOff]);

  if (!mounted || !rect) return null;
  if (!current && !signingOff) return null;

  const { top: cardTop, left: cardLeft } = placeCard(rect, cardHeight);
  const isLast = index === visibleSteps.length - 1;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;

  /**
   * The four transparent pointer-catchers tiled around the highlight. Together
   * they cover the viewport EXCEPT the hole, which is what leaves the spotlit
   * element usable. See the header.
   */
  const dismissRects: Array<{ key: string; style: React.CSSProperties }> = [
    { key: 'top', style: { top: 0, left: 0, width: viewportW, height: Math.max(0, rect.top) } },
    {
      key: 'bottom',
      style: {
        top: rect.top + rect.height,
        left: 0,
        width: viewportW,
        height: Math.max(0, viewportH - (rect.top + rect.height))
      }
    },
    { key: 'left', style: { top: rect.top, left: 0, width: Math.max(0, rect.left), height: rect.height } },
    {
      key: 'right',
      style: {
        top: rect.top,
        left: rect.left + rect.width,
        width: Math.max(0, viewportW - (rect.left + rect.width)),
        height: rect.height
      }
    }
  ];

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-overlay" role="presentation">
        {/* The scrim. `pointer-events-none` so this layer intercepts nothing — the
            four rects below do that. 0.42 rather than the 0.62 this started at:
            dark enough to focus attention, light enough that the page around the
            highlight stays legible — which matters a great deal now that the page
            around the highlight also stays usable. */}
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
          style={{ boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.42)' }}
        />

        {dismissRects.map(({ key, style }) => (
          <button
            key={key}
            type="button"
            className="absolute cursor-default"
            style={style}
            onClick={onDismiss}
            tabIndex={-1}
            // One label across four elements would be announced four times. The ✕
            // and Skip inside the card are the real, reachable exits; these are a
            // pointer convenience, so they stay out of the a11y tree entirely.
            aria-hidden
          />
        ))}

        <motion.div
          key="card"
          ref={cardRef}
          role="dialog"
          // NOT `aria-modal`. The whole design is that the page behind stays
          // reachable, and claiming modality tells a screen reader the opposite —
          // it would hide the very element this card is describing from the virtual
          // cursor.
          aria-labelledby={titleId}
          aria-describedby={bodyId}
          tabIndex={-1}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0, top: cardTop, left: cardLeft }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          // e-4 is the modal elevation in tailwind.config.ts, and this card floats
          // above a scrim — e-3 (a raised card) reads as sitting below the thing
          // it is on top of.
          className="absolute rounded-3xl border border-border bg-card p-5 shadow-e-4 focus:outline-none"
          style={{ width: CARD_WIDTH }}
        >
          <div className="flex items-start gap-3">
            {/* The avatar. Same treatment as the chat panel header in
                chat/chatbot-widget.tsx, and that is not incidental — it is what
                makes the flight at the end read as *this* assistant going home to
                its launcher rather than a decorative circle sliding across the
                screen. Change one and change both. */}
            <div
              ref={avatarRef}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20"
            >
              <Bot className="h-4 w-4 text-primary-ink" aria-hidden />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-label font-semibold uppercase tracking-widest text-muted-foreground">
                Ascendi
                {!signingOff && visibleSteps.length > 1 ? (
                  <span className="ml-1.5 font-normal normal-case tracking-normal">
                    · {index + 1} of {visibleSteps.length}
                  </span>
                ) : null}
              </p>
            </div>

            {!signingOff ? (
              <button
                type="button"
                onClick={onDismiss}
                className="-mr-1 -mt-1 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Close the tour"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>

          {/* Keyed `motion.div` with NO AnimatePresence around it, deliberately.
              `mode="wait"` was the obvious choice and it is wrong twice over: the
              incoming step is not mounted until the outgoing one has finished
              exiting, so every Next costs the exit duration before any new text
              appears — and if the exit never completes, the new step never mounts at
              all. Changing the `key` unmounts the old copy immediately and plays the
              new one's enter animation, which is the same visual result with no
              dependency on an exit ever finishing. (Plain `sync` mode is not the
              alternative: with static positioning it would stack both copies and
              double the card's height mid-transition.) */}
          <motion.div
            key={signingOff ? 'sign-off' : `step-${index}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <h2 id={titleId} className="mt-3 font-heading text-base font-semibold text-foreground">
              {signingOff ? 'That’s the tour' : current?.title}
            </h2>
            <p id={bodyId} className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {signingOff ? signOff : current?.body}
            </p>
          </motion.div>

          {!signingOff ? (
            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={onDismiss}
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
          ) : null}
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
