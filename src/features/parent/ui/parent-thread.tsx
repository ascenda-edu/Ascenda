'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCheck, Loader2, MessageSquare, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';
import type { ParentThread, ParentThreadMessage } from '../model/types';

// Parent side of the parent↔counsellor thread — same bubble/receipt idiom as
// the counsellor's view (counsellor/_components/parent-portal.tsx), with the
// parent on the right. Optimistic send with rollback via POST
// /api/parent/messages.

const TEMPLATES = [
  {
    id: 'meeting_request',
    label: 'Request a meeting',
    content: "Could we set up a short call to talk through [student]'s university options and next steps? I'd value your read on where things stand.",
  },
  {
    id: 'progress_question',
    label: 'Ask for an update',
    content: "How is [student] tracking against the upcoming deadlines? Anything we should be helping with at home?",
  },
  {
    id: 'costs_question',
    label: 'Ask about costs',
    content: "We're planning the budget for [student]'s options — could you share your view on the realistic total costs and any scholarship routes worth pursuing?",
  },
];

const fullDateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function ParentThreadPanel({
  thread,
  childFirstName,
}: {
  thread: ParentThread | null;
  childFirstName: string;
}) {
  const [composeText, setComposeText] = useState('');
  const [localMessages, setLocalMessages] = useState<ParentThreadMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const messages = useMemo(() => {
    const stored = thread?.messages ?? [];
    return [...stored, ...localMessages].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }, [thread, localMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (!thread) {
    return (
      <EmptyState
        icon={<MessageSquare />}
        title="No conversation set up yet"
        description={`The counsellor hasn't opened a parent thread for ${childFirstName} yet. Once they add you as a contact, your conversation will live here.`}
        hint="Ask the school to add your contact details to the counsellor's parent directory."
      />
    );
  }

  // Synchronous `() => void` event-handler boundary around an async body: an
  // `async` handler on `onClick`/`onKeyDown` returns a promise the DOM discards.
  const handleSend = (): void => {
    if (isSending) return;
    const body = composeText.trim();
    if (!body) return;
    setIsSending(true);
    setSendError(null);
    const optimistic: ParentThreadMessage = {
      id: `pm-local-${Date.now()}`,
      sender: 'parent',
      content: body,
      date: new Date().toISOString(),
      read: false,
      template: null,
    };
    setLocalMessages((prev) => [...prev, optimistic]);
    setComposeText('');

    // Rolling the optimistic bubble back was the ENTIRE failure path, and the
    // composer had already been cleared — so a failed send deleted the parent's
    // message and the text they typed, with nothing on screen to say it had not
    // reached the counsellor. Put the text back and say so.
    const rollBack = (message: string) => {
      setLocalMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setComposeText((current) => (current.trim() ? current : body));
      setSendError(message);
    };

    const run = async (): Promise<void> => {
      const res = await fetch('/api/parent/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: thread.contactId, body }),
      });
      if (!res.ok) {
        rollBack("Couldn't send that message — it hasn't reached the counsellor. Try again.");
        return;
      }
      const { message } = await res.json();
      setLocalMessages((prev) => prev.map((m) => (m.id === optimistic.id ? message : m)));
    };

    run()
      .catch(() => {
        rollBack("Couldn't reach the server — your message hasn't been sent. Try again.");
      })
      .finally(() => {
        setIsSending(false);
      });
  };

  const applyTemplate = (template: (typeof TEMPLATES)[number]) => {
    setComposeText(template.content.replace('[student]', childFirstName));
  };

  return (
    <div className="flex min-h-[480px] flex-col overflow-hidden rounded-2xl border border-border bg-card sm:min-h-[560px]">
      {/* Messages */}
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex h-full min-h-[280px] items-center justify-center text-center text-sm text-muted-foreground">
            <div className="space-y-2">
              <MessageSquare className="mx-auto h-8 w-8 text-muted-foreground/40" aria-hidden />
              <p>No messages yet — say hello, or start from a template below.</p>
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isParent = msg.sender === 'parent';
            return (
              <div key={msg.id} className={cn('flex', isParent ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[75%] rounded-2xl px-4 py-2.5 text-sm',
                    isParent
                      ? 'rounded-br-md bg-primary text-primary-foreground'
                      : 'rounded-bl-md bg-muted text-foreground'
                  )}
                >
                  <p>{msg.content}</p>
                  <div className={cn('mt-1 flex items-center gap-1', isParent ? 'justify-end' : 'justify-start')}>
                    <span className={cn('text-label', isParent ? 'text-primary-foreground/60' : 'text-muted-foreground')}>
                      {fullDateFormatter.format(new Date(msg.date))}
                    </span>
                    {isParent && msg.read ? (
                      <CheckCheck className="h-3 w-3 text-primary-foreground/60" aria-hidden />
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick templates */}
      <div className="flex flex-wrap gap-2 border-t border-border/50 px-4 py-2">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => applyTemplate(t)}
            className="rounded-full bg-muted/50 px-3 py-1 text-label font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Compose */}
      {sendError ? (
        <p className="border-t border-border px-3 pt-3 text-label font-medium text-danger" role="alert">
          {sendError}
        </p>
      ) : null}
      <div className="flex gap-2 border-t border-border p-3">
        <label htmlFor="parent-thread-compose" className="sr-only">
          Type a message
        </label>
        <input
          id="parent-thread-compose"
          type="text"
          placeholder="Type a message to the counsellor…"
          value={composeText}
          onChange={(e) => setComposeText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !isSending) handleSend();
          }}
          className="flex-1 rounded-xl border border-border bg-background px-4 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!composeText.trim() || isSending}
          aria-label="Send message"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
        >
          {isSending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
        </button>
      </div>
    </div>
  );
}
