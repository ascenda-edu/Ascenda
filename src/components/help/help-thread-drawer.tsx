'use client';

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, NotebookPen, CalendarPlus, Check, Sparkles, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useSupabase } from '@/hooks/useSupabase';
import { useHelpThread } from '@/hooks/use-help-thread';
import type { HelpMeetingStatus } from '@/lib/types/demo-tables';

type Side = 'student' | 'counsellor';

// Mirrors the focusable-element query in ui/dialog.tsx so the drawer traps
// focus with the same semantics as the shared Dialog primitive.
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const TAB_KEYS = ['thread', 'notes', 'meeting'] as const;

interface HelpThreadDrawerProps {
  open: boolean;
  requestId: string | null;
  side: Side;
  onClose: () => void;
}

const formatRelative = (iso: string): string => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.max(1, Math.round(diffMs / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
};

const formatMeetingTime = (iso: string): string =>
  new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });

const meetingToneClass = (status: HelpMeetingStatus): string => {
  switch (status) {
    case 'confirmed':
      return 'border-emerald-200/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
    case 'cancelled':
      return 'border-border/60 bg-muted/40 text-muted-foreground line-through';
    case 'completed':
      return 'border-violet-200/60 bg-violet-500/10 text-violet-700 dark:text-violet-300';
    default:
      return 'border-sky-200/60 bg-sky-500/10 text-sky-700 dark:text-sky-300';
  }
};

const defaultMeetingSlot = (): string => {
  // Default to Tue 3pm next week in the user's local time.
  const date = new Date();
  date.setDate(date.getDate() + (7 - date.getDay() + 2) % 7 + 1);
  date.setHours(15, 0, 0, 0);
  const offsetMin = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offsetMin * 60_000);
  return local.toISOString().slice(0, 16);
};

export function HelpThreadDrawer({ open, requestId, side, onClose }: HelpThreadDrawerProps) {
  const { request, messages, notes, meetings, loading, reply, addNote, proposeMeeting, setMeetingStatus, setStatus } =
    useHelpThread(requestId);
  const supabase = useSupabase();
  const { showToast } = useToast();

  const asideRef = useRef<HTMLElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const [replyText, setReplyText] = useState('');
  const [noteText, setNoteText] = useState('');
  const [meetingTitle, setMeetingTitle] = useState('15-min check-in');
  const [meetingTime, setMeetingTime] = useState(defaultMeetingSlot);
  const [meetingLocation, setMeetingLocation] = useState('Google Meet · auto link');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'thread' | 'notes' | 'meeting'>('thread');

  // Reset when opening a different request
  useEffect(() => {
    if (open) {
      setReplyText('');
      setNoteText('');
      setMeetingTitle('15-min check-in');
      setMeetingTime(defaultMeetingSlot());
      setMeetingLocation('Google Meet · auto link');
      setTab('thread');
    }
  }, [open, requestId]);

  // Escape closes the drawer (matches ui/dialog.tsx behaviour).
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  // Move focus into the drawer on open, restore it to the trigger on close.
  useEffect(() => {
    if (open) {
      previouslyFocused.current = document.activeElement as HTMLElement | null;
      const node = asideRef.current;
      const target = node?.querySelector<HTMLElement>(FOCUSABLE) ?? node;
      target?.focus();
    } else {
      previouslyFocused.current?.focus?.();
    }
  }, [open]);

  // Trap Tab focus within the drawer while it's open.
  const onTrapKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key !== 'Tab') return;
    const node = asideRef.current;
    if (!node) return;
    const focusables = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null
    );
    if (focusables.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const isCounsellor = side === 'counsellor';

  // Resolve the student's real name from their profile row; fall back to
  // neutral copy rather than showing a wrong hardcoded name.
  const [studentName, setStudentName] = useState('');
  useEffect(() => {
    const profileId = request?.student_profile_id;
    if (!profileId) {
      setStudentName('');
      return;
    }
    let cancelled = false;
    setStudentName('Student');
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', profileId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setStudentName(data?.full_name?.trim() || 'Student');
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, request?.student_profile_id]);

  const handleReply = async () => {
    if (busy || !replyText.trim()) return;
    setBusy(true);
    try {
      await reply(replyText, side);
      setReplyText('');
      showToast({
        title: isCounsellor ? `Reply sent to ${studentName}` : 'Reply sent to your counsellor',
        variant: 'success'
      });
    } catch {
      showToast({ title: "Couldn't send reply", variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const handleAddNote = async () => {
    if (busy || !noteText.trim()) return;
    setBusy(true);
    try {
      await addNote(noteText);
      setNoteText('');
      showToast({ title: 'Note saved', variant: 'success' });
    } catch {
      showToast({ title: "Couldn't save note", variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const handleProposeMeeting = async () => {
    if (busy || !meetingTitle.trim() || !meetingTime) return;
    setBusy(true);
    try {
      await proposeMeeting({
        title: meetingTitle.trim(),
        scheduledFor: new Date(meetingTime).toISOString(),
        location: meetingLocation.trim() || undefined
      });
      showToast({
        title: `Meeting proposed`,
        description: `${meetingTitle} · ${formatMeetingTime(new Date(meetingTime).toISOString())}`,
        variant: 'success'
      });
    } catch {
      showToast({ title: "Couldn't propose meeting", variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const handleMeetingStatus = async (
    meeting: ReturnType<typeof useHelpThread>['meetings'][number],
    status: HelpMeetingStatus
  ) => {
    if (busy) return;
    setBusy(true);
    try {
      await setMeetingStatus(meeting, status, side);
      const label =
        status === 'confirmed'
          ? 'Meeting confirmed'
          : status === 'cancelled'
            ? 'Meeting cancelled'
            : status === 'completed'
              ? 'Meeting marked complete'
              : 'Meeting updated';
      showToast({ title: label, variant: 'success' });
    } catch {
      showToast({ title: "Couldn't update the meeting", variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const handleAccept = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await setStatus('accepted');
      showToast({ title: 'Request accepted', variant: 'success' });
    } catch {
      showToast({ title: "Couldn't accept", variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const handleResolve = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await setStatus('resolved');
      showToast({ title: 'Request resolved', variant: 'success' });
      onClose();
    } catch {
      showToast({ title: "Couldn't resolve", variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && requestId ? (
        <motion.div
          className="fixed inset-0 z-[120] flex justify-end"
          initial={{ pointerEvents: 'none' }}
          animate={{ pointerEvents: 'auto' }}
          exit={{ pointerEvents: 'none' }}
        >
          <motion.div
            className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            ref={asideRef}
            role="dialog"
            aria-modal="true"
            aria-label={request?.subject ?? 'Help request'}
            tabIndex={-1}
            onKeyDown={onTrapKeyDown}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 280, damping: 32 }}
            className="relative z-10 flex h-full w-full max-w-xl flex-col bg-background shadow-2xl outline-none"
          >
            <header className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                  {isCounsellor ? 'Inbox · help request' : 'Your request'}
                </p>
                <h2 className="truncate text-lg font-semibold text-foreground">
                  {request?.university ?? 'Loading…'}
                </h2>
                {request ? (
                  <p className="truncate text-xs text-muted-foreground">
                    {request.program ?? 'Programme'} · from {studentName} ·{' '}
                    {formatRelative(request.created_at)}
                  </p>
                ) : null}
              </div>
              <button
                onClick={onClose}
                className="rounded-full p-1.5 text-muted-foreground transition hover:bg-muted/60 hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </header>

            {/* Tab strip */}
            <div
              role="tablist"
              aria-label="Request views"
              className="flex gap-1 border-b border-border/60 px-3 py-2 text-xs"
            >
              {TAB_KEYS.map((key, index) => {
                const isActive = tab === key;
                // Don't surface the notes count to the student — notes are
                // counsellor-private and the count alone would leak existence.
                const notesLabel = isCounsellor && notes.length
                  ? `Notes · ${notes.length}`
                  : 'Notes';
                const label =
                  key === 'thread'
                    ? `Thread${messages.length ? ` · ${messages.length}` : ''}`
                    : key === 'notes'
                      ? notesLabel
                      : `Meeting${meetings.length ? ` · ${meetings.length}` : ''}`;
                return (
                  <button
                    key={key}
                    id={`help-drawer-tab-${key}`}
                    role="tab"
                    aria-selected={isActive}
                    aria-controls="help-drawer-tabpanel"
                    tabIndex={isActive ? 0 : -1}
                    onClick={() => setTab(key)}
                    onKeyDown={(event) => {
                      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
                      event.preventDefault();
                      const delta = event.key === 'ArrowRight' ? 1 : -1;
                      const next = TAB_KEYS[(index + delta + TAB_KEYS.length) % TAB_KEYS.length];
                      setTab(next);
                      document.getElementById(`help-drawer-tab-${next}`)?.focus();
                    }}
                    className={cn(
                      'rounded-full px-3 py-1.5 transition',
                      isActive
                        ? 'bg-primary font-semibold text-primary-foreground shadow-sm'
                        : 'font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Content */}
            <div
              id="help-drawer-tabpanel"
              role="tabpanel"
              aria-labelledby={`help-drawer-tab-${tab}`}
              className="flex-1 overflow-y-auto px-5 py-4"
            >
              {loading && !request ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : !request ? (
                <p className="text-sm text-muted-foreground">Request not found.</p>
              ) : tab === 'thread' ? (
                <ThreadView
                  initialBody={request.body}
                  initialSubject={request.subject}
                  initialAt={request.created_at}
                  messages={messages}
                  studentName={studentName}
                />
              ) : tab === 'notes' ? (
                <NotesView
                  notes={notes}
                  isCounsellor={isCounsellor}
                  noteText={noteText}
                  setNoteText={setNoteText}
                  onAdd={handleAddNote}
                  busy={busy}
                />
              ) : (
                <MeetingView
                  meetings={meetings}
                  isCounsellor={isCounsellor}
                  meetingTitle={meetingTitle}
                  setMeetingTitle={setMeetingTitle}
                  meetingTime={meetingTime}
                  setMeetingTime={setMeetingTime}
                  meetingLocation={meetingLocation}
                  setMeetingLocation={setMeetingLocation}
                  onPropose={handleProposeMeeting}
                  onSetStatus={handleMeetingStatus}
                  busy={busy}
                />
              )}
            </div>

            {/* Footer composer (Thread tab) */}
            {tab === 'thread' && request ? (
              <div className="border-t border-border/60 bg-card/40 px-5 py-3">
                <div className="flex items-start gap-2">
                  <label htmlFor="help-drawer-reply" className="sr-only">
                    Reply message
                  </label>
                  <textarea
                    id="help-drawer-reply"
                    value={replyText}
                    onChange={(event) => setReplyText(event.target.value)}
                    placeholder={
                      isCounsellor ? `Reply to ${studentName}…` : 'Reply to your counsellor…'
                    }
                    rows={2}
                    className="min-h-[44px] flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                  <Button size="sm" onClick={handleReply} disabled={busy || !replyText.trim()}>
                    <Send className="mr-1.5 h-3.5 w-3.5" />
                    Send
                  </Button>
                </div>

                {isCounsellor ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                    {request.status === 'open' ? (
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={handleAccept}
                        disabled={busy}
                        className="border-violet-300/60 text-violet-700 dark:text-violet-300"
                      >
                        <Check className="mr-1 h-3 w-3" />
                        Accept request
                      </Button>
                    ) : null}
                    {request.status !== 'resolved' ? (
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={handleResolve}
                        disabled={busy}
                        className="border-emerald-300/60 text-emerald-700 dark:text-emerald-300"
                      >
                        <Check className="mr-1 h-3 w-3" />
                        Mark resolved
                      </Button>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">
                        <Check className="h-3 w-3" />
                        Resolved
                      </span>
                    )}
                    <span className="ml-auto text-muted-foreground">
                      Tabs persist · all changes save instantly
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/* ─── Subviews ───────────────────────────────────────────────────────────── */

function ThreadView({
  initialBody,
  initialSubject,
  initialAt,
  messages,
  studentName
}: {
  initialBody: string;
  initialSubject: string;
  initialAt: string;
  messages: ReturnType<typeof useHelpThread>['messages'];
  studentName: string;
}) {
  return (
    <div className="space-y-3">
      <article className="rounded-2xl border border-violet-200/40 bg-violet-500/5 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">{studentName}</p>
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {formatRelative(initialAt)}
          </span>
        </div>
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {initialSubject}
        </p>
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground/90">
          {initialBody}
        </p>
        <p className="mt-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-violet-600 dark:text-violet-400">
          <Sparkles className="h-3 w-3" />
          AI-drafted by student · edited before sending
        </p>
      </article>
      {messages.map((m) => (
        <article
          key={m.id}
          className={cn(
            'rounded-2xl border p-3',
            m.author_role === 'counsellor'
              ? 'border-emerald-200/40 bg-emerald-500/5'
              : 'border-violet-200/40 bg-violet-500/5'
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">
              {m.author_role === 'counsellor' ? 'Counsellor' : studentName}
            </p>
            <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {formatRelative(m.created_at)}
            </span>
          </div>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground/90">
            {m.body}
          </p>
        </article>
      ))}
    </div>
  );
}

function NotesView({
  notes,
  isCounsellor,
  noteText,
  setNoteText,
  onAdd,
  busy
}: {
  notes: ReturnType<typeof useHelpThread>['notes'];
  isCounsellor: boolean;
  noteText: string;
  setNoteText: (s: string) => void;
  onAdd: () => void;
  busy: boolean;
}) {
  return (
    <div className="space-y-3">
      {isCounsellor ? (
        <div className="rounded-2xl border border-border bg-card/40 p-3">
          <div className="flex items-center gap-2">
            <NotebookPen className="h-4 w-4 text-primary" aria-hidden />
            <p className="text-sm font-semibold text-foreground">Private note</p>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Only counsellors see this. Useful for decisions, follow-ups, things to come back to.
          </p>
          <label htmlFor="help-drawer-note" className="sr-only">
            Private note
          </label>
          <textarea
            id="help-drawer-note"
            value={noteText}
            onChange={(event) => setNoteText(event.target.value)}
            placeholder="e.g. PS is strong on the quant side, weak on the 'why this university' question. Send the Cambridge sample for reference."
            rows={3}
            className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <Button size="sm" onClick={onAdd} disabled={busy || !noteText.trim()}>
              Save note
            </Button>
          </div>
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
          Notes are private to the counsellor — visible to them, not to you.
        </p>
      )}
      {isCounsellor ? (
        <div className="space-y-2">
          {notes.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border/60 bg-muted/20 p-3 text-sm text-muted-foreground">
              No notes yet.
            </p>
          ) : (
            notes.map((n) => (
              <article
                key={n.id}
                className="rounded-2xl border border-border/60 bg-card/40 p-3 text-sm text-foreground/90"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    Counsellor note
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    {formatRelative(n.created_at)}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-line">{n.body}</p>
              </article>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function MeetingView({
  meetings,
  isCounsellor,
  meetingTitle,
  setMeetingTitle,
  meetingTime,
  setMeetingTime,
  meetingLocation,
  setMeetingLocation,
  onPropose,
  onSetStatus,
  busy
}: {
  meetings: ReturnType<typeof useHelpThread>['meetings'];
  isCounsellor: boolean;
  meetingTitle: string;
  setMeetingTitle: (s: string) => void;
  meetingTime: string;
  setMeetingTime: (s: string) => void;
  meetingLocation: string;
  setMeetingLocation: (s: string) => void;
  onPropose: () => void;
  onSetStatus: (
    meeting: ReturnType<typeof useHelpThread>['meetings'][number],
    status: HelpMeetingStatus
  ) => void;
  busy: boolean;
}) {
  return (
    <div className="space-y-3">
      {isCounsellor ? (
        <div className="rounded-2xl border border-border bg-card/40 p-3">
          <div className="flex items-center gap-2">
            <CalendarPlus className="h-4 w-4 text-primary" aria-hidden />
            <p className="text-sm font-semibold text-foreground">Propose a meeting</p>
          </div>
          <div className="mt-2 space-y-2">
            <div>
              <label htmlFor="help-drawer-meeting-title" className="sr-only">
                Meeting title
              </label>
              <input
                id="help-drawer-meeting-title"
                type="text"
                value={meetingTitle}
                onChange={(event) => setMeetingTitle(event.target.value)}
                placeholder="Meeting title"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>
            <div>
              <label htmlFor="help-drawer-meeting-time" className="sr-only">
                Meeting date and time
              </label>
              <input
                id="help-drawer-meeting-time"
                type="datetime-local"
                value={meetingTime}
                onChange={(event) => setMeetingTime(event.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>
            <div>
              <label htmlFor="help-drawer-meeting-location" className="sr-only">
                Location or video link
              </label>
              <input
                id="help-drawer-meeting-location"
                type="text"
                value={meetingLocation}
                onChange={(event) => setMeetingLocation(event.target.value)}
                placeholder="Location or video link"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>
            <div className="flex items-center justify-end">
              <Button size="sm" onClick={onPropose} disabled={busy || !meetingTitle.trim() || !meetingTime}>
                Propose
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
          Meetings proposed by your counsellor appear here. Confirm the time that works, or decline to ask for another.
        </p>
      )}

      <div className="space-y-2">
        {meetings.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border/60 bg-muted/20 p-3 text-sm text-muted-foreground">
            No meetings yet.
          </p>
        ) : (
          meetings.map((m) => {
            // Per-status, per-side actions. Student confirms a proposed time;
            // either side can cancel; the counsellor closes one out as complete.
            const actions: { label: string; status: HelpMeetingStatus; primary?: boolean }[] = [];
            if (m.status === 'proposed') {
              if (isCounsellor) {
                actions.push({ label: 'Cancel', status: 'cancelled' });
              } else {
                actions.push({ label: 'Confirm', status: 'confirmed', primary: true });
                actions.push({ label: 'Decline', status: 'cancelled' });
              }
            } else if (m.status === 'confirmed') {
              if (isCounsellor) {
                actions.push({ label: 'Mark complete', status: 'completed', primary: true });
              }
              actions.push({ label: 'Cancel', status: 'cancelled' });
            }

            return (
              <article
                key={m.id}
                className={cn('flex items-start gap-3 rounded-2xl border p-3', meetingToneClass(m.status))}
              >
                <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{m.title}</p>
                  <p className="text-xs">
                    {formatMeetingTime(m.scheduled_for)} · {m.duration_minutes} min
                    {m.location ? ` · ${m.location}` : null}
                  </p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-[0.2em]">{m.status}</p>
                  {actions.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {actions.map((action) => (
                        <Button
                          key={action.status}
                          size="sm"
                          variant={action.primary ? 'default' : 'outline'}
                          disabled={busy}
                          onClick={() => onSetStatus(m, action.status)}
                        >
                          {action.label}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
