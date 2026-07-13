'use client';

import { useEffect, useState } from 'react';

/**
 * Formats a meeting timestamp in the same shape as the inbox drawer's
 * formatMeetingTime (help-thread-drawer.tsx) so both surfaces agree.
 */
const formatMeetingTime = (iso: string): string =>
  new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });

/**
 * Client leaf that renders `help_meetings.scheduled_for` in the BROWSER's
 * timezone. The parent card is a server component — formatting there would
 * bake in the server timezone (UTC on Vercel). Formatting is deferred to a
 * post-mount effect so the server HTML and the client's first render match
 * (no hydration mismatch); until then a stable placeholder holds the line.
 */
export function MeetingTime({ iso }: { iso: string }) {
  const [formatted, setFormatted] = useState<string | null>(null);

  useEffect(() => {
    setFormatted(formatMeetingTime(iso));
  }, [iso]);

  return <>{formatted ?? '…'}</>;
}
