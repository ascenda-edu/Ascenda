'use client';

import { useEffect, useRef } from 'react';
import { useSupabase } from '@/hooks/useSupabase';

// Two-speed realtime-with-poll-fallback, shared by every live view (counsellor
// inbox, help-requests widget, help thread, notifications).
//
// Rationale (canonical — the individual hooks used to each carry a copy):
// Realtime (Supabase postgres_changes) is the primary transport, but it can be
// slow to confirm on a cold start or drop on a flaky network. So we ALSO poll,
// aggressively at first and then relaxing once realtime proves itself:
//   - Start polling at `fastMs` (default 1.5s) so the view feels near-instant
//     even before — or entirely without — a working socket.
//   - When the channel reports SUBSCRIBED, relax to `slowMs` (default 10s):
//     realtime now carries the load and the poll is just cheap insurance.
//   - If the channel errors/times-out/closes, drop back to `fastMs`.
// Polls are skipped while the tab is hidden (`document.hidden`) to avoid
// burning queries on idle tabs; a `visibilitychange` listener catches the view
// up the instant the tab returns.
//
// Pass `enabled: false` (e.g. before a profile/request id resolves) to tear the
// channel and poll down entirely — nothing is created until it flips true.
// `onPoll`, `onStatusChange` and the per-subscription handlers are read through
// refs, so passing fresh closures/arrays each render does NOT churn the channel;
// it is (re)created only when `channelName`, `enabled`, or the intervals change.

export interface RealtimePollSubscription {
  /** Table to watch (in the public schema). */
  table: string;
  /** postgres_changes event; defaults to '*'. */
  event?: string;
  /** Optional PostgREST filter string, e.g. `profile_id=eq.${id}`. */
  filter?: string;
  /** Invoked with the realtime payload for each matching change. */
  handler: (payload: any) => void;
}

export interface UseRealtimePollOptions {
  channelName: string;
  subscriptions: RealtimePollSubscription[];
  /** Fallback refetch invoked on each poll tick and on tab re-focus. */
  onPoll: () => void;
  /** When false, no channel or poll is created (covers "id not resolved yet"). */
  enabled?: boolean;
  fastMs?: number;
  slowMs?: number;
  /** Notified of every raw subscribe status (SUBSCRIBED, CHANNEL_ERROR, …). */
  onStatusChange?: (status: string) => void;
}

export function useRealtimePoll({
  channelName,
  subscriptions,
  onPoll,
  enabled = true,
  fastMs = 1500,
  slowMs = 10000,
  onStatusChange
}: UseRealtimePollOptions): void {
  const supabase = useSupabase();

  // Latest callbacks/subscriptions, read at event time so fresh closures don't
  // force the channel to be torn down and rebuilt on every render.
  const onPollRef = useRef(onPoll);
  const onStatusChangeRef = useRef(onStatusChange);
  const subscriptionsRef = useRef(subscriptions);
  onPollRef.current = onPoll;
  onStatusChangeRef.current = onStatusChange;
  subscriptionsRef.current = subscriptions;

  useEffect(() => {
    if (!enabled) return;

    let pollHandle: number | null = null;
    const startPoll = (intervalMs: number) => {
      if (pollHandle !== null) window.clearInterval(pollHandle);
      pollHandle = window.setInterval(() => {
        if (document.hidden) return;
        onPollRef.current();
      }, intervalMs);
    };
    startPoll(fastMs);

    const onVisibilityChange = () => {
      if (!document.hidden) onPollRef.current();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    let builder = (supabase as any).channel(channelName);
    subscriptionsRef.current.forEach((sub, index) => {
      const config: Record<string, unknown> = {
        event: sub.event ?? '*',
        schema: 'public',
        table: sub.table
      };
      if (sub.filter) config.filter = sub.filter;
      builder = builder.on('postgres_changes', config, (payload: any) => {
        subscriptionsRef.current[index]?.handler(payload);
      });
    });

    const channel = builder.subscribe((status: string) => {
      onStatusChangeRef.current?.(status);
      if (status === 'SUBSCRIBED') startPoll(slowMs);
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        startPoll(fastMs);
      }
    });

    return () => {
      if (pollHandle !== null) window.clearInterval(pollHandle);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      try {
        (supabase as any).removeChannel(channel);
      } catch {
        // ignore
      }
    };
    // Channel identity is fully determined by these; handlers/subscriptions are
    // read via refs above so their re-creation each render is intentionally not
    // a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, channelName, enabled, fastMs, slowMs]);
}
