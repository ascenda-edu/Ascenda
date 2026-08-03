'use client';

import { motion } from 'framer-motion';
import { CalendarClock, CalendarPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';
import { parseLocalDate } from '@/lib/utils/dates';
import { DEADLINE_VISUAL } from '@/lib/theme/categories';
import { buildDeadlinesIcs } from '../model/ics';
import type { ChildDeadline } from '../model/types';

// Urgency-grouped deadline list (counsellor deadline-monitor idiom) with an
// all-day .ics export so parents can mirror the dates into their own calendar.
//
// The four buckets below are exactly DEADLINE_VISUAL's urgency bands
// (lib/theme/categories), so the tone comes from there rather than a local map.

const longDateFormatter = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

type Group = {
  key: string;
  title: string;
  detail: string;
  tone: string;
  items: ChildDeadline[];
};

const groupDeadlines = (deadlines: ChildDeadline[]): Group[] =>
  [
    {
      key: 'overdue',
      title: 'Passed',
      detail: 'Already gone by — worth a check-in if unexpected',
      tone: DEADLINE_VISUAL.overdue.text,
      items: deadlines.filter((d) => d.daysUntil < 0),
    },
    {
      key: 'week',
      title: 'This week',
      detail: 'Within 7 days',
      tone: DEADLINE_VISUAL['this-week'].text,
      items: deadlines.filter((d) => d.daysUntil >= 0 && d.daysUntil <= 7),
    },
    {
      key: 'month',
      title: 'This month',
      detail: '8–30 days out',
      tone: DEADLINE_VISUAL['this-month'].text,
      items: deadlines.filter((d) => d.daysUntil > 7 && d.daysUntil <= 30),
    },
    {
      key: 'later',
      title: 'Further out',
      detail: 'More than a month away',
      // Deliberately neutral rather than DEADLINE_VISUAL.later (success): nothing is
      // "good" about a distant deadline here, it's just quiet.
      tone: 'text-muted-foreground',
      items: deadlines.filter((d) => d.daysUntil > 30),
    },
  ].filter((g) => g.items.length > 0);

export function DeadlineGroups({
  deadlines,
  childName,
}: {
  deadlines: ChildDeadline[];
  childName: string;
}) {
  if (deadlines.length === 0) {
    return (
      <EmptyState
        icon={<CalendarClock />}
        title="No deadlines yet"
        description={`Deadlines appear once ${childName.split(/\s+/)[0]} is tracking applications with dated milestones.`}
      />
    );
  }

  const groups = groupDeadlines(deadlines);

  const exportIcs = () => {
    const ics = buildDeadlinesIcs(deadlines, childName);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ascenda-deadlines.ics';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={exportIcs}
          className="hover-lift inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-semibold text-foreground shadow-e-1"
        >
          <CalendarPlus className="h-3.5 w-3.5" aria-hidden />
          Add to my calendar (.ics)
        </button>
      </div>

      {groups.map((group, groupIndex) => (
        <section key={group.key} className="surface-card">
          <div className="relative z-10">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <div>
                <p className={cn('eyebrow', group.tone)}>
                  {group.title}
                </p>
                <p className="text-xs text-muted-foreground">{group.detail}</p>
              </div>
              <span className="text-sm font-semibold text-foreground">{group.items.length}</span>
            </div>
            <ul className="space-y-2">
              {group.items.map((deadline, index) => (
                <motion.li
                  key={deadline.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: groupIndex * 0.05 + index * 0.03 }}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border border-border bg-background px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {deadline.university} — {deadline.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {deadline.program}
                      {deadline.intake ? ` · ${deadline.intake}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-foreground">
                      {longDateFormatter.format(parseLocalDate(deadline.date))}
                    </p>
                    <p className={cn('text-xs', group.tone)}>
                      {deadline.daysUntil < 0
                        ? `${Math.abs(deadline.daysUntil)} day${Math.abs(deadline.daysUntil) === 1 ? '' : 's'} ago`
                        : deadline.daysUntil === 0
                          ? 'Today'
                          : `in ${deadline.daysUntil} day${deadline.daysUntil === 1 ? '' : 's'}`}
                    </p>
                  </div>
                </motion.li>
              ))}
            </ul>
          </div>
        </section>
      ))}
    </div>
  );
}
