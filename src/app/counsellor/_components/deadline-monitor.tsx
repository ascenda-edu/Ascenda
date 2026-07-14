'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Clock, CalendarDays, AlertTriangle, CheckCircle2, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseLocalDate } from '@/lib/utils/dates';

interface DeadlineEntry {
  id: string;
  university: string;
  program: string;
  date: string;
  type: string;
  studentId: string;
  studentName: string;
  studentFlag: string;
  daysUntil: number;
}

interface DeadlineMonitorProps {
  deadlines: DeadlineEntry[];
}

const TYPE_LABELS: Record<string, string> = {
  early_decision: 'Early Decision',
  regular: 'Regular',
  scholarship: 'Scholarship',
  interview: 'Interview'
};

const TYPE_COLORS: Record<string, string> = {
  early_decision: 'border-violet-200/60 bg-violet-500/10 text-violet-700 dark:text-violet-400',
  regular: 'border-sky-200/60 bg-sky-500/10 text-sky-700 dark:text-sky-400',
  scholarship: 'border-amber-200/60 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  interview: 'border-emerald-200/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
};

type UrgencyGroup = 'overdue' | 'this-week' | 'this-month' | 'future';
type TypeFilter = 'all' | 'early_decision' | 'regular' | 'scholarship' | 'interview';

function getUrgency(days: number): UrgencyGroup {
  if (days < 0) return 'overdue';
  if (days <= 7) return 'this-week';
  if (days <= 30) return 'this-month';
  return 'future';
}

const URGENCY_CONFIG: Record<UrgencyGroup, { label: string; icon: typeof AlertTriangle; headerColor: string; dotColor: string }> = {
  overdue: { label: 'Overdue', icon: AlertTriangle, headerColor: 'text-red-600', dotColor: 'bg-red-500' },
  'this-week': { label: 'This Week', icon: Clock, headerColor: 'text-amber-600', dotColor: 'bg-amber-500' },
  'this-month': { label: 'This Month', icon: CalendarDays, headerColor: 'text-sky-600', dotColor: 'bg-sky-500' },
  future: { label: 'Upcoming', icon: CalendarDays, headerColor: 'text-muted-foreground', dotColor: 'bg-muted-foreground' }
};

function formatDate(iso: string) {
  return parseLocalDate(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function urgencyBadge(days: number) {
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, cls: 'text-red-600 bg-red-500/10 border-red-200/50' };
  if (days === 0) return { text: 'Due today', cls: 'text-red-600 bg-red-500/10 border-red-200/50' };
  if (days <= 3) return { text: `${days}d left`, cls: 'text-red-500 bg-red-500/10 border-red-200/50' };
  if (days <= 7) return { text: `${days}d left`, cls: 'text-amber-600 bg-amber-500/10 border-amber-200/50' };
  return { text: `${days}d`, cls: 'text-muted-foreground bg-muted/40 border-border' };
}

export const DeadlineMonitor = ({ deadlines }: DeadlineMonitorProps) => {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [studentFilter, setStudentFilter] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<UrgencyGroup>>(new Set());

  const filtered = deadlines.filter((d) => {
    if (typeFilter !== 'all' && d.type !== typeFilter) return false;
    if (studentFilter && !d.studentName.toLowerCase().includes(studentFilter.toLowerCase())) return false;
    return true;
  });

  const groups: Record<UrgencyGroup, DeadlineEntry[]> = {
    overdue: [],
    'this-week': [],
    'this-month': [],
    future: []
  };
  filtered.forEach((d) => groups[getUrgency(d.daysUntil)].push(d));

  const toggleGroup = (g: UrgencyGroup) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });
  };

  return (
    <div className="space-y-5">
      {/* Filter bar */}
      <div className="panel flex flex-col gap-3 rounded-2xl px-4 py-3 sm:flex-row sm:items-center">
        <label htmlFor="deadline-monitor-search" className="sr-only">
          Filter by student name
        </label>
        <input
          id="deadline-monitor-search"
          type="text"
          placeholder="Filter by student name…"
          value={studentFilter}
          onChange={(e) => setStudentFilter(e.target.value)}
          className="flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <div className="flex items-center gap-1 rounded-xl border border-border bg-background p-1 shadow-sm">
          {(['all', 'early_decision', 'regular', 'scholarship', 'interview'] as TypeFilter[]).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              aria-pressed={typeFilter === t}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition',
                typeFilter === t
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t === 'all' ? 'All' : TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        <span className="shrink-0 text-sm text-muted-foreground">{filtered.length} deadline{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Groups */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-border bg-muted/40 py-16 text-center">
          <CheckCircle2 className="mb-3 h-8 w-8 text-emerald-500" />
          <p className="font-semibold text-foreground">No deadlines match your filters</p>
          <p className="mt-1 text-sm text-muted-foreground">Try adjusting your filter criteria.</p>
        </div>
      ) : (
        (['overdue', 'this-week', 'this-month', 'future'] as UrgencyGroup[]).map((group) => {
          const items = groups[group];
          if (items.length === 0) return null;
          const cfg = URGENCY_CONFIG[group];
          const Icon = cfg.icon;
          const collapsed = collapsedGroups.has(group);

          return (
            <div key={group} className="surface-card surface-card--static space-y-3">
              {/* Group header */}
              <button
                onClick={() => toggleGroup(group)}
                className="sticky top-0 z-10 flex w-full items-center justify-between gap-3 rounded-t-[20px] bg-card/90 px-5 py-2 backdrop-blur-sm -mx-5"
              >
                <div className="flex items-center gap-2">
                  <span className={cn('h-2.5 w-2.5 rounded-full', cfg.dotColor)} />
                  <Icon className={cn('h-4 w-4', cfg.headerColor)} />
                  <span className={cn('font-semibold', cfg.headerColor)}>{cfg.label}</span>
                  <span className="rounded-full bg-muted/60 px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                    {items.length}
                  </span>
                </div>
                <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition', collapsed && 'rotate-180')} />
              </button>

              {/* Items */}
              {!collapsed && (
                <div className="space-y-2">
                  {items.map((d) => {
                    const badge = urgencyBadge(d.daysUntil);
                    const typeCfg = TYPE_COLORS[d.type] ?? 'border-border bg-muted/40 text-muted-foreground';
                    return (
                      <Link
                        key={d.id}
                        href={`/counsellor/students/${d.studentId}`}
                        className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-background/60 px-4 py-3 transition hover:bg-muted/40 sm:flex-row sm:items-center sm:gap-4"
                      >
                        {/* Days badge */}
                        <span className={cn('flex h-8 w-16 shrink-0 items-center justify-center rounded-xl border text-xs font-bold', badge.cls)}>
                          {badge.text}
                        </span>

                        {/* University + program */}
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <p className="truncate font-semibold text-foreground">{d.university}</p>
                          <p className="truncate text-xs text-muted-foreground">{d.program}</p>
                        </div>

                        {/* Student */}
                        <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                          <span role="img" aria-label={`${d.studentName}'s flag`}>{d.studentFlag}</span>
                          <span className="truncate">{d.studentName}</span>
                        </div>

                        {/* Type + date */}
                        <div className="flex flex-col items-end gap-1">
                          <span className={cn('rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', typeCfg)}>
                            {TYPE_LABELS[d.type] ?? d.type}
                          </span>
                          <span className="text-xs text-muted-foreground">{formatDate(d.date)}</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};
