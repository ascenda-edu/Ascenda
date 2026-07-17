'use client';

// Deadline timeline widget — stacked rows in one card. Urgency is derived from
// the date via classifyDeadlineUrgency and rendered with the shared
// DEADLINE_VISUAL chip (never a widget-supplied color). Counsellor cohort rows
// carry studentName/studentFlag; the student footer link is the only link and
// points at a fixed route. All fields are plain JSX text.

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { cardFade } from '@/lib/motion';
import { DEADLINE_VISUAL, classifyDeadlineUrgency } from '@/lib/theme/categories';
import { daysUntil, parseLocalDate } from '@/lib/utils/dates';
import { flagEmoji } from '@/lib/utils/flag';
import type { ChatMode } from '@/lib/chat/prompts';
import type { DeadlineHit } from '@/lib/chat/widgets';

const relative = (daysUntil: number): string => {
  if (daysUntil < 0) return `overdue ${Math.abs(daysUntil)}d`;
  if (daysUntil === 0) return 'today';
  return `in ${daysUntil}d`;
};

const formatDate = (date: string): string =>
  parseLocalDate(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

function DeadlineRow({ item }: { item: DeadlineHit }) {
  const visual = DEADLINE_VISUAL[classifyDeadlineUrgency(item.date)];
  const Icon = visual.icon;
  // Recompute locally from the same date the chip classifies — the persisted
  // item.daysUntil is tool-run-time and would disagree with the chip once a
  // day boundary passes.
  const days = daysUntil(item.date);
  const overdue = days < 0;

  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className={visual.chip}>
        <Icon className="h-3 w-3" />
        {formatDate(item.date)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-medium text-foreground">
          {item.studentName ? (
            <>
              <span aria-hidden>{item.studentFlag ?? flagEmoji(null, undefined)}</span>{' '}
              {item.studentName} ·{' '}
            </>
          ) : null}
          {item.label}
        </p>
        {item.university ? (
          <p className="truncate text-[10px] text-muted-foreground">{item.university}</p>
        ) : null}
      </div>
      <span
        className={
          overdue
            ? 'shrink-0 text-[10px] font-semibold text-rose-600 dark:text-rose-400'
            : 'shrink-0 text-[10px] text-muted-foreground'
        }
      >
        {relative(days)}
      </span>
    </div>
  );
}

export function DeadlinesWidget({ items, mode }: { items: DeadlineHit[]; mode: ChatMode }) {
  return (
    <motion.div
      variants={cardFade}
      initial="hidden"
      animate="show"
      className="rounded-[14px] border border-border bg-background p-2.5"
    >
      <div className="divide-y divide-border">
        {items.map((item) => (
          // Two programmes share canonical dates (UCAS 15 Oct) — university
          // disambiguates; must match widgetItemKey's identity.
          <DeadlineRow
            key={`${item.label}|${item.date}|${item.university ?? ''}|${item.studentName ?? ''}`}
            item={item}
          />
        ))}
      </div>
      {mode === 'student' ? (
        <Link
          href="/applications/tasks"
          className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-primary transition-colors hover:text-primary/80"
        >
          View all tasks
          <ArrowRight className="h-3 w-3" />
        </Link>
      ) : null}
    </motion.div>
  );
}
