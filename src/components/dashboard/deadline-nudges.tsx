'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Bell, ChevronRight, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { daysUntil } from '@/lib/utils/dates';
import type { DeadlineNudge, NudgeUrgency } from '@/lib/data/student-demo-data';

const URGENCY_CONFIG: Record<NudgeUrgency, { icon: typeof Bell; color: string; bg: string; border: string; ring: string }> = {
  critical: {
    icon: AlertTriangle,
    color: 'text-rose-600 dark:text-rose-400',
    bg: 'bg-rose-500/10',
    border: 'border-rose-200/60 dark:border-rose-500/20',
    ring: 'ring-rose-500/20'
  },
  warning: {
    icon: Bell,
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-200/60 dark:border-amber-500/20',
    ring: 'ring-amber-500/20'
  },
  info: {
    icon: Info,
    color: 'text-sky-600 dark:text-sky-400',
    bg: 'bg-sky-500/10',
    border: 'border-sky-200/60 dark:border-sky-500/20',
    ring: 'ring-sky-500/20'
  }
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } }
};

const nudgeFade = {
  hidden: { opacity: 0, x: -12 },
  show: { opacity: 1, x: 0, transition: { duration: 0.35, ease: 'easeOut' as const } },
  exit: { opacity: 0, x: 12, transition: { duration: 0.2 } }
};

interface DeadlineNudgesProps {
  nudges: DeadlineNudge[];
}

export function DeadlineNudges({ nudges }: DeadlineNudgesProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = nudges.filter((n) => !dismissed.has(n.id));
  const criticalCount = visible.filter((n) => n.urgency === 'critical').length;

  const handleDismiss = (id: string) => {
    setDismissed((prev) => new Set([...prev, id]));
  };

  if (visible.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-200/60 bg-emerald-500/5 px-5 py-6 text-center dark:border-emerald-500/20">
        <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">All caught up!</p>
        <p className="mt-1 text-xs text-muted-foreground">No urgent reminders right now.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      {criticalCount > 0 && (
        <div className="flex items-center gap-2 rounded-2xl border border-rose-200/60 bg-rose-500/5 px-4 py-3 dark:border-rose-500/20">
          <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0" />
          <p className="text-sm text-rose-600 dark:text-rose-400">
            <span className="font-semibold">{criticalCount}</span> critical{' '}
            {criticalCount === 1 ? 'item needs' : 'items need'} your attention
          </p>
        </div>
      )}

      {/* Nudge cards */}
      <motion.div
        className="space-y-3"
        variants={stagger}
        initial="hidden"
        animate="show"
      >
        <AnimatePresence mode="popLayout">
          {visible.map((nudge) => {
            const cfg = URGENCY_CONFIG[nudge.urgency];
            const Icon = cfg.icon;
            const days = daysUntil(nudge.dueDate);

            return (
              <motion.div
                key={nudge.id}
                layout
                variants={nudgeFade}
                initial="hidden"
                animate="show"
                exit="exit"
                className={cn(
                  'relative rounded-2xl border p-4 transition-all',
                  cfg.border, cfg.bg
                )}
              >
                <button
                  type="button"
                  onClick={() => handleDismiss(nudge.id)}
                  className="absolute right-3 top-3 rounded-full p-1 text-muted-foreground/50 transition hover:bg-muted/60 hover:text-foreground"
                  aria-label="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>

                <div className="flex items-start gap-3 pr-6">
                  <div className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', cfg.bg, cfg.color, 'ring-1', cfg.ring)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold text-foreground">{nudge.title}</p>
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums', cfg.color, cfg.bg)}>
                        {days <= 0 ? 'Overdue' : `${days}d`}
                      </span>
                    </div>
                    {nudge.university && (
                      <p className="text-[11px] font-semibold text-muted-foreground mb-1">{nudge.university}</p>
                    )}
                    <p className="text-[13px] text-muted-foreground/90 leading-relaxed">{nudge.description}</p>
                    <Link
                      href={nudge.actionHref}
                      className={cn(
                        'mt-2 inline-flex items-center gap-1 text-xs font-semibold transition hover:underline',
                        cfg.color
                      )}
                    >
                      {nudge.actionLabel}
                      <ChevronRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
