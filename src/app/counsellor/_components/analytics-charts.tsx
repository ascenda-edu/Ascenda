'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { CHART_ACCENT } from './chart-palette';
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
      <div className="flex h-10 rounded-2xl border border-border">
        {/* Steps 1 and 4 of the ramp, not 1 and 2 — adjacent steps are only 1.32:1
            apart. The `ring-2 ring-inset ring-card` on the second segment is the 2px surface gap
            that a monochrome stack depends on to stay readable; without it the two
            indigos merge into one bar.

            No text inside the segments: no single label colour clears 4.5:1 across a
            set of fills, and the two cards below already name and quantify both
            series, so in-bar text was redundant. aria-label carries it for SR users. */}
        {/* Both guarded on > 0 and rounded via first:/last: rather than hardcoding one
            end each. With a 100%-one-programme cohort the surviving segment used to
            render full width with only ONE end rounded, so two square corners poked
            past the container's radius (the removed overflow-hidden used to hide it).
            React drops `null` children, so first:/last: land on whichever survives. */}
        {ibPct > 0 ? (
        <button
          onClick={() => onSelect?.('IB')}
          aria-label={`IB: ${breakdown.ib} students, ${ibPct}% of the cohort. Click to explore.`}
          className="group relative flex h-full items-center justify-center first:rounded-l-2xl last:rounded-r-2xl bg-series-1 transition-[width,background-color] hover:bg-series-1/85 cursor-pointer"
          style={{ width: `${ibPct}%` }}
        >
          <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-[0.6875rem] font-semibold text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            {breakdown.ib} students · Click to explore
          </span>
        </button>
        ) : null}
        {aLevelPct > 0 ? (
        <button
          onClick={() => onSelect?.('A_LEVEL')}
          aria-label={`A-Level: ${breakdown.aLevel} students, ${aLevelPct}% of the cohort. Click to explore.`}
          className="group relative z-raised flex h-full items-center justify-center first:rounded-l-2xl last:rounded-r-2xl bg-series-4 ring-2 ring-inset ring-card transition-[width,background-color] hover:bg-series-4/85 cursor-pointer"
          style={{ width: `${aLevelPct}%` }}
        >
          <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-[0.6875rem] font-semibold text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            {breakdown.aLevel} students · Click to explore
          </span>
        </button>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {/* These cards ARE the legend for the bar above: a colour swatch carries
            identity, the number wears ink. */}
        <button
          onClick={() => onSelect?.('IB')}
          className="hover-lift cursor-pointer rounded-2xl border border-series-1/30 bg-series-1/10 px-5 py-4 text-center"
        >
          <p className="text-2xl font-bold tabular-nums text-foreground">{breakdown.ib}</p>
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-series-1" />
            IB students
          </p>
        </button>
        <button
          onClick={() => onSelect?.('A_LEVEL')}
          className="hover-lift cursor-pointer rounded-2xl border border-series-4/30 bg-series-4/10 px-5 py-4 text-center"
        >
          <p className="text-2xl font-bold tabular-nums text-foreground">{breakdown.aLevel}</p>
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-series-4" />
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
              count > 0 ? 'cursor-pointer hover:bg-muted' : 'cursor-default opacity-60'
            )}
          >
            <span className="w-16 shrink-0 text-right text-xs font-semibold text-muted-foreground">{label}</span>
            {/* The fill carries its own rounded-xl, so clipping here is redundant —
                and it used to swallow the hover tooltip. */}
            <div className="flex-1 rounded-xl bg-border">
              <div
                className={cn(
                  'group relative h-7 rounded-xl bg-primary transition-[width,background-color] duration-700',
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
            {/* Value reads in ink beside the mark, not on it: no label colour clears
                4.5:1 across a set of fills, so an in-bar label can't be accessible. */}
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

// One accent for the whole chart — the row label to the left of each bar is what
// identifies it. Rotating hues here was decoration, not information.

export const FieldChart = ({ fields, onSelect }: FieldChartProps) => {
  const max = Math.max(...fields.map((f) => f.count), 1);
  const total = fields.reduce((a, f) => a + f.count, 0) || 1;

  return (
    <div className="space-y-4">
      <div className="space-y-2.5">
        {fields.map(({ key, label, count }) => (
          <button
            key={label}
            onClick={() => count > 0 && onSelect?.({ key, label })}
            className={cn(
              'group flex w-full items-center gap-3 rounded-xl px-1 py-0.5 transition',
              count > 0 ? 'cursor-pointer hover:bg-muted' : 'cursor-default opacity-60'
            )}
          >
            <span className="w-28 shrink-0 truncate text-right text-xs text-muted-foreground">{label}</span>
            <div className="flex-1 rounded-xl bg-border">
              <div
                className={cn(
                  'group relative h-7 rounded-xl transition-[width,background-color] duration-700',
                  CHART_ACCENT.bar,
                  count > 0 && CHART_ACCENT.barHover
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

// Tone mapping mirrors APPLICATION_STATUS_VISUAL / STAGE_COLORS exactly, so the
// funnel, the kanban and the drill-down can't disagree about a stage. Only the two
// stages that ask something of someone keep a hue: inProgress=warning,
// submitted=success. `planning` and `decision` are waiting states, so they are
// neutral — the bar's own label is what identifies it, and a hue that just marks a
// position in a sequence is telling the reader something they can already read.
//
// `textOnFill` is ink chosen for the fill it sits on, NOT `text-foreground`. This is
// the one chart that still prints its value inside the mark, and near-white ink on a
// bright fill measured 1.43:1 on "Submitted" in dark mode — the value was invisible.
// The neutral bars use `text-background` because `--muted-foreground` is dark in
// light mode and light in dark mode, so `background` is the token that flips with it.
const FUNNEL_STAGES = [
  { key: 'planning' as const, label: 'Planning', color: 'bg-muted-foreground', hoverColor: 'hover:bg-muted-foreground/85', textColor: 'text-muted-foreground', textOnFill: 'text-background' },
  { key: 'inProgress' as const, label: 'In Progress', color: 'bg-warning-fill', hoverColor: 'hover:bg-warning-fill/85', textColor: 'text-warning', textOnFill: 'text-warning-foreground' },
  { key: 'submitted' as const, label: 'Submitted', color: 'bg-success-fill', hoverColor: 'hover:bg-success-fill/85', textColor: 'text-success', textOnFill: 'text-success-foreground' },
  { key: 'decision' as const, label: 'Decision Received', color: 'bg-muted-foreground', hoverColor: 'hover:bg-muted-foreground/85', textColor: 'text-muted-foreground', textOnFill: 'text-background' },
  // enrolled = primary, matching APPLICATION_STATUS_VISUAL.enrolled. The terminal
  // stage of the funnel wears the brand accent rather than a sixth status hue.
  { key: 'enrolled' as const, label: 'Enrolled', color: 'bg-primary', hoverColor: 'hover:bg-primary/85', textColor: 'text-primary-ink', textOnFill: 'text-primary-foreground' }
];

// Synthetic "last year" funnel for the year-on-year comparison toggle. Builds
// off this cycle's distribution with deterministic offsets so the comparison
// numbers look credible across re-renders.
const buildPriorYearFunnel = (current: CohortStats['appFunnel']): CohortStats['appFunnel'] => ({
  planning: Math.max(0, Math.round(current.planning * 1.12)),
  inProgress: Math.max(0, Math.round(current.inProgress * 0.92)),
  submitted: Math.max(0, Math.round(current.submitted * 0.78)),
  decision: Math.max(0, Math.round(current.decision * 0.65)),
  enrolled: Math.max(0, Math.round(current.enrolled * 0.55))
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
        {/* A pressed-state toggle, not a label that swaps: it used to read
            "Hiding last year" while last year's bars were on screen, which was
            simply untrue, and with no `aria-pressed` the on/off state reached a
            screen reader only through that misleading label. Static name +
            aria-pressed is the same pattern as the inbox filter chips. */}
        <button
          type="button"
          aria-pressed={compareYoY}
          onClick={() => setCompareYoY((prev) => !prev)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-label font-semibold transition',
            compareYoY
              ? 'border-primary/60 bg-primary/10 text-primary-ink'
              : 'border-border text-muted-foreground hover:border-primary/30 hover:bg-muted hover:text-foreground'
          )}
        >
          Compare to last year
        </button>
      </div>

      <div className="space-y-3">
        {FUNNEL_STAGES.map(({ key, label, color, hoverColor, textColor, textOnFill }, idx) => {
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
                count > 0 ? 'cursor-pointer hover:bg-muted' : 'cursor-default'
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
                  className={cn('group relative flex h-8 items-center justify-center rounded-xl text-xs font-bold transition-[width,background-color]', color, textOnFill, count > 0 && hoverColor)}
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
    // The three tally CARDS below are plain surfaces, though — a tinted block is too
    // much surface for a tier that the stacked bar above has already coloured. The
    // tone stays on the count, which is the thing being read.
    { key: 'reach' as const, label: 'Reach', count: tiers.reach, color: 'bg-danger-fill', hoverColor: 'hover:bg-danger-fill/85', card: 'border-border bg-card', hoverCard: 'hover-lift', text: 'text-danger' },
    { key: 'match' as const, label: 'Match', count: tiers.match, color: 'bg-warning-fill', hoverColor: 'hover:bg-warning-fill/85', card: 'border-border bg-card', hoverCard: 'hover-lift', text: 'text-warning' },
    { key: 'safe' as const, label: 'Safe', count: tiers.safe, color: 'bg-success-fill', hoverColor: 'hover:bg-success-fill/85', card: 'border-border bg-card', hoverCard: 'hover-lift', text: 'text-success' }
  ];

  return (
    <div className="space-y-4">
      {/* Stacked bar */}
      {/* See ProgrammeSplit: no overflow-hidden, or the tooltips get clipped away. */}
      <div className="flex h-10 rounded-2xl border border-border">
        {tierList.map(({ key, label, count, color, hoverColor }) => {
          const pct = (count / total) * 100;
          return pct > 0 ? (
            <button
              key={label}
              onClick={() => onSelect?.(key, label)}
              aria-label={`${label}: ${count} students, ${Math.round(pct)}%. Click to explore.`}
              // These three are tone tokens (danger/warning/success), so they're
              // separated by hue rather than lightness — but the 2px surface gap is
              // the house rule for every segmented bar, so it applies here too.
              className={cn(color, hoverColor, 'group relative flex items-center justify-center transition-[width,background-color] duration-700 cursor-pointer first:rounded-l-2xl last:rounded-r-2xl ring-2 ring-inset ring-card')}
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
    { label: '100%', count: students.filter((s) => s.pct === 100).length, color: 'bg-success-fill', hoverColor: 'hover:bg-success-fill/85', tooltip: 'Fully complete', min: 100, max: 100 },
    { label: '75–99%', count: students.filter((s) => s.pct >= 75 && s.pct < 100).length, color: 'bg-muted-foreground', hoverColor: 'hover:bg-muted-foreground/85', tooltip: 'Almost complete', min: 75, max: 99 },
    { label: '50–74%', count: students.filter((s) => s.pct >= 50 && s.pct < 75).length, color: 'bg-warning-fill', hoverColor: 'hover:bg-warning-fill/85', tooltip: 'Partially complete', min: 50, max: 74 },
    { label: '<50%', count: students.filter((s) => s.pct < 50).length, color: 'bg-danger-fill', hoverColor: 'hover:bg-danger-fill/85', tooltip: 'Needs attention', min: 0, max: 49 }
  ];
  const max = Math.max(...buckets.map((b) => b.count), 1);
  const avg = Math.round(students.reduce((a, s) => a + s.pct, 0) / (students.length || 1));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {/* text-primary-ink, not text-primary: --primary is the FILL value. It
            happens to clear AA on a white card (4.58:1) but measures 3.88:1 on
            bg-muted, so a later surface change here would silently break it. */}
        <span className="text-sm font-bold text-primary-ink">{avg}% avg</span>
      </div>
      <div className="space-y-2.5">
        {buckets.map(({ label, count, color, hoverColor, tooltip, min, max: bucketMax }) => (
          <button
            key={label}
            onClick={() => count > 0 && onSelect?.({ label, min, max: bucketMax })}
            className={cn(
              'group flex w-full items-center gap-3 rounded-xl px-1 py-0.5 transition',
              count > 0 ? 'cursor-pointer hover:bg-muted' : 'cursor-default opacity-60'
            )}
          >
            <span className="w-14 shrink-0 text-right text-xs font-semibold text-muted-foreground">{label}</span>
            <div className="flex-1 rounded-xl bg-border">
              <div
                className={cn(
                  'group relative h-7 rounded-xl transition-[width,background-color] duration-700',
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
