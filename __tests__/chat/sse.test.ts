import { createSseParser, type SseEvent } from '@/lib/chat/sse';

const collect = (chunks: string[]): SseEvent[] => {
  const parser = createSseParser();
  return chunks.flatMap((c) => parser.push(c));
};

describe('createSseParser', () => {
  it('parses complete events', () => {
    expect(collect(['data: {"text":"Hello"}\n\n'])).toEqual([{ type: 'text', text: 'Hello' }]);
  });

  it('reassembles an event split mid-JSON across reads (the dropped-event bug)', () => {
    const events = collect(['data: {"text":"Hel', 'lo"}\n\ndata: [DONE]\n\n']);
    expect(events).toEqual([{ type: 'text', text: 'Hello' }, { type: 'done' }]);
  });

  it('reassembles a large action payload split across three reads', () => {
    const action = {
      kind: 'help_request',
      subject: 'Oxford reference',
      body: 'x'.repeat(1_800),
    };
    const wire = `data: ${JSON.stringify({ action })}\n\n`;
    const third = Math.floor(wire.length / 3);
    const events = collect([wire.slice(0, third), wire.slice(third, 2 * third), wire.slice(2 * third)]);
    expect(events).toEqual([{ type: 'action', action }]);
  });

  it('handles multiple events arriving in one chunk', () => {
    const events = collect(['data: {"text":"a"}\n\ndata: {"text":"b"}\n\ndata: [DONE]\n\n']);
    expect(events).toEqual([
      { type: 'text', text: 'a' },
      { type: 'text', text: 'b' },
      { type: 'done' },
    ]);
  });

  it('holds a trailing partial line until the next read', () => {
    const parser = createSseParser();
    expect(parser.push('data: {"text":"a"}\n\ndata: {"te')).toEqual([{ type: 'text', text: 'a' }]);
    expect(parser.push('xt":"b"}\n\n')).toEqual([{ type: 'text', text: 'b' }]);
  });

  it('emits error events (so the widget can show a retryable bubble)', () => {
    expect(collect(['data: {"error":"Stream interrupted. Try again."}\n\n'])).toEqual([
      { type: 'error', message: 'Stream interrupted. Try again.' },
    ]);
  });

  it('drops malformed complete lines without affecting later events', () => {
    const events = collect(['data: {not json}\n\ndata: {"text":"ok"}\n\n']);
    expect(events).toEqual([{ type: 'text', text: 'ok' }]);
  });

  it('ignores non-data lines (comments, blank keep-alives)', () => {
    expect(collect([':keep-alive\n\n\n'])).toEqual([]);
  });
});
