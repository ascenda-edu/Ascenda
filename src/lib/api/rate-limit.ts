// Minimal in-memory sliding-window rate limiter for API routes.
//
// Scope: per server instance — on serverless this bounds abuse per warm
// instance rather than globally, which is still enough to stop a scripted
// loop from burning unbounded LLM spend. Swap for a shared store (Upstash,
// Postgres) if global enforcement is ever needed.

const buckets = new Map<string, number[]>();
const MAX_KEYS = 10_000;

export const checkRateLimit = (
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number }
): boolean => {
  const now = Date.now();
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  if (!buckets.has(key) && buckets.size >= MAX_KEYS) buckets.clear(); // crude memory bound
  buckets.set(key, recent);
  return true;
};
