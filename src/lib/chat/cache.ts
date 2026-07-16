// TTL cache for chat context blocks, so a multi-message conversation doesn't
// re-run the (sometimes heavy — counsellor loadCohort) context queries on
// every message. Same posture as lib/api/rate-limit.ts: in-memory and
// per-server-instance — on serverless each instance warms its own cache,
// which only costs an extra build, never correctness.

import type { ChatContext } from './context';

interface Entry {
  value: ChatContext;
  expires: number;
}

const store = new Map<string, Entry>();
const MAX_KEYS = 5_000;

export const DEFAULT_CONTEXT_TTL_MS = 60_000;

export function contextCacheKey(mode: string, userId: string, activeChildId?: string): string {
  return `${mode}:${userId}:${activeChildId ?? ''}`;
}

export function getCachedContext(key: string): ChatContext | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() >= entry.expires) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

export function setCachedContext(
  key: string,
  value: ChatContext,
  ttlMs: number = DEFAULT_CONTEXT_TTL_MS
): void {
  if (store.size >= MAX_KEYS) store.clear();
  store.set(key, { value, expires: Date.now() + ttlMs });
}

/** Test-only: clear all entries. */
export function __resetContextCache(): void {
  store.clear();
}
