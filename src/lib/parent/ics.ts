// Minimal iCalendar (.ics) generation for parent deadline export.
//
// Deadlines are date-only strings, so events are emitted as ALL-DAY
// (DTSTART;VALUE=DATE) — never as timed events, which would shift by the
// importer's UTC offset (the same gotcha lib/utils/dates.ts exists for).
// DTEND is exclusive per RFC 5545, hence the +1 day.

import type { ChildDeadline } from '@/lib/parent/types';

const escapeText = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

/** 'YYYY-MM-DD' → 'YYYYMMDD'; returns null for anything malformed. */
const toDateValue = (value: string): string | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? `${m[1]}${m[2]}${m[3]}` : null;
};

const nextDayValue = (value: string): string => {
  const [, y, mo, d] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)!;
  const next = new Date(Number(y), Number(mo) - 1, Number(d) + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${next.getFullYear()}${pad(next.getMonth() + 1)}${pad(next.getDate())}`;
};

export const buildDeadlinesIcs = (deadlines: ChildDeadline[], childName: string): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  const events = deadlines.flatMap((d) => {
    const dateValue = toDateValue(d.date);
    if (!dateValue) return [];
    return [
      'BEGIN:VEVENT',
      `UID:${d.id}@ascenda`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${dateValue}`,
      `DTEND;VALUE=DATE:${nextDayValue(d.date)}`,
      `SUMMARY:${escapeText(`${d.university} — ${d.name}`)}`,
      `DESCRIPTION:${escapeText(`${childName}'s application deadline: ${d.program}${d.intake ? ` (${d.intake})` : ''}`)}`,
      'END:VEVENT',
    ];
  });

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ascenda//Parent Portal//EN',
    'CALSCALE:GREGORIAN',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
};
