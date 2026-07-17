// Contracts for the chat tool registry. Two tool kinds with different
// execution rights (the tiered-autonomy line):
//
//   ReadTool  — executed by the server DURING the tool loop, no confirmation.
//   WriteTool — never executed inline. The loop converts the model's call into
//               a ToolActionProposal (an editable confirm card); the execute
//               endpoint runs `execute` only after the user approves, and only
//               through the user-scoped client so RLS has the final word.

import type { FunctionDeclaration } from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatMode } from '../prompts';
import type { ToolActionEditableField } from '../actions';
import type { ChatWidget } from '../widgets';

export interface ToolContext {
  /** The route handler's user-scoped client — RLS is the enforcement layer. */
  supabase: SupabaseClient<any, any, any>;
  userId: string;
  mode: ChatMode;
}

export interface ToolActionProposal {
  tool: string;
  title: string;
  summary: string;
  params: Record<string, unknown>;
  editable: ToolActionEditableField[];
}

export interface ToolActionResult {
  ok: boolean;
  /** Fed back to the model on resume + stored in the action jsonb. Keep small. */
  result?: Record<string, unknown>;
  /** Human line for the confirm card, e.g. "Tracked — see [Applications](/applications)". */
  message: string;
  error?: string;
}

interface ToolBase {
  name: string;
  /** Modes whose tool list includes this tool — enforced server-side both at
   * declaration time and again at execute time (from the conversation row). */
  modes: ChatMode[];
  declaration: FunctionDeclaration;
}

export interface ReadTool extends ToolBase {
  kind: 'read';
  /** MUST never throw — return an `{ error }`/`{ note }` payload instead, so a
   * failed lookup degrades to a model-visible message, not a broken stream. */
  execute(ctx: ToolContext, args: Record<string, unknown>): Promise<Record<string, unknown>>;
  /** Optional rich-widget groups for the thread (see ../widgets.ts). One tool
   * may emit several groups (e.g. cohort overview → stats + at-risk). Return
   * null/empty when the payload has nothing card-worthy (errors, empty sets). */
  toWidgets?(result: Record<string, unknown>): ChatWidget[] | null;
  /** Transient "agent is working" label streamed while this tool runs. */
  statusLabel?: string;
}

export interface WriteTool extends ToolBase {
  kind: 'write';
  /** Model args → validated confirm-card proposal. Async so it can resolve
   * human-readable names (programme titles etc.). null = drop the call. */
  toProposal(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolActionProposal | null>;
  /** Re-validates a (possibly user-edited) params object at execute time.
   * Runs server-side in the execute endpoint — never trust the wire shape. */
  validateParams(
    params: unknown
  ): { ok: true; params: Record<string, unknown> } | { ok: false; error: string };
  execute(ctx: ToolContext, params: Record<string, unknown>): Promise<ToolActionResult>;
}

export type ChatTool = ReadTool | WriteTool;
