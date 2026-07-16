// Buffered parser for the chat SSE stream. The critical property: bytes are
// accumulated across push() calls and only COMPLETE lines are parsed, so an
// event split across two network reads (likely for the ~2KB `action` payload)
// is reassembled instead of silently dropped — naive per-chunk splitting loses
// the fragment on both sides of the boundary.

export type SseEvent =
  | { type: 'text'; text: string }
  | { type: 'action'; action: unknown }
  | { type: 'error'; message: string }
  | { type: 'done' };

export function createSseParser() {
  let buffer = '';

  return {
    /** Feed a decoded network chunk; returns every complete event it closed. */
    push(chunk: string): SseEvent[] {
      buffer += chunk;
      const lines = buffer.split('\n');
      // The final segment is either '' (chunk ended on a newline) or a partial
      // line — keep it buffered for the next read.
      buffer = lines.pop() ?? '';

      const events: SseEvent[] = [];
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') {
          events.push({ type: 'done' });
          continue;
        }
        try {
          const parsed = JSON.parse(data) as Record<string, unknown>;
          if (typeof parsed.text === 'string') events.push({ type: 'text', text: parsed.text });
          if (parsed.action !== undefined) events.push({ type: 'action', action: parsed.action });
          if (typeof parsed.error === 'string') events.push({ type: 'error', message: parsed.error });
        } catch {
          // A malformed COMPLETE line is server garbage — drop it. Partial
          // lines never reach here; they wait in the buffer.
        }
      }
      return events;
    },
  };
}
