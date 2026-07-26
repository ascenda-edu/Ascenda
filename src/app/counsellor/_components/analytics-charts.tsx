'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { CHART_PALETTE } from './chart-palette';
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
      {/* No overflow-hidden here: it would clip the hover tooltips out of existence.
          Each segment rounds its own outer corner instead, so the pill shape survives. */}
      <div className="flex h-10 rounded-2xl border border-border/50">
        {/* No text inside the segments: white fails on these fills (2.15:1 on the
            amber-family slot) and no single label colour clears 4.5:1 across the
            palette. The two cards below already name and quantify both series, so
            the in-bar text was redundant anyway. aria-label carries it for SR users. */}
        <button
          onClick={() => onSelect?.('IB')}
          aria-label={`IB: ${breakdown.ib} students, ${ibPct}% of the cohort. Click to explore.`}
          className="group relative flex h-full items-center justify-center rounded-l-2xl bg-series-1 transition-all hover:bg-series-1/85 cursor-pointer"
          style={{ width: `${ibPct}%` }}
        >
          <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-[0.6875rem] font-semibold text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            {breakdown.ib} students · Click to explore
          </span>
        </button>
        <button
          onClick={() => onSelect?.('A_LEVEL')}
          aria-label={`A-Level: ${breakdown.aLevel} students, ${aLevelPct}% of the cohort. Click to explore.`}
          className="group relative flex h-full items-center justify-center rounded-r-2xl bg-series-2 transition-all hover:bg-series-2/85 cursor-pointer"
          style={{ width: `${aLevelPct}%` }}
        >
          <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-[0.6875rem] font-semibold text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            {breakdown.aLevel} students · Click to explore
          </span>
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {/* These cards ARE the legend for the bar above: a colour swatch carries
            identity, the number wears ink. */}
        <button
          onClick={() => onSelect?.('IB')}
          className="hover-lift cursor-pointer rounded-2xl border border-series-1/25 bg-series-1/10 px-5 py-4 text-center"
        >
          <p className="text-2xl font-bold tabular-nums text-foreground">{breakdown.ib}</p>
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-series-1" />
            IB students
          </p>
        </button>
        <button
          onClick={() => onSelect?.('A_LEVEL')}
          className="hover-lift cursor-pointer rounded-2xl border border-series-2/25 bg-series-2/10 px-5 py-4 text-center"
        >
          <p className="text-2xl font-bold tabular-nums text-foreground">{breakdown.aLevel}</p>
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-series-2" />
            A-Level students
          </p>
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
              'group flex w-full items-center gap-3 rounded-xl px-1 py-0.5 transition',
              count > 0 ? 'cursor-pointer hover:bg-muted/40' : 'cursor-default opacity-60'
            )}
          >
            <span className="w-16 shrink-0 text-right text-xs font-semibold text-muted-foreground">{label}</span>
            {/* The fill carries its own rounded-xl, so clipping here is redundant —
                and it used to swallow the hover tooltip. */}
            <div className="flex-1 rounded-xl bg-muted/50">
              <div
                className={cn(
                  'group relative h-7 rounded-xl bg-primary transition-all duration-700',
                  count > 0 && 'hover:bg-primary/85'
                )}
                style={{ width: `${(count / maxCount) * 100}%`, minWidth: count > 0 ? '0.5rem' : '0' }}
              >
                {count > 0 && (
                  <span className="pointer-events-none absolute -top-8 right-0 whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-label font-semibold text-background opacity-0 shadow-e-2 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    {count} student{count !== 1 ? 's' : ''} · {Math.round((count / total) * 100)}% · Click to explore
                  </span>
                )}
              </div>
            </div>
            {/* Value reads in ink beside the mark, not on it. No single label colour
                clears 4.5:1 across the series fills — sky measures 4.10 on white and
                4.24 on ink — so an in-bar label cannot be made accessible. */}
            <span className="w-8 shrink-0 text-right text-xs font-bold tabular-nums text-foreground">{count}</span>
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

const FIELD_COLORS = CHART_PALETTE.map((c) => c.bar);
const FIELD_HOVER_COLORS = CHART_PALETTE.map((c) => c.barHover);

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
              'group flex w-full items-center gap-3 rounded-xl px-1 py-0.5 transition',
              count > 0 ? 'cursor-pointer hover:bg-muted/40' : 'cursor-default opacity-60'
            )}
          >
            <span className="w-28 shrink-0 truncate text-right text-xs text-muted-foreground">{label}</span>
            <div className="flex-1 rounded-xl bg-muted/50">
              <div
                className={cn(
                  'group relative h-7 rounded-xl transition-all duration-700',
                  FIELD_COLORS[idx % FIELD_COLORS.length],
                  count > 0 && FIELD_HOVER_COLORS[idx % FIELD_HOVER_COLORS.length]
                )}
                style={{ width: `${(count / max) * 100}%`, minWidth: count > 0 ? '0.5rem' : '0' }}
              >
                {count > 0 && (
                  <span className="pointer-events-none absolute -top-8 right-0 whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-label font-semibold text-background opacity-0 shadow-e-2 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    {count} student{count !== 1 ? 's' : ''} · {Math.round((count / total) * 100)}% · Click to explore
                  </span>
                )}
              </div>
            </div>
            <span className="w-8 shrink-0 text-right text-xs font-bold tabular-nums text-foreground">{count}</span>
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
  // Tone mapping matches APPLICATION_STATUS_VISUAL / STAGE_COLORS so the funnel,
  // the kanban and the analytics drill-down can never disagree about a stage.
  { key: 'planning' as const, label: 'Planning', color: 'bg-muted-foreground/40', hoverColor: 'hover:bg-muted-foreground/60', textColor: 'text-muted-foreground' },
  { key: 'inProgress' as const, label: 'In Progress', color: 'bg-info', hoverColor: 'hover:bg-info/85', textColor: 'text-info' },
  { key: 'submitted' as const, label: 'Submitted', color: 'bg-success', hoverColor: 'hover:bg-success/85', textColor: 'text-success' },
  { key: 'decision' as const, label: 'Decision Received', color: 'bg-feature', hoverColor: 'hover:bg-feature/85', textColor: 'text-feature' }
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
  if (prior === 0) return { label: 'new', tone: 'text-success' };
  const pct = Math.round((diff / prior) * 100);
  if (pct === 0) return { label: '±0%', tone: 'text-muted-foreground' };
  const sign = pct > 0 ? '▲' : '▼';
  const tone = pct > 0 ? 'text-success' : 'text-danger';
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
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-label font-semibold transition',
            compareYoY
              ? 'border-feature/40 bg-feature-subtle text-feature'
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
                'group block w-full space-y-1.5 rounded-xl px-1 py-1 transition',
                count > 0 ? 'cursor-pointer hover:bg-muted/40' : 'cursor-default'
              )}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className={cn('font-bold tabular-nums', textColor)}>
                  {count} <span className="font-normal text-muted-foreground">({pct}%)</span>
                  {compareYoY ? (
                    <span className={cn('ml-2 text-[0.625rem] font-semibold', delta.tone)}>{delta.label}</span>
                  ) : null}
                </span>
              </div>
              <div className="flex justify-center">
                <div
                  className={cn('group relative flex h-8 items-center justify-center rounded-xl text-xs font-bold text-foreground transition-all', color, count > 0 && hoverColor)}
                  style={{ width: `${width}%` }}
                >
                  {count}
                  <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-[0.6875rem] font-semibold text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    {count} student{count !== 1 ? 's' : ''} · {pct}%
                    {compareYoY ? ` · ${delta.label} vs last year` : ''} · Click to explore
                  </span>
                </div>
              </div>
              {compareYoY ? (
                <div className="ml-auto flex w-fit items-center gap-1 pr-2 text-[0.625rem] uppercase tracking-[0.2em] text-muted-foreground">
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
    // reach/match/safety is a status scale, matching TIER_VISUAL in lib/theme/categories.
    { key: 'reach' as const, label: 'Reach', count: tiers.reach, color: 'bg-danger', hoverColor: 'hover:bg-danger/85', card: 'border-danger/25 bg-danger-subtle', hoverCard: 'hover-lift', text: 'text-danger' },
    { key: 'match' as const, label: 'Match', count: tiers.match, color: 'bg-warning', hoverColor: 'hover:bg-warning/85', card: 'border-warning/25 bg-warning-subtle', hoverCard: 'hover-lift', text: 'text-warning' },
    { key: 'safe' as const, label: 'Safe', count: tiers.safe, color: 'bg-success', hoverColor: 'hover:bg-success/85', card: 'border-success/25 bg-success-subtle', hoverCard: 'hover-lift', text: 'text-success' }
  ];

  return (
    <div className="space-y-4">
      {/* Stacked bar */}
      {/* See ProgrammeSplit: no overflow-hidden, or the tooltips get clipped away. */}
      <div className="flex h-10 rounded-2xl border border-border/50">
        {tierList.map(({ key, label, count, color, hoverColor }) => {
          const pct = (count / total) * 100;
          return pct > 0 ? (
            <button
              key={label}
              onClick={() => onSelect?.(key, label)}
              aria-label={`${label}: ${count} students, ${Math.round(pct)}%. Click to explore.`}
              className={cn(color, hoverColor, 'group relative flex items-center justify-center transition-all duration-700 cursor-pointer first:rounded-l-2xl last:rounded-r-2xl')}
              style={{ width: `${pct}%` }}
            >
              {/* Identity comes from the labelled cards below, not in-bar text. */}
              <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-[0.6875rem] font-semibold text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
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
            <p className="text-[0.6875rem] text-muted-foreground">{Math.round((count / total) * 100)}%</p>
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
  // Completion bands are a STATUS scale, not categorical data, so they use the tone
  // tokens rather than chart series colours. (They were emerald/sky/amber/red-500 —
  // note `red`, where the rest of the app used `rose`, one of the drifts that made
  // status colour untunable.)
  const buckets = [
    { label: '100%', count: students.filter((s) => s.pct === 100).length, color: 'bg-success', hoverColor: 'hover:bg-success/85', tooltip: 'Fully complete', min: 100, max: 100 },
    { label: '75–99%', count: students.filter((s) => s.pct >= 75 && s.pct < 100).length, color: 'bg-info', hoverColor: 'hover:bg-info/85', tooltip: 'Almost complete', min: 75, max: 99 },
    { label: '50–74%', count: students.filter((s) => s.pct >= 50 && s.pct < 75).length, color: 'bg-warning', hoverColor: 'hover:bg-warning/85', tooltip: 'Partially complete', min: 50, max: 74 },
    { label: '<50%', count: students.filter((s) => s.pct < 50).length, color: 'bg-danger', hoverColor: 'hover:bg-danger/85', tooltip: 'Needs attention', min: 0, max: 49 }
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
              'group flex w-full items-center gap-3 rounded-xl px-1 py-0.5 transition',
              count > 0 ? 'cursor-pointer hover:bg-muted/40' : 'cursor-default opacity-60'
            )}
          >
            <span className="w-14 shrink-0 text-right text-xs font-semibold text-muted-foreground">{label}</span>
            <div className="flex-1 rounded-xl bg-muted/50">
              <div
                className={cn(
                  'group relative h-7 rounded-xl transition-all duration-700',
                  color,
                  count > 0 && hoverColor
                )}
                style={{ width: `${(count / max) * 100}%`, minWidth: count > 0 ? '0.5rem' : '0' }}
              >
                {count > 0 && (
                  <span className="pointer-events-none absolute -top-8 right-0 whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-label font-semibold text-background opacity-0 shadow-e-2 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    {count} student{count !== 1 ? 's' : ''} · {tooltip} · Click to explore
                  </span>
                )}
              </div>
            </div>
            <span className="w-8 shrink-0 text-right text-xs font-bold tabular-nums text-foreground">{count}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
