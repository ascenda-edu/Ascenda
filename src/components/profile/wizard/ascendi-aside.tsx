'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { AscendiMark } from './ascendi-mark';
import { cn } from '@/lib/utils';

/**
 * Ascendi, reacting to what the student just answered.
 *
 * The mascot already exists across `/welcome`, the product tour and
 * `ascendi-coach.tsx`, and was absent from the longest and most demoralising
 * surface in the product. This is the same character in the place it was most
 * needed.
 *
 * ── IT MUST NEVER TAKE FOCUS ─────────────────────────────────────────────────
 * `role="status"` with `aria-live="polite"`, and no autofocus anywhere. It appears
 * *because* the student did something else — moving focus to it would interrupt the
 * very action that triggered it, and on the grades screen that means yanking the
 * caret out of a number field mid-digit. The dismiss button is reachable by Tab and
 * by Escape, which is enough.
 *
 * ── THE DEFERRED GREETING HAZARD ─────────────────────────────────────────────
 * The greeting is delayed so it arrives after the page settles. A fast student can
 * pick a subject inside that window, and an unguarded timer then overwrites the
 * reaction they just earned with a generic hello. `hasSpokenRef` is why that cannot
 * happen: the greeting only plays if nothing real has been said yet. Found by
 * driving the real thing, not by reading it.
 */

const VISIBLE_MS = 9000;

export function AscendiAside({
  message,
  /** Changes whenever a NEW reaction fires, even if the text repeats. */
  token,
  onDismiss
}: {
  message: string | null;
  token: number;
  onDismiss: () => void;
}) {
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!message) return;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      onDismiss();
    }, VISIBLE_MS);
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    // `token` is in the deps so a second reaction restarts the dwell rather than
    // inheriting the remainder of the first one's timer.
  }, [message, token, onDismiss]);

  useEffect(() => {
    if (!message) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'pointer-events-none fixed bottom-4 right-4 z-overlay flex max-w-[min(21rem,calc(100vw-2rem))] items-end gap-2.5',
        'motion-safe:animate-rise-in'
      )}
    >
      <span
        aria-hidden
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15"
      >
        <AscendiMark size={26} />
      </span>

      <div className="pointer-events-auto relative">
        <div className="rounded-2xl rounded-br-md border border-border bg-popover p-3.5 pr-4 shadow-e-3">
          <p className="eyebrow text-primary-ink">Ascendi</p>
          <p className="mt-1 text-body-sm leading-relaxed text-foreground">{message}</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss Ascendi"
          className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      </div>
    </div>
  );
}
