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
import type { ProgramHit } from '@/lib/chat/tools';
import { ProgramResultCard } from './program-result-card';

// ─── Message shape ──────────────────────────────────────────────────────────
// UI-side message, mapped from ChatMessageRow (or created optimistically during
// a live stream). `persisted` marks rows loaded from the DB — only those have a
// real DB id, so only those can be rated / have their action state written back.

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
  action?: ChatAction;
  actionState?: ActionState;
  rating?: 1 | -1;
  hits?: ProgramHit[];
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
    <div className="flex h-[calc(100vh-220px)] min-h-[480px] flex-col overflow-hidden rounded-[24px] border border-border bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <p className="truncate font-heading text-sm font-semibold text-foreground">{title}</p>
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
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className={cn('flex flex-col', msg.role === 'user' ? 'items-end' : 'items-start')}
                >
                  <div
                    className={cn(
                      'max-w-[85%] break-words rounded-[16px] px-3.5 py-2.5 text-[13px] leading-relaxed',
                      msg.error
                        ? 'border border-rose-300/60 bg-rose-500/10 text-rose-700 dark:border-rose-500/30 dark:text-rose-300'
                        : msg.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted/60 text-foreground'
                    )}
                  >
                    {msg.error ? (
                      <div className="space-y-1.5">
                        <p>{msg.content}</p>
                        <button
                          onClick={onRetry}
                          disabled={isStreaming}
                          className="inline-flex items-center gap-1 rounded-full border border-rose-300/60 px-2.5 py-1 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-500/10 disabled:opacity-50 dark:border-rose-500/40 dark:text-rose-300"
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
                              <span className="text-[11px] text-muted-foreground">{statusLabel}</span>
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

                  {/* Programme results */}
                  {msg.hits && msg.hits.length > 0 && (
                    <div className="mt-2 grid w-full max-w-[85%] gap-1.5 sm:grid-cols-2">
                      {msg.hits.map((hit) => (
                        <ProgramResultCard key={hit.id} hit={hit} mode={mode} />
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
                        sendDisabled={msg.action.kind === 'tool_action' && !msg.persisted}
                      />
                    </div>
                  )}

                  {/* Thumbs feedback */}
                  {showFeedback && (
                    <div className="mt-1 flex items-center gap-0.5">
                      <button
                        onClick={() => onRate(msg.id, 1)}
                        aria-label="Good answer"
                        aria-pressed={msg.rating === 1}
                        className={cn(
                          'flex h-6 w-6 items-center justify-center rounded-full transition-colors',
                          msg.rating === 1
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-muted-foreground/60 hover:bg-muted hover:text-foreground'
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
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-muted-foreground/60 hover:bg-muted hover:text-foreground'
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
                  className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
          <p className="mb-1.5 text-center text-[11px] text-muted-foreground" role="status">
            Message limit reached — you can send again in {cooldownRemaining}s
          </p>
        )}
        <div className="flex items-end gap-2 rounded-[18px] border border-border bg-background px-3 py-1.5 transition-colors focus-within:border-primary/40">
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
              className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-foreground transition-[transform] hover:-translate-y-0.5"
              aria-label="Stop generating"
              title="Stop generating"
            >
              <Square className="h-3 w-3 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() || coolingDown}
              className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-[transform,opacity] hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
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
