'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { AscendiMark } from './ascendi-mark';

/**
 * The moment the essentials complete and matching unlocks.
 *
 * Before this, finishing the three sections that actually gate the product produced
 * nothing at all — the student found out by reaching the end of the form. The one
 * acknowledgement in the whole flow arrived after the final submit, which is both
 * too late and too far from the thing being acknowledged.
 *
 * ── WHY A DIALOG, AND WHY IT IS SAFE TO INTERRUPT ────────────────────────────
 * This fires exactly once per session and only on a genuine state change, so it is
 * the rare case where interrupting is the correct behaviour: the student has just
 * earned the thing the entire form exists to give them. It is dismissible two ways
 * and it never blocks progress — "Keep going" simply closes it.
 *
 * The caller is responsible for firing it only when the current screen VALIDATES,
 * not merely when the fields are non-empty. See `StudentIntakeForm`'s note: `done()`
 * tests for presence, so an unguarded check launches a full-screen celebration over
 * someone who has typed one letter of their email address.
 *
 * ── FOCUS ──
 * Focus moves to the dialog on open and returns to whatever had it on close, which
 * is what stops a keyboard user being dropped at the top of the document. Tab is
 * trapped between the two actions while it is open.
 */
export function MilestoneCelebration({
  open,
  boostersOutstanding,
  onContinue,
  onDismiss
}: {
  open: boolean;
  /** Whether an optional section is still empty, which changes the primary action. */
  boostersOutstanding: boolean;
  onContinue: () => void;
  onDismiss: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const firstActionRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    firstActionRef.current?.focus();
    const toRestore = returnFocusRef.current;
    return () => {
      // Guard on still being in the document: the element that opened this may have
      // been unmounted by the re-render that opened it.
      if (toRestore && toRestore.isConnected) toRestore.focus({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onDismiss();
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>('button:not([disabled])')
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onDismiss]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-foreground/50 p-5 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wizard-milestone-title"
        className="surface-card max-w-[26rem] rounded-4xl !p-8 text-center motion-safe:animate-rise-in"
      >
        <span
          aria-hidden
          className="mx-auto flex h-[4.75rem] w-[4.75rem] items-center justify-center rounded-full bg-primary/10"
        >
          <AscendiMark size={42} />
        </span>

        <h2
          id="wizard-milestone-title"
          className="mt-4 font-heading text-xl font-semibold tracking-tight text-foreground"
        >
          Your matches just unlocked
        </h2>
        <p className="mt-2 text-body-sm leading-relaxed text-muted-foreground">
          {boostersOutstanding
            ? "That's everything we need to rank programmes against your grades and subjects. The two optional sections only sharpen it from here."
            : "That's everything we need — your ranking will run on your full profile."}
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {boostersOutstanding ? (
            <>
              <Button ref={firstActionRef} type="button" size="sm" onClick={onContinue}>
                See what&apos;s next
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={onDismiss}>
                Keep going
              </Button>
            </>
          ) : (
            <Button ref={firstActionRef} type="button" size="sm" onClick={onDismiss}>
              Keep going
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
