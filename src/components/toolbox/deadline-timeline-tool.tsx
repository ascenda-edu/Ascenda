'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarClock, Filter, LayoutGrid, List, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { daysUntil, parseLocalDate } from '@/lib/utils/dates';
import { stagger, cardFade } from '@/lib/motion';
import type { TimelineDeadline, TimelineDeadlineType } from '@/lib/data/student-demo-data';

const TYPE_CONFIG: Record<TimelineDeadlineType, { color: string; bg: string; dot: string; label: string }> = {
  submission: { color: 'text-primary-ink', bg: 'bg-primary/10 border-primary/30', dot: 'bg-primary', label: 'Submission' },
  exam: { color: 'text-warning', bg: 'bg-warning-subtle border-warning/25', dot: 'bg-warning', label: 'Exam' },
  interview: { color: 'text-danger', bg: 'bg-danger-subtle border-danger/25', dot: 'bg-danger', label: 'Interview' },
  document: { color: 'text-info', bg: 'bg-info-subtle border-info/25', dot: 'bg-info', label: 'Document' },
};

const dateFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const monthFormatter = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' });
const dayOfWeek = new Intl.DateTimeFormat('en-GB', { weekday: 'short' });

// Local-timezone 'YYYY-MM-DD' for a Date. Calendar cells are built from local
// y/m/d parts, so their keys must be formatted from local parts too — using
// date.toISOString() would key against a UTC day that can differ from the cell.
function formatLocalYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function urgencyColor(days: number): string {
  if (days <= 0) return 'text-danger bg-danger-subtle';
  if (days <= 3) return 'text-danger bg-danger-subtle';
  if (days <= 7) return 'text-warning bg-warning-subtle';
  return 'text-muted-foreground bg-muted/30';
}

function getCalendarDays(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = (firstDay.getDay() + 6) % 7; // Monday start
  const days: (Date | null)[] = [];
  for (let i = 0; i < startPad; i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
  return days;
}

interface DeadlineTimelineToolProps {
  deadlines: TimelineDeadline[];
}

export function DeadlineTimelineTool({ deadlines }: DeadlineTimelineToolProps) {
  const [filterType, setFilterType] = useState<TimelineDeadlineType | null>(null);
  const [filterUniversity, setFilterUniversity] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'timeline' | 'calendar'>('timeline');
  const [selectedDeadline, setSelectedDeadline] = useState<string | null>(null);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);

  // Calendar state
  const now = new Date();
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [calYear, setCalYear] = useState(now.getFullYear());

  const universities = useMemo(() => [...new Set(deadlines.map((d) => d.university))], [deadlines]);

  const filtered = useMemo(() => {
    let result = [...deadlines].sort((a, b) => parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime());
    if (filterType) result = result.filter((d) => d.type === filterType);
    if (filterUniversity) result = result.filter((d) => d.university === filterUniversity);
    return result;
  }, [deadlines, filterType, filterUniversity]);

  const daysUntilMap = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((d) => { if (!map.has(d.id)) map.set(d.id, daysUntil(d.date)); });
    return map;
  }, [filtered]);

  const focusDeadlines = filtered.filter((d) => { const days = daysUntilMap.get(d.id) ?? daysUntil(d.date); return days <= 14 && days >= 0; });
  const overdueDeadlines = filtered.filter((d) => (daysUntilMap.get(d.id) ?? daysUntil(d.date)) < 0);

  // Group by month for timeline
  const grouped = useMemo(() => {
    const map = new Map<string, TimelineDeadline[]>();
    filtered.filter((d) => (daysUntilMap.get(d.id) ?? daysUntil(d.date)) >= 0).forEach((d) => {
      const key = monthFormatter.format(parseLocalDate(d.date));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    });
    return [...map.entries()];
  }, [filtered, daysUntilMap]);

  // Calendar data
  const calendarDays = useMemo(() => getCalendarDays(calYear, calMonth), [calYear, calMonth]);
  const deadlinesByDate = useMemo(() => {
    const map = new Map<string, TimelineDeadline[]>();
    filtered.forEach((d) => {
      const key = d.date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    });
    return map;
  }, [filtered]);

  const navigateMonth = (delta: number) => {
    const d = new Date(calYear, calMonth + delta, 1);
    setCalMonth(d.getMonth());
    setCalYear(d.getFullYear());
  };

  return (
    <div className="space-y-6">
      {/* Overdue warning */}
      {overdueDeadlines.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-danger/25 bg-danger-subtle p-4 flex items-start gap-3"
        >
          <AlertCircle className="h-5 w-5 text-danger shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-danger">{overdueDeadlines.length} overdue deadline{overdueDeadlines.length !== 1 ? 's' : ''}</p>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {overdueDeadlines.map((d) => (
                <span key={d.id} className="text-xs text-danger/80">{d.title} ({Math.abs(daysUntilMap.get(d.id) ?? daysUntil(d.date))}d ago)</span>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Focus cards: next 14 days */}
      {focusDeadlines.length > 0 && (
        <div className="space-y-3">
          <p className="eyebrow">Next 14 days</p>
          <motion.div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" variants={stagger} initial="hidden" animate="show">
            {focusDeadlines.map((d) => {
              const cfg = TYPE_CONFIG[d.type];
              const days = daysUntilMap.get(d.id) ?? daysUntil(d.date);
              return (
                <motion.button
                  key={d.id}
                  type="button"
                  variants={cardFade}
                  whileHover={{ scale: 1.02, y: -2 }}
                  className={cn('w-full text-left rounded-2xl border p-4 space-y-2 cursor-pointer transition-shadow hover:shadow-e-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', cfg.bg)}
                  onClick={() => setSelectedDeadline(selectedDeadline === d.id ? null : d.id)}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn('rounded-full px-2.5 py-0.5 text-label font-semibold uppercase', cfg.bg, cfg.color)}>{cfg.label}</span>
                    <span className={cn('rounded-full px-2 py-0.5 text-label font-bold', urgencyColor(days))}>
                      {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days} days`}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-foreground">{d.title}</p>
                  <p className="text-xs text-muted-foreground">{d.university}</p>
                  {/* Urgency bar */}
                  <div className="h-1 rounded-full bg-muted/30 overflow-hidden">
                    <motion.div
                      className={cn('h-full rounded-full', days <= 3 ? 'bg-danger' : days <= 7 ? 'bg-warning' : 'bg-success')}
                      initial={{ width: '100%' }}
                      animate={{ width: `${Math.max(100 - (days / 14) * 100, 5)}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                  <AnimatePresence>
                    {selectedDeadline === d.id && d.detail && (
                      <motion.p
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="text-xs text-muted-foreground pt-1 overflow-hidden"
                      >
                        {d.detail}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </motion.button>
              );
            })}
          </motion.div>
        </div>
      )}

      {/* Controls: filters + view toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          {(Object.keys(TYPE_CONFIG) as TimelineDeadlineType[]).map((type) => {
            const cfg = TYPE_CONFIG[type];
            return (
              <button
                key={type}
                onClick={() => setFilterType(filterType === type ? null : type)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  filterType === type ? cn(cfg.bg, cfg.color, 'border') : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                )}
              >
                <div className={cn('h-2 w-2 rounded-full', cfg.dot)} />
                {cfg.label}
              </button>
            );
          })}
        </div>
        {/* 'all' is a sentinel: Radix rejects an empty item value, and "all
          * universities" is a real choice rather than a placeholder. Mapped back
          * to null here so the filter logic below is untouched. */}
        <Select
          value={filterUniversity ?? 'all'}
          onValueChange={(value) => setFilterUniversity(value === 'all' ? null : value)}
        >
          {/* w-auto: the trigger is w-full by default, which would take a whole
            * line of this wrap row. */}
          <SelectTrigger size="sm" aria-label="Filter by university" className="w-auto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All universities</SelectItem>
            {universities.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="ml-auto flex gap-1 surface-subcard p-1 rounded-xl">
          <button
            onClick={() => setViewMode('timeline')}
            className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-colors', viewMode === 'timeline' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
          >
            <List className="h-3.5 w-3.5" /> Timeline
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-colors', viewMode === 'calendar' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Calendar
          </button>
        </div>
      </div>

      {/* Calendar View */}
      {viewMode === 'calendar' && (
        <div className="space-y-4">
          {/* Month navigation */}
          <div className="flex items-center justify-between">
            <button onClick={() => navigateMonth(-1)} aria-label="Previous month" className="rounded-lg p-2 hover:bg-muted/60 transition-colors">
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
            </button>
            <p className="text-sm font-semibold text-foreground">
              {new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(new Date(calYear, calMonth))}
            </p>
            <button onClick={() => navigateMonth(1)} aria-label="Next month" className="rounded-lg p-2 hover:bg-muted/60 transition-colors">
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="eyebrow text-center py-1">
                {d}
              </div>
            ))}

            {/* Calendar cells */}
            {calendarDays.map((date, i) => {
              if (!date) return <div key={`empty-${i}`} className="h-20" />;

              const dateStr = formatLocalYmd(date);
              const dayDeadlines = deadlinesByDate.get(dateStr) ?? [];
              const isToday = dateStr === formatLocalYmd(now);
              const isPast = date < now && !isToday;
              const dayLabel = date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

              return (
                <button
                  key={dateStr}
                  type="button"
                  aria-label={`${dayLabel} — ${dayDeadlines.length} deadline${dayDeadlines.length === 1 ? '' : 's'}`}
                  onClick={() => dayDeadlines.length > 0 && setSelectedCalendarDate(selectedCalendarDate === dateStr ? null : dateStr)}
                  className={cn(
                    'h-20 rounded-xl border p-1.5 transition-colors overflow-hidden text-left',
                    isToday ? 'border-primary/40 bg-primary/5' : 'border-border/50 hover:bg-muted/20',
                    isPast && 'opacity-50',
                    dayDeadlines.length > 0 && 'ring-1 ring-primary/10 cursor-pointer',
                    selectedCalendarDate === dateStr && 'ring-2 ring-primary/40 bg-primary/5'
                  )}
                >
                  <p className={cn(
                    'text-label font-medium',
                    isToday ? 'text-primary-ink font-bold' : 'text-muted-foreground'
                  )}>
                    {date.getDate()}
                  </p>
                  <div className="space-y-0.5 mt-0.5">
                    {dayDeadlines.slice(0, 2).map((d) => {
                      const cfg = TYPE_CONFIG[d.type];
                      return (
                        <div
                          key={d.id}
                          className={cn('rounded px-1 py-0.5 text-label font-medium truncate', cfg.bg, cfg.color)}
                          title={`${d.title} — ${d.university}`}
                        >
                          {d.title}
                        </div>
                      );
                    })}
                    {dayDeadlines.length > 2 && (
                      <p className="text-label text-muted-foreground pl-1">+{dayDeadlines.length - 2} more</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected day detail panel */}
          <AnimatePresence>
            {selectedCalendarDate && (deadlinesByDate.get(selectedCalendarDate) ?? []).length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="rounded-2xl border border-border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">
                      {parseLocalDate(selectedCalendarDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                    <button onClick={() => setSelectedCalendarDate(null)} className="text-muted-foreground hover:text-foreground text-xs">
                      Close
                    </button>
                  </div>
                  {(deadlinesByDate.get(selectedCalendarDate) ?? []).map((d) => {
                    const cfg = TYPE_CONFIG[d.type];
                    return (
                      <div key={d.id} className={cn('rounded-xl border p-3 space-y-1', cfg.bg)}>
                        <div className="flex items-center gap-2">
                          <span className={cn('rounded-full px-2 py-0.5 text-label font-semibold', cfg.bg, cfg.color)}>{cfg.label}</span>
                          <span className="text-sm font-semibold text-foreground">{d.title}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{d.university}</p>
                        {d.detail && <p className="text-xs text-muted-foreground/80">{d.detail}</p>}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Timeline View */}
      {viewMode === 'timeline' && (
        <div className="space-y-8">
          {grouped.map(([month, items]) => (
            <div key={month}>
              <div className="flex items-center gap-3 mb-4">
                <p className="eyebrow">{month}</p>
                <span className="rounded-full bg-muted/50 px-2 py-0.5 text-label font-medium text-muted-foreground">{items.length} items</span>
                <div className="flex-1 h-px bg-border/50" />
              </div>
              <div className="relative border-l-2 border-border pl-6 space-y-4">
                {items.map((d) => {
                  const cfg = TYPE_CONFIG[d.type];
                  const days = daysUntilMap.get(d.id) ?? daysUntil(d.date);
                  return (
                    <motion.div
                      key={d.id}
                      className="relative"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      whileHover={{ x: 4 }}
                    >
                      {/* Dot on timeline */}
                      <div className={cn('absolute -left-[31px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-background shadow-e-1', cfg.dot)} />
                      <div className="space-y-1.5 surface-subcard p-3 rounded-xl hover:shadow-e-2 transition-shadow">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-foreground">{d.title}</span>
                          <span className={cn('rounded-full px-2 py-0.5 text-label font-semibold', cfg.bg, cfg.color)}>{cfg.label}</span>
                          {days >= 0 && days <= 7 && (
                            <span className={cn('rounded-full px-2 py-0.5 text-label font-bold', urgencyColor(days))}>
                              {days === 0 ? 'Today!' : days === 1 ? 'Tomorrow' : `${days} days left`}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{d.university}</span>
                          <span>·</span>
                          <span>{dateFormatter.format(parseLocalDate(d.date))}</span>
                          <span>·</span>
                          <span>{dayOfWeek.format(parseLocalDate(d.date))}</span>
                        </div>
                        {d.detail && <p className="text-xs text-muted-foreground/80">{d.detail}</p>}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {filtered.length === 0 && (
        <EmptyState icon={CalendarClock} title="No deadlines match your filters" />
      )}
    </div>
  );
}
