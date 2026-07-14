'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { useRealtimePoll } from '@/hooks/use-realtime-poll';
import {
  insertNotification,
  listOpenHelpRequests,
  updateHelpRequestStatus
} from '@/lib/demo/help-request-client';
import type { HelpRequest, HelpRequestStatus } from '@/lib/types/demo-tables';

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

  // Realtime + adaptive poll fallback (see use-realtime-poll.ts for the
  // two-speed rationale — keeps the demo flip moment snappy under any conditions).
  useRealtimePoll({
    channelName: 'help_requests_widget',
    onPoll: refresh,
    subscriptions: [
      {
        event: 'INSERT',
        table: 'help_requests',
        handler: (payload: { new: HelpRequest }) => {
          setItems((prev) => {
            if (prev.some((row) => row.id === payload.new.id)) return prev;
            if (payload.new.status !== 'open' && payload.new.status !== 'accepted') return prev;
            return [payload.new, ...prev];
          });
        }
      },
      {
        event: 'UPDATE',
        table: 'help_requests',
        handler: (payload: { new: HelpRequest }) => {
          setItems((prev) => {
            if (payload.new.status === 'resolved') {
              return prev.filter((row) => row.id !== payload.new.id);
            }
            return prev.map((row) => (row.id === payload.new.id ? payload.new : row));
          });
        }
      }
    ]
  });

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
