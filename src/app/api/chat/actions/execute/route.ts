// Confirm-then-execute endpoint for tool_action proposals. The chat route
// only ever DRAFTS write actions; this is the single place the server
// executes one — after the user confirmed the card, under the user-scoped
// client (RLS is the enforcement), against the action row persisted by the
// chat turn (the wire can only vary the card's editable fields).
//
// Response contract:
//   Validation/auth failures  → JSON {error} with 400/401/403/409/429.
//   Once the action EXECUTES  → always SSE 200 (the write outcome must never
//     be masked by resume-stream failures):
//       {"executed": {ok, message, result?}}   — first event
//       then a normal assistant follow-up turn ({"text"}, maybe one
//       {"action"} proposing the next step, {"saved": {id}}), then [DONE].
//       If no model is reachable, a static {"text": <result message>} stands
//       in for the follow-up.

import { NextRequest } from 'next/server';
import { type Content } from '@google/genai';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { parseJsonBody } from '@/lib/api/guards';
import { getSystemPrompt, getToolAddendum } from '@/lib/chat/prompts';
import { buildContextForMode } from '@/lib/chat/context';
import { contextCacheKey, getCachedContext, setCachedContext } from '@/lib/chat/cache';
import { getWriteTool, buildGeminiTools } from '@/lib/chat/tools/registry';
import {
  newTurnAccumulator,
  openStreamWithFallback,
  runToolLoop,
} from '@/lib/chat/gemini';
import { isChatAction } from '@/lib/chat/actions';
import type { ToolActionResult } from '@/lib/chat/tools/types';
import {
  appendMessage,
  claimMessageAction,
  getConversation,
  getMessage,
  listMessages,
  updateMessageAction,
} from '@/lib/chat/history';

export const runtime = 'nodejs';

// Matches the hook's HISTORY_LIMIT — the resume turn sees the same window a
// normal turn would.
const HISTORY_LIMIT = 12;

const jsonError = (error: string, status: number) =>
  new Response(JSON.stringify({ error }), { status });

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return jsonError('Not authenticated', 401);

    // Tighter than the chat limit — every hit is a state-changing write.
    if (!checkRateLimit(`chat-action:${user.id}`, { limit: 10, windowMs: 60_000 })) {
      return jsonError('Too many actions — try again in a minute', 429);
    }

    const body = await parseJsonBody<{
      conversationId?: unknown;
      messageId?: unknown;
      tool?: unknown;
      params?: unknown;
    }>(req);
    const conversationId = typeof body?.conversationId === 'string' ? body.conversationId : '';
    const messageId = typeof body?.messageId === 'string' ? body.messageId : '';
    const toolName = typeof body?.tool === 'string' ? body.tool : '';
    const wireParams =
      body?.params && typeof body.params === 'object' && !Array.isArray(body.params)
        ? (body.params as Record<string, unknown>)
        : null;
    if (!conversationId || !messageId || !toolName || !wireParams) {
      return jsonError('Invalid request', 400);
    }

    const conversation = await getConversation(supabase, conversationId);
    if (!conversation || conversation.owner_id !== user.id) {
      return jsonError('Conversation not found', 403);
    }
    // Mode↔tool binding comes from the PERSISTED conversation row, never the
    // wire. Same demo-posture seam as /api/chat (mode was client-chosen at
    // conversation creation): when profiles.role is enforced there, this
    // tightens automatically.
    const mode = conversation.mode;

    const message = await getMessage(supabase, messageId);
    if (!message || message.conversation_id !== conversationId || message.role !== 'assistant') {
      return jsonError('Action not found', 400);
    }
    if (message.action_state !== 'pending') {
      return jsonError('This action was already handled', 409);
    }
    const storedAction = message.action;
    if (
      !isChatAction(storedAction) ||
      storedAction.kind !== 'tool_action' ||
      storedAction.tool !== toolName // tool name is immutable — only params can be edited
    ) {
      return jsonError('Action mismatch', 400);
    }

    const writeTool = getWriteTool(toolName, mode);
    if (!writeTool) return jsonError('Tool not available', 403);

    // Edits are whitelisted to the card's editable fields; everything else
    // comes from the stored proposal, so the wire can't rewrite target ids.
    const editableKeys = new Set(storedAction.editable.map((f) => f.key));
    const effectiveParams: Record<string, unknown> = { ...storedAction.params };
    for (const key of editableKeys) {
      if (wireParams[key] !== undefined) effectiveParams[key] = wireParams[key];
    }
    const validated = writeTool.validateParams(effectiveParams);
    if (!validated.ok) return jsonError(validated.error, 400);

    // Atomic pending→sent claim: double-clicks and second tabs lose the race.
    const claimed = await claimMessageAction(supabase, messageId);
    if (!claimed) return jsonError('This action was already handled', 409);

    const toolCtx = { supabase, userId: user.id, mode };
    let executed: ToolActionResult;
    try {
      executed = await writeTool.execute(toolCtx, validated.params);
    } catch (err) {
      console.warn('[chat-action] execute threw:', err);
      executed = { ok: false as const, message: "Couldn't complete that action." };
    }
    if (!executed.ok) {
      // Revert the claim so the card stays confirmable — the write did not land.
      try {
        await updateMessageAction(supabase, messageId, 'pending');
      } catch (err) {
        console.warn('[chat-action] claim revert failed:', err);
      }
      return jsonError(executed.error ?? executed.message, 400);
    }

    const executedAction = {
      ...storedAction,
      params: validated.params,
      ...(executed.result ? { result: executed.result } : {}),
      resultMessage: executed.message,
      executedAt: new Date().toISOString(),
    };
    try {
      await updateMessageAction(
        supabase,
        messageId,
        'sent',
        executedAction as unknown as Record<string, unknown>
      );
    } catch (err) {
      // The write landed; a failed stamp only degrades the card's result line.
      console.warn('[chat-action] result stamp failed:', err);
    }

    // ── From here the action has EXECUTED — always stream 200. ──────────────
    const cacheKey = contextCacheKey(mode, user.id, undefined);
    let chatContext = getCachedContext(cacheKey);
    if (!chatContext) {
      chatContext = await buildContextForMode(supabase, mode, user.id, undefined);
      setCachedContext(cacheKey, chatContext);
    }
    const tools = buildGeminiTools(mode);
    const systemInstruction = [
      getSystemPrompt(mode),
      tools ? getToolAddendum(mode, false) : '',
      chatContext.context,
    ]
      .filter(Boolean)
      .join('\n\n');

    const history = await listMessages(supabase, conversationId);
    const convo: Content[] = history
      .filter((m) => m.content) // action-only rows have no prose for the model
      .slice(-HISTORY_LIMIT)
      .map((m) => ({
        role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
        parts: [{ text: m.content }],
      }));
    while (convo.length > 0 && convo[0].role !== 'user') convo.shift();
    convo.push({
      role: 'user',
      parts: [
        {
          text:
            `[SYSTEM NOTE — not user text] The user confirmed the "${toolName}" card and Ascenda executed it. ` +
            `Result: ${JSON.stringify(executed.result ?? { ok: true })}. Outcome shown to the user: "${executed.message}". ` +
            'Briefly confirm what happened and, if a next step was planned, propose it now.',
        },
      ],
    });

    const streamOptions = {
      systemInstruction,
      ...(tools ? { tools } : {}),
      abortSignal: req.signal,
    };
    const opened = process.env.GEMINI_API_KEY
      ? await openStreamWithFallback(convo, streamOptions)
      : null;

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        let closed = false;
        const sendRaw = (line: string) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(`data: ${line}\n\n`));
          } catch {
            closed = true;
          }
        };
        const send = (payload: unknown) => sendRaw(JSON.stringify(payload));

        send({
          executed: {
            ok: true,
            message: executed.message,
            ...(executed.result ? { result: executed.result } : {}),
          },
        });

        const acc = newTurnAccumulator();
        let assistantPersisted = false;
        const persistFollowUp = async (): Promise<string | null> => {
          if (assistantPersisted) return null;
          if (!acc.text && !acc.action && acc.widgets.length === 0) return null;
          assistantPersisted = true;
          try {
            const { id } = await appendMessage(supabase, {
              conversation_id: conversationId,
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
            console.warn('[chat-action] follow-up persist failed:', err);
            return null;
          }
        };

        try {
          if (opened) {
            await runToolLoop({
              opened,
              contents: convo,
              streamOptions,
              toolCtx,
              acc,
              send,
            });
          }
          if (!acc.text && !acc.action) {
            // No model (or an empty turn): the static outcome line stands in,
            // so the thread still records what happened.
            acc.text = executed.message;
            send({ text: acc.text });
          }
          const savedId = await persistFollowUp();
          if (savedId) send({ saved: { id: savedId } });
          sendRaw('[DONE]');
        } catch {
          if (!acc.text) {
            acc.text = executed.message;
            send({ text: acc.text });
          }
          send({ error: 'Follow-up interrupted — the action itself succeeded.' });
          sendRaw('[DONE]');
        } finally {
          await persistFollowUp();
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
    console.error('[chat-action]', err);
    return jsonError('Something went wrong. Please try again.', 500);
  }
}
