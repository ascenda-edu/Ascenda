'use client';

// Streaming client for /api/chat, shared by the floating widget and the
// Assistant workspace. Lifted from chatbot-widget.tsx — the behaviour contract
// (abort keeps partials, 429 starts a cooldown, empty streams are distinct
// from errors) is load-bearing for both surfaces and covered by tests.
//
// The hook owns the AbortController, isStreaming, and the 429 cooldown
// countdown; callers own their message list and translate the handler
// callbacks into their own state.

import { useCallback, useEffect, useRef, useState } from 'react';
import { createSseParser } from '@/lib/chat/sse';
import { isChatAction, type ChatAction } from '@/lib/chat/actions';
import type { ChatMode } from '@/lib/chat/prompts';
import type { ProgramHit } from '@/lib/chat/tools';

// Only the most recent turns ride along on each request — the server holds the
// system prompt + live account context, so old turns add cost, not quality.
export const HISTORY_LIMIT = 12;
export const COOLDOWN_SECONDS = 60;

export interface ChatStreamHandlers {
  /** Called with the FULL accumulated text after every delta. */
  onTextDelta: (fullText: string) => void;
  onAction?: (action: ChatAction) => void;
  onResults?: (hits: ProgramHit[]) => void;
}

export interface ChatRunArgs {
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  mode: ChatMode;
  surface: 'widget' | 'assistant';
  currentPage?: string;
  conversationId?: string;
  handlers: ChatStreamHandlers;
}

export type ChatRunResult =
  | {
      kind: 'completed';
      text: string;
      action?: ChatAction;
      hits?: ProgramHit[];
      /** DB row id of the persisted assistant message (assistant surface with
       * a conversationId) — adopt it so action/rating writes land. */
      savedId?: string;
    }
  | { kind: 'empty' }
  | { kind: 'aborted'; text: string }
  | { kind: 'rate_limited'; message: string }
  | { kind: 'error'; message: string };

export function useChatStream() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  // Count the rate-limit cooldown back down to zero.
  const coolingDown = cooldownRemaining > 0;
  useEffect(() => {
    if (!coolingDown) return;
    const iv = window.setInterval(
      () => setCooldownRemaining((s) => (s <= 1 ? 0 : s - 1)),
      1000
    );
    return () => window.clearInterval(iv);
  }, [coolingDown]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const run = useCallback(async (args: ChatRunArgs): Promise<ChatRunResult> => {
    const controller = new AbortController();
    abortRef.current = controller;
    setIsStreaming(true);

    let accumulated = '';
    let action: ChatAction | undefined;
    let hits: ProgramHit[] | undefined;
    let savedId: string | undefined;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          messages: args.history.slice(-HISTORY_LIMIT).map((m) => ({
            role: m.role,
            content: m.content,
          })),
          currentPage: args.currentPage,
          mode: args.mode,
          surface: args.surface,
          ...(args.conversationId ? { conversationId: args.conversationId } : {}),
        }),
      });

      if (res.status === 429) {
        setCooldownRemaining(COOLDOWN_SECONDS);
        return {
          kind: 'rate_limited',
          message: 'You’ve sent a lot of messages — give it a minute and try again.',
        };
      }
      if (!res.ok) {
        let message = 'Something went wrong';
        try {
          const err = await res.json();
          if (typeof err.error === 'string') message = err.error;
        } catch {
          // non-JSON body — keep the generic message
        }
        return { kind: 'error', message };
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        // Buffered parser: events split across network reads are reassembled,
        // never dropped (matters most for the ~2KB action payload).
        const parser = createSseParser();
        let finished = false;
        while (!finished) {
          const { done, value } = await reader.read();
          if (done) break;

          for (const event of parser.push(decoder.decode(value, { stream: true }))) {
            if (event.type === 'done') {
              finished = true;
              break;
            }
            if (event.type === 'error') {
              return { kind: 'error', message: event.message };
            }
            if (event.type === 'text') {
              accumulated += event.text;
              args.handlers.onTextDelta(accumulated);
            }
            if (event.type === 'action' && isChatAction(event.action)) {
              action = event.action;
              args.handlers.onAction?.(event.action);
            }
            if (event.type === 'results' && Array.isArray(event.hits)) {
              const batch = event.hits as ProgramHit[];
              hits = [...(hits ?? []), ...batch];
              args.handlers.onResults?.(batch);
            }
            if (event.type === 'saved') {
              savedId = event.id;
            }
          }
        }
      }

      if (!accumulated && !action && !hits) {
        return { kind: 'empty' };
      }
      return { kind: 'completed', text: accumulated, action, hits, savedId };
    } catch (err) {
      // Some environments surface fetch aborts as plain Errors, not DOMException.
      if ((err instanceof DOMException || err instanceof Error) && err.name === 'AbortError') {
        return { kind: 'aborted', text: accumulated };
      }
      return {
        kind: 'error',
        message: err instanceof Error ? err.message : 'Something went wrong. Try again.',
      };
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
    }
  }, []);

  return { run, stop, isStreaming, cooldownRemaining, coolingDown };
}
