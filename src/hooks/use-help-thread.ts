'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import {
  getHelpRequest,
  insertHelpMeeting,
  insertHelpMessage,
  insertHelpNote,
  listHelpMeetings,
  listHelpMessages,
  listHelpNotes,
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

// See use-notifications.ts for the rationale on the two-speed poll.
const POLL_MS_FAST = 1500;
const POLL_MS_SLOW = 10000;

export const useHelpThread = (requestId: string | null): UseHelpThreadResult => {
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

  const refresh = useCallback(async () => {
    if (!requestId) {
      setRequest(null);
      setMessages([]);
      setNotes([]);
      setMeetings([]);
      return;
    }
    try {
      const [r, m, n, mt] = await Promise.all([
        getHelpRequest(supabase, requestId),
        listHelpMessages(supabase, requestId),
        listHelpNotes(supabase, requestId),
        listHelpMeetings(supabase, requestId)
      ]);
      setRequest(r);
      setMessages(m);
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

  // Realtime + adaptive poll fallback while drawer is open. Same
  // two-speed scheme as the other live hooks.
  useEffect(() => {
    if (!requestId) return;

    let pollHandle: number | null = null;
    const startPoll = (intervalMs: number) => {
      if (pollHandle !== null) window.clearInterval(pollHandle);
      pollHandle = window.setInterval(() => refresh(), intervalMs);
    };
    startPoll(POLL_MS_FAST);

    const channel = (supabase as any)
      .channel(`help_thread:${requestId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'help_messages', filter: `request_id=eq.${requestId}` },
        () => refresh()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'help_notes', filter: `request_id=eq.${requestId}` },
        () => refresh()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'help_meetings', filter: `request_id=eq.${requestId}` },
        () => refresh()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'help_requests', filter: `id=eq.${requestId}` },
        () => refresh()
      )
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') startPoll(POLL_MS_SLOW);
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          startPoll(POLL_MS_FAST);
        }
      });

    return () => {
      if (pollHandle !== null) window.clearInterval(pollHandle);
      try {
        (supabase as any).removeChannel(channel);
      } catch {
        // ignore
      }
    };
  }, [requestId, refresh, supabase]);

  const reply = useCallback(
    async (body: string, authorRole: 'student' | 'counsellor') => {
      if (!requestId || !currentProfileId || !request) return;
      const trimmed = body.trim();
      if (!trimmed) return;
      // The trg_help_message_notify DB trigger notifies the other side —
      // a student session can't insert onto a counsellor's notification row
      // under RLS, so the fan-out has to happen server-side.
      await insertHelpMessage(supabase, {
        request_id: requestId,
        author_profile_id: currentProfileId,
        author_role: authorRole,
        body: trimmed
      });
      await refresh();
    },
    [requestId, currentProfileId, request, supabase, refresh]
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
      await updateHelpRequestStatus(supabase, requestId, status);
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
