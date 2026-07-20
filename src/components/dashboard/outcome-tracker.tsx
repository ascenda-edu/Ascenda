'use client';

import { motion } from 'framer-motion';
import { Check, Clock, HelpCircle, X, MinusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OutcomeRecord } from '@/lib/data/student-demo-data';

const RESULT_CONFIG = {
  accepted: { icon: Check, label: 'Accepted', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-200/60 dark:border-emerald-500/20' },
  rejected: { icon: X, label: 'Rejected', color: 'text-rose-500', bg: 'bg-rose-500/10 border-rose-200/60 dark:border-rose-500/20' },
  waitlisted: { icon: HelpCircle, label: 'Waitlisted', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10 border-amber-200/60 dark:border-amber-500/20' },
  pending: { icon: Clock, label: 'Pending', color: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-500/10 border-sky-200/60 dark:border-sky-500/20' },
  withdrawn: { icon: MinusCircle, label: 'Withdrawn', color: 'text-muted-foreground', bg: 'bg-muted/60 border-border' }
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } }
};

const cardFade = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } }
};

interface OutcomeTrackerProps {
  outcomes: OutcomeRecord[];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function OutcomeTracker({ outcomes }: OutcomeTrackerProps) {
  const accepted = outcomes.filter((o) => o.result === 'accepted').length;
  const pending = outcomes.filter((o) => o.result === 'pending').length;
  const total = outcomes.length;

  return (
    <div className="space-y-4">
      {/* Summary chips */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: 'Accepted', count: accepted, color: 'bg-emerald-500/10 text-emerald-600 border-emerald-200/60 dark:text-emerald-400 dark:border-emerald-500/20' },
          { label: 'Pending', count: pending, color: 'bg-sky-500/10 text-sky-600 border-sky-200/60 dark:text-sky-400 dark:border-sky-500/20' },
          { label: 'Total', count: total, color: 'bg-muted/60 text-foreground border-border' }
        ].map(({ label, count, color }) => (
          <div key={label} className={cn('rounded-2xl border px-4 py-2 text-center', color)}>
            <p className="text-lg font-bold tabular-nums">{count}</p>
            <p className="text-[0.6875rem] font-semibold">{label}</p>
          </div>
        ))}
      </div>

      {/* Cards */}
      <motion.div
        className="space-y-3"
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-40px' }}
      >
        {outcomes.map((outcome) => {
          const cfg = RESULT_CONFIG[outcome.result];
          const Icon = cfg.icon;

          return (
            <motion.div
              key={outcome.id}
              variants={cardFade}
              className="flex items-center gap-4 rounded-2xl border border-border/60 bg-background/60 px-5 py-4"
            >
              <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', cfg.bg)}>
                <Icon className={cn('h-5 w-5', cfg.color)} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground">{outcome.university}</p>
                <p className="text-sm text-muted-foreground">{outcome.program} · {outcome.country}</p>
                {outcome.notes && (
                  <p className="mt-1 text-xs text-muted-foreground/80">{outcome.notes}</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className={cn('rounded-full border px-3 py-1 text-xs font-semibold', cfg.bg, cfg.color)}>
                  {cfg.label}
                </span>
                {outcome.responseDate && (
                  <span className="text-[0.6875rem] text-muted-foreground">{formatDate(outcome.responseDate)}</span>
                )}
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
