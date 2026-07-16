'use client';

// Streaming client for /api/chat, shared by the floating widget and the
// Assistant workspace. Lifted from chatbot-widget.tsx — the behaviour contract
// (abort keeps partials, 429 starts a cooldown, empty streams are distinct
// from errors) is load-bearing for both surfaces and covered by tests.
//
// The hook owns the AbortController, isStreaming, and the 429 cooldown
// countdown; callers own their message list and translate the handler
// callbacks into their own state.
//
// Two entry points share one `runStream` core (fetch/parse/abort/cooldown):
//   run()               — POST /api/chat, the conversational turn.
//   runActionExecute()  — POST /api/chat/actions/execute, run a proposed
//                         WriteTool server-side, then stream the follow-up turn.

import { useCallback, useEffect, useRef, useState } from 'react';
import { createSseParser } from '@/lib/chat/sse';
import { isChatAction, type ChatAction } from '@/lib/chat/actions';
import type { ChatMode } from '@/lib/chat/prompts';
import type { ProgramHit } from '@/lib/chat/tools';

// Only the most recent turns ride along on each request — the server holds the
// system prompt + live account context, so old turns add cost, not quality.
export const HISTORY_LIMIT = 12;
export const COOLDOWN_SECONDS = 60;

/** Outcome of a server-side tool execution, mirrored onto the run result and
 * (optionally) delivered eagerly via onExecuted as the first stream frame. */
export interface ExecutedInfo {
  ok: boolean;
  message: string;
  result?: unknown;
}

export interface ChatStreamHandlers {
  /** Called with the FULL accumulated text after every delta. */
  onTextDelta: (fullText: string) => void;
  onAction?: (action: ChatAction) => void;
  onResults?: (hits: ProgramHit[]) => void;
  /** Transient "agent is working" line — cleared by the caller on first text. */
  onStatus?: (tool: string, label: string) => void;
  /** Fires once with the execute endpoint's result, ahead of the follow-up
   * turn's text (runActionExecute only). */
  onExecuted?: (executed: ExecutedInfo) => void;
}

export interface ChatRunArgs {
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  mode: ChatMode;
  surface: 'widget' | 'assistant';
  currentPage?: string;
  conversationId?: string;
  handlers: ChatStreamHandlers;
}

export interface ActionExecuteArgs {
  conversationId: string;
  messageId: string;
  tool: string;
  params: Record<string, unknown>;
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
      /** Present only on the runActionExecute path — the tool run's outcome. */
      executed?: ExecutedInfo;
    }
  | { kind: 'empty' }
  | { kind: 'aborted'; text: string }
  | { kind: 'rate_limited'; message: string }
  | { kind: 'error'; message: string };

/** runActionExecute widens the union with two terminal, non-streaming outcomes
 * the confirm card reacts to specially. */
export type ActionExecuteResult =
  | ChatRunResult
  | { kind: 'conflict' }
  | { kind: 'invalid'; error: string };

export function useChatStream() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  // One controller PER in-flight stream. Callers should prevent concurrent
  // streams (guards on isStreaming), but if two ever overlap — e.g. a confirm
  // racing a turn — each keeps its own controller, stop() aborts them all, and
  // isStreaming stays true until the last one settles, instead of the first
  // finisher clobbering shared state.
  const controllersRef = useRef<Set<AbortController>>(new Set());

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
    for (const controller of controllersRef.current) controller.abort();
  }, []);

  // Shared fetch → parse → dispatch → terminal-result core. `onNonOk` owns the
  // non-429 error mapping so each entry point can classify status codes its own
  // way (plain error vs. 409 conflict / 400 invalid).
  const runStream = useCallback(
    async (
      url: string,
      body: unknown,
      handlers: ChatStreamHandlers,
      onNonOk: (res: Response) => Promise<ActionExecuteResult>
    ): Promise<ActionExecuteResult> => {
      const controller = new AbortController();
      controllersRef.current.add(controller);
      setIsStreaming(true);

      let accumulated = '';
      let action: ChatAction | undefined;
      let hits: ProgramHit[] | undefined;
      let savedId: string | undefined;
      let executed: ExecutedInfo | undefined;

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify(body),
        });

        if (res.status === 429) {
          setCooldownRemaining(COOLDOWN_SECONDS);
          return {
            kind: 'rate_limited',
            message: 'You’ve sent a lot of messages — give it a minute and try again.',
          };
        }
        if (!res.ok) {
          return await onNonOk(res);
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
              if (event.type === 'status') {
                handlers.onStatus?.(event.tool, event.label);
              }
              if (event.type === 'executed') {
                executed = {
                  ok: event.ok,
                  message: event.message,
                  ...(event.result !== undefined ? { result: event.result } : {}),
                };
                handlers.onExecuted?.(executed);
              }
              if (event.type === 'text') {
                accumulated += event.text;
                handlers.onTextDelta(accumulated);
              }
              if (event.type === 'action' && isChatAction(event.action)) {
                action = event.action;
                handlers.onAction?.(event.action);
              }
              if (event.type === 'results' && Array.isArray(event.hits)) {
                const batch = event.hits as ProgramHit[];
                hits = [...(hits ?? []), ...batch];
                handlers.onResults?.(batch);
              }
              if (event.type === 'saved') {
                savedId = event.id;
              }
            }
          }
        }

        if (!accumulated && !action && !hits && !executed) {
          return { kind: 'empty' };
        }
        return { kind: 'completed', text: accumulated, action, hits, savedId, executed };
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
        controllersRef.current.delete(controller);
        if (controllersRef.current.size === 0) setIsStreaming(false);
      }
    },
    []
  );

  const run = useCallback(
    (args: ChatRunArgs): Promise<ChatRunResult> =>
      runStream(
        '/api/chat',
        {
          messages: args.history.slice(-HISTORY_LIMIT).map((m) => ({
            role: m.role,
            content: m.content,
          })),
          currentPage: args.currentPage,
          mode: args.mode,
          surface: args.surface,
          ...(args.conversationId ? { conversationId: args.conversationId } : {}),
        },
        args.handlers,
        async (res) => {
          let message = 'Something went wrong';
          try {
            const err = await res.json();
            if (typeof err.error === 'string') message = err.error;
          } catch {
            // non-JSON body — keep the generic message
          }
          return { kind: 'error', message };
        }
        // run never produces conflict/invalid, so the narrower public type holds.
      ) as Promise<ChatRunResult>,
    [runStream]
  );

  const runActionExecute = useCallback(
    (input: ActionExecuteArgs, handlers: ChatStreamHandlers): Promise<ActionExecuteResult> =>
      runStream(
        '/api/chat/actions/execute',
        {
          conversationId: input.conversationId,
          messageId: input.messageId,
          tool: input.tool,
          params: input.params,
        },
        handlers,
        async (res) => {
          // Already claimed by another tab / a double-click — terminal, treat as
          // handled (the caller flips the card to 'sent' with no result line).
          if (res.status === 409) return { kind: 'conflict' };
          // Invalid params — the card stays editable and shows the reason.
          if (res.status === 400) {
            let error = 'Those details need a change before this can run.';
            try {
              const b = await res.json();
              if (typeof b.error === 'string') error = b.error;
            } catch {
              // keep the generic message
            }
            return { kind: 'invalid', error };
          }
          // 401 / 403 / 5xx — generic error.
          let message = 'Something went wrong';
          try {
            const b = await res.json();
            if (typeof b.error === 'string') message = b.error;
          } catch {
            // keep the generic message
          }
          return { kind: 'error', message };
        }
      ),
    [runStream]
  );

  return { run, runActionExecute, stop, isStreaming, cooldownRemaining, coolingDown };
}
