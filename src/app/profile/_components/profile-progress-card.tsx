'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import { PROFILE_STEPS, type StepCompletionMap } from '@/lib/profile/steps';
import { cn } from '@/lib/utils';
import { DURATION, EASE } from '@/lib/motion';
import { classifyCompletion, COMPLETION_VISUAL } from '@/lib/theme/categories';

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
  const clampedPercent = useMemo(() => Math.min(100, Math.max(0, completionPercent)), [completionPercent]);
  const isComplete = clampedPercent >= 100;
  const band = classifyCompletion(clampedPercent);
  const visual = COMPLETION_VISUAL[band];

  useEffect(() => {
    if (!isComplete) {
      setCelebrate(false);
      return;
    }

    setCelebrate(true);
    const timer = setTimeout(() => setCelebrate(false), 2200);
    return () => clearTimeout(timer);
  }, [isComplete]);

  /* One chromatic element on this card, and it is the progress BAR — a data mark,
     which encodes a quantity rather than a status.

     This card previously spent the band tone five times over: a tinted border, a
     `border-l-4` rail, a filled icon plate, a toned eyebrow and the bar. At 100%
     that meant five green marks saying one thing, on the screen whose whole
     problem was saying "done" too loudly. The surface, rail, plate and eyebrow are
     neutral now; the bar still carries the band, so a profile at 20% still reads
     as urgent at a glance. */
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

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
        <motion.div
          className={cn('h-full rounded-full', visual.bar)}
          initial={{ width: 0 }}
          animate={{ width: `${clampedPercent}%` }}
          transition={{ type: 'spring', stiffness: 110, damping: 20 }}
          aria-hidden
        />
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
                  className="absolute h-2 w-4 rounded-full bg-gradient-to-r from-primary via-muted to-success shadow-e-2"
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
