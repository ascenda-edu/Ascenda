// Minimal in-memory sliding-window rate limiter for API routes.
//
// Scope: per server instance — on serverless this bounds abuse per warm
// instance rather than globally, which is still enough to stop a scripted
// loop from burning unbounded LLM spend. Swap for a shared store (Upstash,
// Postgres) if global enforcement is ever needed.

// Each bucket carries its own windowMs so the overflow eviction below can tell
// which entries are dead without knowing every caller's window up front.
interface Bucket {
  hits: number[];
  windowMs: number;
}

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 10_000;

// Reclaim space when the map hits its cap WITHOUT wiping live limits: a global
// clear() would reset every route's counters (including per-user chat/LLM spend
// buckets), so an attacker rotating spoofed IPs against an anon route could
// flush everyone's limits. Instead, drop fully-expired buckets first, then — if
// still at capacity — evict the entries closest to expiring (earliest window
// start) until back under the cap.
const evictForSpace = (now: number) => {
  for (const [key, bucket] of buckets) {
    if (bucket.hits.every((t) => now - t >= bucket.windowMs)) {
      buckets.delete(key);
    }
  }
  if (buckets.size < MAX_KEYS) return;
  const orderedByWindowStart = [...buckets.entries()].sort(
    (a, b) => Math.min(...a[1].hits) - Math.min(...b[1].hits)
  );
  for (const [key] of orderedByWindowStart) {
    if (buckets.size < MAX_KEYS) break;
    buckets.delete(key);
  }
};

export const checkRateLimit = (
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number }
): boolean => {
  const now = Date.now();
  const existing = buckets.get(key);
  const recent = (existing?.hits ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, { hits: recent, windowMs });
    return false;
  }
  recent.push(now);
  if (!existing && buckets.size >= MAX_KEYS) evictForSpace(now);
  buckets.set(key, { hits: recent, windowMs });
  return true;
};

// Best-effort client IP for keying anonymous routes (no user id). Prefer
// `x-real-ip`: Vercel sets it to the actual connecting client and ignores any
// client-supplied value, so it can't be spoofed to mint a fresh rate-limit key
// per request. The LEFTMOST `x-forwarded-for` hop is caller-controlled (proxies
// append the real client to the right), so it's only a dev / non-Vercel
// fallback for when x-real-ip is absent.
export const clientIp = (request: Request) =>
  request.headers.get('x-real-ip')?.trim() ||
  request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  'unknown';
