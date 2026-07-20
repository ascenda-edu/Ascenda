'use client';

import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CounsellorStudent, MatchTier } from '@/lib/counsellor/types';
import { MessageStudentButton } from './message-student-button';

interface PortfolioBalanceProps {
  student: CounsellorStudent;
}

type Verdict = 'balanced' | 'reach_heavy' | 'no_safety' | 'untracked';

interface Composition {
  reach: number;
  match: number;
  safe: number;
  untracked: number;
  total: number;
}

function buildComposition(student: CounsellorStudent): Composition {
  const tierByKey = new Map<string, MatchTier>();
  for (const m of student.matches) {
    tierByKey.set(`${m.university}|${m.program}`, m.tier);
  }
  const c: Composition = { reach: 0, match: 0, safe: 0, untracked: 0, total: student.applications.length };
  for (const app of student.applications) {
    const tier = tierByKey.get(`${app.university}|${app.program}`);
    if (tier === 'Reach') c.reach += 1;
    else if (tier === 'Match') c.match += 1;
    else if (tier === 'Safe') c.safe += 1;
    else c.untracked += 1;
  }
  return c;
}

function classify(c: Composition): Verdict {
  if (c.total === 0) return 'balanced';
  const reachShare = c.reach / c.total;
  if (c.safe === 0 && c.total >= 2) return 'no_safety';
  if (reachShare > 0.6) return 'reach_heavy';
  if (c.untracked > 0 && c.untracked === c.total) return 'untracked';
  return 'balanced';
}

const VERDICT_COPY: Record<Verdict, { headline: string; detail: string; tone: 'good' | 'warn' | 'crit' | 'info'; icon: typeof CheckCircle2 }> = {
  balanced: {
    headline: 'Balanced portfolio',
    detail: 'Mix of reach, match, and safe options looks healthy.',
    tone: 'good',
    icon: CheckCircle2
  },
  reach_heavy: {
    headline: 'Reach-heavy portfolio',
    detail: 'More than 60% of applications are stretch picks. Consider discussing additional match or safe options.',
    tone: 'warn',
    icon: AlertTriangle
  },
  no_safety: {
    headline: 'No safety options',
    detail: 'No applications fall in the safe tier. A single rejection cycle leaves this student exposed.',
    tone: 'crit',
    icon: AlertTriangle
  },
  untracked: {
    headline: 'Applications outside matched list',
    detail: "Every application is to a programme that isn't in this student's match set — fit hasn't been assessed.",
    tone: 'info',
    icon: Info
  }
};

const TONE_STYLES = {
  good: {
    card: 'border-emerald-200/60 bg-emerald-500/5',
    icon: 'text-emerald-600 dark:text-emerald-400',
    headline: 'text-emerald-700 dark:text-emerald-300'
  },
  warn: {
    card: 'border-amber-200/60 bg-amber-500/5',
    icon: 'text-amber-600 dark:text-amber-400',
    headline: 'text-amber-700 dark:text-amber-300'
  },
  crit: {
    card: 'border-rose-200/60 bg-rose-500/5',
    icon: 'text-rose-600 dark:text-rose-400',
    headline: 'text-rose-700 dark:text-rose-300'
  },
  info: {
    card: 'border-sky-200/60 bg-sky-500/5',
    icon: 'text-sky-600 dark:text-sky-400',
    headline: 'text-sky-700 dark:text-sky-300'
  }
} as const;

const SEGMENTS: { key: keyof Composition; label: MatchTier | 'Other'; bar: string; pill: string }[] = [
  { key: 'reach', label: 'Reach', bar: 'bg-rose-500', pill: 'border-rose-200/60 bg-rose-500/10 text-rose-600 dark:text-rose-400' },
  { key: 'match', label: 'Match', bar: 'bg-amber-500', pill: 'border-amber-200/60 bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  { key: 'safe', label: 'Safe', bar: 'bg-emerald-500', pill: 'border-emerald-200/60 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  { key: 'untracked', label: 'Other', bar: 'bg-slate-400', pill: 'border-slate-200/60 bg-slate-500/10 text-slate-600 dark:text-slate-300' }
];

export const PortfolioBalance = ({ student }: PortfolioBalanceProps) => {
  if (student.applications.length === 0) return null;

  const composition = buildComposition(student);
  const verdict = classify(composition);
  const copy = VERDICT_COPY[verdict];
  const tone = TONE_STYLES[copy.tone];
  const Icon = copy.icon;
  const showNudge = copy.tone === 'warn' || copy.tone === 'crit';

  return (
    <div className={cn('rounded-[24px] border p-5 sm:p-6', tone.card)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background/80', tone.icon)}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="space-y-1">
            <p className={cn('text-sm font-bold', tone.headline)}>{copy.headline}</p>
            <p className="text-sm text-muted-foreground">{copy.detail}</p>
          </div>
        </div>

        {showNudge && (
          <MessageStudentButton
            student={{
              id: student.id,
              firstName: student.personal.firstName,
              lastName: student.personal.lastName
            }}
            reason="portfolio_balance"
            variant="nudge"
          />
        )}
      </div>

      {/* Composition bar */}
      <div className="mt-5 space-y-2">
        <div className="flex h-2 overflow-hidden rounded-full bg-muted/60">
          {SEGMENTS.map(({ key, bar }) => {
            const value = composition[key] as number;
            if (value === 0) return null;
            const pct = (value / composition.total) * 100;
            return <div key={key} className={cn('h-2', bar)} style={{ width: `${pct}%` }} />;
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {SEGMENTS.map(({ key, label, pill }) => {
            const value = composition[key] as number;
            if (value === 0) return null;
            return (
              <span key={key} className={cn('rounded-full border px-2.5 py-0.5 text-[0.6875rem] font-semibold tabular-nums', pill)}>
                {value} {label}
              </span>
            );
          })}
          <span className="ml-auto text-[0.6875rem] text-muted-foreground">
            {composition.total} application{composition.total !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  );
};
