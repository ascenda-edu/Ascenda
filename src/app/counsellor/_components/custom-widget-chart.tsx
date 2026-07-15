'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  aggregateCustomWidget,
  type CustomWidgetBucket,
  type CustomWidgetDef
} from '@/lib/counsellor/custom-widgets';
import type { CounsellorStudent } from '@/lib/counsellor/types';
import { chartPaletteAt } from './chart-palette';

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
    <span className="pointer-events-none absolute -top-8 right-0 whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-[11px] font-semibold text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100">
      {bucket.count} {unitFor(bucket.count)} · {pctOf(bucket.count)}%{interactive ? ' · Click to explore' : ''}
    </span>
  );

  if (def.viz === 'bars') {
    const max = Math.max(...buckets.map((b) => b.count), 1);
    return (
      <div className="space-y-2.5">
        {buckets.map((bucket, idx) => {
          const colors = chartPaletteAt(idx);
          const clickable = interactive && bucket.count > 0;
          return (
            <button
              key={bucket.key}
              onClick={() => clickable && onSelect?.(bucket)}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl px-1 py-0.5 transition',
                clickable ? 'cursor-pointer hover:bg-muted/40' : 'cursor-default',
                bucket.count === 0 && 'opacity-60'
              )}
            >
              <span className="w-28 shrink-0 truncate text-right text-xs text-muted-foreground">{bucket.label}</span>
              <div className="flex-1 overflow-hidden rounded-xl bg-muted/50">
                <div
                  className={cn(
                    'group relative flex h-7 items-center justify-end rounded-xl px-2 text-xs font-bold text-white transition-all duration-700',
                    colors.bar,
                    clickable && colors.barHover
                  )}
                  style={{ width: `${(bucket.count / max) * 100}%`, minWidth: bucket.count > 0 ? '2rem' : '0' }}
                >
                  {bucket.count > 0 ? bucket.count : ''}
                  {bucket.count > 0 && tooltip(bucket)}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  if (def.viz === 'stacked') {
    return (
      <div className="space-y-4">
        <div className="flex h-10 overflow-hidden rounded-2xl border border-border/50">
          {buckets.map((bucket, idx) => {
            const pct = (bucket.count / total) * 100;
            if (pct <= 0) return null;
            const colors = chartPaletteAt(idx);
            return (
              <button
                key={bucket.key}
                onClick={() => onSelect?.(bucket)}
                className={cn(
                  'group relative flex min-w-0 items-center justify-center text-xs font-bold text-white transition-all duration-700',
                  colors.bar,
                  interactive ? cn(colors.barHover, 'cursor-pointer') : 'cursor-default'
                )}
                style={{ width: `${pct}%` }}
              >
                {pct > 12 && <span className="truncate px-1">{bucket.label}</span>}
                <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-[11px] font-semibold text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100">
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
                <p className="text-[11px] text-muted-foreground">{pctOf(bucket.count)}%</p>
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
