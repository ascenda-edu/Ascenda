'use client';

import { useEffect, useState, useCallback } from 'react';
import { Inbox, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';
import { formatRelativeTime } from '@/lib/utils/dates';
import { useSupabase } from '@/hooks/useSupabase';
import { useRealtimePoll } from '@/hooks/use-realtime-poll';
import { useHelpDrawer } from '@/components/help/help-drawer-provider';
import {
  countUnreadForStudent,
  listInboxRequests,
  markNotificationRead,
  resolveProfileNames
} from '@/lib/demo/help-request-client';
import type { HelpRequest } from '@/lib/types/demo-tables';

interface InboxListProps {
  profileId: string;
}

// Tone tokens (globals.css): warning = pending work, success = done. "Open" is
// deliberately neutral — nothing is owed yet. AA-verified in both themes, so no
// `dark:` variants.
const STATUS_PILL: Record<HelpRequest['status'], { label: string; tone: string }> = {
  open: { label: 'Open', tone: 'border-border bg-muted text-muted-foreground' },
  accepted: { label: 'In progress', tone: 'border-warning/30 bg-warning-subtle text-warning' },
  resolved: { label: 'Resolved', tone: 'border-success/30 bg-success-subtle text-success' }
};

export function InboxList({ profileId }: InboxListProps) {
  const supabase = useSupabase();
  const { openRequest } = useHelpDrawer();
  const [requests, setRequests] = useState<HelpRequest[]>([]);
  const [unreadByRequest, setUnreadByRequest] = useState<Map<string, number>>(new Map());
  const [counsellorNames, setCounsellorNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    // Unread comes from student_last_read_at (same source of truth as the "Seen"
    // receipt and the counsellor's unread count), not notification hrefs — see
    // countUnreadForStudent. Keeps the badge from contradicting the receipt.
    const [reqs, unread] = await Promise.all([
      listInboxRequests(supabase, profileId),
      countUnreadForStudent(supabase, profileId)
    ]);
    setRequests(reqs);
    setUnreadByRequest(unread);
    // Real counsellor names for claimed threads. Best-effort — unclaimed
    // threads (or a failed lookup) fall back to neutral copy below.
    const counsellorIds = reqs
      .map((r) => r.counsellor_profile_id)
      .filter((id): id is string => Boolean(id));
    if (counsellorIds.length > 0) {
      try {
        // Empty fallback (not 'Your counsellor') so the `name ?` guard in
        // initiatorLabel selects the neutral 'From your counsellor' branch for a
        // counsellor with no resolved name — otherwise every row reads
        // 'From Your counsellor · your counsellor' and the neutral branch is dead.
        setCounsellorNames(await resolveProfileNames(supabase, counsellorIds, ''));
      } catch (err) {
        console.warn('inbox: counsellor name lookup failed', err);
      }
    }
    setLoadFailed(false);
  }, [supabase, profileId]);

  // Background refresh (poll tick / realtime event): fire-and-forget on purpose.
  // A single dropped refetch only means the list is briefly stale and the next
  // tick retries, so it is logged rather than surfaced — but it is never silent,
  // and it never blanks the list the student is already looking at.
  const refresh = useCallback((): void => {
    load().catch((err: unknown) => {
      console.warn('inbox: refresh failed', err);
    });
  }, [load]);

  const initiatorLabel = (req: HelpRequest): string => {
    const name = req.counsellor_profile_id
      ? counsellorNames.get(req.counsellor_profile_id)
      : undefined;
    if (req.initiated_by === 'counsellor') {
      return name ? `From ${name} · your counsellor` : 'From your counsellor';
    }
    return 'From you';
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load()
      .catch((err: unknown) => {
        // A failed first load used to fall through to the "No messages yet"
        // empty state — telling the student they have no conversations when the
        // query simply did not come back. Flag it and say so instead.
        console.warn('inbox: initial load failed', err);
        if (!cancelled) setLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  // Realtime-with-poll-fallback: any change to this student's help_requests, or
  // a new notification for them, invalidates and we refetch. The shared hook adds
  // a poll fallback + visibilitychange catch-up so the inbox keeps updating even
  // if the websocket drops.
  useRealtimePoll({
    channelName: 'inbox_list',
    enabled: !!profileId,
    onPoll: refresh,
    subscriptions: [
      { table: 'help_requests', filter: `student_profile_id=eq.${profileId}`, handler: refresh },
      { table: 'notifications', filter: `profile_id=eq.${profileId}`, handler: refresh }
    ]
  });

  const handleOpen = useCallback(
    (req: HelpRequest): void => {
      openRequest(req.id);
      // Best-effort: mark unread notifications for this thread as read.
      // Don't block the drawer open if it fails.
      const unread = unreadByRequest.get(req.id) ?? 0;
      if (unread === 0) return;
      const markRead = async (): Promise<void> => {
        // We don't have notification ids here without another query, so just
        // bulk-mark all unread student notifications pointing at this thread.
        const { data } = await (supabase as any)
          .from('notifications')
          .select('id, href')
          .eq('profile_id', profileId)
          .eq('audience', 'student')
          .is('read_at', null);
        const ids = ((data ?? []) as { id: string; href: string | null }[])
          .filter((r) => r.href && r.href.includes(`help=${req.id}`))
          .map((r) => r.id);
        await Promise.all(ids.map((id) => markNotificationRead(supabase, id)));
        setUnreadByRequest((prev) => {
          const next = new Map(prev);
          next.delete(req.id);
          return next;
        });
      };
      // Console-only by design: the drawer has already opened and the student
      // is reading the thread. The only consequence of a failure is that the
      // unread dot survives until the next refresh, which is strictly the SAFE
      // direction to be wrong in — it never claims a message was read when it
      // was not.
      markRead().catch((err: unknown) => {
        console.warn('inbox: mark read failed', err);
      });
    },
    [openRequest, unreadByRequest, supabase, profileId]
  );

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    );
  }

  if (loadFailed && requests.length === 0) {
    return (
      <EmptyState
        icon={<Inbox />}
        title="Couldn't load your messages"
        description="This is a connection problem, not an empty inbox. It retries automatically — or reload the page."
      />
    );
  }

  if (requests.length === 0) {
    return (
      <EmptyState
        icon={<Inbox />}
        title="No messages yet"
        description="When you raise a help request — or your counsellor reaches out — it’ll land here."
      />
    );
  }

  return (
    <div className="space-y-2">
      {requests.map((req) => {
        const unread = unreadByRequest.get(req.id) ?? 0;
        const isUnread = unread > 0;
        const status = STATUS_PILL[req.status];
        return (
          <button
            key={req.id}
            type="button"
            onClick={() => handleOpen(req)}
            className={cn(
              'group flex w-full items-start gap-4 rounded-2xl border px-5 py-4 text-left transition',
              isUnread
                ? 'border-primary/30 bg-primary/10 hover:border-primary/60'
                : 'border-border bg-card hover:bg-muted'
            )}
          >
            <div
              className={cn(
                'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                isUnread ? 'bg-primary/10 text-primary-ink' : 'bg-border text-muted-foreground'
              )}
            >
              <MessageSquare className="h-4 w-4" />
            </div>
            <div className="flex-1 space-y-1 overflow-hidden">
              <div className="flex items-center gap-2">
                <p className={cn('truncate text-sm', isUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground')}>
                  {req.subject}
                </p>
                {isUnread ? (
                  <span className="rounded-full bg-primary px-1.5 text-label font-bold leading-4 text-primary-foreground">
                    {unread}
                  </span>
                ) : null}
              </div>
              <p className="line-clamp-2 text-xs text-muted-foreground">{req.body}</p>
              <div className="flex items-center gap-2 pt-0.5">
                <span className="text-label text-muted-foreground">{initiatorLabel(req)}</span>
                <span className="text-label text-muted-foreground">·</span>
                <span className={cn('rounded-full border px-2 py-0.5 text-label font-semibold', status.tone)}>
                  {status.label}
                </span>
              </div>
            </div>
            <span className="shrink-0 text-label text-muted-foreground tabular-nums">
              {formatRelativeTime(req.created_at)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
