// Relative due-date badge copy shared by the task surfaces.
//
// due_date is a date-only string — parse as LOCAL midnight (parseLocalDate) or
// "due today" reads as overdue/tomorrow depending on the user's UTC offset.

import { MS_PER_DAY, parseLocalDate, startOfToday } from '@/lib/utils/dates';

export interface DueBadge {
  label: string;
  urgent: boolean;
}

export function dueLabel(iso?: string | null): DueBadge | null {
  if (!iso) return null;
  const due = parseLocalDate(iso);
  const today = startOfToday();
  const diff = Math.round((due.getTime() - today.getTime()) / MS_PER_DAY);
  if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, urgent: true };
  if (diff === 0) return { label: 'Today', urgent: true };
  if (diff === 1) return { label: 'Tomorrow', urgent: false };
  if (diff <= 14) return { label: `In ${diff} days`, urgent: false };
  // Beyond two weeks a concrete date reads better than "In 23 days"; include
  // the year once it differs from the current one.
  const sameYear = due.getFullYear() === today.getFullYear();
  return {
    label: due.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      ...(sameYear ? {} : { year: 'numeric' })
    }),
    urgent: false
  };
}
