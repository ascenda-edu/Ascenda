// Ascendi chat endpoint — one brain, two surfaces. Orchestration only: system
// prompts live in lib/chat/prompts.ts, live-account context in
// lib/chat/context.ts (cached, lib/chat/cache.ts), tools in lib/chat/tools.ts,
// action payloads in lib/chat/actions.ts, history persistence in
// lib/chat/history.ts.
//
// Surfaces:
//   'widget'    (default — back-compat hinge): READ tools only (student /
//               counsellor; parent none) with rich widget cards, but NO
//               actions — write/propose calls are refused inside the loop
//               (allowActions: false). Nothing is persisted.
//   'assistant' : full agentic suite. Read + write tools; when
//               `conversationId` is provided the turn is persisted to
//               chat_conversations / chat_messages (RLS own-only; the route's
//               client is the user's).
//
// SSE protocol (all events `data: <json>\n\n`, terminated by `data: [DONE]`):
//   {"text": "..."}     — streamed prose chunk
//   {"action": {...}}   — ≤1 per turn: a ChatAction the user must confirm
//                         client-side; the server never executes actions.
//   {"results": {"tool": "<name>", "widgets": [{"kind": "...", "items": [...]}]}}
//                       — typed widget groups for rich in-thread cards (see
//                         lib/chat/widgets.ts; assistant surface only, by
//                         construction — the floating widget has no tools)
//   {"saved": {"id": "..."}}
//                       — the persisted assistant message's row id (assistant
//                         surface with conversationId only), so the client can
//                         adopt it for follow-up action/rating writes
//   {"error": "..."}    — stream-level failure

import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { type Content } from '@google/genai';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { ACTIVE_CHILD_COOKIE } from '@/features/parent';
import {
  getSystemPrompt,
  getToolAddendum,
  getWidgetToolAddendum,
  type ChatMode,
} from '@/lib/chat/prompts';
import { resolveChatMode } from '@/lib/chat/mode';
import { buildContextForMode } from '@/lib/chat/context';
import { contextCacheKey, getCachedContext, setCachedContext } from '@/lib/chat/cache';
import { buildToolsForMode } from '@/lib/chat/tools';
import { buildGeminiTools, buildGeminiReadTools } from '@/lib/chat/tools/registry';
import {
  newTurnAccumulator,
  openStreamWithFallback,
  runToolLoop,
} from '@/lib/chat/gemini';
import {
  appendMessage,
  getConversation,
  getLatestMessage,
  renameConversation,
} from '@/lib/chat/history';

export const runtime = 'nodejs';

const TITLE_LENGTH = 60;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createRouteHandlerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
    }

    // Bound per-user LLM spend — nothing else stops a scripted request loop.
    if (!checkRateLimit(`chat:${user.id}`, { limit: 20, windowMs: 60_000 })) {
      return new Response(JSON.stringify({ error: 'Too many requests — try again in a minute' }), {
        status: 429
      });
    }

    const body = await req.json();
    const { messages, currentPage, mode: rawMode, surface: rawSurface, conversationId } = body as {
      messages: ChatMessage[];
      currentPage?: string;
      mode?: ChatMode;
      surface?: 'widget' | 'assistant';
      conversationId?: string;
    };
    // Resolve + authorize the mode (bound to the counsellor seam under the demo
    // posture — see resolveChatMode). The route uses the user-scoped client (no
    // service-role), so tightening canActAsCounsellor() at real onboarding
    // closes this privilege-escalation path automatically.
    const resolved = await resolveChatMode(supabase, user, rawMode);
    if (!resolved.ok) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    }
    const mode: ChatMode = resolved.mode;
    const surface = rawSurface === 'assistant' ? 'assistant' : 'widget';

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'No messages provided' }), { status: 400 });
    }
    if (
      messages.length > 50 ||
      messages.some((m) => typeof m.content !== 'string' || m.content.length > 8_000)
    ) {
      return new Response(JSON.stringify({ error: 'Conversation too long' }), { status: 400 });
    }

    if (!process.env.GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI service not configured.' }), { status: 503 });
    }

    // ── Persistence pre-flight (assistant surface only) ─────────────────────
    // Ownership + mode are verified BEFORE any model spend. RLS would reject
    // the writes anyway (the route's client is user-scoped), but failing fast
    // gives a clean status instead of a broken stream.
    const persist = surface === 'assistant' && typeof conversationId === 'string';
    const lastMessage = messages[messages.length - 1];
    if (persist) {
      const conversation = await getConversation(supabase, conversationId!);
      if (!conversation || conversation.owner_id !== user.id) {
        return new Response(JSON.stringify({ error: 'Conversation not found' }), { status: 403 });
      }
      if (conversation.mode !== mode) {
        return new Response(JSON.stringify({ error: 'Conversation mode mismatch' }), { status: 400 });
      }
      if (lastMessage.role === 'user') {
        try {
          // A retry re-sends the same trailing user text (the previous turn
          // errored after the user row was stored) — don't store it twice.
          const latest = await getLatestMessage(supabase, conversationId!);
          const isRetry = latest?.role === 'user' && latest.content === lastMessage.content;
          if (!isRetry) {
            // Persist the ORIGINAL user text — the page-context prefix below
            // is model-only framing, not conversation content.
            await appendMessage(supabase, {
              conversation_id: conversationId!,
              role: 'user',
              content: lastMessage.content,
            });
          }
          if (!conversation.title) {
            await renameConversation(
              supabase,
              conversationId!,
              lastMessage.content.trim().slice(0, TITLE_LENGTH)
            );
          }
        } catch (err) {
          console.warn('[chat] user-message persist failed:', err);
        }
      }
    }

    // ── Live account context (cached 60s per user+mode) ─────────────────────
    const activeChildId =
      mode === 'parent' ? (await cookies()).get(ACTIVE_CHILD_COOKIE)?.value : undefined;
    const cacheKey = contextCacheKey(mode, user.id, activeChildId);
    let chatContext = getCachedContext(cacheKey);
    if (!chatContext) {
      chatContext = await buildContextForMode(supabase, mode, user.id, activeChildId);
      setCachedContext(cacheKey, chatContext);
    }
    const parentContactId = chatContext.parentContactId;

    // Surface → toolset. Assistant: full read+write registry set (parent keeps
    // its legacy single-tool path — message tool only when a contact thread
    // exists). Widget: READ tools only, no actions (parent widget none) — the
    // loop additionally refuses write calls via allowActions below.
    const tools =
      surface === 'assistant'
        ? mode === 'parent'
          ? buildToolsForMode(mode, Boolean(parentContactId))
          : buildGeminiTools(mode)
        : mode === 'parent'
          ? undefined
          : buildGeminiReadTools(mode);
    const toolAddendum =
      surface === 'assistant'
        ? getToolAddendum(mode, Boolean(parentContactId))
        : getWidgetToolAddendum(mode);
    const systemInstruction = [
      getSystemPrompt(mode),
      tools ? toolAddendum : '',
      chatContext.context,
    ]
      .filter(Boolean)
      .join('\n\n');

    // Add page context to the latest user message
    const enhancedMessages = messages.map((m, i) => {
      if (i === messages.length - 1 && m.role === 'user' && currentPage) {
        return {
          ...m,
          content: `[The user is currently on the ${currentPage} page]\n\n${m.content}`,
        };
      }
      return m;
    });

    const convo: Content[] = enhancedMessages.map((m) => ({
      role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
      parts: [{ text: m.content }],
    }));

    // Establish the first stream with the model fallback chain; later tool
    // rounds reuse whichever model succeeded.
    const streamOptions = {
      systemInstruction,
      ...(tools ? { tools } : {}),
      abortSignal: req.signal,
    };
    const opened = await openStreamWithFallback(convo, streamOptions);
    if (!opened) {
      return new Response(JSON.stringify({
        error: 'AI is rate-limited right now. Please wait a moment and try again.',
      }), { status: 503 });
    }

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        let closed = false;
        const sendRaw = (line: string) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(`data: ${line}\n\n`));
          } catch {
            closed = true; // consumer went away — stop pushing
          }
        };
        const send = (payload: unknown) => sendRaw(JSON.stringify(payload));

        // Turn-level accumulators (mutated live by the tool loop). The happy
        // path persists BEFORE [DONE] and announces the row id (`saved` event)
        // so the client can adopt it for follow-up writes (action sent-state,
        // ratings); the `finally` is the backstop for aborts/disconnects,
        // guarded against double-persisting.
        const acc = newTurnAccumulator();
        let assistantPersisted = false;

        const persistAssistantMessage = async (): Promise<string | null> => {
          if (!persist || assistantPersisted) return null;
          if (!acc.text && !acc.action && acc.widgets.length === 0) return null;
          assistantPersisted = true;
          try {
            const { id } = await appendMessage(supabase, {
              conversation_id: conversationId!,
              role: 'assistant',
              content: acc.text,
              ...(acc.action
                ? {
                    action: acc.action as unknown as Record<string, unknown>,
                    action_state: 'pending',
                  }
                : {}),
              ...(acc.widgets.length > 0
                ? { tool_results: acc.widgets as unknown as Record<string, unknown>[] }
                : {}),
            });
            return id;
          } catch (err) {
            console.warn('[chat] assistant-message persist failed:', err);
            return null;
          }
        };

        try {
          await runToolLoop({
            opened,
            contents: convo,
            streamOptions,
            toolCtx: { supabase, userId: user.id, mode },
            ...(parentContactId ? { parentContactId } : {}),
            allowActions: surface === 'assistant',
            acc,
            send,
          });

          // Persist before [DONE] and hand the row id to the client so its
          // in-session bubble can adopt it (action/rating writes need it).
          const savedId = await persistAssistantMessage();
          if (savedId) send({ saved: { id: savedId } });
          sendRaw('[DONE]');
        } catch {
          send({ error: 'Stream interrupted. Try again.' });
        } finally {
          // Backstop for aborts/disconnects — no-op when the happy path
          // already persisted; failures never break the delivered stream.
          await persistAssistantMessage();
          if (!closed) {
            try {
              controller.close();
            } catch {
              // already closed
            }
          }
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err: unknown) {
    console.error('[chat]', err);
    return new Response(
      JSON.stringify({ error: 'Something went wrong. Please try again.' }),
      { status: 500 }
    );
  }
}
