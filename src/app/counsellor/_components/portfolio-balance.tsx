'use client';

import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CounsellorStudent, MatchTier } from '@/lib/counsellor/types';
import { TIER_VISUAL } from '@/lib/theme/categories';
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
  good: { card: 'border-success/25 bg-success-subtle', icon: 'text-success', headline: 'text-success' },
  warn: { card: 'border-warning/25 bg-warning-subtle', icon: 'text-warning', headline: 'text-warning' },
  crit: { card: 'border-danger/25 bg-danger-subtle', icon: 'text-danger', headline: 'text-danger' },
  info: { card: 'border-info/25 bg-info-subtle', icon: 'text-info', headline: 'text-info' }
} as const;

// Tier segments are TIER_VISUAL's; `untracked` is genuinely neutral (no tier has
// been assessed), so it wears the muted ink rather than a fifth hue.
const SEGMENTS: { key: keyof Composition; label: MatchTier | 'Other'; bar: string; pill: string }[] = [
  { key: 'reach', label: 'Reach', bar: TIER_VISUAL.reach.bar, pill: `${TIER_VISUAL.reach.border} ${TIER_VISUAL.reach.bg} ${TIER_VISUAL.reach.text}` },
  { key: 'match', label: 'Match', bar: TIER_VISUAL.match.bar, pill: `${TIER_VISUAL.match.border} ${TIER_VISUAL.match.bg} ${TIER_VISUAL.match.text}` },
  { key: 'safe', label: 'Safe', bar: TIER_VISUAL.safety.bar, pill: `${TIER_VISUAL.safety.border} ${TIER_VISUAL.safety.bg} ${TIER_VISUAL.safety.text}` },
  { key: 'untracked', label: 'Other', bar: 'bg-muted-foreground/40', pill: 'border-border bg-muted/60 text-muted-foreground' }
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
    <div className={cn('rounded-3xl border p-5 sm:p-6', tone.card)}>
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
              <span key={key} className={cn('rounded-full border px-2.5 py-0.5 text-label font-semibold tabular-nums', pill)}>
                {value} {label}
              </span>
            );
          })}
          <span className="ml-auto text-label text-muted-foreground">
            {composition.total} application{composition.total !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  );
};
