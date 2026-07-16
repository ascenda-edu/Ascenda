'use client';

// Chat UI primitives shared by the floating Ascendi widget and the full-page
// Assistant workspace. Moved out of chatbot-widget.tsx verbatim — behaviour
// changes here affect BOTH surfaces.

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2, Send } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { ChatAction } from '@/lib/chat/actions';
import type { ChatMode } from '@/lib/chat/prompts';

// ─── Portal routing helpers (pure — defined in lib/chat/paths) ──────────────

export {
  ASSISTANT_PATHS,
  assistantPathForMode,
  isAssistantRoute,
  detectMode,
  isRouteInMode,
} from '@/lib/chat/paths';
import { isRouteInMode } from '@/lib/chat/paths';

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ─── Markdown message renderer ──────────────────────────────────────────────

export function MessageContent({
  content,
  mode,
  onLinkClick,
}: {
  content: string;
  mode: ChatMode;
  onLinkClick: () => void;
}) {
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        ul: ({ children }) => <ul className="mb-1.5 ml-3 list-disc space-y-0.5 last:mb-0">{children}</ul>,
        ol: ({ children }) => <ol className="mb-1.5 ml-3 list-decimal space-y-0.5 last:mb-0">{children}</ol>,
        li: ({ children }) => <li className="text-[13px]">{children}</li>,
        a: ({ href, children }) => {
          // Internal route → real navigation link (correct semantics: href,
          // middle-click/open-in-new-tab work). Closing the panel stays on the
          // click handler so it dismisses as the route changes.
          if (href?.startsWith('/')) {
            // Safety net on top of the prompt rules: a link that would take
            // the user out of this portal renders as plain text.
            if (!isRouteInMode(href, mode)) {
              return <span>{children}</span>;
            }
            return (
              <Link
                href={href}
                onClick={onLinkClick}
                className="inline-flex items-center gap-0.5 text-primary underline underline-offset-2 hover:text-primary/80"
              >
                {children}
              </Link>
            );
          }
          return (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-primary/80">
              {children}
            </a>
          );
        },
        code: ({ children }) => (
          <code className="rounded bg-muted px-1 py-0.5 text-[12px]">{children}</code>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// ─── Action confirm card ────────────────────────────────────────────────────
// Renders a model-proposed action (help request / counsellor message) as an
// editable draft. Nothing is sent until the user hits Send — the model only
// drafts. Used by the Assistant workspace (the widget surface receives no
// actions).

export type ActionState = 'pending' | 'sending' | 'sent' | 'cancelled';

export function ActionConfirmCard({
  action,
  state,
  onSend,
  onCancel,
}: {
  action: ChatAction;
  state: ActionState;
  onSend: (edited: ChatAction) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [subject, setSubject] = useState(action.kind === 'help_request' ? action.subject : '');
  const [body, setBody] = useState(action.body);
  const [failed, setFailed] = useState(false);

  const title =
    action.kind === 'help_request' ? 'Help request to your counsellor' : 'Message to the counsellor';

  if (state === 'sent') {
    return (
      <div className="flex items-center gap-2 rounded-[14px] border border-emerald-300/60 bg-emerald-500/10 px-3 py-2.5 text-xs font-medium text-emerald-700 dark:border-emerald-500/30 dark:text-emerald-300">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        Sent to your counsellor
      </div>
    );
  }
  if (state === 'cancelled') {
    return (
      <div className="rounded-[14px] border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
        Draft discarded
      </div>
    );
  }

  const sending = state === 'sending';
  const handleSend = async () => {
    setFailed(false);
    const edited: ChatAction =
      action.kind === 'help_request'
        ? { ...action, subject: subject.trim(), body: body.trim() }
        : { ...action, body: body.trim() };
    const ok = await onSend(edited);
    if (!ok) setFailed(true);
  };

  return (
    <div className="space-y-2 rounded-[14px] border border-primary/30 bg-primary/5 p-3">
      <p className="text-xs font-semibold text-foreground">{title}</p>
      {action.kind === 'help_request' && (
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          disabled={sending}
          aria-label="Subject"
          className="w-full rounded-[10px] border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:border-primary/40 focus:outline-none disabled:opacity-50"
        />
      )}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={sending}
        rows={3}
        aria-label="Message body"
        className="w-full resize-none rounded-[10px] border border-border bg-background px-2.5 py-1.5 text-xs leading-relaxed text-foreground focus:border-primary/40 focus:outline-none disabled:opacity-50"
      />
      {failed && (
        <p className="text-[11px] text-rose-600 dark:text-rose-400">
          Couldn&apos;t send — try again in a moment.
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSend}
          disabled={sending || !body.trim() || (action.kind === 'help_request' && !subject.trim())}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground transition-[transform,opacity] hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          Send
        </button>
        <button
          onClick={onCancel}
          disabled={sending}
          className="rounded-full border border-border px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Auto-resize textarea ───────────────────────────────────────────────────

export function AutoResizeTextarea({
  value,
  onChange,
  onSubmit,
  disabled,
  inputRef,
  placeholder = 'Ask Ascendi anything…',
}: {
  value: string;
  onChange: (val: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  placeholder?: string;
}) {
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    // Auto-resize
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 96) + 'px';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <textarea
      ref={inputRef}
      value={value}
      onChange={handleInput}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      aria-label={placeholder}
      disabled={disabled}
      rows={1}
      className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
      style={{ maxHeight: 96 }}
    />
  );
}
