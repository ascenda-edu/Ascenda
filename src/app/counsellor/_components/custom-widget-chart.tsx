'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  aggregateCustomWidget,
  type CustomWidgetBucket,
  type CustomWidgetDef
} from '@/lib/counsellor/custom-widgets';
import type { CounsellorStudent } from '@/lib/counsellor/types';
import { CHART_ACCENT, chartPaletteAt } from './chart-palette';

interface CustomWidgetChartProps {
  def: CustomWidgetDef;
  students: CounsellorStudent[];
  /** Omit (e.g. in the builder preview) to render non-interactive. */
  onSelect?: (bucket: CustomWidgetBucket) => void;
}

export const CustomWidgetChart = ({ def, students, onSelect }: CustomWidgetChartProps) => {
  const result = useMemo(() => aggregateCustomWidget(def, students), [def, students]);

  if (!result) {
    return (
      <p className="text-xs text-muted-foreground">
        This widget&rsquo;s data source is no longer available. Remove it and create a new one.
      </p>
    );
  }

  const { buckets, total, rowTotal, unitSingular, unitPlural } = result;

  if (total === 0) {
    return (
      <div className="flex h-28 items-center justify-center rounded-2xl border border-dashed border-border/60 text-xs text-muted-foreground">
        No {unitPlural} to show yet
      </div>
    );
  }

  const interactive = Boolean(onSelect);
  const unitFor = (count: number) => (count === 1 ? unitSingular : unitPlural);
  // Displayed percentages divide by rows counted, not bucket-count sum — for
  // multi-label dimensions (risk flags) a bucket can legitimately reach 100%.
  const pctOf = (count: number) => Math.round((count / rowTotal) * 100);

  const tooltip = (bucket: CustomWidgetBucket) => (
    <span className="pointer-events-none absolute -top-8 right-0 whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-[0.6875rem] font-semibold text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
      {bucket.count} {unitFor(bucket.count)} · {pctOf(bucket.count)}%{interactive ? ' · Click to explore' : ''}
    </span>
  );

  if (def.viz === 'bars') {
    const max = Math.max(...buckets.map((b) => b.count), 1);
    return (
      <div className="space-y-2.5">
        {buckets.map((bucket) => {
          // One accent: the row label to the left identifies each bar. The ramp is
          // only for stacked segments, where separation inside one bar is required.
          const colors = CHART_ACCENT;
          const clickable = interactive && bucket.count > 0;
          return (
            <button
              key={bucket.key}
              onClick={() => clickable && onSelect?.(bucket)}
              className={cn(
                'group flex w-full items-center gap-3 rounded-xl px-1 py-0.5 transition',
                clickable ? 'cursor-pointer hover:bg-muted/40' : 'cursor-default',
                bucket.count === 0 && 'opacity-60'
              )}
            >
              <span className="w-28 shrink-0 truncate text-right text-xs text-muted-foreground">{bucket.label}</span>
              {/* The fill carries its own rounded-xl, so clipping here is redundant —
                  and it used to swallow the hover tooltip. */}
              <div className="flex-1 rounded-xl bg-muted/50">
                <div
                  className={cn(
                    'group relative h-7 rounded-xl transition-[width,background-color] duration-700',
                    colors.bar,
                    clickable && colors.barHover
                  )}
                  style={{ width: `${(bucket.count / max) * 100}%`, minWidth: bucket.count > 0 ? '0.5rem' : '0' }}
                >
                  {bucket.count > 0 && tooltip(bucket)}
                </div>
              </div>
              <span className="w-8 shrink-0 text-right text-xs font-bold tabular-nums text-foreground">
                {bucket.count}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  if (def.viz === 'stacked') {
    return (
      <div className="space-y-4">
        {/* No overflow-hidden: it clipped the tooltips. Segments round their own outer corners. */}
        <div className="flex h-10 rounded-2xl border border-border/50">
          {buckets.map((bucket, idx) => {
            const pct = (bucket.count / total) * 100;
            if (pct <= 0) return null;
            const colors = chartPaletteAt(idx);
            return (
              <button
                key={bucket.key}
                onClick={() => onSelect?.(bucket)}
                aria-label={`${bucket.label}: ${bucket.count} ${unitFor(bucket.count)}, ${pctOf(bucket.count)}%`}
                className={cn(
                  // ring-2 ring-card is the 2px surface gap between segments. Adjacent
                  // ramp steps are only ~1.4:1 apart, so the gap — not the colour
                  // delta — is what keeps a monochrome stack readable. Don't remove it.
                  'group relative flex min-w-0 items-center justify-center transition-[width,background-color] duration-700 first:rounded-l-2xl last:rounded-r-2xl ring-2 ring-card',
                  colors.bar,
                  interactive ? cn(colors.barHover, 'cursor-pointer') : 'cursor-default'
                )}
                style={{ width: `${pct}%` }}
              >
                <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-label font-semibold text-background opacity-0 shadow-e-2 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  {bucket.count} {unitFor(bucket.count)} · {pctOf(bucket.count)}%{interactive ? ' · Click to explore' : ''}
                </span>
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {buckets.map((bucket, idx) => {
            const colors = chartPaletteAt(idx);
            const clickable = interactive && bucket.count > 0;
            return (
              <button
                key={bucket.key}
                onClick={() => clickable && onSelect?.(bucket)}
                className={cn(
                  'rounded-2xl border px-3 py-3 text-center transition',
                  colors.card,
                  clickable ? cn(colors.cardHover, 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md') : 'cursor-default'
                )}
              >
                <p className={cn('text-xl font-bold tabular-nums', colors.text)}>{bucket.count}</p>
                <p className="truncate text-xs text-muted-foreground">{bucket.label}</p>
                <p className="text-[0.6875rem] text-muted-foreground">{pctOf(bucket.count)}%</p>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // kpi
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {buckets.map((bucket, idx) => {
        const colors = chartPaletteAt(idx);
        const clickable = interactive && bucket.count > 0;
        return (
          <button
            key={bucket.key}
            onClick={() => clickable && onSelect?.(bucket)}
            className={cn(
              'rounded-2xl border px-4 py-4 text-left transition',
              colors.card,
              clickable ? cn(colors.cardHover, 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md') : 'cursor-default'
            )}
          >
            <p className={cn('text-lg font-bold tabular-nums', colors.text)}>{bucket.count}</p>
            <p className="truncate text-xs font-semibold text-foreground">{bucket.label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {pctOf(bucket.count)}% of {unitPlural}
            </p>
          </button>
        );
      })}
    </div>
  );
};
