// Buffered parser for the chat SSE stream. The critical property: bytes are
// accumulated across push() calls and only COMPLETE lines are parsed, so an
// event split across two network reads (likely for the ~2KB `action` payload)
// is reassembled instead of silently dropped — naive per-chunk splitting loses
// the fragment on both sides of the boundary.

export type SseEvent =
  | { type: 'text'; text: string }
  | { type: 'action'; action: unknown }
  | { type: 'results'; hits: unknown }
  | { type: 'status'; tool: string; label: string }
  | { type: 'executed'; ok: boolean; message: string; result?: unknown }
  | { type: 'saved'; id: string }
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
          if (parsed.results !== undefined)
            events.push({ type: 'results', hits: (parsed.results as { hits?: unknown })?.hits });
          {
            const status = parsed.status as { tool?: unknown; label?: unknown } | undefined;
            if (typeof status?.tool === 'string' && typeof status?.label === 'string')
              events.push({ type: 'status', tool: status.tool, label: status.label });
          }
          {
            const executed = parsed.executed as
              | { ok?: unknown; message?: unknown; result?: unknown }
              | undefined;
            if (typeof executed?.ok === 'boolean' && typeof executed?.message === 'string')
              events.push({
                type: 'executed',
                ok: executed.ok,
                message: executed.message,
                ...(executed.result !== undefined ? { result: executed.result } : {}),
              });
          }
          {
            const savedId = (parsed.saved as { id?: unknown } | undefined)?.id;
            if (typeof savedId === 'string') events.push({ type: 'saved', id: savedId });
          }
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
