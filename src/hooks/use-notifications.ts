'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useSupabase } from '@/hooks/useSupabase';
import { useRealtimePoll } from '@/hooks/use-realtime-poll';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead
} from '@/lib/demo/help-request-client';
import type { Notification, NotificationAudience } from '@/lib/types/demo-tables';

export interface UseNotificationsResult {
  items: Notification[];
  unreadCount: number;
  loading: boolean;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  refresh: () => Promise<void>;
}

// Derive which inbox audience to show from the current route. /counsellor/*
// = counsellor inbox; everything else = student inbox. Lets a single user
// (the demo's greg@workiflow.com) hold two clean inboxes without auth changes.
const audienceForPath = (pathname: string | null): NotificationAudience =>
  pathname?.startsWith('/counsellor') ? 'counsellor' : 'student';

export const useNotifications = (): UseNotificationsResult => {
  const supabase = useSupabase();
  const pathname = usePathname();
  const audience = audienceForPath(pathname);
  const [items, setItems] = useState<Notification[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const realtimeOkRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!profileId) return;
    try {
      const next = await listNotifications(supabase, profileId, audience, 25);
      setItems(next);
    } catch (err) {
      console.warn('useNotifications: refresh failed', err);
    }
  }, [supabase, profileId, audience]);

  // Resolve current profile id once.
  useEffect(() => {
    let cancelled = false;
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (cancelled) return;
        setProfileId(data?.user?.id ?? null);
      })
      // getUser() reaches the network and can reject. Unhandled, that was an
      // unhandled rejection that left `profileId` null for the life of the
      // mount, so the bell rendered permanently empty — indistinguishable from
      // a genuinely empty inbox, and silent. Same hazard as use-help-thread.ts
      // and use-is-demo-user.ts; `error` is surfaced so it is at least visible.
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error('[useNotifications] could not resolve the current user', error);
        setProfileId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // Initial load. Re-runs whenever audience changes (i.e. the user
  // flipped to the other side).
  useEffect(() => {
    if (!profileId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    listNotifications(supabase, profileId, audience, 25)
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch((err) => console.warn('useNotifications: initial load failed', err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, profileId, audience]);

  // Realtime: subscribe to inserts/updates for this profile, with the shared
  // two-speed poll fallback (see use-realtime-poll.ts for the rationale).
  useRealtimePoll({
    channelName: `notif:${profileId}:${audience}`,
    enabled: !!profileId,
    onPoll: refresh,
    onStatusChange: (status) => {
      if (status === 'SUBSCRIBED') realtimeOkRef.current = true;
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        realtimeOkRef.current = false;
      }
    },
    subscriptions: [
      {
        event: 'INSERT',
        table: 'notifications',
        filter: `profile_id=eq.${profileId}`,
        handler: (payload: { new: Notification }) => {
          // Realtime filter can only match one column; double-check audience
          // here so we don't surface counsellor inbox items on the student
          // side and vice versa.
          if (payload.new.audience !== audience) return;
          setItems((prev) => {
            if (prev.some((row) => row.id === payload.new.id)) return prev;
            return [payload.new, ...prev].slice(0, 25);
          });
        }
      },
      {
        event: 'UPDATE',
        table: 'notifications',
        filter: `profile_id=eq.${profileId}`,
        handler: (payload: { new: Notification }) => {
          if (payload.new.audience !== audience) return;
          setItems((prev) =>
            prev.map((row) => (row.id === payload.new.id ? payload.new : row))
          );
        }
      }
    ]
  });

  const markRead = useCallback(
    async (id: string) => {
      try {
        await markNotificationRead(supabase, id);
        setItems((prev) =>
          prev.map((row) => (row.id === id ? { ...row, read_at: new Date().toISOString() } : row))
        );
      } catch (err) {
        console.warn('useNotifications: markRead failed', err);
      }
    },
    [supabase]
  );

  const markAllRead = useCallback(async () => {
    if (!profileId) return;
    try {
      await markAllNotificationsRead(supabase, profileId, audience);
      const now = new Date().toISOString();
      setItems((prev) => prev.map((row) => (row.read_at ? row : { ...row, read_at: now })));
    } catch (err) {
      console.warn('useNotifications: markAllRead failed', err);
    }
  }, [supabase, profileId, audience]);

  const unreadCount = items.filter((row) => !row.read_at).length;

  return { items, unreadCount, loading, markRead, markAllRead, refresh };
};
