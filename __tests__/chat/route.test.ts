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

import { POST } from '@/app/api/chat/route';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { buildContextForMode } from '@/lib/chat/context';
import { executeSearchPrograms } from '@/lib/chat/tools';
import { __resetContextCache } from '@/lib/chat/cache';

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

    const res = await POST(chatRequest(validBody));
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

    const res = await POST(chatRequest(validBody));
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
});
