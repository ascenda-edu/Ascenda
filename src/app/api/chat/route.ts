// Ascendi chatbot endpoint. Orchestration only — system prompts live in
// lib/chat/prompts.ts, live-account context in lib/chat/context.ts (cached,
// lib/chat/cache.ts), tools in lib/chat/tools.ts, action payloads in
// lib/chat/actions.ts.
//
// SSE protocol (all events `data: <json>\n\n`, terminated by `data: [DONE]`):
//   {"text": "..."}    — streamed prose chunk (unchanged from v1)
//   {"error": "..."}   — stream-level failure (unchanged from v1)
//   {"action": {...}}  — ≤1 per turn: a ChatAction the user must confirm
//                        client-side; the server never executes actions.

import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import {
  GoogleGenAI,
  type Content,
  type FunctionCall,
  type GenerateContentConfig,
  type GenerateContentResponse,
  type Part,
} from '@google/genai';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { ACTIVE_CHILD_COOKIE } from '@/lib/parent/active-child';
import { getSystemPrompt, getToolAddendum, MODELS, type ChatMode } from '@/lib/chat/prompts';
import { buildContextForMode } from '@/lib/chat/context';
import { contextCacheKey, getCachedContext, setCachedContext } from '@/lib/chat/cache';
import { buildToolsForMode, executeSearchPrograms } from '@/lib/chat/tools';
import { isActionCall, toActionPayload } from '@/lib/chat/actions';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? '' });

export const runtime = 'nodejs';

// Bound on tool-calling rounds per message: round 1 may request searches,
// round 2 answers from results (or searches once more), round 3 must answer.
const MAX_TOOL_ROUNDS = 3;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const VALID_MODES: ChatMode[] = ['student', 'counsellor', 'parent'];

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerSupabaseClient();
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
    const { messages, currentPage, mode: rawMode } = body as {
      messages: ChatMessage[];
      currentPage?: string;
      mode?: ChatMode;
    };
    const mode: ChatMode = VALID_MODES.includes(rawMode as ChatMode)
      ? (rawMode as ChatMode)
      : 'student';

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

    // ── Live account context (cached 60s per user+mode) ─────────────────────
    const activeChildId =
      mode === 'parent' ? cookies().get(ACTIVE_CHILD_COOKIE)?.value : undefined;
    const cacheKey = contextCacheKey(mode, user.id, activeChildId);
    let chatContext = getCachedContext(cacheKey);
    if (!chatContext) {
      chatContext = await buildContextForMode(supabase, mode, user.id, activeChildId);
      setCachedContext(cacheKey, chatContext);
    }
    const parentContactId = chatContext.parentContactId;

    const tools = buildToolsForMode(mode, Boolean(parentContactId));
    const systemInstruction = [
      getSystemPrompt(mode),
      tools ? getToolAddendum(mode, Boolean(parentContactId)) : '',
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

    // gemini-2.5-flash burns the output budget on hidden thinking unless it's
    // zeroed; 2.0 models reject thinkingConfig outright, which would silently
    // kill the fallback chain — so it's applied per-model.
    const configForModel = (model: string): GenerateContentConfig => ({
      systemInstruction,
      temperature: 0.7,
      maxOutputTokens: 1024,
      abortSignal: req.signal,
      ...(tools ? { tools } : {}),
      ...(model.startsWith('gemini-2.5') ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    });

    // Establish the first stream with the model fallback chain; later tool
    // rounds reuse whichever model succeeded.
    let stream: AsyncGenerator<GenerateContentResponse> | null = null;
    let chosenModel = '';
    for (const model of MODELS) {
      try {
        stream = await ai.models.generateContentStream({
          model,
          contents: convo,
          config: configForModel(model),
        });
        chosenModel = model;
        break;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[chat] ${model} failed: ${msg.slice(0, 100)}`);
        continue;
      }
    }
    if (!stream) {
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

        try {
          let activeStream = stream!;
          for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
            const calls: FunctionCall[] = [];
            const textParts: string[] = [];

            for await (const chunk of activeStream) {
              if (chunk.text) {
                send({ text: chunk.text });
                textParts.push(chunk.text);
              }
              for (const fc of chunk.functionCalls ?? []) calls.push(fc);
            }

            if (calls.length === 0) break; // model finished with prose

            // Action proposals are emitted for client-side confirmation and
            // end the turn — the server never executes them.
            const actionCall = calls.find((c) => isActionCall(c.name));
            if (actionCall) {
              const payload = toActionPayload(actionCall, { parentContactId });
              if (payload) send({ action: payload });
              break;
            }

            // Last round: don't execute tools we can't answer from.
            if (round === MAX_TOOL_ROUNDS - 1) break;

            const responseParts: Part[] = [];
            for (const fc of calls) {
              if (fc.name === 'search_programs') {
                const result = await executeSearchPrograms(supabase, fc.args ?? {});
                responseParts.push({
                  functionResponse: {
                    name: fc.name,
                    ...(fc.id ? { id: fc.id } : {}),
                    response: result as unknown as Record<string, unknown>,
                  },
                });
              }
            }
            if (responseParts.length === 0) break; // unknown tool — bail out

            convo.push({
              role: 'model',
              parts: [
                ...(textParts.length > 0 ? [{ text: textParts.join('') }] : []),
                ...calls.map((c) => ({ functionCall: c })),
              ],
            });
            convo.push({ role: 'user', parts: responseParts });

            activeStream = await ai.models.generateContentStream({
              model: chosenModel,
              contents: convo,
              config: configForModel(chosenModel),
            });
          }

          sendRaw('[DONE]');
        } catch {
          send({ error: 'Stream interrupted. Try again.' });
        } finally {
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
