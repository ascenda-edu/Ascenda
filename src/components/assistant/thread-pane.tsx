'use client';

// The Assistant thread column: conversation header, scrollable message list,
// and the composer. Bubble/thumbs/composer styling mirrors the floating widget
// (chatbot-widget.tsx) so the two surfaces stay visually consistent; the extra
// affordances here — programme result cards, action confirm cards — are the
// things the full-page Assistant does that the widget doesn't.

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Loader2, RotateCcw, Send, Square, ThumbsDown, ThumbsUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ActionConfirmCard,
  AutoResizeTextarea,
  MessageContent,
  prefersReducedMotion,
  type ActionState,
} from '@/components/chat/shared';
import type { ChatAction } from '@/lib/chat/actions';
import type { ChatMode } from '@/lib/chat/prompts';
import type { ChatWidget } from '@/lib/chat/widgets';
import { WidgetRenderer } from './widgets';

// ─── Message shape ──────────────────────────────────────────────────────────
// UI-side message, mapped from ChatMessageRow (or created optimistically during
// a live stream). `persisted` marks rows loaded from the DB — only those have a
// real DB id, so only those can be rated / have their action state written back.

export interface AssistantMessage {
  id: string;
  /** Stable React key for optimistic bubbles: `id` is swapped for the DB row
   * id on persist, and a key change would remount the bubble (wiping any
   * in-progress action-card edits). DB-loaded rows leave it unset. */
  clientKey?: string;
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
  action?: ChatAction;
  actionState?: ActionState;
  rating?: 1 | -1;
  /** Rich widget groups (merged, deduped, capped — see lib/chat/widgets). */
  widgets?: ChatWidget[];
  persisted?: boolean;
}

interface ThreadPaneProps {
  title: string;
  messages: AssistantMessage[];
  mode: ChatMode;
  isStreaming: boolean;
  emptyState?: React.ReactNode;
  onRetry: () => void;
  onResend: () => void;
  onRate: (messageId: string, rating: 1 | -1) => void;
  onActionSend: (messageId: string, edited: ChatAction) => Promise<boolean>;
  onActionCancel: (messageId: string) => void;
  /** Disables tool_action Confirm buttons while a stream is active or the
   * rate-limit cooldown is running — confirming opens a second stream. */
  actionsLocked?: boolean;
  /** Transient "agent is working" line, shown on the streaming bubble. */
  statusLabel?: string | null;
  // Composer
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  coolingDown: boolean;
  cooldownRemaining: number;
  inputRef: React.RefObject<HTMLTextAreaElement>;
}

export function ThreadPane({
  title,
  messages,
  mode,
  isStreaming,
  emptyState,
  onRetry,
  onResend,
  onRate,
  onActionSend,
  onActionCancel,
  actionsLocked,
  statusLabel,
  input,
  onInputChange,
  onSubmit,
  onStop,
  coolingDown,
  cooldownRemaining,
  inputRef,
}: ThreadPaneProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the newest content as it streams in.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }, [messages]);

  const isEmpty = messages.length === 0;
  const last = messages[messages.length - 1];
  const showResend = Boolean(last && last.role === 'user' && !isStreaming);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <div className="flex h-[calc(100vh-220px)] min-h-[480px] flex-col overflow-hidden rounded-3xl border border-border bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <p className="truncate text-sm font-semibold text-foreground">{title}</p>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4" aria-live="polite">
        {isEmpty ? (
          <div className="flex h-full flex-col">{emptyState}</div>
        ) : (
          <>
            {messages.map((msg, idx) => {
              const isStreamingThis =
                isStreaming && msg.role === 'assistant' && idx === messages.length - 1;
              const showFeedback =
                msg.role === 'assistant' &&
                Boolean(msg.content) &&
                !msg.error &&
                !isStreamingThis &&
                Boolean(msg.persisted);

              return (
                <motion.div
                  key={msg.clientKey ?? msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className={cn('flex flex-col', msg.role === 'user' ? 'items-end' : 'items-start')}
                >
                  <div
                    className={cn(
                      'max-w-[85%] break-words rounded-2xl px-3.5 py-2.5 text-body-sm leading-relaxed',
                      msg.error
                        ? 'border border-danger/30 bg-danger-subtle text-danger'
                        : msg.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-foreground'
                    )}
                  >
                    {msg.error ? (
                      <div className="space-y-1.5">
                        <p>{msg.content}</p>
                        <button
                          onClick={onRetry}
                          disabled={isStreaming}
                          className="inline-flex items-center gap-1 rounded-full border border-danger/30 px-2.5 py-1 text-label font-semibold text-danger transition hover:bg-danger-subtle disabled:opacity-50"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Retry
                        </button>
                      </div>
                    ) : msg.content ? (
                      msg.role === 'assistant' ? (
                        <>
                          {isStreamingThis && statusLabel && (
                            <div className="mb-1.5 flex items-center gap-1.5">
                              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                              <span className="text-label text-muted-foreground">{statusLabel}</span>
                            </div>
                          )}
                          <MessageContent content={msg.content} mode={mode} onLinkClick={() => {}} />
                        </>
                      ) : (
                        msg.content
                      )
                    ) : isStreamingThis ? (
                      <div className="flex items-center gap-1.5">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{statusLabel || 'Thinking…'}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">No reply — try asking again.</span>
                    )}
                  </div>

                  {/* Rich tool widgets (programme cards, deadlines, matches…) */}
                  {msg.widgets && msg.widgets.length > 0 && (
                    <div className="mt-2 flex w-full max-w-[85%] flex-col gap-1.5">
                      {msg.widgets.map((widget) => (
                        // kind is unique per message post-merge — a valid key.
                        <WidgetRenderer key={widget.kind} widget={widget} mode={mode} />
                      ))}
                    </div>
                  )}

                  {/* Proposed action (help request / counsellor message) */}
                  {msg.action && (
                    <div className="mt-2 w-full max-w-[85%]">
                      <ActionConfirmCard
                        action={msg.action}
                        state={msg.actionState ?? 'pending'}
                        onSend={(edited) => onActionSend(msg.id, edited)}
                        onCancel={() => onActionCancel(msg.id)}
                        mode={mode}
                        sendDisabled={
                          msg.action.kind === 'tool_action' &&
                          (!msg.persisted || Boolean(actionsLocked))
                        }
                      />
                    </div>
                  )}

                  {/* Thumbs feedback. gap-2, not gap-0.5: these are two 24×24
                      controls with OPPOSITE meanings, and 2px apart a fat finger
                      rates the answer backwards. */}
                  {showFeedback && (
                    <div className="mt-1 flex items-center gap-2">
                      <button
                        onClick={() => onRate(msg.id, 1)}
                        aria-label="Good answer"
                        aria-pressed={msg.rating === 1}
                        className={cn(
                          'flex h-6 w-6 items-center justify-center rounded-full transition-colors',
                          msg.rating === 1
                            ? 'text-success'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                      >
                        <ThumbsUp className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => onRate(msg.id, -1)}
                        aria-label="Bad answer"
                        aria-pressed={msg.rating === -1}
                        className={cn(
                          'flex h-6 w-6 items-center justify-center rounded-full transition-colors',
                          msg.rating === -1
                            ? 'text-danger'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                      >
                        <ThumbsDown className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </motion.div>
              );
            })}

            {/* Trailing unanswered user message */}
            {showResend && (
              <div className="flex justify-end">
                <button
                  onClick={onResend}
                  className="inline-flex items-center gap-1 rounded-full border border-primary/30 px-2.5 py-1 text-label font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
                >
                  <RotateCcw className="h-3 w-3" />
                  No reply recorded — resend
                </button>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <form onSubmit={handleFormSubmit} className="border-t border-border bg-card px-3 py-2.5">
        {coolingDown && (
          <p className="mb-1.5 text-center text-label text-muted-foreground" role="status">
            Message limit reached — you can send again in {cooldownRemaining}s
          </p>
        )}
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-background px-3 py-1.5 transition-[border-color,box-shadow] focus-within:border-primary focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
          <AutoResizeTextarea
            value={input}
            onChange={onInputChange}
            onSubmit={onSubmit}
            disabled={isStreaming || coolingDown}
            inputRef={inputRef}
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              // Own focus ring: the wrapper's `focus-within` fires for any child, so
              // without this, tabbing here highlighted the whole composer as though
              // the textarea had focus. Same fix in chat/chatbot-widget.tsx, which
              // duplicates this composer markup verbatim.
              className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-foreground transition-[transform,box-shadow] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label="Stop generating"
              title="Stop generating"
            >
              <Square className="h-3 w-3 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() || coolingDown}
              className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-[transform,opacity,box-shadow] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-40 disabled:hover:translate-y-0"
              aria-label="Send message"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
