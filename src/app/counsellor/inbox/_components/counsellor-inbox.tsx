'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Inbox, Search, MessageSquare, CheckCheck } from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/utils/dates';
import { useSupabase } from '@/hooks/useSupabase';
import { useRealtimePoll } from '@/hooks/use-realtime-poll';
import { useHelpDrawer } from '@/components/help/help-drawer-provider';
import { loadCounsellorInbox, type CounsellorInboxItem } from '@/lib/demo/help-request-client';
import type { HelpRequestStatus } from '@/lib/types/demo-tables';

// See use-realtime-poll.ts for the rationale on the two-speed poll. The inbox
// polls a touch slower than the other views (a reload here is 4 queries).
const POLL_MS_FAST = 2000;
const POLL_MS_SLOW = 12000;

type FilterKey = 'open' | 'accepted' | 'resolved' | 'all';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'accepted', label: 'In progress' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'all', label: 'All' }
];

const STATUS_PILL: Record<HelpRequestStatus, { label: string; tone: string }> = {
  open: { label: 'Open', tone: 'border-feature/25 bg-feature-subtle text-feature' },
  accepted: { label: 'In progress', tone: 'border-warning/25 bg-warning-subtle text-warning' },
  resolved: { label: 'Resolved', tone: 'border-success/25 bg-success-subtle text-success' }
};

export function CounsellorInbox() {
  const supabase = useSupabase();
  const { openRequest } = useHelpDrawer();
  const [items, setItems] = useState<CounsellorInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('open');
  const [query, setQuery] = useState('');

  const refresh = useCallback(async () => {
    try {
      const next = await loadCounsellorInbox(supabase);
      setItems(next);
    } catch (err) {
      console.warn('counsellor inbox: refresh failed', err);
    }
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    refresh().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  // Realtime + adaptive poll fallback (fast until the socket confirms, slow after).
  useRealtimePoll({
    channelName: 'counsellor_inbox',
    fastMs: POLL_MS_FAST,
    slowMs: POLL_MS_SLOW,
    onPoll: refresh,
    subscriptions: [
      { table: 'help_requests', handler: () => refresh() },
      { table: 'help_messages', handler: () => refresh() }
    ]
  });

  const counts = useMemo(
    () => ({
      open: items.filter((i) => i.request.status === 'open').length,
      accepted: items.filter((i) => i.request.status === 'accepted').length,
      resolved: items.filter((i) => i.request.status === 'resolved').length,
      all: items.length
    }),
    [items]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (filter !== 'all' && item.request.status !== filter) return false;
      if (!q) return true;
      return (
        item.studentName.toLowerCase().includes(q) ||
        item.request.subject.toLowerCase().includes(q) ||
        (item.request.university ?? '').toLowerCase().includes(q)
      );
    });
  }, [items, filter, query]);

  return (
    <div className="space-y-4">
      {/* Toolbar: filters + search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Filter conversations" className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const isActive = filter === f.key;
            const count = counts[f.key];
            return (
              <button
                key={f.key}
                role="tab"
                aria-selected={isActive}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-semibold transition',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-e-1'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                )}
              >
                {f.label}
                {count > 0 ? <span className="ml-1.5 tabular-nums opacity-70">{count}</span> : null}
              </button>
            );
          })}
        </div>
        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <label htmlFor="counsellor-inbox-search" className="sr-only">
            Search conversations
          </label>
          <input
            id="counsellor-inbox-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search student or subject…"
            className="form-input rounded-full py-2 pl-9 pr-3 text-xs"
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[76px] animate-pulse rounded-2xl bg-muted/40" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-4xl border border-dashed border-border bg-muted/40 p-12 text-center">
          <Inbox className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
          <p className="font-semibold text-foreground">
            {query.trim() || filter !== 'open' ? 'No conversations match' : 'No open conversations'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {query.trim() || filter !== 'open'
              ? 'Try a different filter or search term.'
              : 'When a student raises a help request — or you message one — it lands here.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {visible.map((item) => {
              const { request } = item;
              const isUnread = item.unreadCount > 0;
              const pill = STATUS_PILL[request.status];
              return (
                <motion.li
                  key={request.id}
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 16 }}
                  transition={{ duration: 0.18 }}
                >
                  <button
                    type="button"
                    onClick={() => openRequest(request.id)}
                    className={cn(
                      'group flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left hover-lift',
                      isUnread ? 'border-primary/30 bg-primary/5' : 'border-border bg-card hover:bg-muted/40'
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                        isUnread ? 'bg-primary/20 text-primary-ink' : 'bg-muted text-muted-foreground'
                      )}
                      aria-hidden
                    >
                      {getInitials(item.studentName)}
                    </span>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <p className={cn('truncate text-sm', isUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground')}>
                          {item.studentName}
                        </p>
                        {isUnread ? (
                          <span className="shrink-0 rounded-full bg-primary px-1.5 text-label font-bold leading-4 text-primary-foreground tabular-nums">
                            {item.unreadCount}
                          </span>
                        ) : null}
                        <span className="ml-auto shrink-0 text-label text-muted-foreground tabular-nums">
                          {formatRelativeTime(item.lastMessageAt)}
                        </span>
                      </div>
                      <p className="truncate text-xs font-medium text-foreground/80">{request.subject}</p>
                      <p className="line-clamp-1 text-xs text-muted-foreground">
                        {item.lastMessageFromCounsellor ? (
                          <span className="inline-flex items-center gap-1">
                            <CheckCheck className="h-3 w-3 shrink-0" aria-hidden />
                            {item.lastMessageBody}
                          </span>
                        ) : (
                          item.lastMessageBody
                        )}
                      </p>
                      <div className="flex items-center gap-2 pt-0.5">
                        <span className={cn('rounded-full border px-2 py-0.5 text-label font-semibold', pill.tone)}>
                          {pill.label}
                        </span>
                        {request.university ? (
                          <span className="truncate text-label text-muted-foreground">
                            {request.university}
                            {request.program ? ` · ${request.program}` : ''}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <MessageSquare
                      className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-foreground"
                      aria-hidden
                    />
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
