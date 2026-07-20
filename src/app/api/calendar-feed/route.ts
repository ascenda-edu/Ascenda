import { NextResponse } from 'next/server';

import { CALENDAR_FEED_CONFIG, type CalendarFeedEvent, type CalendarFeedResponse } from '@/lib/calendar-feed';
import { checkRateLimit, clientIp } from '@/lib/api/rate-limit';

// Anonymous route that fans out to external ICS feeds — throttle per client IP
// (see clientIp) so it can't be turned into an outbound-fetch amplifier.

const unfoldIcs = (ics: string) => ics.replace(/\r?\n[ \t]/g, '\n');

const getOffsetMinutes = (date: Date, timeZone: string) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const parts = formatter.formatToParts(date).reduce<Record<string, number>>((acc, part) => {
    if (part.type !== 'literal') {
      acc[part.type] = Number.parseInt(part.value, 10);
    }
    return acc;
  }, {});

  const asUtc = Date.UTC(
    parts.year,
    (parts.month ?? 1) - 1,
    parts.day ?? 1,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0
  );

  return (asUtc - date.getTime()) / 60000;
};

const toZonedIso = (
  { year, month, day, hour = 0, minute = 0, second = 0 }: { year: number; month: number; day: number; hour?: number; minute?: number; second?: number },
  timeZone: string
) => {
  const initialUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset = getOffsetMinutes(new Date(initialUtc), timeZone);
  const adjusted = initialUtc - offset * 60_000;
  const finalOffset = getOffsetMinutes(new Date(adjusted), timeZone);
  const finalUtc = initialUtc - finalOffset * 60_000;
  return new Date(finalUtc).toISOString();
};

const toIsoDate = (candidate: string, tzid?: string) => {
  const trimmed = candidate.trim();
  const dateTimeZ = trimmed.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  const dateTimeNoZ = trimmed.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  const dateOnly = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);

  if (dateTimeZ) {
    return `${dateTimeZ[1]}-${dateTimeZ[2]}-${dateTimeZ[3]}T${dateTimeZ[4]}:${dateTimeZ[5]}:${dateTimeZ[6]}Z`;
  }

  if (dateTimeNoZ) {
    const parts = {
      year: Number.parseInt(dateTimeNoZ[1], 10),
      month: Number.parseInt(dateTimeNoZ[2], 10),
      day: Number.parseInt(dateTimeNoZ[3], 10),
      hour: Number.parseInt(dateTimeNoZ[4], 10),
      minute: Number.parseInt(dateTimeNoZ[5], 10),
      second: Number.parseInt(dateTimeNoZ[6], 10)
    };
    if (tzid) {
      try {
        return toZonedIso(parts, tzid);
      } catch {
        // fall through to local formatting
      }
    }
    return `${dateTimeNoZ[1]}-${dateTimeNoZ[2]}-${dateTimeNoZ[3]}T${dateTimeNoZ[4]}:${dateTimeNoZ[5]}:${dateTimeNoZ[6]}`;
  }

  if (dateOnly) {
    if (tzid) {
      try {
        return toZonedIso(
          {
            year: Number.parseInt(dateOnly[1], 10),
            month: Number.parseInt(dateOnly[2], 10),
            day: Number.parseInt(dateOnly[3], 10),
            hour: 0,
            minute: 0,
            second: 0
          },
          tzid
        );
      } catch {
        // fall through to local formatting
      }
    }
    return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T00:00:00`;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return new Date().toISOString();
};

const parseIcsEvents = (data: string, source: (typeof CALENDAR_FEED_CONFIG)[number]) => {
  const unfolded = unfoldIcs(data);
  const blocks = unfolded.split('BEGIN:VEVENT').slice(1);

  return blocks
    .map((block, index) => {
      const lines = block.split(/\r?\n/);
      const event: Partial<CalendarFeedEvent> = {
        sourceLabel: source.label,
        provider: source.id
      };

      for (const line of lines) {
        if (!line || line.startsWith('END:VEVENT')) continue;

        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) continue;

        const rawKey = line.substring(0, colonIndex);
        const value = line.substring(colonIndex + 1);
        const [baseKey, ...params] = rawKey.split(';');
        const tzid = params
          .map((param) => param.trim())
          .find((param) => param.toUpperCase().startsWith('TZID='))?.split('=')[1];

        if (baseKey.startsWith('UID')) {
          event.id = value;
        } else if (baseKey.startsWith('SUMMARY')) {
          event.title = value.replace(/\\n/g, ' ').trim();
        } else if (baseKey.startsWith('DTSTART')) {
          event.start = toIsoDate(value, tzid);
        } else if (baseKey.startsWith('DTEND')) {
          event.end = toIsoDate(value, tzid);
        } else if (baseKey.startsWith('DESCRIPTION')) {
          event.description = value.replace(/\\n/g, ' ').trim();
        } else if (baseKey.startsWith('LOCATION')) {
          event.location = value.replace(/\\n/g, ' ').trim();
        }
      }

      if (!event.id) {
        event.id = `${source.id}-${index}-${Math.random().toString(36).slice(2, 8)}`;
      }

      if (!event.start) {
        return null;
      }

      if (!event.end) {
        event.end = event.start;
      }

      return event as CalendarFeedEvent;
    })
    .filter((event): event is CalendarFeedEvent => Boolean(event));
};

export async function GET(request: Request) {
  if (!checkRateLimit(`calendar-feed:${clientIp(request)}`, { limit: 10, windowMs: 60_000 })) {
    return NextResponse.json({ events: [], connectedSources: [] }, {
      status: 429, headers: { 'Cache-Control': 'no-store' }
    });
  }

  // Fetch every configured feed concurrently so total latency is the slowest
  // single feed, not the sum. Each feed catches its own errors (missing env
  // var, non-200, network/parse failure) and resolves to null, so one bad feed
  // can never abort the others. Results stay in CALENDAR_FEED_CONFIG order.
  const feedResults = await Promise.all(
    CALENDAR_FEED_CONFIG.map(async (source) => {
      const url = process.env[source.envKey];
      if (!url) {
        return null;
      }

      try {
        // Revalidate the outbound ICS every 5 min instead of no-store, so a burst
        // of requests collapses onto one upstream fetch per feed.
        const response = await fetch(url, { next: { revalidate: 300 } });
        if (!response.ok) {
          return null;
        }

        const text = await response.text();
        return { source, events: parseIcsEvents(text, source) };
      } catch {
        // A failing/absent feed should not block the other feeds.
        return null;
      }
    })
  );

  const aggregatedEvents: CalendarFeedEvent[] = [];
  const connectedSources: Set<(typeof CALENDAR_FEED_CONFIG)[number]['id']> = new Set();

  for (const result of feedResults) {
    if (!result) {
      continue;
    }
    aggregatedEvents.push(...result.events);
    connectedSources.add(result.source.id);
  }

  const sortedEvents = aggregatedEvents.sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  );

  const body: CalendarFeedResponse = {
    events: sortedEvents.slice(0, 50),
    connectedSources: Array.from(connectedSources)
  };

  return NextResponse.json(body, {
    status: 200,
    headers: { 'Cache-Control': 'public, s-maxage=300' }
  });
}
