// Shared date-only helpers.
//
// Deadline columns (deadline_date, due_date, …) are date-only strings.
// `new Date('YYYY-MM-DD')` parses as UTC midnight, so comparing it against a
// local-midnight boundary shifts every deadline by the user's UTC offset —
// a deadline due today disappears from "upcoming" for UTC+ users and shows
// as "Tomorrow" for UTC− users. Parse date-only strings as LOCAL dates.

export const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Parse a date-only string ('YYYY-MM-DD') as local midnight. Full ISO
 * timestamps (with a time component) fall through to normal Date parsing. */
export const parseLocalDate = (value: string): Date => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(value);
};

/** Date-only string shape: YYYY-MM-DD. */
export const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Pure VALIDITY check for a date-only string. Round-trip check: `new
 * Date('2026-02-30')` ROLLS OVER to Mar 2 rather than failing, so
 * parse-and-compare is the only way to reject impossible days. This uses an
 * explicit UTC round-trip on purpose — it's checking calendar validity, NOT
 * display/comparison (use parseLocalDate for those), so it must stay UTC-based. */
export const isValidDate = (value: string): boolean => {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    date.getUTCFullYear() === Number(m[1]) &&
    date.getUTCMonth() + 1 === Number(m[2]) &&
    date.getUTCDate() === Number(m[3])
  );
};

/** Local midnight today. */
export const startOfToday = (): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

/** Whole days from today until the given date-only string (negative = past). */
export const daysUntil = (value: string): number => {
  const target = parseLocalDate(value);
  const targetMidnight = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((targetMidnight.getTime() - startOfToday().getTime()) / MS_PER_DAY);
};

/** Human-relative time from a full ISO timestamp: 'Just now' under a minute,
 * then 'Xm ago' / 'Xh ago' / 'Xd ago', falling back to a short 'D Mon' date
 * beyond a week. Coarse by design — for chat/inbox recency, not durations.
 * Expects a timestamp with a time component (message/created_at), not a
 * date-only string. */
export const formatRelativeTime = (iso: string): string => {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 60_000) return 'Just now';
  const min = Math.round(diffMs / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.round(hr / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

/** Trim a free-text value and cap it at `max` characters. Type-guards the
 * input so non-strings yield '' rather than throwing. */
export const clampText = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';
