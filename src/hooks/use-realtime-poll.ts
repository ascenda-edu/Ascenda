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
//   - When the channel reports SUBSCRIBED, relax to `slowMs` (default 30s):
//     realtime now carries the load and the poll is just cheap insurance
//     against silently-missed events, so it can be sparse.
//   - While the channel is NOT subscribed, each tick doubles the interval up
//     to `maxMs` (default ≥30s). A table missing from the realtime
//     publication used to pin every mounted view at a permanent 1.5s poll;
//     now the worst case decays to one query per `maxMs`. If the channel
//     later errors/closes after having subscribed, backoff restarts from
//     `fastMs` (the drop is likely transient, so be responsive once).
// The poll chain pauses entirely while the tab is hidden (`document.hidden`) so
// an idle tab burns neither queries nor timer wakeups; a `visibilitychange`
// listener catches the view up and resumes the chain the instant it returns.
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
  /** Backoff ceiling while realtime is unavailable; defaults to max(slowMs, 30s). */
  maxMs?: number;
  /** Notified of every raw subscribe status (SUBSCRIBED, CHANNEL_ERROR, …). */
  onStatusChange?: (status: string) => void;
}

export function useRealtimePoll({
  channelName,
  subscriptions,
  onPoll,
  enabled = true,
  fastMs = 1500,
  slowMs = 30000,
  maxMs = Math.max(slowMs, 30000),
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

    // setTimeout chain (not setInterval) so the delay can change between ticks:
    // 'fallback' doubles the delay each tick toward maxMs; 'insurance' holds a
    // steady slowMs alongside a healthy socket.
    let pollHandle: number | null = null;
    let pollMode: 'fallback' | 'insurance' = 'fallback';
    let pollDelay = fastMs;
    // Tearing the channel down (removeChannel → unsubscribe) fires the subscribe
    // callback one last time with 'CLOSED', which would otherwise re-enter
    // fallback and re-arm a timer chain that cleanup can no longer clear —
    // leaking a poll loop on the stale closure. Gate every (re)schedule on this.
    let disposed = false;

    const scheduleNext = () => {
      if (disposed) return;
      if (pollHandle !== null) window.clearTimeout(pollHandle);
      pollHandle = null;
      // Don't arm a timer while the tab is hidden — it would wake every
      // pollDelay only to skip the poll and re-arm, churning with no progress
      // (and in fallback mode the delay never backs off because nothing ran).
      // onVisibilityChange resumes the chain — with a catch-up poll — on return.
      if (document.hidden) return;
      pollHandle = window.setTimeout(() => {
        pollHandle = null;
        // Hidden mid-countdown (throttled fire after the tab was hidden): pause
        // rather than poll; onVisibilityChange resumes on return.
        if (document.hidden) return;
        onPollRef.current();
        if (pollMode === 'fallback') pollDelay = Math.min(pollDelay * 2, maxMs);
        scheduleNext();
      }, pollDelay);
    };

    const enterFallback = () => {
      pollMode = 'fallback';
      pollDelay = fastMs;
      scheduleNext();
    };
    const enterInsurance = () => {
      pollMode = 'insurance';
      pollDelay = slowMs;
      scheduleNext();
    };

    enterFallback();

    const onVisibilityChange = () => {
      if (document.hidden) {
        // Stop the chain while hidden; clear a timer already counting down so it
        // can't fire a no-op. scheduleNext also refuses to arm while hidden.
        if (pollHandle !== null) {
          window.clearTimeout(pollHandle);
          pollHandle = null;
        }
        return;
      }
      // Back in view: catch up immediately, then resume the chain at the
      // current cadence.
      onPollRef.current();
      scheduleNext();
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
      if (status === 'SUBSCRIBED') enterInsurance();
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        // Only reset the backoff when falling FROM a healthy socket. The
        // client retries a dead channel indefinitely, and each failed attempt
        // re-fires one of these statuses — resetting on every one would pin
        // the poll at fastMs, which is exactly what the backoff exists to fix.
        if (pollMode !== 'fallback') enterFallback();
      }
    });

    return () => {
      disposed = true;
      if (pollHandle !== null) window.clearTimeout(pollHandle);
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
  }, [supabase, channelName, enabled, fastMs, slowMs, maxMs]);
}
