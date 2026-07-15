// Guarded JSON localStorage access. Centralises the SSR guard, the parse
// guard, and quota/security-error swallowing so widget-preference code doesn't
// re-implement the try/catch dance per key. Callers still validate shape —
// JSON.parse can return anything, so pass a `validate` refinement when the
// fallback should also cover well-formed-but-wrong values.
export function readJSON<T>(key: string, fallback: T, validate?: (parsed: unknown) => parsed is T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return fallback;
    const parsed: unknown = JSON.parse(stored);
    if (validate) return validate(parsed) ? parsed : fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode / quota exceeded — preferences simply don't persist.
  }
}
