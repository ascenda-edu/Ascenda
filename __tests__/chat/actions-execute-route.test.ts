/**
 * @jest-environment ./jest.environment-node.js
 *
 * Route handlers need the fetch globals (Request/Response/ReadableStream),
 * which the default jsdom environment lacks.
 */

jest.mock('@google/genai', () => {
  const generateContentStream = jest.fn();
  return {
    GoogleGenAI: jest.fn(() => ({ models: { generateContentStream } })),
    Type: { OBJECT: 'OBJECT', STRING: 'STRING', INTEGER: 'INTEGER', ARRAY: 'ARRAY' },
    __mockGenerateContentStream: generateContentStream,
  };
});

jest.mock('@/lib/supabase/server', () => ({
  createRouteHandlerSupabaseClient: jest.fn(),
}));

jest.mock('@/lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(() => true),
}));

jest.mock('@/lib/chat/context', () => ({
  buildContextForMode: jest.fn(),
  buildStarterSuggestions: jest.fn(() => []),
}));

// The endpoint's write-tool resolution is registry-driven — mock the registry
// so these tests exercise the endpoint contract, not tool implementations.
jest.mock('@/lib/chat/tools/registry', () => ({
  getReadTool: jest.fn(() => null),
  getWriteTool: jest.fn(),
  buildGeminiTools: jest.fn(() => undefined),
  frameToolResult: jest.fn((r: Record<string, unknown>) => r),
}));

jest.mock('@/lib/chat/history', () => ({
  getConversation: jest.fn(),
  getMessage: jest.fn(),
  listMessages: jest.fn(),
  appendMessage: jest.fn(),
  claimMessageAction: jest.fn(),
  updateMessageAction: jest.fn(),
}));

import { POST } from '@/app/api/chat/actions/execute/route';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { buildContextForMode } from '@/lib/chat/context';
import { getWriteTool } from '@/lib/chat/tools/registry';
import { __resetContextCache } from '@/lib/chat/cache';
import {
  getConversation,
  getMessage,
  listMessages,
  appendMessage,
  claimMessageAction,
  updateMessageAction,
} from '@/lib/chat/history';

const { __mockGenerateContentStream: mockGenerate } = jest.requireMock('@google/genai') as {
  __mockGenerateContentStream: jest.Mock;
};

const streamOf = (chunks: Array<{ text?: string }>) =>
  (async function* () {
    for (const chunk of chunks) yield chunk;
  })();

const executeRequest = (body: unknown) =>
  new Request('http://localhost/api/chat/actions/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;

const pendingAction = {
  kind: 'tool_action',
  tool: 'create_task',
  title: 'Add a task',
  summary: 'Add "orig" to your Oxford application',
  params: { application_id: 'app-1', task_name: 'orig' },
  editable: [{ key: 'task_name', label: 'Task', kind: 'text' }],
};

const validBody = {
  conversationId: 'conv-1',
  messageId: 'msg-1',
  tool: 'create_task',
  params: { application_id: 'app-1', task_name: 'orig' },
};

type ValidateResult =
  | { ok: true; params: Record<string, unknown> }
  | { ok: false; error: string };
type ExecuteResult = { ok: boolean; result?: Record<string, unknown>; message: string; error?: string };

const makeWriteTool = () => ({
  kind: 'write' as const,
  name: 'create_task',
  modes: ['student'],
  declaration: {},
  toProposal: jest.fn(),
  validateParams: jest.fn(
    (params: Record<string, unknown>): ValidateResult => ({ ok: true, params })
  ),
  execute: jest.fn(
    async (): Promise<ExecuteResult> => ({
      ok: true,
      result: { taskId: 'task-9' },
      message: 'Task added — see [Tasks](/applications/tasks).',
    })
  ),
});

// The all-models-fail test spies on console.warn (openStreamWithFallback warns
// per rejected model). Restoring in afterEach keeps the spy from leaking if an
// assertion throws mid-test.
afterEach(() => {
  jest.restoreAllMocks();
});

describe('POST /api/chat/actions/execute', () => {
  let writeTool: ReturnType<typeof makeWriteTool>;

  beforeEach(() => {
    jest.clearAllMocks();
    __resetContextCache();
    process.env.GEMINI_API_KEY = 'test-key';
    (createRouteHandlerSupabaseClient as jest.Mock).mockReturnValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-123' } } }) },
    });
    (checkRateLimit as jest.Mock).mockReturnValue(true);
    (buildContextForMode as jest.Mock).mockResolvedValue({ context: 'CTX', signals: {} });
    (getConversation as jest.Mock).mockResolvedValue({
      id: 'conv-1',
      owner_id: 'user-123',
      mode: 'student',
      title: 'T',
    });
    (getMessage as jest.Mock).mockResolvedValue({
      id: 'msg-1',
      conversation_id: 'conv-1',
      role: 'assistant',
      content: '',
      action: pendingAction,
      action_state: 'pending',
    });
    (listMessages as jest.Mock).mockResolvedValue([
      { role: 'user', content: 'add a task please' },
      { role: 'assistant', content: 'Here is the card.' },
    ]);
    (appendMessage as jest.Mock).mockResolvedValue({ id: 'msg-2' });
    (claimMessageAction as jest.Mock).mockResolvedValue(true);
    (updateMessageAction as jest.Mock).mockResolvedValue(undefined);
    writeTool = makeWriteTool();
    (getWriteTool as jest.Mock).mockReturnValue(writeTool);
    mockGenerate.mockResolvedValue(streamOf([{ text: 'Done! Want the next step?' }]));
  });

  it('rejects unauthenticated requests', async () => {
    (createRouteHandlerSupabaseClient as jest.Mock).mockReturnValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
    });
    expect((await POST(executeRequest(validBody))).status).toBe(401);
  });

  it('rejects rate-limited requests with 429', async () => {
    (checkRateLimit as jest.Mock).mockReturnValue(false);
    expect((await POST(executeRequest(validBody))).status).toBe(429);
  });

  it('rejects a malformed body', async () => {
    expect((await POST(executeRequest({ conversationId: 'conv-1' }))).status).toBe(400);
    expect(claimMessageAction).not.toHaveBeenCalled();
  });

  it('rejects a conversation the caller does not own', async () => {
    (getConversation as jest.Mock).mockResolvedValue({
      id: 'conv-1',
      owner_id: 'someone-else',
      mode: 'student',
    });
    expect((await POST(executeRequest(validBody))).status).toBe(403);
    expect(writeTool.execute).not.toHaveBeenCalled();
  });

  it('rejects an already-handled action with 409', async () => {
    (getMessage as jest.Mock).mockResolvedValue({
      id: 'msg-1',
      conversation_id: 'conv-1',
      role: 'assistant',
      action: pendingAction,
      action_state: 'sent',
    });
    expect((await POST(executeRequest(validBody))).status).toBe(409);
    expect(writeTool.execute).not.toHaveBeenCalled();
  });

  it('rejects a tool-name swap — the stored proposal wins', async () => {
    const res = await POST(executeRequest({ ...validBody, tool: 'add_to_shortlist' }));
    expect(res.status).toBe(400);
    expect(claimMessageAction).not.toHaveBeenCalled();
  });

  it('rejects when the tool is not in the conversation mode', async () => {
    (getWriteTool as jest.Mock).mockReturnValue(null);
    expect((await POST(executeRequest(validBody))).status).toBe(403);
  });

  it('rejects invalid params before claiming, with the tool error', async () => {
    writeTool.validateParams.mockReturnValue({ ok: false, error: 'Task name is required.' });
    const res = await POST(executeRequest(validBody));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Task name is required.' });
    expect(claimMessageAction).not.toHaveBeenCalled();
  });

  it('only lets editable keys through — target ids come from the stored proposal', async () => {
    await (
      await POST(
        executeRequest({
          ...validBody,
          params: { application_id: 'EVIL-OTHER-APP', task_name: 'edited name' },
        })
      )
    ).text();
    expect(writeTool.validateParams).toHaveBeenCalledWith({
      application_id: 'app-1', // stored, not the wire's
      task_name: 'edited name', // editable — edit accepted
    });
  });

  it('returns 409 when the atomic claim loses the race', async () => {
    (claimMessageAction as jest.Mock).mockResolvedValue(false);
    expect((await POST(executeRequest(validBody))).status).toBe(409);
    expect(writeTool.execute).not.toHaveBeenCalled();
  });

  it('reverts the claim to pending when execution fails', async () => {
    writeTool.execute.mockResolvedValue({
      ok: false,
      message: "Couldn't complete that action.",
      error: 'insert failed',
    });
    const res = await POST(executeRequest(validBody));
    expect(res.status).toBe(400);
    expect(updateMessageAction).toHaveBeenCalledWith(expect.anything(), 'msg-1', 'pending');
  });

  it('executes, stamps the action, streams executed→text→saved→[DONE]', async () => {
    const res = await POST(executeRequest(validBody));
    expect(res.status).toBe(200);
    const body = await res.text();

    expect(writeTool.execute).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-123', mode: 'student' }),
      { application_id: 'app-1', task_name: 'orig' }
    );

    // Stamp: sent + result payload merged into the action jsonb.
    const stamp = (updateMessageAction as jest.Mock).mock.calls.find(([, , state]) => state === 'sent');
    expect(stamp).toBeDefined();
    expect(stamp![3]).toMatchObject({
      kind: 'tool_action',
      tool: 'create_task',
      result: { taskId: 'task-9' },
      resultMessage: 'Task added — see [Tasks](/applications/tasks).',
    });
    expect(typeof stamp![3].executedAt).toBe('string');

    const executedIdx = body.indexOf('"executed"');
    const textIdx = body.indexOf('Done! Want the next step?');
    const savedIdx = body.indexOf('data: {"saved":{"id":"msg-2"}}');
    const doneIdx = body.indexOf('data: [DONE]');
    expect(executedIdx).toBeGreaterThan(-1);
    expect(textIdx).toBeGreaterThan(executedIdx);
    expect(savedIdx).toBeGreaterThan(textIdx);
    expect(doneIdx).toBeGreaterThan(savedIdx);

    // Follow-up persisted as a fresh assistant message.
    expect((appendMessage as jest.Mock).mock.calls[0][1]).toMatchObject({
      conversation_id: 'conv-1',
      role: 'assistant',
      content: 'Done! Want the next step?',
    });
  });

  it('still streams the outcome when every model fails — the write is never masked', async () => {
    // Each model rejection is warned about on purpose; assert it rather than
    // letting three stack traces print.
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockGenerate.mockRejectedValue(new Error('down'));
    const res = await POST(executeRequest(validBody));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('"executed"');
    expect(body).toContain('Task added — see [Tasks](/applications/tasks).');
    expect(body).toContain('data: [DONE]');
    // The static fallback line is persisted so the thread keeps a record.
    expect((appendMessage as jest.Mock).mock.calls[0][1]).toMatchObject({
      role: 'assistant',
      content: 'Task added — see [Tasks](/applications/tasks).',
    });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[chat] gemini-2.5-flash failed: down'));
    expect(warnSpy.mock.calls.length).toBe(mockGenerate.mock.calls.length);
  });
});
