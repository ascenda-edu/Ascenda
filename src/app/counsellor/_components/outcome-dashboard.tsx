'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, Clock, MinusCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { stagger, cardFade } from '@/lib/motion';
import type { OutcomeResult, MatchTier, CounsellorOutcome } from '@/lib/data/counsellor-dummy-data';
import type { OutcomeStats } from '@/lib/counsellor/data';

const RESULT_CONFIG: Record<OutcomeResult, { icon: typeof CheckCircle2; color: string; bg: string; label: string }> = {
  accepted: { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-500/10', label: 'Accepted' },
  rejected: { icon: XCircle, color: 'text-rose-600', bg: 'bg-rose-500/10', label: 'Rejected' },
  waitlisted: { icon: Clock, color: 'text-amber-600', bg: 'bg-amber-500/10', label: 'Waitlisted' },
  pending: { icon: Clock, color: 'text-sky-600', bg: 'bg-sky-500/10', label: 'Pending' },
  withdrawn: { icon: MinusCircle, color: 'text-muted-foreground', bg: 'bg-muted/30', label: 'Withdrawn' },
};

const TIER_COLORS: Record<MatchTier, string> = {
  Reach: 'text-rose-600 bg-rose-500/10',
  Match: 'text-amber-600 bg-amber-500/10',
  Safe: 'text-emerald-600 bg-emerald-500/10',
};

const dateFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

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
      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {([
          { label: 'Total', value: stats.total, color: 'text-foreground' },
          { label: 'Accepted', value: stats.accepted, color: 'text-emerald-600' },
          { label: 'Rejected', value: stats.rejected, color: 'text-rose-600' },
          { label: 'Waitlisted', value: stats.waitlisted, color: 'text-amber-600' },
          { label: 'Pending', value: stats.pending, color: 'text-sky-600' },
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
            <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="6" className="text-muted/20" />
            <motion.circle
              cx="40" cy="40" r="34" fill="none" strokeWidth="6" strokeLinecap="round"
              className={cn(stats.acceptanceRate >= 50 ? 'stroke-emerald-500' : 'stroke-amber-500')}
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
          <p className="text-xs text-muted-foreground">{stats.accepted} accepted out of {stats.total - stats.pending} decided applications</p>
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
            <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
              <motion.div
                className={cn('h-full rounded-full', rate >= 50 ? 'bg-emerald-500' : rate >= 25 ? 'bg-amber-500' : 'bg-rose-500')}
                initial={{ width: 0 }} animate={{ width: `${rate}%` }} transition={{ duration: 0.6 }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{accepted} of {total} accepted</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Search student..."
          value={filterStudent}
          onChange={(e) => setFilterStudent(e.target.value)}
          className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring w-44"
        />
        <button
          onClick={() => setFilterResult(null)}
          className={cn('rounded-full px-3 py-1 text-xs font-medium transition-colors', !filterResult ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:bg-muted')}
        >All</button>
        {(['accepted', 'rejected', 'waitlisted', 'pending'] as const).map((r) => {
          const cfg = RESULT_CONFIG[r];
          return (
            <button
              key={r}
              onClick={() => setFilterResult(filterResult === r ? null : r)}
              className={cn('rounded-full px-3 py-1 text-xs font-medium transition-colors', filterResult === r ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:bg-muted')}
            >{cfg.label}</button>
          );
        })}
      </div>

      {/* Results table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 pr-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Student</th>
              <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">University</th>
              <th className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Programme</th>
              <th className="text-center py-2 px-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Result</th>
              <th className="text-center py-2 px-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Tier</th>
              <th className="text-left py-2 pl-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Date</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => {
              const cfg = RESULT_CONFIG[o.result];
              const Icon = cfg.icon;
              return (
                <tr key={o.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="py-2.5 pr-3 font-medium text-foreground">{o.studentName}</td>
                  <td className="py-2.5 px-3 text-muted-foreground">{o.university}</td>
                  <td className="py-2.5 px-3 text-muted-foreground text-xs">{o.program}</td>
                  <td className="py-2.5 px-3 text-center">
                    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', cfg.bg, cfg.color)}>
                      <Icon className="h-3 w-3" /> {cfg.label}
                    </span>
                    {o.conditions && <p className="text-[10px] text-muted-foreground mt-0.5">{o.conditions}</p>}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', TIER_COLORS[o.tier])}>{o.tier}</span>
                  </td>
                  <td className="py-2.5 pl-3 text-xs text-muted-foreground">
                    {o.responseDate ? dateFormatter.format(new Date(o.responseDate)) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-8">No outcomes match your filters.</p>
      )}
    </div>
  );
}
