'use client';

// Chat UI primitives shared by the floating Ascendi widget and the full-page
// Assistant workspace. Moved out of chatbot-widget.tsx verbatim — behaviour
// changes here affect BOTH surfaces.

import { useId, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2, Send } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
        li: ({ children }) => <li className="text-body-sm">{children}</li>,
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
                className="inline-flex items-center gap-0.5 text-primary-ink underline underline-offset-2 hover:text-primary-ink/80"
              >
                {children}
              </Link>
            );
          }
          return (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary-ink underline underline-offset-2 hover:text-primary-ink/80">
              {children}
            </a>
          );
        },
        code: ({ children }) => (
          <code className="rounded bg-muted px-1 py-0.5 text-xs">{children}</code>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// ─── Action confirm card ────────────────────────────────────────────────────
// Renders a model-proposed action as an editable draft. Nothing is sent until
// the user confirms — the model only drafts. Three variants:
//   help_request / counsellor_message — legacy client-side sends (subject+body
//     / body). Parent portal + persisted rows depend on these rendering as-is.
//   tool_action — the agentic path: fields come from `editable`, execution runs
//     server-side via POST /api/chat/actions/execute (the workspace wires it).
// Used by the Assistant workspace (the widget surface receives no actions).

export type ActionState = 'pending' | 'sending' | 'sent' | 'cancelled';

export function ActionConfirmCard({
  action,
  state,
  onSend,
  onCancel,
  sendDisabled,
  mode = 'student',
}: {
  action: ChatAction;
  state: ActionState;
  onSend: (edited: ChatAction) => Promise<boolean>;
  onCancel: () => void;
  /** tool_action only — the workspace disables Confirm until the message row is
   * persisted (its DB id is required by the execute endpoint). */
  sendDisabled?: boolean;
  /** Portal mode — keeps result-message links portal-scoped. */
  mode?: ChatMode;
}) {
  if (action.kind === 'tool_action') {
    return (
      <ToolActionCard
        action={action}
        state={state}
        onSend={onSend}
        onCancel={onCancel}
        sendDisabled={sendDisabled}
        mode={mode}
      />
    );
  }
  return <LegacyActionCard action={action} state={state} onSend={onSend} onCancel={onCancel} />;
}

// ── Legacy: help request / counsellor message (unchanged behaviour) ──────────

type LegacyAction = Extract<ChatAction, { kind: 'help_request' | 'counsellor_message' }>;

function LegacyActionCard({
  action,
  state,
  onSend,
  onCancel,
}: {
  action: LegacyAction;
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
      <div className="flex items-center gap-2 rounded-xl border border-success/25 bg-success-subtle px-3 py-2.5 text-xs font-medium text-success">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        Sent to your counsellor
      </div>
    );
  }
  if (state === 'cancelled') {
    return (
      <div className="rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
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
    <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <p className="text-xs font-semibold text-foreground">{title}</p>
      {action.kind === 'help_request' && (
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          disabled={sending}
          aria-label="Subject"
          className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground transition-[border-color,box-shadow] hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
        />
      )}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={sending}
        rows={3}
        aria-label="Message body"
        className="w-full resize-none rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs leading-relaxed text-foreground transition-[border-color,box-shadow] hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
      />
      {failed && (
        <p className="text-label text-danger">
          Couldn&apos;t send — try again in a moment.
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSend}
          disabled={sending || !body.trim() || (action.kind === 'help_request' && !subject.trim())}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-label font-semibold text-primary-foreground transition-[transform,opacity] hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          Send
        </button>
        <button
          onClick={onCancel}
          disabled={sending}
          className="rounded-full border border-border px-3 py-1.5 text-label font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Agentic: tool_action (server-executed) ───────────────────────────────────

type ToolAction = Extract<ChatAction, { kind: 'tool_action' }>;

/** Coerce an arbitrary params value into an editable string sensibly. */
function paramToInput(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function ToolActionCard({
  action,
  state,
  onSend,
  onCancel,
  sendDisabled,
  mode,
}: {
  action: ToolAction;
  state: ActionState;
  onSend: (edited: ChatAction) => Promise<boolean>;
  onCancel: () => void;
  sendDisabled?: boolean;
  mode: ChatMode;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(action.editable.map((f) => [f.key, paramToInput(action.params[f.key])]))
  );
  const [failed, setFailed] = useState(false);
  // Per-card id prefix — several cards can be on screen at once.
  const uid = useId();
  const hintId = `${uid}-hint`;

  if (state === 'sent') {
    return (
      <div className="rounded-xl border border-success/25 bg-success-subtle px-3 py-2.5 text-xs font-medium text-success">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <MessageContent content={action.resultMessage || 'Done.'} mode={mode} onLinkClick={() => {}} />
          </div>
        </div>
      </div>
    );
  }
  if (state === 'cancelled') {
    return (
      <div className="rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
        Draft discarded
      </div>
    );
  }

  const sending = state === 'sending';
  const setField = (key: string, val: string) => setValues((prev) => ({ ...prev, [key]: val }));

  const handleSend = async () => {
    setFailed(false);
    const merged: Record<string, unknown> = { ...action.params };
    for (const field of action.editable) merged[field.key] = values[field.key] ?? '';
    const ok = await onSend({ ...action, params: merged });
    if (!ok) setFailed(true);
  };

  const controlClass =
    'w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground transition-[border-color,box-shadow] hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50';

  return (
    <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div>
        <p className="text-xs font-semibold text-foreground">{action.title}</p>
        {action.summary && (
          <p className="mt-0.5 text-label leading-relaxed text-muted-foreground">{action.summary}</p>
        )}
      </div>

      {action.editable.map((field) => {
        const id = `${uid}-${field.key}`;
        return (
          <div key={field.key} className="space-y-1">
            <label htmlFor={id} className="block text-label font-medium text-muted-foreground">
              {field.label}
            </label>
            {field.kind === 'textarea' ? (
              <AutoResizeTextareaField
                id={id}
                value={values[field.key] ?? ''}
                onChange={(v) => setField(field.key, v)}
                disabled={sending}
              />
            ) : field.kind === 'select' ? (
              // `|| undefined` so an empty draft value shows the placeholder —
              // Radix cannot hold '' as a value. The panel is portalled, so the
              // scrolling message thread can't clip it.
              <Select
                value={values[field.key] || undefined}
                onValueChange={(v) => setField(field.key, v)}
                disabled={sending}
              >
                <SelectTrigger id={id} size="sm" className="rounded-lg px-2.5">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {/* Keep a value not present in options selectable rather than silently snapping. */}
                  {values[field.key] &&
                    !(field.options ?? []).includes(values[field.key]) && (
                      <SelectItem value={values[field.key]}>{values[field.key]}</SelectItem>
                    )}
                  {/* filter(Boolean): options arrive from the model's tool call, and
                      a blank one would throw inside Radix. */}
                  {(field.options ?? []).filter(Boolean).map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <input
                id={id}
                type={field.kind === 'date' ? 'date' : 'text'}
                value={values[field.key] ?? ''}
                onChange={(e) => setField(field.key, e.target.value)}
                disabled={sending}
                className={controlClass}
              />
            )}
          </div>
        );
      })}

      {failed && (
        <p className="text-label text-danger">
          Couldn&apos;t run that — check the details and try again.
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={handleSend}
          disabled={sending || sendDisabled}
          aria-describedby={sendDisabled && !sending ? `${hintId}` : undefined}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-label font-semibold text-primary-foreground transition-[transform,opacity] hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          Confirm
        </button>
        <button
          onClick={onCancel}
          disabled={sending}
          className="rounded-full border border-border px-3 py-1.5 text-label font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          Cancel
        </button>
        {sendDisabled && !sending && (
          <span id={hintId} className="text-label text-muted-foreground">
            Hold on a moment…
          </span>
        )}
      </div>
    </div>
  );
}

// A minimal auto-growing textarea for tool_action fields — mirrors the composer
// AutoResizeTextarea, but standalone (its own id/label, no submit-on-Enter).
function AutoResizeTextareaField({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
}) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
        const el = e.target;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 160) + 'px';
      }}
      disabled={disabled}
      rows={3}
      className="w-full resize-none rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs leading-relaxed text-foreground transition-[border-color,box-shadow] hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
    />
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
