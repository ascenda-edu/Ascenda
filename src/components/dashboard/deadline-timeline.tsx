'use client';

import { motion } from 'framer-motion';
import { CalendarClock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { stagger as listStagger, itemSlide as itemFade } from '@/lib/motion';
import { classifyDeadlineUrgency, DEADLINE_VISUAL } from '@/lib/theme/categories';
import { parseLocalDate } from '@/lib/utils/dates';

// item.date arrives as a raw date-only string ('2026-07-17') so urgency can be
// classified from it; render it as a human date ('Jul 17') and fall back to the
// raw value for non-dates like 'TBD'.
const formatDisplayDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = parseLocalDate(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const sameYear = parsed.getFullYear() === new Date().getFullYear();
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' })
  });
};

interface TimelineItem {
  id: string;
  name: string;
  date: string;
  context: string;
}

interface DeadlineTimelineProps {
  items: TimelineItem[];
}

const URGENCY_BADGE: Partial<Record<ReturnType<typeof classifyDeadlineUrgency>, string>> = {
  overdue: 'Overdue',
  'this-week': 'This week',
  'this-month': 'This month'
};

export const DeadlineTimeline = ({ items }: DeadlineTimelineProps) => {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted p-8 text-center space-y-3">
        <CalendarClock className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">No upcoming deadlines yet</p>
        <p className="text-xs text-muted-foreground">Track programs you plan to apply to.</p>
      </div>
    );
  }

  return (
    <motion.ol
      className="space-y-3"
      variants={listStagger}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-40px' }}
    >
      {items.map((item) => {
        const urgency = classifyDeadlineUrgency(item.date);
        const visual = DEADLINE_VISUAL[urgency];
        const Icon = visual.icon;
        const badgeLabel = URGENCY_BADGE[urgency];

        return (
          <motion.li
            key={item.id}
            className={cn(
              'hover-lift group flex items-start gap-3 rounded-2xl border border-l-4 bg-card/60 p-4 shadow-e-1 backdrop-blur-sm',
              visual.border,
              visual.accent
            )}
            variants={itemFade}
          >
            <div className={visual.swatch}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground truncate">{item.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{item.context}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className={cn('text-xs font-semibold uppercase tracking-wider', visual.text)}>{formatDisplayDate(item.date)}</p>
              {badgeLabel ? (
                <span className={cn(visual.chip, 'mt-1')}>{badgeLabel}</span>
              ) : null}
            </div>
          </motion.li>
        );
      })}
    </motion.ol>
  );
};
