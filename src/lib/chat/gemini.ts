// Shared Gemini plumbing for the two assistant endpoints (/api/chat and
// /api/chat/actions/execute): one client, one config builder, one model
// fallback chain, and the tool-calling loop itself — so the confirm-resume
// turn behaves exactly like a normal turn.

import {
  GoogleGenAI,
  type Content,
  type FunctionCall,
  type GenerateContentConfig,
  type GenerateContentResponse,
  type Part,
  type Tool,
} from '@google/genai';
import { MODELS } from './prompts';
import { isActionCall, toActionPayload, type ChatAction } from './actions';
import { getReadTool, getWriteTool, frameToolResult } from './tools/registry';
import type { ToolContext } from './tools/types';
import { mergeWidgets, type ChatWidget } from './widgets';

export const geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? '' });

// Bound on tool-calling rounds per message: enough headroom for a read chain
// (e.g. get_my_matches → search_programs) before proposing a write; the final
// round must answer in prose.
export const MAX_TOOL_ROUNDS = 5;

export interface GeminiStreamOptions {
  systemInstruction: string;
  tools?: Tool[];
  abortSignal?: AbortSignal;
}

// gemini-2.5-flash burns the output budget on hidden thinking unless it's
// zeroed; 2.0 models reject thinkingConfig outright, which would silently
// kill the fallback chain — so it's applied per-model.
const configForModel = (model: string, opts: GeminiStreamOptions): GenerateContentConfig => ({
  systemInstruction: opts.systemInstruction,
  temperature: 0.7,
  maxOutputTokens: 1024,
  ...(opts.abortSignal ? { abortSignal: opts.abortSignal } : {}),
  ...(opts.tools ? { tools: opts.tools } : {}),
  ...(model.startsWith('gemini-2.5') ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
});

export interface OpenedStream {
  stream: AsyncGenerator<GenerateContentResponse>;
  model: string;
}

/** Establish the first stream via the model fallback chain; null when every
 * model fails (callers return 503 before opening the SSE response). */
export async function openStreamWithFallback(
  contents: Content[],
  opts: GeminiStreamOptions
): Promise<OpenedStream | null> {
  for (const model of MODELS) {
    try {
      const stream = await geminiClient.models.generateContentStream({
        model,
        contents,
        config: configForModel(model, opts),
      });
      return { stream, model };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[chat] ${model} failed: ${msg.slice(0, 100)}`);
      continue;
    }
  }
  return null;
}

/** Live accumulators, mutated as the turn streams so the caller's abort
 * backstop can persist a partial turn. */
export interface TurnAccumulator {
  text: string;
  action: ChatAction | null;
  widgets: ChatWidget[];
}

export const newTurnAccumulator = (): TurnAccumulator => ({
  text: '',
  action: null,
  widgets: [],
});

/**
 * The tool loop. Read tools execute inline (framed results fed back to the
 * model); the first write-tool or legacy propose_* call becomes a ChatAction
 * proposal, is emitted as an `action` SSE event, and ends the turn — the
 * server never executes writes here. Later rounds reuse the model that
 * survived the fallback chain.
 */
export async function runToolLoop(opts: {
  opened: OpenedStream;
  contents: Content[];
  streamOptions: GeminiStreamOptions;
  toolCtx: ToolContext;
  parentContactId?: string;
  /** false on the widget surface: write/propose calls are answered with an
   * error functionResponse instead of becoming action proposals — the widget
   * has no confirm-card machinery and must stay a no-actions surface. */
  allowActions?: boolean;
  acc: TurnAccumulator;
  send: (payload: unknown) => void;
}): Promise<void> {
  const { contents, streamOptions, toolCtx, parentContactId, acc, send } = opts;
  const allowActions = opts.allowActions !== false;
  let activeStream = opts.opened.stream;
  const chosenModel = opts.opened.model;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const calls: FunctionCall[] = [];
    const textParts: string[] = [];

    for await (const chunk of activeStream) {
      if (chunk.text) {
        send({ text: chunk.text });
        textParts.push(chunk.text);
        acc.text += chunk.text;
      }
      for (const fc of chunk.functionCalls ?? []) calls.push(fc);
    }

    if (calls.length === 0) break; // model finished with prose

    // Write proposals (registry) and legacy propose_* calls (parent portal,
    // old-model retries) end the turn for client-side confirmation. On a
    // no-actions surface they instead fall through to the read loop below,
    // where the unknown-tool branch tells the model they're unavailable.
    const actionable = allowActions
      ? calls.find((c) => getWriteTool(c.name ?? '', toolCtx.mode) || isActionCall(c.name))
      : undefined;
    if (actionable) {
      // Reads co-emitted with a write can't reach the model (the action ends
      // the turn), but ones with a widget card should still render instead of
      // being silently dropped. Model-fuel-only reads are skipped — executing
      // them would be invisible DB work.
      for (const fc of calls) {
        if (fc === actionable) continue;
        const readTool = getReadTool(fc.name ?? '', toolCtx.mode);
        if (!readTool?.toWidgets) continue;
        if (readTool.statusLabel) {
          send({ status: { tool: readTool.name, label: readTool.statusLabel } });
        }
        const result = await readTool.execute(toolCtx, fc.args ?? {});
        const widgets = readTool.toWidgets(result);
        if (widgets && widgets.length > 0) {
          acc.widgets = mergeWidgets(acc.widgets, widgets);
          send({ results: { tool: readTool.name, widgets } });
        }
      }
      const writeTool = getWriteTool(actionable.name ?? '', toolCtx.mode);
      let payload: ChatAction | null = null;
      if (writeTool) {
        const proposal = await writeTool.toProposal(toolCtx, actionable.args ?? {});
        if (proposal) payload = { kind: 'tool_action', ...proposal };
      } else {
        payload = toActionPayload(actionable, { parentContactId });
      }
      if (payload) {
        acc.action = payload;
        send({ action: payload });
      }
      break;
    }

    // Last round: don't execute tools we can't answer from.
    if (round === MAX_TOOL_ROUNDS - 1) break;

    const responseParts: Part[] = [];
    for (const fc of calls) {
      const readTool = getReadTool(fc.name ?? '', toolCtx.mode);
      if (readTool) {
        if (readTool.statusLabel) {
          send({ status: { tool: readTool.name, label: readTool.statusLabel } });
        }
        const result = await readTool.execute(toolCtx, fc.args ?? {});
        const widgets = readTool.toWidgets?.(result);
        if (widgets && widgets.length > 0) {
          acc.widgets = mergeWidgets(acc.widgets, widgets);
          send({ results: { tool: readTool.name, widgets } });
        }
        responseParts.push({
          functionResponse: {
            name: fc.name,
            ...(fc.id ? { id: fc.id } : {}),
            response: frameToolResult(result),
          },
        });
      } else {
        // Unknown / other-mode tool: tell the model instead of dying silently.
        responseParts.push({
          functionResponse: {
            name: fc.name,
            ...(fc.id ? { id: fc.id } : {}),
            response: { error: `Tool ${fc.name ?? '(unnamed)'} is not available.` },
          },
        });
      }
    }

    contents.push({
      role: 'model',
      parts: [
        ...(textParts.length > 0 ? [{ text: textParts.join('') }] : []),
        ...calls.map((c) => ({ functionCall: c })),
      ],
    });
    contents.push({ role: 'user', parts: responseParts });

    activeStream = await geminiClient.models.generateContentStream({
      model: chosenModel,
      contents,
      config: configForModel(chosenModel, streamOptions),
    });
  }
}
