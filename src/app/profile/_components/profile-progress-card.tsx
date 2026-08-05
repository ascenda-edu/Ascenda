'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import { PROFILE_STEPS, type StepCompletionMap } from '@/lib/profile/steps';
import { cn } from '@/lib/utils';
import { DURATION, EASE } from '@/lib/motion';
import {
  classifyCompletion,
  COMPLETION_VISUAL,
  PROGRESS_SEGMENT_FILL,
  PROGRESS_SEGMENT_GAP,
  PROGRESS_TRACK
} from '@/lib/theme/categories';

/**
 * The latch that stops the celebration re-firing.
 *
 * `/profile` is a SERVER component, so `completionPercent` arrives already-computed
 * on every request and this card remounts from scratch on every navigation. A
 * `useRef` of the previous value therefore cannot help: there is no previous render
 * to compare against, which is why an already-complete student used to get confetti
 * on every visit and every refresh. The moment we want to mark is the TRANSITION to
 * complete, and the only thing that survives a remount is storage.
 */
const CELEBRATED_KEY = 'ascenda-profile-complete-celebrated';

interface ProfileProgressCardProps {
  completionPercent: number;
  completedCount: number;
  totalSteps: number;
  nextStepTitle?: string;
  stepCompletion: StepCompletionMap;
}

const confettiPieces = [
  { top: '10%', left: '14%', delay: 0 },
  { top: '18%', left: '82%', delay: 0.05 },
  { top: '32%', left: '36%', delay: 0.12 },
  { top: '40%', left: '68%', delay: 0.18 },
  { top: '22%', left: '50%', delay: 0.24 }
];

export function ProfileProgressCard({
  completionPercent,
  completedCount,
  totalSteps,
  nextStepTitle,
  stepCompletion
}: ProfileProgressCardProps) {
  const [celebrate, setCelebrate] = useState(false);
  /* Whether THIS mount armed the celebration — see the note in the effect below. */
  const armedThisMount = useRef(false);
  const clampedPercent = useMemo(() => Math.min(100, Math.max(0, completionPercent)), [completionPercent]);
  const isComplete = clampedPercent >= 100;
  const band = classifyCompletion(clampedPercent);
  const visual = COMPLETION_VISUAL[band];

  /* Celebrate the TRANSITION to complete, exactly once — not the resting state.
     Reaching 100% is a genuine terminal outcome and earns a spike; *being* at 100%
     is just how the page looks from then on, and re-running the confetti on every
     refresh turns a reward into wallpaper.

     Regressing below 100% clears the latch on purpose: if a student empties a
     section and later fills it back in, they have crossed the line again and the
     moment is theirs again. Storage access is wrapped because Safari's private mode
     throws on `localStorage` rather than no-opping — a failed read there simply
     means the student gets the celebration once per visit, which is the graceful
     end of this feature rather than a crash on the profile page. */
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!isComplete) {
      setCelebrate(false);
      try {
        window.localStorage.removeItem(CELEBRATED_KEY);
      } catch {
        /* storage unavailable — nothing was ever written, so nothing to clear */
      }
      return;
    }

    let alreadyCelebrated = false;
    try {
      alreadyCelebrated = window.localStorage.getItem(CELEBRATED_KEY) !== null;
      if (!alreadyCelebrated) window.localStorage.setItem(CELEBRATED_KEY, '1');
    } catch {
      /* storage unavailable — fall through and celebrate; see the note above */
    }
    /* `armedThisMount` and not a bare `if (alreadyCelebrated) return` — that version
       left the confetti STUCK ON in development. `reactStrictMode` is true
       (next.config.js), so the effect double-invokes on one mount: pass 1 wrote the
       latch, set `celebrate` and armed the 2200ms timer, cleanup cleared the timer,
       and pass 2 then read its OWN latch write, returned early, and never re-armed —
       so nothing was left to turn it off. A ref survives both invocations of the same
       mount, which is exactly the distinction needed: "someone already celebrated" and
       "I already celebrated" are different questions, and only the first should bail. */
    if (alreadyCelebrated && !armedThisMount.current) return;
    armedThisMount.current = true;

    setCelebrate(true);
    const timer = setTimeout(() => setCelebrate(false), 2200);
    return () => clearTimeout(timer);
  }, [isComplete]);

  /* Nothing on this card carries a status tone, including the bar. Completion is a
     QUANTITY: the bar's LENGTH is the encoding, and a colour that changes with the
     number would say "your state changed" when only the amount did.

     This card previously spent the band tone five times over — a tinted border, a
     `border-l-4` rail, a filled icon plate, a toned eyebrow and the bar — so at 100%
     five green marks said one thing, on the screen whose whole problem was saying
     "done" too loudly. The first four went neutral in an earlier pass; the bar was
     kept on the grounds that "a profile at 20% still reads as urgent at a glance",
     which is the error stated out loud. A half-finished profile has no deadline, so
     it is not urgent — it is simply the next thing to do. */
  return (
    <div className="surface-card relative overflow-hidden rounded-4xl p-6">
      <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl text-muted-foreground">
            <visual.icon className="h-5 w-5" />
          </div>
          <div>
            <p className="eyebrow">Profile completion</p>
            <p className="text-2xl font-semibold text-foreground">{clampedPercent}%</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {completedCount}/{totalSteps} steps done {nextStepTitle ? `• Next: ${nextStepTitle}` : ''}
            </p>
          </div>
        </div>
        {/* Neutral: this chip says "Progress", which is a label for the number
            beside it, not a state. It was the band tone, so at 100% it was a
            green chip on a green card next to a green plate. */}
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-4 py-2 text-label uppercase tracking-[0.35em] text-muted-foreground">
          <Sparkles className="h-4 w-4" />
          Progress
        </div>
      </div>

      {/* SEGMENTED, one segment per step — not a continuous fill.
        *
        * `PROFILE_STEPS.length` is 5, so this percentage can only ever be one of
        * 0/20/40/60/80/100. A continuous bar springing to an arbitrary width claims
        * a resolution the data does not have, and it invites the reader to compare
        * two profiles by bar length when the only real question is which steps are
        * done. Five segments answer that directly.
        *
        * There is also a hard contrast reason the `--series-*` ramp REQUIRES
        * segments (see `PROGRESS_SEGMENT_FILL`): `--series-5` measures 2.57:1 light
        * and 2.70:1 dark against a `bg-muted` track, under the 3:1 a non-text mark
        * needs. It clears 3:1 against the CARD, which is the surface it actually
        * sits on once the card-coloured `gap-[2px]` between segments is there. A
        * continuous bar has no such gap, so it could not walk this ramp at all.
        *
        * Each segment is driven by its OWN step, not by the rounded percentage, so a
        * student who fills step 4 before step 3 sees the truth. The ramp is
        * positional (segment i always takes rung i), which keeps the bar reading
        * left-to-right regardless of the order the steps were completed in. */}
      <div
        role="progressbar"
        aria-label="Profile completion"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clampedPercent}
        aria-valuetext={`${completedCount} of ${totalSteps} steps done`}
        className={cn('mt-4 flex items-center', PROGRESS_SEGMENT_GAP)}
      >
        {PROFILE_STEPS.map((step, index) => (
          <motion.span
            key={step.key}
            // The segments are decoration; the role/aria-value* on the wrapper is
            // what gets announced, alongside the "{n}/{total} steps done" line above.
            aria-hidden
            className={cn(
              'h-2 flex-1 rounded-full',
              stepCompletion[step.key] ? PROGRESS_SEGMENT_FILL[index] : PROGRESS_TRACK
            )}
            // Staggered wipe from the left, so the bar reads as accumulation rather
            // than as five things appearing at once. `originX` matters: the default
            // centre origin makes a segment grow outwards from its middle, which
            // looks like a pulse, not progress. Honoured-reduced-motion is handled
            // globally by <MotionConfig reducedMotion="user"> in providers.tsx.
            style={{ originX: 0 }}
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ duration: DURATION.base, ease: EASE, delay: index * 0.06 }}
          />
        ))}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {PROFILE_STEPS.map((step) => {
          const complete = stepCompletion[step.key];
          return (
            <Link
              key={step.key}
              href={`/profile/wizard?step=${step.key}`}
              className={cn(
                'group surface-subcard relative overflow-hidden px-4 py-4 transition-transform duration-300 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                // The card surface stays neutral in BOTH states. Colour goes to the
                // step that still needs work — a warning rail plus the action strip
                // below — so attention lands on what is unfinished rather than on
                // what is already done.
                !complete && 'surface-card--action'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{step.title}</p>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-3 py-1 text-label font-semibold uppercase tracking-[0.2em]',
                    complete
                      ? 'text-muted-foreground'
                      : 'bg-muted text-muted-foreground ring-1 ring-border'
                  )}
                >
                  {complete
                    ? <Check className="h-3 w-3 shrink-0" aria-hidden />
                    : <ArrowRight className="h-3 w-3 shrink-0" aria-hidden />}
                  {/* An arrow, not a clock: a clock says HURRY, an arrow says GO.
                      And "Next up" rather than "Action" — same information without
                      the reproach, on a screen anxious students open. */}
                  {complete ? 'Complete' : 'Next up'}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>
              {complete ? (
                <span className="eyebrow mt-3 inline-flex items-center gap-2 opacity-80 transition group-hover:opacity-100">
                  Review
                </span>
              ) : (
                <span className="surface-action-strip">
                  <span>Finish this step</span>
                  <span aria-hidden>Open →</span>
                </span>
              )}
            </Link>
          );
        })}
      </div>

      <AnimatePresence>
        {celebrate ? (
          <>
            <motion.div
              // /60, not the /30 nearest-rung mapping would have given: this is the
              // one celebratory moment in the app, and the ladder was about to make
              // it fainter. An inset-0 ring with no fill is not a scrim — nothing is
              // obscured — so it is a tint, and a tint marking a reward earns the
              // rung above the one that marks a hover.
              className="pointer-events-none absolute inset-0 rounded-4xl ring-2 ring-primary/60"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DURATION.base, ease: EASE }}
              aria-hidden
            />
            <motion.div
              className="pointer-events-none absolute inset-0 rounded-4xl shadow-e-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              // Twice the ring's duration on purpose — the two layers are staged, so the
              // glow keeps blooming after the ring has landed. Snapping both to the same
              // step would collapse the celebration into a single flat fade.
              transition={{ duration: 0.8, ease: EASE }}
              aria-hidden
            />
            <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
              {confettiPieces.map((piece, index) => (
                <motion.span
                  key={`${piece.left}-${piece.top}-${index}`}
                  // Brand-only. These were `from-primary via-muted to-success`, the
                  // one place in the app that mixed the brand and a status tone in a
                  // single gradient — so the reward layer was quietly asserting
                  // "success" too, on top of the four other things already saying
                  // "done". Both stops now sit on the `--series-*` ramp, i.e. the
                  // brand at two lightnesses, which keeps the shard legible on the
                  // card in either theme. Gradient stops are explicitly outside the
                  // alpha ladder (brand.md §7), so this needs no rung.
                  className="absolute h-2 w-4 rounded-full bg-gradient-to-r from-primary to-series-4 shadow-e-2"
                  style={{ top: piece.top, left: piece.left }}
                  initial={{ y: -12, opacity: 0, rotate: -12 }}
                  animate={{ y: 12, opacity: [0.9, 1, 0.6, 0], rotate: [0, 8, -6, 12] }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1.6, delay: piece.delay, ease: 'easeOut' }}
                />
              ))}
            </div>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
