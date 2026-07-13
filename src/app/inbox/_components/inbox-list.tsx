'use client';

import { useEffect, useState, useCallback } from 'react';
import { Inbox, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSupabase } from '@/hooks/useSupabase';
import { useHelpDrawer } from '@/components/help/help-drawer-provider';
import {
  listInboxRequests,
  listUnreadByRequest,
  markNotificationRead
} from '@/lib/demo/help-request-client';
import type { HelpRequest } from '@/lib/types/demo-tables';

interface InboxListProps {
  profileId: string;
}

const STATUS_PILL: Record<HelpRequest['status'], { label: string; tone: string }> = {
  open: { label: 'Open', tone: 'border-sky-200/60 bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  accepted: { label: 'In progress', tone: 'border-amber-200/60 bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  resolved: { label: 'Resolved', tone: 'border-emerald-200/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' }
};

const formatWhen = (iso: string): string => {
  const d = new Date(iso);
  const diffH = (Date.now() - d.getTime()) / 36e5;
  if (diffH < 1) return `${Math.max(1, Math.round(diffH * 60))} min ago`;
  if (diffH < 24) return `${Math.round(diffH)} h ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

const initiatorLabel = (req: HelpRequest): string =>
  req.initiated_by === 'counsellor' ? 'From Sarah · your counsellor' : 'From you';

export function InboxList({ profileId }: InboxListProps) {
  const supabase = useSupabase();
  const { openRequest } = useHelpDrawer();
  const [requests, setRequests] = useState<HelpRequest[]>([]);
  const [unreadByRequest, setUnreadByRequest] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [reqs, unread] = await Promise.all([
      listInboxRequests(supabase, profileId),
      listUnreadByRequest(supabase, profileId)
    ]);
    setRequests(reqs);
    setUnreadByRequest(unread);
  }, [supabase, profileId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    refresh()
      .catch((err) => console.warn('inbox: initial load failed', err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  // Realtime: any new help_request or new notification for this user invalidates
  // and we refetch. The help_requests subscription is unfiltered because the demo
  // is single-user; a multi-user rollout would filter on student_profile_id.
  useEffect(() => {
    const channel = (supabase as any)
      .channel('inbox_list')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'help_requests' },
        () => refresh()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `profile_id=eq.${profileId}` },
        () => refresh()
      )
      .subscribe();
    return () => {
      try {
        (supabase as any).removeChannel(channel);
      } catch {
        // ignore
      }
    };
  }, [supabase, profileId, refresh]);

  const handleOpen = useCallback(
    async (req: HelpRequest) => {
      openRequest(req.id);
      // Best-effort: mark unread notifications for this thread as read.
      // Don't block the drawer open if it fails.
      const unread = unreadByRequest.get(req.id) ?? 0;
      if (unread > 0) {
        try {
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
        } catch (err) {
          console.warn('inbox: mark read failed', err);
        }
      }
    },
    [openRequest, unreadByRequest, supabase, profileId]
  );

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted/40" />
        ))}
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="rounded-[28px] border border-dashed border-border bg-muted/40 p-12 text-center">
        <Inbox className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
        <p className="font-semibold text-foreground">No messages yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          When you raise a help request — or your counsellor reaches out — it’ll land here.
        </p>
      </div>
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
                ? 'border-primary/30 bg-primary/5 hover:bg-primary/10'
                : 'border-border bg-card hover:bg-muted/40'
            )}
          >
            <div
              className={cn(
                'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                isUnread ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
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
                  <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold leading-4 text-primary-foreground">
                    {unread}
                  </span>
                ) : null}
              </div>
              <p className="line-clamp-2 text-xs text-muted-foreground">{req.body}</p>
              <div className="flex items-center gap-2 pt-0.5">
                <span className="text-[11px] text-muted-foreground">{initiatorLabel(req)}</span>
                <span className="text-[11px] text-muted-foreground/60">·</span>
                <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold', status.tone)}>
                  {status.label}
                </span>
              </div>
            </div>
            <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
              {formatWhen(req.created_at)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
