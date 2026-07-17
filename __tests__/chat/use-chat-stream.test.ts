/**
 * Tests for the shared streaming hook — the contract both the widget and the
 * Assistant workspace depend on (accumulated deltas, distinct terminal states,
 * abort keeps partials, 429 starts the cooldown).
 */
import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'util';

// jsdom lacks the encoding globals the hook uses.
(globalThis as Record<string, unknown>).TextEncoder ??= NodeTextEncoder;
(globalThis as Record<string, unknown>).TextDecoder ??= NodeTextDecoder;

import { renderHook, act } from '@testing-library/react';
import { useChatStream, HISTORY_LIMIT, COOLDOWN_SECONDS } from '@/hooks/use-chat-stream';
import type { ChatRunResult } from '@/hooks/use-chat-stream';

const encoder = new NodeTextEncoder();

/** Fake reader yielding each string as one network chunk. */
const readerOf = (chunks: Array<string | Error>) => {
  let i = 0;
  return {
    read: jest.fn(async () => {
      if (i >= chunks.length) return { done: true, value: undefined };
      const next = chunks[i++];
      if (next instanceof Error) throw next;
      return { done: false, value: encoder.encode(next) };
    }),
  };
};

const streamResponse = (chunks: Array<string | Error>) => ({
  ok: true,
  status: 200,
  body: { getReader: () => readerOf(chunks) },
});

const baseArgs = (handlers: Partial<Parameters<ReturnType<typeof useChatStream>['run']>[0]['handlers']> = {}) => ({
  history: [{ role: 'user' as const, content: 'Hi' }],
  mode: 'student' as const,
  surface: 'widget' as 'widget' | 'assistant',
  handlers: { onTextDelta: jest.fn(), ...handlers },
});

const runHook = async (
  args: ReturnType<typeof baseArgs> & { conversationId?: string; surface?: 'widget' | 'assistant' }
): Promise<{ result: ChatRunResult; hook: ReturnType<typeof renderHook<ReturnType<typeof useChatStream>, unknown>> }> => {
  const hook = renderHook(() => useChatStream());
  let result!: ChatRunResult;
  await act(async () => {
    result = await hook.result.current.run(args);
  });
  return { result, hook };
};

describe('useChatStream', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it('streams text deltas as accumulated full text and completes', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      streamResponse(['data: {"text":"Hello "}\n\n', 'data: {"text":"world"}\n\ndata: [DONE]\n\n'])
    );
    const args = baseArgs();
    const { result } = await runHook(args);

    expect(result).toEqual({ kind: 'completed', text: 'Hello world', action: undefined, widgets: undefined });
    expect(args.handlers.onTextDelta).toHaveBeenNthCalledWith(1, 'Hello ');
    expect(args.handlers.onTextDelta).toHaveBeenNthCalledWith(2, 'Hello world');
  });

  it('sends surface, conversationId, and a trimmed history', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(streamResponse(['data: {"text":"ok"}\n\ndata: [DONE]\n\n']));
    const longHistory = Array.from({ length: 20 }, (_, i) => ({
      role: 'user' as const,
      content: `msg ${i}`,
    }));
    await runHook({ ...baseArgs(), history: longHistory, surface: 'assistant', conversationId: 'conv-1' });

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.surface).toBe('assistant');
    expect(body.conversationId).toBe('conv-1');
    expect(body.messages).toHaveLength(HISTORY_LIMIT);
    expect(body.messages[0].content).toBe(`msg ${20 - HISTORY_LIMIT}`);
  });

  it('fires onAction for a valid action event and returns it', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      streamResponse([
        'data: {"action":{"kind":"help_request","subject":"S","body":"B"}}\n\ndata: [DONE]\n\n',
      ])
    );
    const onAction = jest.fn();
    const { result } = await runHook(baseArgs({ onAction }));

    expect(onAction).toHaveBeenCalledWith({ kind: 'help_request', subject: 'S', body: 'B' });
    expect(result.kind).toBe('completed');
  });

  it('ignores malformed action payloads', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      streamResponse(['data: {"action":{"kind":"help_request"}}\n\ndata: [DONE]\n\n'])
    );
    const onAction = jest.fn();
    const { result } = await runHook(baseArgs({ onAction }));

    expect(onAction).not.toHaveBeenCalled();
    expect(result.kind).toBe('empty');
  });

  it('fires onWidgets for widget events and accumulates merged widgets', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      streamResponse([
        'data: {"results":{"tool":"search_programs","widgets":[{"kind":"programs","items":[{"id":"p1","course":"CS"}]}]}}\n\n',
        'data: {"results":{"tool":"search_programs","widgets":[{"kind":"programs","items":[{"id":"p1","course":"CS"},{"id":"p2","course":"Maths"}]}]}}\n\n',
        'data: {"text":"Found!"}\n\ndata: [DONE]\n\n',
      ])
    );
    const onWidgets = jest.fn();
    const { result } = await runHook(baseArgs({ onWidgets }));

    expect(onWidgets).toHaveBeenCalledTimes(2);
    expect(onWidgets).toHaveBeenNthCalledWith(1, [
      { kind: 'programs', items: [{ id: 'p1', course: 'CS' }] },
    ]);
    // Accumulated result merges batches and dedupes by id.
    expect(result).toMatchObject({
      kind: 'completed',
      text: 'Found!',
      widgets: [
        {
          kind: 'programs',
          items: [
            { id: 'p1', course: 'CS' },
            { id: 'p2', course: 'Maths' },
          ],
        },
      ],
    });
  });

  it('captures the saved row id from the saved frame', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      streamResponse([
        'data: {"text":"Done"}\n\ndata: {"saved":{"id":"row-42"}}\n\ndata: [DONE]\n\n',
      ])
    );
    const { result } = await runHook(baseArgs());
    expect(result).toMatchObject({ kind: 'completed', text: 'Done', savedId: 'row-42' });
  });

  it('returns rate_limited on 429 and starts the cooldown', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 429 });
    const { result, hook } = await runHook(baseArgs());

    expect(result.kind).toBe('rate_limited');
    expect(hook.result.current.coolingDown).toBe(true);
    expect(hook.result.current.cooldownRemaining).toBe(COOLDOWN_SECONDS);
  });

  it('returns the server error message on a non-OK response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: 'AI is rate-limited right now.' }),
    });
    const { result } = await runHook(baseArgs());
    expect(result).toEqual({ kind: 'error', message: 'AI is rate-limited right now.' });
  });

  it('surfaces an error SSE event as a retryable error with its message', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      streamResponse(['data: {"error":"Stream interrupted. Try again."}\n\n'])
    );
    const { result } = await runHook(baseArgs());
    expect(result).toEqual({ kind: 'error', message: 'Stream interrupted. Try again.' });
  });

  it('returns empty when the stream ends with nothing', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(streamResponse(['data: [DONE]\n\n']));
    const { result } = await runHook(baseArgs());
    expect(result).toEqual({ kind: 'empty' });
  });

  it('keeps the partial text when the stream aborts mid-way', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      streamResponse([
        'data: {"text":"partial answer"}\n\n',
        new DOMException('The operation was aborted.', 'AbortError'),
      ])
    );
    const { result } = await runHook(baseArgs());
    expect(result).toEqual({ kind: 'aborted', text: 'partial answer' });
  });

  it('treats a plain Error named AbortError as an abort too', async () => {
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    (global.fetch as jest.Mock).mockRejectedValue(abortErr);
    const { result } = await runHook(baseArgs());
    expect(result).toEqual({ kind: 'aborted', text: '' });
  });

  it('reassembles events split across network reads', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      streamResponse(['data: {"text":"Hel', 'lo"}\n\ndata: [DONE]\n\n'])
    );
    const { result } = await runHook(baseArgs());
    expect(result).toMatchObject({ kind: 'completed', text: 'Hello' });
  });
});
