'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Clock, CalendarDays, AlertTriangle, CheckCircle2, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseLocalDate } from '@/lib/utils/dates';
import { DEADLINE_VISUAL } from '@/lib/theme/categories';

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

/* Deadline TYPE is a category — what kind of thing this is — not an urgency. It had
   `scholarship` on the warning tone and `interview` on success, which meant a
   scholarship deadline six months out looked like something due on Friday and an
   interview looked like a completed task. Urgency is carried separately, by the
   urgency badge and the day count, and that is the only place a status hue belongs.
   Early decision keeps a brand tint because it is the one type that is genuinely
   distinguished by being binding; everything else is neutral, with the LABEL doing
   the work of telling them apart. */
const TYPE_COLORS: Record<string, string> = {
  early_decision: 'border-primary/30 bg-primary/10 text-primary-ink',
  regular: 'border-border bg-muted text-muted-foreground',
  scholarship: 'border-border bg-muted text-muted-foreground',
  interview: 'border-border bg-muted text-muted-foreground'
};

type UrgencyGroup = 'overdue' | 'this-week' | 'this-month' | 'future';
type TypeFilter = 'all' | 'early_decision' | 'regular' | 'scholarship' | 'interview';

function getUrgency(days: number): UrgencyGroup {
  if (days < 0) return 'overdue';
  if (days <= 7) return 'this-week';
  if (days <= 30) return 'this-month';
  return 'future';
}

// Colours come from DEADLINE_VISUAL (the urgency tone system of record); the icons
// stay local because this monitor's set differs from the shared one.
//
// `future` reads DEADLINE_VISUAL.later, NOT .unknown — they are different states, and
// pointing `future` at `unknown` was a mis-mapping. Both are neutral now, but the two
// mean different things and must keep reading from their own entries.
//
// Only the two groups that ask for action today keep a hue: Overdue and This Week.
// "This Month" and "Upcoming" are neutral, because the group header already says how
// far out they are and a colour there was restating the words underneath it.
const URGENCY_CONFIG: Record<UrgencyGroup, { label: string; icon: typeof AlertTriangle; headerColor: string; dotColor: string; countChip: string }> = {
  overdue: { label: 'Overdue', icon: AlertTriangle, headerColor: DEADLINE_VISUAL.overdue.text, dotColor: DEADLINE_VISUAL.overdue.bar, countChip: 'bg-danger-subtle text-danger' },
  'this-week': { label: 'This Week', icon: Clock, headerColor: DEADLINE_VISUAL['this-week'].text, dotColor: DEADLINE_VISUAL['this-week'].bar, countChip: 'bg-warning-subtle text-warning' },
  'this-month': { label: 'This Month', icon: CalendarDays, headerColor: DEADLINE_VISUAL['this-month'].text, dotColor: DEADLINE_VISUAL['this-month'].bar, countChip: 'bg-muted text-muted-foreground' },
  future: { label: 'Upcoming', icon: CalendarDays, headerColor: DEADLINE_VISUAL.later.text, dotColor: DEADLINE_VISUAL.later.bar, countChip: 'bg-muted text-muted-foreground' }
};

function formatDate(iso: string) {
  return parseLocalDate(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function urgencyBadge(days: number) {
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, cls: 'text-danger bg-danger-subtle border-danger/25' };
  if (days === 0) return { text: 'Due today', cls: 'text-danger bg-danger-subtle border-danger/25' };
  if (days <= 3) return { text: `${days}d left`, cls: 'text-danger bg-danger-subtle border-danger/25' };
  if (days <= 7) return { text: `${days}d left`, cls: 'text-warning bg-warning-subtle border-warning/25' };
  // Beyond a week there is nothing to do today, so the pill goes quiet: the number
  // in it already says how much runway is left, and a hue on top of that number was
  // saying it twice. These two match DEADLINE_VISUAL's `this-month` and `later`,
  // both of which are neutral.
  return { text: `${days}d`, cls: 'text-muted-foreground bg-muted border-border' };
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
      <div className="surface-toolbar flex flex-col gap-3 sm:flex-row sm:items-center">
        <label htmlFor="deadline-monitor-search" className="sr-only">
          Filter by student name
        </label>
        <input
          id="deadline-monitor-search"
          type="text"
          placeholder="Filter by student name…"
          value={studentFilter}
          onChange={(e) => setStudentFilter(e.target.value)}
          className="form-input flex-1 rounded-full py-2"
        />
        <div className="flex items-center gap-1 rounded-xl border border-border bg-background p-1 shadow-e-1">
          {(['all', 'early_decision', 'regular', 'scholarship', 'interview'] as TypeFilter[]).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              aria-pressed={typeFilter === t}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition',
                typeFilter === t
                  ? 'bg-primary text-primary-foreground shadow-e-1'
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
        <div className="flex flex-col items-center justify-center rounded-4xl border border-dashed border-border bg-muted/40 py-16 text-center">
          <CheckCircle2 className="mb-3 h-8 w-8 text-success" />
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
            <div key={group} className="surface-card space-y-3">
              {/* Group header */}
              <button
                onClick={() => toggleGroup(group)}
                className="sticky top-0 z-raised flex w-full items-center justify-between gap-3 rounded-t-2xl bg-card/90 px-5 py-2 backdrop-blur-sm -mx-5"
              >
                <div className="flex items-center gap-2">
                  <span className={cn('h-2.5 w-2.5 rounded-full', cfg.dotColor)} />
                  <Icon className={cn('h-4 w-4', cfg.headerColor)} />
                  <span className={cn('font-semibold', cfg.headerColor)}>{cfg.label}</span>
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', cfg.countChip)}>
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
                          <span className={cn('rounded-full border px-2.5 py-0.5 text-label font-semibold', typeCfg)}>
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
