'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import {
  insertNotification,
  listOpenHelpRequests,
  updateHelpRequestStatus
} from '@/lib/demo/help-request-client';
import type { HelpRequest, HelpRequestStatus } from '@/lib/types/demo-tables';

// See use-notifications.ts for the rationale on the two-speed poll.
const POLL_MS_FAST = 1500;
const POLL_MS_SLOW = 10000;

export interface UseHelpRequestsResult {
  items: HelpRequest[];
  loading: boolean;
  accept: (req: HelpRequest) => Promise<void>;
  resolve: (req: HelpRequest) => Promise<void>;
  refresh: () => Promise<void>;
}

export const useHelpRequests = (): UseHelpRequestsResult => {
  const supabase = useSupabase();
  const [items, setItems] = useState<HelpRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const next = await listOpenHelpRequests(supabase);
      setItems(next);
    } catch (err) {
      console.warn('useHelpRequests: refresh failed', err);
    }
  }, [supabase]);

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listOpenHelpRequests(supabase)
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch((err) => console.warn('useHelpRequests: initial load failed', err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // Realtime + adaptive poll fallback (fast when realtime not confirmed,
  // slow when it is — keeps the demo flip moment snappy under any conditions).
  useEffect(() => {
    let pollHandle: number | null = null;
    const startPoll = (intervalMs: number) => {
      if (pollHandle !== null) window.clearInterval(pollHandle);
      pollHandle = window.setInterval(() => {
        // Skip polls in hidden tabs; visibilitychange below catches up on return.
        if (document.hidden) return;
        refresh();
      }, intervalMs);
    };
    startPoll(POLL_MS_FAST);

    const onVisibilityChange = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const channel = (supabase as any)
      .channel('help_requests_widget')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'help_requests' },
        (payload: { new: HelpRequest }) => {
          setItems((prev) => {
            if (prev.some((row) => row.id === payload.new.id)) return prev;
            if (payload.new.status !== 'open' && payload.new.status !== 'accepted') return prev;
            return [payload.new, ...prev];
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'help_requests' },
        (payload: { new: HelpRequest }) => {
          setItems((prev) => {
            if (payload.new.status === 'resolved') {
              return prev.filter((row) => row.id !== payload.new.id);
            }
            return prev.map((row) => (row.id === payload.new.id ? payload.new : row));
          });
        }
      )
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') startPoll(POLL_MS_SLOW);
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          startPoll(POLL_MS_FAST);
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
  }, [supabase, refresh]);

  const updateAndNotify = useCallback(
    async (req: HelpRequest, status: HelpRequestStatus) => {
      try {
        await updateHelpRequestStatus(supabase, req.id, status);
        if (status === 'accepted') {
          await insertNotification(supabase, {
            profile_id: req.student_profile_id,
            kind: 'help_accepted',
            title: 'Your counsellor accepted your help request',
            body: req.university ? `${req.university}${req.program ? ` · ${req.program}` : ''}` : null,
            href: req.application_id ? `/applications/${req.application_id}` : null
          });
        }
      } catch (err) {
        console.warn(`useHelpRequests: ${status} failed`, err);
        throw err;
      }
    },
    [supabase]
  );

  const accept = useCallback(
    async (req: HelpRequest) => {
      await updateAndNotify(req, 'accepted');
    },
    [updateAndNotify]
  );

  const resolve = useCallback(
    async (req: HelpRequest) => {
      await updateAndNotify(req, 'resolved');
    },
    [updateAndNotify]
  );

  return { items, loading, accept, resolve, refresh };
};
