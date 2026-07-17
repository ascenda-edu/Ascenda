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

jest.mock('@/lib/chat/tools', () => {
  const actual = jest.requireActual('@/lib/chat/tools');
  return { ...actual, executeSearchPrograms: jest.fn() };
});

// Persistence goes through the history wrapper — mock the wrapper, not the
// raw supabase chains.
jest.mock('@/lib/chat/history', () => ({
  getConversation: jest.fn(),
  getLatestMessage: jest.fn(),
  appendMessage: jest.fn(),
  renameConversation: jest.fn(),
}));

import { POST } from '@/app/api/chat/route';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { buildContextForMode } from '@/lib/chat/context';
import { executeSearchPrograms } from '@/lib/chat/tools';
import { __resetContextCache } from '@/lib/chat/cache';
import {
  getConversation,
  getLatestMessage,
  appendMessage,
  renameConversation,
} from '@/lib/chat/history';

const { __mockGenerateContentStream: mockGenerate } = jest.requireMock('@google/genai') as {
  __mockGenerateContentStream: jest.Mock;
};

type Chunk = { text?: string; functionCalls?: Array<{ id?: string; name?: string; args?: Record<string, unknown> }> };

const streamOf = (chunks: Chunk[]) =>
  (async function* () {
    for (const chunk of chunks) yield chunk;
  })();

const chatRequest = (body: unknown) =>
  new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;

const validBody = {
  messages: [{ role: 'user', content: 'Hi there' }],
  currentPage: '/dashboard',
  mode: 'student',
};

describe('POST /api/chat', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetContextCache();
    process.env.GEMINI_API_KEY = 'test-key';
    (createRouteHandlerSupabaseClient as jest.Mock).mockReturnValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-123' } } }) },
    });
    (checkRateLimit as jest.Mock).mockReturnValue(true);
    (buildContextForMode as jest.Mock).mockResolvedValue({
      context: 'LIVE-CONTEXT-BLOCK',
      signals: {},
    });
    (getConversation as jest.Mock).mockResolvedValue({
      id: 'conv-1',
      owner_id: 'user-123',
      mode: 'student',
      title: null,
    });
    (getLatestMessage as jest.Mock).mockResolvedValue(null);
    (appendMessage as jest.Mock).mockResolvedValue({ id: 'msg-1' });
    (renameConversation as jest.Mock).mockResolvedValue(undefined);
  });

  it('rejects unauthenticated requests', async () => {
    (createRouteHandlerSupabaseClient as jest.Mock).mockReturnValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
    });
    const res = await POST(chatRequest(validBody));
    expect(res.status).toBe(401);
  });

  it('rejects rate-limited requests with 429', async () => {
    (checkRateLimit as jest.Mock).mockReturnValue(false);
    const res = await POST(chatRequest(validBody));
    expect(res.status).toBe(429);
  });

  it('rejects an empty message list', async () => {
    const res = await POST(chatRequest({ ...validBody, messages: [] }));
    expect(res.status).toBe(400);
  });

  it('streams text chunks, injects the context block, and terminates with [DONE]', async () => {
    mockGenerate.mockResolvedValueOnce(streamOf([{ text: 'Hello ' }, { text: 'world' }]));

    const res = await POST(chatRequest(validBody));
    expect(res.status).toBe(200);
    const body = await res.text();

    expect(body).toContain('data: {"text":"Hello "}');
    expect(body).toContain('data: {"text":"world"}');
    expect(body.trimEnd().endsWith('data: [DONE]')).toBe(true);

    const config = mockGenerate.mock.calls[0][0].config;
    expect(config.systemInstruction).toContain('LIVE-CONTEXT-BLOCK');
    expect(config.systemInstruction).toContain('Ascendi');
    // gemini-2.5-flash gets a zeroed thinking budget (2.0 models must not)
    expect(mockGenerate.mock.calls[0][0].model).toBe('gemini-2.5-flash');
    expect(config.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });

  it('executes search_programs and streams the follow-up round', async () => {
    mockGenerate
      .mockResolvedValueOnce(
        streamOf([{ functionCalls: [{ id: 'call-1', name: 'search_programs', args: { query: 'cs' } }] }])
      )
      .mockResolvedValueOnce(streamOf([{ text: 'Found 3 programmes!' }]));
    (executeSearchPrograms as jest.Mock).mockResolvedValue({ results: [{ id: 'p1' }] });

    const res = await POST(chatRequest({ ...validBody, surface: 'assistant' }));
    const body = await res.text();

    expect(executeSearchPrograms).toHaveBeenCalledWith(expect.anything(), { query: 'cs' });
    expect(mockGenerate).toHaveBeenCalledTimes(2);
    // second round carries the functionCall + functionResponse turns
    const secondContents = mockGenerate.mock.calls[1][0].contents;
    const last = secondContents[secondContents.length - 1];
    expect(last.role).toBe('user');
    expect(last.parts[0].functionResponse.name).toBe('search_programs');
    expect(body).toContain('Found 3 programmes!');
    expect(body).toContain('data: [DONE]');
  });

  it('emits a single action event for an action call and never executes it', async () => {
    mockGenerate.mockResolvedValueOnce(
      streamOf([
        { text: 'Drafted this for you: ' },
        { functionCalls: [{ name: 'propose_help_request', args: { subject: 'Oxford ref', body: 'Please advise' } }] },
      ])
    );

    const res = await POST(chatRequest({ ...validBody, surface: 'assistant' }));
    const body = await res.text();

    expect(body).toContain(
      'data: {"action":{"kind":"help_request","subject":"Oxford ref","body":"Please advise"}}'
    );
    expect(body).toContain('data: [DONE]');
    expect(mockGenerate).toHaveBeenCalledTimes(1); // action ends the turn
    expect(executeSearchPrograms).not.toHaveBeenCalled();
  });

  it('falls back through the model list when the first model rejects', async () => {
    mockGenerate
      .mockRejectedValueOnce(new Error('quota exceeded'))
      .mockResolvedValueOnce(streamOf([{ text: 'ok' }]));

    const res = await POST(chatRequest(validBody));
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toContain('ok');
    expect(mockGenerate.mock.calls[0][0].model).toBe('gemini-2.5-flash');
    expect(mockGenerate.mock.calls[1][0].model).toBe('gemini-2.0-flash');
    // 2.0 models must NOT receive thinkingConfig (they reject it with a 400)
    expect(mockGenerate.mock.calls[1][0].config.thinkingConfig).toBeUndefined();
  });

  it('returns 503 when every model fails to start', async () => {
    mockGenerate.mockRejectedValue(new Error('down'));
    const res = await POST(chatRequest(validBody));
    expect(res.status).toBe(503);
  });

  // ── Surface gating ─────────────────────────────────────────────────────

  it('gives the widget surface (default) no tools — read-only informational', async () => {
    mockGenerate.mockResolvedValueOnce(streamOf([{ text: 'hi' }]));
    await (await POST(chatRequest(validBody))).text();
    expect(mockGenerate.mock.calls[0][0].config.tools).toBeUndefined();
  });

  it('gives the assistant surface the full registry toolset for the mode', async () => {
    mockGenerate.mockResolvedValueOnce(streamOf([{ text: 'hi' }]));
    await (await POST(chatRequest({ ...validBody, surface: 'assistant' }))).text();
    const tools = mockGenerate.mock.calls[0][0].config.tools;
    expect(tools).toBeDefined();
    const names = tools[0].functionDeclarations.map((d: { name: string }) => d.name);
    expect(names).toEqual([
      'search_programs',
      'get_university_info',
      'get_my_applications',
      'get_my_matches',
      'get_my_shortlist',
      'track_application',
      'create_task',
      'update_task_status',
      'add_to_shortlist',
      'send_help_request',
    ]);
  });

  it('gives the counsellor assistant its own registry toolset', async () => {
    mockGenerate.mockResolvedValueOnce(streamOf([{ text: 'hi' }]));
    (getConversation as jest.Mock).mockResolvedValue({
      id: 'conv-1',
      owner_id: 'user-123',
      mode: 'counsellor',
      title: 'T',
    });
    await (
      await POST(chatRequest({ ...validBody, mode: 'counsellor', surface: 'assistant' }))
    ).text();
    const names = mockGenerate.mock.calls[0][0].config.tools[0].functionDeclarations.map(
      (d: { name: string }) => d.name
    );
    expect(names).toEqual([
      'search_programs',
      'get_university_info',
      'get_cohort_overview',
      'get_student_overview',
      'get_cohort_deadlines',
      'add_student_note',
      'message_student',
    ]);
  });

  // ── Persistence (assistant surface + conversationId) ───────────────────

  const persistBody = { ...validBody, surface: 'assistant', conversationId: 'conv-1' };

  it('persists the user message before streaming and the assistant message after', async () => {
    mockGenerate.mockResolvedValueOnce(streamOf([{ text: 'Hello ' }, { text: 'world' }]));

    const res = await POST(chatRequest(persistBody));
    await res.text();

    expect(getConversation).toHaveBeenCalledWith(expect.anything(), 'conv-1');
    const calls = (appendMessage as jest.Mock).mock.calls;
    expect(calls).toHaveLength(2);
    // Original user text, not the page-enhanced copy
    expect(calls[0][1]).toEqual({
      conversation_id: 'conv-1',
      role: 'user',
      content: 'Hi there',
    });
    expect(calls[1][1]).toMatchObject({
      conversation_id: 'conv-1',
      role: 'assistant',
      content: 'Hello world',
    });
  });

  it('auto-titles an untitled conversation from the first user message (≤60 chars)', async () => {
    mockGenerate.mockResolvedValueOnce(streamOf([{ text: 'ok' }]));
    const longMessage = 'x'.repeat(100);

    await (
      await POST(
        chatRequest({ ...persistBody, messages: [{ role: 'user', content: longMessage }] })
      )
    ).text();

    const [, , title] = (renameConversation as jest.Mock).mock.calls[0];
    expect(title).toBe('x'.repeat(60));
  });

  it('leaves an already-titled conversation alone', async () => {
    (getConversation as jest.Mock).mockResolvedValue({
      id: 'conv-1',
      owner_id: 'user-123',
      mode: 'student',
      title: 'Existing title',
    });
    mockGenerate.mockResolvedValueOnce(streamOf([{ text: 'ok' }]));

    await (await POST(chatRequest(persistBody))).text();
    expect(renameConversation).not.toHaveBeenCalled();
  });

  it('rejects a conversation the caller does not own before any model spend', async () => {
    (getConversation as jest.Mock).mockResolvedValue({
      id: 'conv-1',
      owner_id: 'someone-else',
      mode: 'student',
      title: null,
    });

    const res = await POST(chatRequest(persistBody));
    expect(res.status).toBe(403);
    expect(appendMessage).not.toHaveBeenCalled();
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('rejects a conversation whose mode does not match', async () => {
    (getConversation as jest.Mock).mockResolvedValue({
      id: 'conv-1',
      owner_id: 'user-123',
      mode: 'parent',
      title: null,
    });

    const res = await POST(chatRequest(persistBody));
    expect(res.status).toBe(400);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('persists an action-only turn (no prose) with the pending action', async () => {
    mockGenerate.mockResolvedValueOnce(
      streamOf([
        { functionCalls: [{ name: 'propose_help_request', args: { subject: 'S', body: 'B' } }] },
      ])
    );

    await (await POST(chatRequest(persistBody))).text();

    const assistantCall = (appendMessage as jest.Mock).mock.calls[1][1];
    expect(assistantCall).toMatchObject({
      role: 'assistant',
      content: '',
      action: { kind: 'help_request', subject: 'S', body: 'B' },
      action_state: 'pending',
    });
  });

  it('emits a results SSE frame and persists tool_results on search turns', async () => {
    mockGenerate
      .mockResolvedValueOnce(
        streamOf([{ functionCalls: [{ id: 'c1', name: 'search_programs', args: { query: 'cs' } }] }])
      )
      .mockResolvedValueOnce(streamOf([{ text: 'Found!' }]));
    (executeSearchPrograms as jest.Mock).mockResolvedValue({
      results: [{ id: 'p1', course: 'CS', university: 'Oxford', country: 'UK', city: null, level: null }],
    });

    const res = await POST(chatRequest(persistBody));
    const body = await res.text();

    expect(body).toContain(
      'data: {"results":{"tool":"search_programs","widgets":[{"kind":"programs","items":[{"id":"p1"'
    );
    const assistantCall = (appendMessage as jest.Mock).mock.calls[1][1];
    expect(assistantCall.tool_results).toEqual([
      {
        kind: 'programs',
        items: [
          { id: 'p1', course: 'CS', university: 'Oxford', country: 'UK', city: null, level: null },
        ],
      },
    ]);
  });

  it('announces the persisted assistant row id via a saved frame before [DONE]', async () => {
    mockGenerate.mockResolvedValueOnce(streamOf([{ text: 'Hello' }]));

    const res = await POST(chatRequest(persistBody));
    const body = await res.text();

    const savedIdx = body.indexOf('data: {"saved":{"id":"msg-1"}}');
    const doneIdx = body.indexOf('data: [DONE]');
    expect(savedIdx).toBeGreaterThan(-1);
    expect(doneIdx).toBeGreaterThan(savedIdx);
    // Single persist — the finally backstop must not double-write.
    const assistantWrites = (appendMessage as jest.Mock).mock.calls.filter(
      ([, row]) => row.role === 'assistant'
    );
    expect(assistantWrites).toHaveLength(1);
  });

  it('skips re-persisting the user message on a retry of the same text', async () => {
    (getLatestMessage as jest.Mock).mockResolvedValue({
      id: 'prev',
      role: 'user',
      content: 'Hi there',
    });
    mockGenerate.mockResolvedValueOnce(streamOf([{ text: 'second try worked' }]));

    await (await POST(chatRequest(persistBody))).text();

    const calls = (appendMessage as jest.Mock).mock.calls;
    expect(calls).toHaveLength(1); // assistant only — no duplicate user row
    expect(calls[0][1].role).toBe('assistant');
  });

  it('never persists on the widget surface even with a conversationId', async () => {
    mockGenerate.mockResolvedValueOnce(streamOf([{ text: 'hi' }]));
    await (await POST(chatRequest({ ...validBody, conversationId: 'conv-1' }))).text();
    expect(getConversation).not.toHaveBeenCalled();
    expect(appendMessage).not.toHaveBeenCalled();
  });
});
