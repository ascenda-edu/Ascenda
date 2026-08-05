'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * Average progress across the toolbox tools, drawn as a ring.
 *
 * Brand, at every value. The stroke and the centred figure used to run the same
 * three-way ternary — `>= 80 ? success : >= 50 ? warning : danger` — which read an
 * average as a verdict: a student halfway through the tools was told in the
 * overdue colour that they were behind on work nobody had asked them to do. A
 * percentage is a quantity; the arc length is the encoding (brand.md §5, Data).
 *
 * Shape copied from `dashboard/hub/profile-progress-card.tsx`: `stroke-primary`
 * arc on a `stroke-muted` track. Deliberately NOT copied from it: that card flips
 * to `stroke-success` at 100%. Per brand.md §4 rule 3, `success` is for terminal
 * positive outcomes and "done" is silent — and unlike a profile, "all five tools
 * touched" is not an outcome at all.
 */
export function ToolboxProgressRing({ value }: { value: number }) {
  const circumference = 2 * Math.PI * 28;
  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64" role="img" aria-label={`${value}% progress`}>
        {/* ONE interpolated child, not `{value}% progress`. <title> is parsed as raw text,
          * so the comment React normally emits between two adjacent text children is
          * swallowed — the server shipped "67% progress" as a single text node while the
          * client hydrated two, which threw "Hydration failed" on every /toolbox load. */}
        <title>{`${value}% progress`}</title>
        <circle cx="32" cy="32" r="28" fill="none" strokeWidth="4" className="stroke-muted" />
        <motion.circle
          cx="32" cy="32" r="28" fill="none" strokeWidth="4" strokeLinecap="round"
          className="stroke-primary"
          initial={{ strokeDasharray: `0 ${circumference}` }}
          animate={{ strokeDasharray: `${(value / 100) * circumference} ${circumference}` }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.span
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-sm font-bold tabular-nums text-foreground"
        >
          {value}%
        </motion.span>
      </div>
    </div>
  );
}

/**
 * Days to the nearest deadline. The tone ladder here STAYS — this is the case the
 * ring above is not. A date is not a quantity you are filling up, it is an
 * obligation with a fixed end, so "3 days left" genuinely asks the reader to act
 * now and `danger`/`warning` are saying exactly what they mean (brand.md §4:
 * `danger` = urgent/overdue, `warning` = act soon). `DEADLINE_VISUAL` in
 * lib/theme/categories bands the same axis the same way at day 7.
 */
export function ToolboxCountdown({ days }: { days: number }) {
  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={cn(
        'flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl border',
        days <= 3 ? 'bg-danger-subtle border-danger/30' : days <= 7 ? 'bg-warning-subtle border-warning/30' : 'bg-primary/10 border-primary/30'
      )}
    >
      <span className={cn(
        'text-lg font-bold leading-none tabular-nums',
        days <= 3 ? 'text-danger' : days <= 7 ? 'text-warning' : 'text-primary-ink'
      )}>
        {days}
      </span>
      <span className="text-label font-semibold text-muted-foreground mt-0.5">
        {days === 1 ? 'day' : 'days'}
      </span>
    </motion.div>
  );
}
