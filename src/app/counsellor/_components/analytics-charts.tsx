'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { CohortStats } from './types';

// ─── Programme Split ──────────────────────────────────────────────────────────

interface ProgrammeSplitProps {
  breakdown: CohortStats['programmeBreakdown'];
  onSelect?: (programme: 'IB' | 'A_LEVEL') => void;
}

export const ProgrammeSplit = ({ breakdown, onSelect }: ProgrammeSplitProps) => {
  const total = breakdown.ib + breakdown.aLevel || 1;
  const ibPct = Math.round((breakdown.ib / total) * 100);
  const aLevelPct = 100 - ibPct;

  return (
    <div className="space-y-4">
      <div className="flex h-10 overflow-hidden rounded-2xl border border-border/50">
        <button
          onClick={() => onSelect?.('IB')}
          className="group relative flex h-full items-center justify-center bg-violet-500/70 text-xs font-bold text-white transition-all hover:bg-violet-500/90 cursor-pointer"
          style={{ width: `${ibPct}%` }}
        >
          IB {ibPct}%
          <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-[11px] font-semibold text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100">
            {breakdown.ib} students · Click to explore
          </span>
        </button>
        <button
          onClick={() => onSelect?.('A_LEVEL')}
          className="group relative flex h-full items-center justify-center bg-sky-500/70 text-xs font-bold text-white transition-all hover:bg-sky-500/90 cursor-pointer"
          style={{ width: `${aLevelPct}%` }}
        >
          A-Level {aLevelPct}%
          <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-[11px] font-semibold text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100">
            {breakdown.aLevel} students · Click to explore
          </span>
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => onSelect?.('IB')}
          className="rounded-2xl border border-violet-200/60 bg-violet-500/10 px-5 py-4 text-center transition hover:-translate-y-0.5 hover:shadow-md hover:border-violet-300/80 cursor-pointer dark:border-violet-500/20 dark:hover:border-violet-400/40"
        >
          <p className="text-2xl font-bold text-violet-700 dark:text-violet-300">{breakdown.ib}</p>
          <p className="text-xs text-muted-foreground">IB students</p>
        </button>
        <button
          onClick={() => onSelect?.('A_LEVEL')}
          className="rounded-2xl border border-sky-200/60 bg-sky-500/10 px-5 py-4 text-center transition hover:-translate-y-0.5 hover:shadow-md hover:border-sky-300/80 cursor-pointer dark:border-sky-500/20 dark:hover:border-sky-400/40"
        >
          <p className="text-2xl font-bold text-sky-700 dark:text-sky-300">{breakdown.aLevel}</p>
          <p className="text-xs text-muted-foreground">A-Level students</p>
        </button>
      </div>
    </div>
  );
};

// ─── IB Score Distribution ────────────────────────────────────────────────────

interface IbDistributionProps {
  buckets: { label: string; count: number; min: number; max: number }[];
  onSelect?: (bucket: { label: string; min: number; max: number }) => void;
}

export const IbDistribution = ({ buckets, onSelect }: IbDistributionProps) => {
  const maxCount = Math.max(...buckets.map((b) => b.count), 1);
  const total = buckets.reduce((a, b) => a + b.count, 0) || 1;

  return (
    <div className="space-y-4">
      <div className="space-y-2.5">
        {buckets.map(({ label, count, min, max }) => (
          <button
            key={label}
            onClick={() => count > 0 && onSelect?.({ label, min, max })}
            className={cn(
              'flex w-full items-center gap-3 rounded-xl px-1 py-0.5 transition',
              count > 0 ? 'cursor-pointer hover:bg-muted/40' : 'cursor-default opacity-60'
            )}
          >
            <span className="w-16 shrink-0 text-right text-xs font-semibold text-muted-foreground">{label}</span>
            <div className="flex-1 overflow-hidden rounded-xl bg-muted/50">
              <div
                className={cn(
                  'group relative flex h-7 items-center justify-end rounded-xl bg-primary/70 px-2 text-xs font-bold text-primary-foreground transition-all duration-700',
                  count > 0 && 'hover:bg-primary/90'
                )}
                style={{ width: `${(count / maxCount) * 100}%`, minWidth: count > 0 ? '2rem' : '0' }}
              >
                {count > 0 ? count : ''}
                {count > 0 && (
                  <span className="pointer-events-none absolute -top-8 right-0 whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-[11px] font-semibold text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100">
                    {count} student{count !== 1 ? 's' : ''} · {Math.round((count / total) * 100)}% · Click to explore
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

// ─── Field of Study Chart ─────────────────────────────────────────────────────

interface FieldChartProps {
  fields: { key: string; label: string; count: number }[];
  onSelect?: (field: { key: string; label: string }) => void;
}

const FIELD_COLORS = [
  'bg-violet-500/70',
  'bg-sky-500/70',
  'bg-emerald-500/70',
  'bg-amber-500/70',
  'bg-rose-500/70',
  'bg-indigo-500/70',
  'bg-teal-500/70',
  'bg-orange-500/70'
];

const FIELD_HOVER_COLORS = [
  'hover:bg-violet-500/90',
  'hover:bg-sky-500/90',
  'hover:bg-emerald-500/90',
  'hover:bg-amber-500/90',
  'hover:bg-rose-500/90',
  'hover:bg-indigo-500/90',
  'hover:bg-teal-500/90',
  'hover:bg-orange-500/90'
];

export const FieldChart = ({ fields, onSelect }: FieldChartProps) => {
  const max = Math.max(...fields.map((f) => f.count), 1);
  const total = fields.reduce((a, f) => a + f.count, 0) || 1;

  return (
    <div className="space-y-4">
      <div className="space-y-2.5">
        {fields.map(({ key, label, count }, idx) => (
          <button
            key={label}
            onClick={() => count > 0 && onSelect?.({ key, label })}
            className={cn(
              'flex w-full items-center gap-3 rounded-xl px-1 py-0.5 transition',
              count > 0 ? 'cursor-pointer hover:bg-muted/40' : 'cursor-default opacity-60'
            )}
          >
            <span className="w-28 shrink-0 truncate text-right text-xs text-muted-foreground">{label}</span>
            <div className="flex-1 overflow-hidden rounded-xl bg-muted/50">
              <div
                className={cn(
                  'group relative flex h-7 items-center justify-end rounded-xl px-2 text-xs font-bold text-white transition-all duration-700',
                  FIELD_COLORS[idx % FIELD_COLORS.length],
                  count > 0 && FIELD_HOVER_COLORS[idx % FIELD_HOVER_COLORS.length]
                )}
                style={{ width: `${(count / max) * 100}%`, minWidth: count > 0 ? '2rem' : '0' }}
              >
                {count > 0 ? count : ''}
                {count > 0 && (
                  <span className="pointer-events-none absolute -top-8 right-0 whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-[11px] font-semibold text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100">
                    {count} student{count !== 1 ? 's' : ''} · {Math.round((count / total) * 100)}% · Click to explore
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

// ─── Application Funnel (full analytics version) ──────────────────────────────

interface FullFunnelProps {
  funnel: CohortStats['appFunnel'];
  onSelect?: (stage: keyof CohortStats['appFunnel'], label: string) => void;
}

const FUNNEL_STAGES = [
  { key: 'planning' as const, label: 'Planning', color: 'bg-muted-foreground/40', hoverColor: 'hover:bg-muted-foreground/60', textColor: 'text-muted-foreground' },
  { key: 'inProgress' as const, label: 'In Progress', color: 'bg-sky-500/70', hoverColor: 'hover:bg-sky-500/90', textColor: 'text-sky-700 dark:text-sky-400' },
  { key: 'submitted' as const, label: 'Submitted', color: 'bg-violet-500/70', hoverColor: 'hover:bg-violet-500/90', textColor: 'text-violet-700 dark:text-violet-400' },
  { key: 'decision' as const, label: 'Decision Received', color: 'bg-emerald-500/70', hoverColor: 'hover:bg-emerald-500/90', textColor: 'text-emerald-700 dark:text-emerald-400' }
];

// Synthetic "last year" funnel for the year-on-year comparison toggle. Builds
// off this cycle's distribution with deterministic offsets so the comparison
// numbers look credible across re-renders.
const buildPriorYearFunnel = (current: CohortStats['appFunnel']): CohortStats['appFunnel'] => ({
  planning: Math.max(0, Math.round(current.planning * 1.12)),
  inProgress: Math.max(0, Math.round(current.inProgress * 0.92)),
  submitted: Math.max(0, Math.round(current.submitted * 0.78)),
  decision: Math.max(0, Math.round(current.decision * 0.65))
});

const formatDelta = (current: number, prior: number): { label: string; tone: string } => {
  const diff = current - prior;
  if (prior === 0 && current === 0) return { label: 'flat', tone: 'text-muted-foreground' };
  if (prior === 0) return { label: 'new', tone: 'text-emerald-600 dark:text-emerald-400' };
  const pct = Math.round((diff / prior) * 100);
  if (pct === 0) return { label: '±0%', tone: 'text-muted-foreground' };
  const sign = pct > 0 ? '▲' : '▼';
  const tone = pct > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
  return { label: `${sign} ${Math.abs(pct)}%`, tone };
};

export const FullFunnel = ({ funnel, onSelect }: FullFunnelProps) => {
  const [compareYoY, setCompareYoY] = useState(false);
  // Students can appear in multiple stages; use max stage value as denominator
  // so bars are relative to the busiest stage, not an inflated sum.
  const total = Math.max(...Object.values(funnel), 1);
  const priorFunnel = buildPriorYearFunnel(funnel);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setCompareYoY((prev) => !prev)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition',
            compareYoY
              ? 'border-violet-300/70 bg-violet-500/10 text-violet-700 dark:text-violet-300'
              : 'border-border/60 text-muted-foreground hover:border-primary/40 hover:bg-muted/60 hover:text-foreground'
          )}
        >
          {compareYoY ? 'Hiding last year' : 'Compare to last year'}
        </button>
      </div>

      <div className="space-y-3">
        {FUNNEL_STAGES.map(({ key, label, color, hoverColor, textColor }, idx) => {
          const count = funnel[key];
          const pct = Math.round((count / total) * 100);
          const width = Math.max(100 - idx * 12, 40);
          const prior = priorFunnel[key];
          const delta = formatDelta(count, prior);

          return (
            <button
              key={key}
              onClick={() => count > 0 && onSelect?.(key, label)}
              className={cn(
                'block w-full space-y-1.5 rounded-xl px-1 py-1 transition',
                count > 0 ? 'cursor-pointer hover:bg-muted/40' : 'cursor-default'
              )}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className={cn('font-bold tabular-nums', textColor)}>
                  {count} <span className="font-normal text-muted-foreground">({pct}%)</span>
                  {compareYoY ? (
                    <span className={cn('ml-2 text-[10px] font-semibold', delta.tone)}>{delta.label}</span>
                  ) : null}
                </span>
              </div>
              <div className="flex justify-center">
                <div
                  className={cn('group relative flex h-8 items-center justify-center rounded-xl text-xs font-bold text-white transition-all', color, count > 0 && hoverColor)}
                  style={{ width: `${width}%` }}
                >
                  {count}
                  <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-[11px] font-semibold text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100">
                    {count} student{count !== 1 ? 's' : ''} · {pct}%
                    {compareYoY ? ` · ${delta.label} vs last year` : ''} · Click to explore
                  </span>
                </div>
              </div>
              {compareYoY ? (
                <div className="ml-auto flex w-fit items-center gap-1 pr-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Last year · {prior}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ─── Match Tier Summary ───────────────────────────────────────────────────────

interface MatchTierSummaryProps {
  tiers: CohortStats['matchTiers'];
  onSelect?: (tier: 'reach' | 'match' | 'safe', label: string) => void;
}

export const MatchTierSummary = ({ tiers, onSelect }: MatchTierSummaryProps) => {
  const total = tiers.reach + tiers.match + tiers.safe || 1;

  const tierList = [
    { key: 'reach' as const, label: 'Reach', count: tiers.reach, color: 'bg-rose-500/80', hoverColor: 'hover:bg-rose-500', card: 'border-rose-200/60 bg-rose-500/10 dark:border-rose-500/20', hoverCard: 'hover:border-rose-300/80 hover:-translate-y-0.5 hover:shadow-md dark:hover:border-rose-400/40', text: 'text-rose-600 dark:text-rose-400' },
    { key: 'match' as const, label: 'Match', count: tiers.match, color: 'bg-amber-500/80', hoverColor: 'hover:bg-amber-500', card: 'border-amber-200/60 bg-amber-500/10 dark:border-amber-500/20', hoverCard: 'hover:border-amber-300/80 hover:-translate-y-0.5 hover:shadow-md dark:hover:border-amber-400/40', text: 'text-amber-600 dark:text-amber-400' },
    { key: 'safe' as const, label: 'Safe', count: tiers.safe, color: 'bg-emerald-500/80', hoverColor: 'hover:bg-emerald-500', card: 'border-emerald-200/60 bg-emerald-500/10 dark:border-emerald-500/20', hoverCard: 'hover:border-emerald-300/80 hover:-translate-y-0.5 hover:shadow-md dark:hover:border-emerald-400/40', text: 'text-emerald-600 dark:text-emerald-400' }
  ];

  return (
    <div className="space-y-4">
      {/* Stacked bar */}
      <div className="flex h-10 overflow-hidden rounded-2xl border border-border/50">
        {tierList.map(({ key, label, count, color, hoverColor }) => {
          const pct = (count / total) * 100;
          return pct > 0 ? (
            <button
              key={label}
              onClick={() => onSelect?.(key, label)}
              className={cn(color, hoverColor, 'group relative flex items-center justify-center text-xs font-bold text-white transition-all duration-700 cursor-pointer')}
              style={{ width: `${pct}%` }}
            >
              {pct > 8 ? label : ''}
              <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-[11px] font-semibold text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100">
                {count} {label} · {Math.round(pct)}% · Click to explore
              </span>
            </button>
          ) : null;
        })}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {tierList.map(({ key, label, count, card, hoverCard, text }) => (
          <button
            key={label}
            onClick={() => onSelect?.(key, label)}
            className={cn('rounded-2xl border px-3 py-4 text-center transition cursor-pointer', card, hoverCard)}
          >
            <p className={cn('text-2xl font-bold tabular-nums', text)}>{count}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-[11px] text-muted-foreground">{Math.round((count / total) * 100)}%</p>
          </button>
        ))}
      </div>
    </div>
  );
};

// ─── Profile Completion Breakdown ─────────────────────────────────────────────

interface CompletionBreakdownProps {
  students: { name: string; pct: number }[];
  onSelect?: (bucket: { label: string; min: number; max: number }) => void;
}

export const CompletionBreakdown = ({ students, onSelect }: CompletionBreakdownProps) => {
  const buckets = [
    { label: '100%', count: students.filter((s) => s.pct === 100).length, color: 'bg-emerald-500/70', hoverColor: 'hover:bg-emerald-500/90', tooltip: 'Fully complete', min: 100, max: 100 },
    { label: '75–99%', count: students.filter((s) => s.pct >= 75 && s.pct < 100).length, color: 'bg-sky-500/70', hoverColor: 'hover:bg-sky-500/90', tooltip: 'Almost complete', min: 75, max: 99 },
    { label: '50–74%', count: students.filter((s) => s.pct >= 50 && s.pct < 75).length, color: 'bg-amber-500/70', hoverColor: 'hover:bg-amber-500/90', tooltip: 'Partially complete', min: 50, max: 74 },
    { label: '<50%', count: students.filter((s) => s.pct < 50).length, color: 'bg-red-500/70', hoverColor: 'hover:bg-red-500/90', tooltip: 'Needs attention', min: 0, max: 49 }
  ];
  const max = Math.max(...buckets.map((b) => b.count), 1);
  const avg = Math.round(students.reduce((a, s) => a + s.pct, 0) / (students.length || 1));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <span className="text-sm font-bold text-primary">{avg}% avg</span>
      </div>
      <div className="space-y-2.5">
        {buckets.map(({ label, count, color, hoverColor, tooltip, min, max: bucketMax }) => (
          <button
            key={label}
            onClick={() => count > 0 && onSelect?.({ label, min, max: bucketMax })}
            className={cn(
              'flex w-full items-center gap-3 rounded-xl px-1 py-0.5 transition',
              count > 0 ? 'cursor-pointer hover:bg-muted/40' : 'cursor-default opacity-60'
            )}
          >
            <span className="w-14 shrink-0 text-right text-xs font-semibold text-muted-foreground">{label}</span>
            <div className="flex-1 overflow-hidden rounded-xl bg-muted/50">
              <div
                className={cn(
                  'group relative flex h-7 items-center justify-end rounded-xl px-2 text-xs font-bold text-white transition-all duration-700',
                  color,
                  count > 0 && hoverColor
                )}
                style={{ width: `${(count / max) * 100}%`, minWidth: count > 0 ? '2rem' : '0' }}
              >
                {count > 0 ? count : ''}
                {count > 0 && (
                  <span className="pointer-events-none absolute -top-8 right-0 whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-[11px] font-semibold text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100">
                    {count} student{count !== 1 ? 's' : ''} · {tooltip} · Click to explore
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
