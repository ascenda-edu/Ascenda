'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, CheckCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { useNotifications } from '@/hooks/use-notifications';
import { useHelpDrawer } from '@/components/help/help-drawer-provider';
import type { Notification } from '@/lib/types/demo-tables';

const HELP_HREF_RX = /[?&]help=([0-9a-fA-F-]{36})/;

const extractHelpRequestId = (href?: string | null): string | null => {
  if (!href) return null;
  const match = href.match(HELP_HREF_RX);
  return match?.[1] ?? null;
};

// Only navigate to relative in-app paths. Under the demo's open RLS any user can
// write a notification row, so an attacker could inject an external/junk href
// (phishing). A safe href must be a root-relative path ('/foo') and not a
// protocol-relative one ('//evil.com', which the browser treats as external).
const isSafeHref = (href?: string | null): href is string =>
  !!href && href.startsWith('/') && !href.startsWith('//');

// Semantic Badge variants, not class bundles — the pill geometry now lives in
// exactly one place (ui/badge.tsx) and this table says only what the tone MEANS.
const KIND_TONE: Record<string, BadgeVariant> = {
  help_request: 'primary',
  help_accepted: 'success',
  deck_assignment: 'warning',
  default: 'neutral'
};

const formatRelative = (iso: string): string => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.max(1, Math.round(diffMs / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
};

export const NotificationBell = ({ className }: { className?: string }) => {
  const { items, unreadCount, markRead, markAllRead } = useNotifications();
  const { openRequest } = useHelpDrawer();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const prevUnreadRef = useRef(unreadCount);
  const [announcement, setAnnouncement] = useState('');

  // Announce arriving notifications for screen readers when the unread count
  // climbs (new rows landing via realtime), independent of the panel being open.
  useEffect(() => {
    if (unreadCount > prevUnreadRef.current) {
      const delta = unreadCount - prevUnreadRef.current;
      setAnnouncement(`${delta} new notification${delta === 1 ? '' : 's'} · ${unreadCount} unread`);
    }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handle = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  // Escape closes the panel and returns focus to the bell button.
  useEffect(() => {
    if (!open) return;
    const handle = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [open]);

  // ── Why this is NOT a Dialog ────────────────────────────────────────────────
  // This is a POPOVER: it is anchored to the bell, it does not cover the page,
  // and the page behind it stays live. Porting it to ui/dialog.tsx would trap
  // focus, lock body scroll and mark the rest of the app `aria-hidden` for a
  // dropdown — heavier than the interaction deserves and a regression in feel.
  // The correct non-modal semantics are instead: `role="dialog"` WITHOUT
  // `aria-modal` (which would be a lie — nothing is trapped), the trigger's
  // `aria-haspopup="dialog"` + `aria-expanded` + `aria-controls`, focus moved
  // into the panel on open, Escape restoring focus to the bell, and the panel
  // closing when focus leaves it (below) so it can never sit open and orphaned
  // behind the user's caret. A future @radix-ui/react-popover would supersede
  // all of this — it is NOT currently a dependency (docs/audit/09, LOW-14).
  useEffect(() => {
    if (!open) return;
    // Land inside the panel rather than leaving the caret on the trigger, so a
    // screen-reader user is placed in the thing that just appeared.
    panelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handle = (event: FocusEvent) => {
      const next = event.relatedTarget as Node | null;
      // relatedTarget is null when focus leaves the document entirely (tab-away
      // to browser chrome) — keep the panel open in that case.
      if (!next || wrapperRef.current?.contains(next)) return;
      setOpen(false);
    };
    const node = wrapperRef.current;
    node?.addEventListener('focusout', handle);
    return () => node?.removeEventListener('focusout', handle);
  }, [open]);

  // `markRead`/`markAllRead` swallow their own failures into a console warning
  // (see use-notifications.ts) — these terminal catches are what keeps the
  // promise from floating. The consequence of a failure is only that the unread
  // dot survives until the next poll, which is the SAFE direction to be wrong
  // in: it never claims a notification was read when it was not, so there is
  // nothing worth interrupting the user for.
  const handleMarkAllRead = (): void => {
    markAllRead().catch((err: unknown) => {
      console.warn('notification-bell: markAllRead failed', err);
    });
  };

  const handleItemClick = (notif: Notification) => {
    if (!notif.read_at) {
      markRead(notif.id).catch((err: unknown) => {
        console.warn('notification-bell: markRead failed', err);
      });
    }
    setOpen(false);
    // If the notification points at a specific help_request, open the
    // drawer rather than navigating to a list page. Drawer renders the
    // full thread + reply/notes/meeting actions.
    const helpId = extractHelpRequestId(notif.href);
    if (helpId) {
      openRequest(helpId);
    }
  };

  return (
    <div ref={wrapperRef} className={cn('relative', className)}>
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
      {/* KEPT as a native `title=`, deliberately.
          docs/audit/09-design-system.md MED-10 says to convert the `title=`
          attributes that carry information available nowhere else and to leave
          the genuinely supplementary ones. This one is supplementary twice over:
          the button already has an aria-label (so AT users are covered) and a
          bell icon needs no gloss. Converting it was measured: this component
          renders in the navbar on every authenticated route, and pulling
          TooltipContent in makes @radix-ui/react-tooltip's Popper/floating-ui
          live code — **+9 kB gzip on every one of them**, for one hover hint.
          The two deck chips in counsellor/universities/_universities-client.tsx
          ARE converted, because there the tooltip is the only signal that the
          chip is clickable. */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? 'notification-bell-panel' : undefined}
        title="Notifications"
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Bell className="h-4 w-4" aria-hidden />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger-fill px-1 text-label font-semibold text-danger-foreground shadow-e-1">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            ref={panelRef}
            id="notification-bell-panel"
            role="dialog"
            aria-label="Notifications"
            tabIndex={-1}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className="absolute right-0 top-[calc(100%+8px)] z-panel w-80 overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-e-4 outline-none backdrop-blur-lg sm:w-96"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <p className="text-sm font-semibold">Notifications</p>
                <p className="text-label text-muted-foreground">
                  {unreadCount === 0 ? 'All caught up' : `${unreadCount} unread`}
                </p>
              </div>
              {unreadCount > 0 ? (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-label font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                >
                  <CheckCheck className="h-3 w-3" />
                  Mark all read
                </button>
              ) : null}
            </div>

            <div className="max-h-[60vh] overflow-y-auto overscroll-contain">
              {items.length === 0 ? (
                <EmptyState
                  size="inline"
                  icon={<Bell />}
                  title="No notifications yet"
                  description="Replies, accepted requests and new quests land here."
                  className="m-3"
                />
              ) : (
                <ul className="divide-y divide-border">
                  {items.map((notif) => {
                    const tone = KIND_TONE[notif.kind] ?? KIND_TONE.default;
                    const unread = !notif.read_at;
                    const content = (
                      <div
                        className={cn(
                          'group flex gap-3 px-4 py-3 transition hover:bg-muted',
                          unread ? 'bg-primary/10' : null
                        )}
                      >
                        <span
                          className={cn('mt-0.5 h-2 w-2 shrink-0 rounded-full', unread ? 'bg-primary' : 'bg-transparent')}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p
                              className={cn(
                                'truncate text-sm',
                                unread ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground'
                              )}
                            >
                              {notif.title}
                            </p>
                            <Badge
                              variant={tone}
                              size="sm"
                              className="shrink-0 font-medium uppercase tracking-[0.15em]"
                            >
                              {notif.kind.replaceAll('_', ' ')}
                            </Badge>
                          </div>
                          {notif.body ? (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">{notif.body}</p>
                          ) : null}
                          <p className="mt-1 text-label uppercase tracking-[0.2em] text-muted-foreground">
                            {formatRelative(notif.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                    const helpId = extractHelpRequestId(notif.href);
                    return (
                      <li key={notif.id}>
                        {isSafeHref(notif.href) && !helpId ? (
                          <Link href={notif.href} onClick={() => handleItemClick(notif)}>
                            {content}
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleItemClick(notif)}
                            className="block w-full text-left"
                          >
                            {content}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
