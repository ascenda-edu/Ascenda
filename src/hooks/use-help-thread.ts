'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { useRealtimePoll } from '@/hooks/use-realtime-poll';
import {
  getHelpRequest,
  insertHelpMeeting,
  insertHelpMessage,
  insertHelpNote,
  listHelpMeetings,
  listHelpMessages,
  listHelpNotes,
  markThreadRead,
  updateHelpMeetingStatus,
  updateHelpRequestStatus
} from '@/lib/demo/help-request-client';
import type {
  HelpMeeting,
  HelpMeetingStatus,
  HelpMessage,
  HelpNote,
  HelpRequest,
  HelpRequestStatus
} from '@/lib/types/demo-tables';

export interface UseHelpThreadResult {
  request: HelpRequest | null;
  messages: HelpMessage[];
  notes: HelpNote[];
  meetings: HelpMeeting[];
  loading: boolean;
  reply: (body: string, authorRole: 'student' | 'counsellor') => Promise<void>;
  addNote: (body: string) => Promise<void>;
  proposeMeeting: (input: {
    title: string;
    scheduledFor: string;
    durationMinutes?: number;
    location?: string;
  }) => Promise<void>;
  setMeetingStatus: (meeting: HelpMeeting, status: HelpMeetingStatus, actor: 'student' | 'counsellor') => Promise<void>;
  setStatus: (status: HelpRequestStatus) => Promise<void>;
}

export const useHelpThread = (
  requestId: string | null,
  side: 'student' | 'counsellor' = 'student'
): UseHelpThreadResult => {
  const supabase = useSupabase();
  const [request, setRequest] = useState<HelpRequest | null>(null);
  const [messages, setMessages] = useState<HelpMessage[]>([]);
  const [notes, setNotes] = useState<HelpNote[]>([]);
  const [meetings, setMeetings] = useState<HelpMeeting[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setCurrentProfileId(data?.user?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // Optimistically-appended replies that haven't round-tripped yet. refresh()
  // re-appends them so a poll landing mid-send doesn't blink the message away.
  const pendingRef = useRef<HelpMessage[]>([]);
  // Monotonic guard against a stale in-flight refresh clobbering a just-sent
  // message. refresh() reads the server rows + pendingRef *after* its awaits;
  // reply() clears pendingRef and reconciles the saved row *before* a slow
  // refresh that started pre-commit lands. Each refresh captures the current
  // ticket at start and reply() bumps it whenever it mutates messages state, so
  // a refresh whose ticket is now stale discards its snapshot instead of
  // wiping the reconciled row (a fresh poll/realtime refresh follows anyway).
  const refreshSeqRef = useRef(0);
  // The thread currently on screen. reply()'s closure captures the requestId it
  // sent to; comparing against this ref at resolve time stops a slow send from
  // splicing its message into a different conversation the user switched to.
  const activeRequestIdRef = useRef<string | null>(requestId);
  useEffect(() => {
    activeRequestIdRef.current = requestId;
  }, [requestId]);

  const refresh = useCallback(async () => {
    if (!requestId) {
      setRequest(null);
      setMessages([]);
      setNotes([]);
      setMeetings([]);
      return;
    }
    const ticket = refreshSeqRef.current;
    try {
      const [r, m, n, mt] = await Promise.all([
        getHelpRequest(supabase, requestId),
        listHelpMessages(supabase, requestId),
        listHelpNotes(supabase, requestId),
        listHelpMeetings(supabase, requestId)
      ]);
      // reply() bumped the sequence past our ticket while we were awaiting: it
      // reconciled a sent message against state that is newer than the snapshot
      // we just fetched (which may pre-date that row's commit). Discard the
      // whole stale snapshot rather than let it wipe the reconciled row — the
      // next poll/realtime refresh re-reads everything a beat later.
      if (refreshSeqRef.current !== ticket) return;
      setRequest(r);
      // A pending optimistic reply whose server row has already arrived (the
      // realtime INSERT often beats the insert's own HTTP response) would
      // render twice — drop it in favour of the server row. The
      // (author, role, body) key is NOT unique — two identical-text sends
      // share it — so consume at most one server row per pending entry: tally
      // the matching server rows and keep any pending entries beyond that
      // count, matched greedily oldest-first (pendingRef is in send order).
      const serverKeyCounts = new Map<string, number>();
      for (const srv of m) {
        const key = `${srv.author_profile_id}\u0000${srv.author_role}\u0000${srv.body}`;
        serverKeyCounts.set(key, (serverKeyCounts.get(key) ?? 0) + 1);
      }
      const pending = pendingRef.current
        .filter((p) => p.request_id === requestId)
        .filter((p) => {
          const key = `${p.author_profile_id}\u0000${p.author_role}\u0000${p.body}`;
          const remaining = serverKeyCounts.get(key) ?? 0;
          if (remaining > 0) {
            // A server row covers this optimistic temp — spend the credit and
            // drop the temp so it isn't rendered twice.
            serverKeyCounts.set(key, remaining - 1);
            return false;
          }
          // No server row for it yet — keep showing the optimistic temp.
          return true;
        });
      setMessages([...m, ...pending]);
      setNotes(n);
      setMeetings(mt);
    } catch (err) {
      console.warn('useHelpThread: refresh failed', err);
    }
  }, [requestId, supabase]);

  useEffect(() => {
    if (!requestId) return;
    let cancelled = false;
    setLoading(true);
    refresh().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [requestId, refresh]);

  // Realtime + adaptive poll fallback while drawer is open. Same two-speed
  // scheme as the other live hooks (see use-realtime-poll.ts).
  useRealtimePoll({
    channelName: `help_thread:${requestId}`,
    enabled: !!requestId,
    onPoll: refresh,
    subscriptions: [
      { table: 'help_messages', filter: `request_id=eq.${requestId}`, handler: () => refresh() },
      { table: 'help_notes', filter: `request_id=eq.${requestId}`, handler: () => refresh() },
      { table: 'help_meetings', filter: `request_id=eq.${requestId}`, handler: () => refresh() },
      {
        table: 'help_requests',
        filter: `id=eq.${requestId}`,
        // Patch request state in place from the payload instead of a full
        // refresh. Our own markThreadRead UPDATE (and the counsellor's) round-
        // trips back through this subscription, and a blanket refresh() would
        // fire the 4-query reload on every thread open and again per incoming
        // message. We can't just skip read-receipt events though: the OTHER
        // side's *_last_read_at stamp also arrives here and drives the live
        // 'Seen' receipt, so the merge has to happen. (Realtime encodes
        // timestamptz as '2026-07-14 10:00:00+00', unlike PostgREST's ISO form,
        // but every consumer parses via new Date(), which handles both.)
        handler: (payload) => {
          const next = payload?.new;
          if (payload?.eventType === 'UPDATE' && next?.id) {
            setRequest((prev) => (prev && prev.id === next.id ? { ...prev, ...next } : prev));
          } else {
            refresh();
          }
        }
      }
    ]
  });

  // Mark the thread read for this side whenever a new other-side message is
  // visible (including the opening request body on first open). Keyed on the
  // latest other-side marker so the *_last_read_at update it triggers doesn't
  // loop back through refresh() into another stamp.
  const lastStampedRef = useRef<string | null>(null);
  useEffect(() => {
    lastStampedRef.current = null;
  }, [requestId]);
  useEffect(() => {
    // Wait until request/messages actually belong to requestId. On a thread
    // switch refresh() only nulls state when !requestId, so the PREVIOUS
    // thread's data lingers until the new load lands — stamping now would forge
    // a read on the new requestId using the old thread's marker (clearing the
    // new thread's badge and faking 'Seen' before content shows). Also skip
    // while the initial load for this thread is still in flight.
    if (!requestId || !request || request.id !== requestId || loading) return;
    // counsellor_last_read_at is a single shared column, so any counsellor-
    // capable viewer stamping it clears the OWNING counsellor's unread badge.
    // Until per-counsellor read tracking lands (a follow-up for multi-
    // counsellor onboarding), only stamp on the counsellor side when the thread
    // is unclaimed or the current viewer owns it.
    if (
      side === 'counsellor' &&
      request.counsellor_profile_id &&
      currentProfileId !== request.counsellor_profile_id
    ) {
      return;
    }
    const lastOther = [...messages].reverse().find((m) => m.author_role !== side);
    const marker = lastOther?.id ?? (request.initiated_by !== side ? `opening-${request.id}` : null);
    if (!marker || lastStampedRef.current === marker) return;
    lastStampedRef.current = marker;
    markThreadRead(supabase, requestId, side).catch((err) =>
      console.warn('useHelpThread: mark read failed', err)
    );
  }, [requestId, request, messages, side, supabase, loading, currentProfileId]);

  const reply = useCallback(
    async (body: string, authorRole: 'student' | 'counsellor') => {
      if (!requestId || !currentProfileId || !request) return;
      const trimmed = body.trim();
      if (!trimmed) return;
      // Optimistic append: show the message immediately, reconcile with the
      // server row on success, roll back on error (caller shows the toast).
      const temp: HelpMessage = {
        id: `optimistic-${Math.random().toString(36).slice(2)}`,
        request_id: requestId,
        author_profile_id: currentProfileId,
        author_role: authorRole,
        body: trimmed,
        created_at: new Date().toISOString()
      };
      pendingRef.current = [...pendingRef.current, temp];
      setMessages((prev) => [...prev, temp]);
      try {
        // The trg_help_message_notify DB trigger notifies the other side —
        // a student session can't insert onto a counsellor's notification row
        // under RLS, so the fan-out has to happen server-side.
        const saved = await insertHelpMessage(supabase, {
          request_id: requestId,
          author_profile_id: currentProfileId,
          author_role: authorRole,
          body: trimmed
        });
        pendingRef.current = pendingRef.current.filter((p) => p.id !== temp.id);
        // Only touch visible state if the user is still on this thread —
        // otherwise the message would splice into whichever conversation
        // they switched to (the next refresh of this thread shows it).
        if (activeRequestIdRef.current === requestId) {
          setMessages((prev) => {
            const withoutTemp = prev.filter((m) => m.id !== temp.id);
            return withoutTemp.some((m) => m.id === saved.id) ? withoutTemp : [...withoutTemp, saved];
          });
          // Invalidate any refresh that started before this reconciliation: it
          // fetched its snapshot pre-commit and has our now-cleared temp queued.
          refreshSeqRef.current += 1;
        }
      } catch (err) {
        pendingRef.current = pendingRef.current.filter((p) => p.id !== temp.id);
        if (activeRequestIdRef.current === requestId) {
          setMessages((prev) => prev.filter((m) => m.id !== temp.id));
          // Same guard on rollback — a stale refresh must not resurrect the
          // temp it still has queued after we've removed it here.
          refreshSeqRef.current += 1;
        }
        throw err;
      }
    },
    [requestId, currentProfileId, request, supabase]
  );

  const addNote = useCallback(
    async (body: string) => {
      if (!requestId || !currentProfileId) return;
      const trimmed = body.trim();
      if (!trimmed) return;
      await insertHelpNote(supabase, {
        request_id: requestId,
        author_profile_id: currentProfileId,
        body: trimmed
      });
      await refresh();
    },
    [requestId, currentProfileId, supabase, refresh]
  );

  const proposeMeeting = useCallback(
    async ({
      title,
      scheduledFor,
      durationMinutes = 30,
      location
    }: {
      title: string;
      scheduledFor: string;
      durationMinutes?: number;
      location?: string;
    }) => {
      if (!requestId || !currentProfileId || !request) return;
      // trg_help_meeting_insert_notify notifies the student server-side.
      await insertHelpMeeting(supabase, {
        request_id: requestId,
        counsellor_profile_id: currentProfileId,
        student_profile_id: request.student_profile_id,
        title,
        scheduled_for: scheduledFor,
        duration_minutes: durationMinutes,
        location: location ?? null,
        status: 'proposed'
      });
      await refresh();
    },
    [requestId, currentProfileId, request, supabase, refresh]
  );

  const setMeetingStatus = useCallback(
    async (meeting: HelpMeeting, status: HelpMeetingStatus, actor: 'student' | 'counsellor') => {
      if (!requestId || !request) return;
      // status_changed_by tells trg_help_meeting_status_notify which side
      // acted (auth.uid() can't distinguish the two sides of the demo
      // account); the trigger notifies the other side server-side.
      await updateHelpMeetingStatus(supabase, meeting.id, status, actor);
      await refresh();
    },
    [requestId, request, supabase, refresh]
  );

  const setStatus = useCallback(
    async (status: HelpRequestStatus) => {
      if (!requestId) return;
      // The DB trigger owns claim-on-accept (migration 20260714100000): accepting
      // an unclaimed thread sets counsellor_profile_id := auth.uid() server-side,
      // so the client must not author that invariant too. refresh() reads the
      // resulting counsellor_profile_id back.
      await updateHelpRequestStatus(supabase, requestId, status);
      // The student's "accepted" notice is authored by the DB trigger
      // trg_help_request_accepted_notify (migration 20260715120000) — do not
      // insert it client-side too.
      await refresh();
    },
    [requestId, supabase, refresh]
  );

  return {
    request,
    messages,
    notes,
    meetings,
    loading,
    reply,
    addNote,
    proposeMeeting,
    setMeetingStatus,
    setStatus
  };
};
