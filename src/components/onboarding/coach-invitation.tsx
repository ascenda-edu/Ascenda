'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bot, X } from 'lucide-react';
import { DURATION, EASE } from '@/lib/motion';

/**
 * Ascendi offering to show someone around — the whole difference between this
 * flow and the one it replaces.
 *
 * The previous behaviour: 600ms after the dashboard finished loading, a
 * full-screen 62%-black scrim appeared over everything with no warning and no
 * consent, and the element it pointed at was not clickable. That is what "too
 * aggressive" meant concretely.
 *
 * This is the same tour behind an offer. A small card rises next to the Ascendi
 * launcher, says what it can do in one line, and waits. Nothing is covered,
 * nothing is blocked, and the page is fully usable while it sits there. The
 * overlay only ever appears because someone asked for it.
 *
 * WHY IT ANCHORS TO THE LAUNCHER, AND WHY NO LAUNCHER MEANS NO OFFER
 * -----------------------------------------------------------------
 * The offer is positioned from the launcher's measured rect, so it reads as
 * Ascendi speaking rather than as a generic toast. When there is no launcher, this
 * renders nothing at all rather than falling back to a corner of its own:
 *
 *   - On `/assistant` and the portal assistant routes the widget removes itself,
 *     because the full workspace replaces it. Someone already looking at Ascendi
 *     does not need Ascendi to introduce itself.
 *   - An unanchored card floating in from nowhere is precisely the uninvited
 *     interruption this component exists to stop being.
 *
 * The launcher arrives late — `ChatbotWidgetLazy` is `next/dynamic` with
 * `ssr: false` — so this polls briefly for it and then gives up quietly.
 */

/** Long enough for the page's own entry animations to settle first. */
const APPEAR_DELAY_MS = 1400;
/** How long to keep looking for a launcher that may still be loading. */
const ANCHOR_TIMEOUT_MS = 6000;
const ANCHOR_POLL_MS = 250;

const CARD_WIDTH = 268;
/** Gap between the card's bottom edge and the top of the launcher. */
const CARD_GAP = 12;

export function CoachInvitation({
  label,
  launcherRect,
  onAccept,
  onDecline
}: {
  /** How the tour describes itself: "I can show you around <label>". */
  label: string;
  /** Measured on demand — see `coach-context.tsx` for why this is a function. */
  launcherRect: () => DOMRect | null;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [visible, setVisible] = useState(false);

  // Wait, then look for the launcher until it turns up or the budget runs out.
  useEffect(() => {
    let polling: number | undefined;
    let giveUp: number | undefined;

    const appear = window.setTimeout(() => {
      const look = () => {
        const rect = launcherRect();
        if (!rect) return;
        setAnchor(rect);
        setVisible(true);
        window.clearInterval(polling);
        window.clearTimeout(giveUp);
      };

      look();
      polling = window.setInterval(look, ANCHOR_POLL_MS);
      giveUp = window.setTimeout(() => window.clearInterval(polling), ANCHOR_TIMEOUT_MS);
    }, APPEAR_DELAY_MS);

    return () => {
      window.clearTimeout(appear);
      window.clearInterval(polling);
      window.clearTimeout(giveUp);
    };
  }, [launcherRect]);

  /**
   * Follow the launcher on resize.
   *
   * Not on scroll: both this card and the launcher are `position: fixed`, so
   * neither moves when the page scrolls and re-measuring would be pure churn. A
   * resize genuinely relocates the launcher, because its offset crosses the `md`
   * breakpoint and depends on `env(safe-area-inset-bottom)`.
   */
  useEffect(() => {
    if (!visible) return;
    const remeasure = () => {
      const rect = launcherRect();
      if (rect) setAnchor(rect);
    };
    window.addEventListener('resize', remeasure);
    return () => window.removeEventListener('resize', remeasure);
  }, [visible, launcherRect]);

  if (!anchor) return null;

  // Right-aligned to the launcher and sitting above it, clamped so a narrow
  // viewport cannot push the card off the left edge.
  const left = Math.max(12, anchor.right - CARD_WIDTH);
  const bottom = window.innerHeight - anchor.top + CARD_GAP;

  return createPortal(
    <AnimatePresence>
      {visible ? (
        <motion.div
          // z-docked, matching the launcher itself. Deliberately NOT z-overlay:
          // this must sit below any real modal or dialog, because an offer to look
          // around the page is never more important than what the user just opened.
          className="fixed z-docked rounded-3xl border border-border bg-card p-4 shadow-e-4"
          style={{ width: CARD_WIDTH, left, bottom }}
          initial={{ opacity: 0, y: 10, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.98 }}
          transition={{ duration: DURATION.base, ease: EASE }}
          role="dialog"
          aria-label="Ascendi can show you around"
        >
          <div className="flex items-start gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
              <Bot className="h-4 w-4 text-primary-ink" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-heading text-sm font-semibold leading-tight text-foreground">
                Want a quick look around?
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                I can walk you through {label} in under a minute.
              </p>
            </div>
            <button
              type="button"
              onClick={onDecline}
              className="-mr-1 -mt-1 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="No thanks"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2">
            {/* Plain buttons, not the `Button` primitive: at this size its `sm`
                variant is still 36px tall and two of them dominate a 268px card.
                Same tokens, same focus ring, smaller frame. */}
            <button
              type="button"
              onClick={onAccept}
              className="flex-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Show me
            </button>
            <button
              type="button"
              onClick={onDecline}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Not now
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
