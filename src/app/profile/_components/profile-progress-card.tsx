'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
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

  return (
    <div
      className={cn(
        'surface-card relative overflow-hidden rounded-4xl border-l-4 p-6',
        visual.border,
        visual.accent
      )}
    >
      <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <div className={visual.swatch}>
            <visual.icon className="h-5 w-5" />
          </div>
          <div>
            <p className={cn('eyebrow', visual.text)}>Profile completion</p>
            <p className="text-2xl font-semibold text-foreground">{clampedPercent}%</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {completedCount}/{totalSteps} steps done {nextStepTitle ? `• Next: ${nextStepTitle}` : ''}
            </p>
          </div>
        </div>
        <div className={cn('inline-flex items-center gap-2 rounded-full px-4 py-2 text-label uppercase tracking-[0.35em]', visual.chip)}>
          <Sparkles className="h-4 w-4" />
          Progress
        </div>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted/70">
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
                complete
                  ? 'border-success/25 bg-success-subtle'
                  : ''
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{step.title}</p>
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-3 py-1 text-label font-semibold uppercase tracking-[0.2em]',
                    complete
                      ? 'bg-success-subtle text-success ring-1 ring-success/25'
                      : 'bg-muted/70 text-muted-foreground ring-1 ring-border'
                  )}
                >
                  {complete ? 'Complete' : 'Action'}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>
              <span className="eyebrow-accent mt-3 inline-flex items-center gap-2 opacity-80 transition group-hover:opacity-100">
                Open
              </span>
            </Link>
          );
        })}
      </div>

      <AnimatePresence>
        {celebrate ? (
          <>
            <motion.div
              className="pointer-events-none absolute inset-0 rounded-4xl ring-2 ring-primary/40"
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
                  className="absolute h-2 w-4 rounded-full bg-gradient-to-r from-primary via-info to-success shadow-e-2"
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
