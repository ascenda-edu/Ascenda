'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, Clock, MinusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OutcomeResult, MatchTier, CounsellorOutcome } from '@/lib/counsellor/types';
import type { OutcomeStats } from '@/lib/counsellor/data';
import { TIER_VISUAL, PROGRESS_FILL, PROGRESS_TRACK } from '@/lib/theme/categories';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const RESULT_CONFIG: Record<OutcomeResult, { icon: typeof CheckCircle2; color: string; bg: string; label: string }> = {
  accepted: { icon: CheckCircle2, color: 'text-success', bg: 'bg-success-subtle', label: 'Accepted' },
  rejected: { icon: XCircle, color: 'text-danger', bg: 'bg-danger-subtle', label: 'Rejected' },
  waitlisted: { icon: Clock, color: 'text-warning', bg: 'bg-warning-subtle', label: 'Waitlisted' },
  pending: { icon: Clock, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Pending' },
  withdrawn: { icon: MinusCircle, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Withdrawn' },
};

const TIER_COLORS: Record<MatchTier, string> = {
  Reach: `${TIER_VISUAL.reach.text} ${TIER_VISUAL.reach.bg}`,
  Match: `${TIER_VISUAL.match.text} ${TIER_VISUAL.match.bg}`,
  Safe: `${TIER_VISUAL.safety.text} ${TIER_VISUAL.safety.bg}`,
};

const dateFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// `Intl.DateTimeFormat.format` throws `RangeError: Invalid time value` rather
// than returning a placeholder, and an unparseable date would take this whole
// route into the error boundary — which is exactly what happened to the
// Applications list view. A truthiness check alone doesn't cover it.
const formatResponseDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date);
};

export function OutcomeDashboard({ outcomes, stats }: { outcomes: CounsellorOutcome[]; stats: OutcomeStats }) {
  const [filterResult, setFilterResult] = useState<OutcomeResult | null>(null);
  const [filterStudent, setFilterStudent] = useState('');

  const filtered = useMemo(() => {
    let result = [...outcomes];
    if (filterResult) result = result.filter((o) => o.result === filterResult);
    if (filterStudent) result = result.filter((o) => o.studentName.toLowerCase().includes(filterStudent.toLowerCase()));
    return result;
  }, [outcomes, filterResult, filterStudent]);

  // Acceptance by tier
  const tierStats = useMemo(() => {
    const tiers: MatchTier[] = ['Reach', 'Match', 'Safe'];
    return tiers.map((tier) => {
      const ofTier = outcomes.filter((o) => o.tier === tier);
      const decided = ofTier.filter((o) => o.result !== 'pending');
      const accepted = decided.filter((o) => o.result === 'accepted').length;
      return { tier, total: ofTier.length, decided: decided.length, accepted, rate: decided.length > 0 ? Math.round((accepted / decided.length) * 100) : 0 };
    });
  }, [outcomes]);

  return (
    <div className="space-y-6">
      {/* Summary stats. These five tones STAY: the colour is keyed to the result
          category (accepted / rejected / waitlisted / pending), not to the size of
          the count under it, and it is the same key `RESULT_CONFIG` uses in the
          table and the filter row below — so the tiles double as that legend.
          Nothing here bands a quantity. */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {([
          { label: 'Total', value: stats.total, color: 'text-foreground' },
          { label: 'Accepted', value: stats.accepted, color: 'text-success' },
          { label: 'Rejected', value: stats.rejected, color: 'text-danger' },
          { label: 'Waitlisted', value: stats.waitlisted, color: 'text-warning' },
          { label: 'Pending', value: stats.pending, color: 'text-muted-foreground' },
        ] as const).map((stat) => (
          <div key={stat.label} className="surface-subcard p-3 text-center">
            <p className={cn('text-xl font-bold', stat.color)}>{stat.value}</p>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Acceptance rate highlight */}
      <div className="surface-subcard p-4 flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0">
          <svg className="h-16 w-16 -rotate-90" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="6" className="text-muted" />
            {/* Brand at every value, for the same reason as the tier bars below.
                This was `>= 50 ? 'stroke-success' : 'stroke-warning'`, i.e. a
                cohort statistic being graded pass/fail at an invented 50% line —
                and the whole cohort's ring flipping colour because one more
                decision landed reads as a state change, which is the error. Note
                the /profile rings (`profile-progress-card.tsx`, `intake-rail.tsx`)
                do use `complete ? 'stroke-success' : 'stroke-primary'`, and that
                is legitimate: `success` marks a genuine terminal outcome. An
                acceptance rate never completes — there is no 100% to reach. */}
            <motion.circle
              cx="40" cy="40" r="34" fill="none" strokeWidth="6" strokeLinecap="round"
              className="stroke-primary"
              initial={{ strokeDasharray: `0 ${2 * Math.PI * 34}` }}
              animate={{ strokeDasharray: `${(stats.acceptanceRate / 100) * 2 * Math.PI * 34} ${2 * Math.PI * 34}` }}
              transition={{ duration: 1, ease: 'easeOut' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-bold text-foreground">{stats.acceptanceRate}%</span>
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Cohort Acceptance Rate</p>
          <p className="text-xs text-muted-foreground">{stats.accepted} accepted out of {stats.total - stats.pending - stats.withdrawn} decided applications</p>
        </div>
      </div>

      {/* Acceptance by tier */}
      <div className="grid gap-3 sm:grid-cols-3">
        {tierStats.map(({ tier, total, accepted, rate }) => (
          <div key={tier} className={cn('surface-subcard p-4 space-y-2')}>
            <div className="flex items-center justify-between">
              <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', TIER_COLORS[tier])}>{tier}</span>
              <span className="text-sm font-bold text-foreground">{rate}%</span>
            </div>
            {/* ONE accent for all three bars, deliberately — not the series ramp,
                and certainly not the old `>=50 success / >=25 warning / danger`
                banding, which turned an arbitrary pair of thresholds into a verdict
                (a 49% Reach acceptance rate drew olive, 50% drew green).
                An acceptance rate is a quantity like any other; the number is
                printed directly above the bar.

                Why not `chartPaletteAt(idx)`, given these three bars ARE a
                comparison set? Two reasons, and either is enough:
                  1. Identity is already carried — each bar sits under its own tier
                     pill, and chart-palette.ts's rule is that a bar chart with row
                     labels takes one accent; the ramp is reserved for STACKED or
                     SEGMENTED bars, where adjacent fills inside a single bar must
                     be told apart. These are three separate bars in three cards.
                     Walking the ramp would also double-encode the tier, which the
                     rose/amber/emerald pill beside it already encodes — and encode
                     it in a second, contradictory visual language.
                  2. Contrast. These fills sit directly on a `bg-muted` track with
                     no surface-coloured gap, and the late ramp steps are measured
                     at 2.57:1 (light) / 2.70:1 (dark) against exactly that track —
                     under the 3:1 a non-text mark needs. The ramp is only legal
                     against the CARD, which is what a segmented bar's 2px gaps
                     give it. See lib/theme/categories.ts.
                The bars are also NOT sorted by value — they are fixed in tier order
                Reach/Match/Safe — so a light→dark ramp would have implied a ranking
                the row order doesn't hold anyway. */}
            <div className={cn('h-1.5 rounded-full overflow-hidden', PROGRESS_TRACK)}>
              <motion.div
                className={cn('h-full rounded-full', PROGRESS_FILL)}
                initial={{ width: 0 }} animate={{ width: `${rate}%` }} transition={{ duration: 0.6 }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{accepted} of {total} accepted</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="outcome-dashboard-search" className="sr-only">
          Search student
        </label>
        <input
          id="outcome-dashboard-search"
          type="text"
          placeholder="Search student…"
          value={filterStudent}
          onChange={(e) => setFilterStudent(e.target.value)}
          className="form-input w-44 rounded-full px-3 py-1.5 text-xs"
        />
        <button
          onClick={() => setFilterResult(null)}
          aria-pressed={!filterResult}
          className={cn('rounded-full px-3 py-1 text-xs font-medium transition-colors', !filterResult ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-border')}
        >All</button>
        {(['accepted', 'rejected', 'waitlisted', 'pending'] as const).map((r) => {
          const cfg = RESULT_CONFIG[r];
          return (
            <button
              key={r}
              onClick={() => setFilterResult(filterResult === r ? null : r)}
              aria-pressed={filterResult === r}
              className={cn('rounded-full px-3 py-1 text-xs font-medium transition-colors', filterResult === r ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-border')}
            >{cfg.label}</button>
          );
        })}
      </div>

      {/* Results table — the `Table` primitive holds a min-width so these six
          columns scroll on a narrow viewport instead of compressing into
          slivers, which is what the bare `overflow-x-auto` here used to do. The
          card is on purpose the call site's job (see ui/table.tsx). */}
      <div className="surface-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Student</TableHead>
              <TableHead scope="col">University</TableHead>
              <TableHead scope="col">Programme</TableHead>
              <TableHead scope="col" className="text-center">Result</TableHead>
              <TableHead scope="col" className="text-center">Tier</TableHead>
              <TableHead scope="col">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((o) => {
              const cfg = RESULT_CONFIG[o.result];
              const Icon = cfg.icon;
              return (
                <TableRow key={o.id}>
                  <TableCell className="font-medium text-foreground">{o.studentName}</TableCell>
                  <TableCell className="text-muted-foreground">{o.university}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{o.program}</TableCell>
                  <TableCell className="text-center">
                    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', cfg.bg, cfg.color)}>
                      <Icon className="h-3 w-3" /> {cfg.label}
                    </span>
                    {o.conditions && <p className="text-label text-muted-foreground mt-0.5">{o.conditions}</p>}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={cn('rounded-full px-2 py-0.5 text-label font-semibold', TIER_COLORS[o.tier])}>{o.tier}</span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatResponseDate(o.responseDate)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-8">No outcomes match your filters.</p>
      )}
    </div>
  );
}
