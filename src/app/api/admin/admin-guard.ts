/**
 * The admin API's authorisation preamble, in one place.
 *
 * WHY THIS EXISTS
 * ---------------
 * All three routes under `/api/admin` opened with the same eight lines, and all
 * three had the same defect (docs/audit/02-data-layer.md, "27 call sites
 * silently discard `error`"):
 *
 *     const { data: profile } = await supabase
 *       .from('profiles').select('role').eq('id', user.id).single();
 *     if (profile?.role !== 'admin') return 403;
 *
 * The `error` was never bound. That guard happens to fail CLOSED — a failed
 * lookup leaves `profile` undefined, `undefined?.role !== 'admin'` is true, deny
 * — but by accident of where the `?.` fell, not by design. Written one character
 * differently (`if (profile && profile.role !== 'admin')`, or a later
 * `const role = profile?.role ?? 'admin'` default) the identical shape fails
 * OPEN, and nothing in the file says which it is. Worse, nothing was logged: an
 * RLS change that made `profiles` unreadable would 403 every admin in silence.
 *
 * Two other properties this fixes while it is here:
 *
 *  - `.single()` errors with PGRST116 when zero rows match, so a signed-in user
 *    with no `profiles` row arrived here as an ERROR rather than as "not an
 *    admin". `.maybeSingle()` makes the two outcomes distinguishable, which is
 *    what lets the deny below be honest about which one happened.
 *  - a lookup that genuinely failed is answered 503, not 403. Both DENY — that
 *    is the invariant — but an admin who is told "forbidden" files a support
 *    ticket, and an operator who greps for 403 never finds the outage. The
 *    driver detail goes to the log; the response body carries none of it.
 */

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { Database } from '@/lib/types/database';
import { logger } from '@/lib/observability/logger';

type Client = SupabaseClient<Database>;

export type AdminGuardResult =
  | { user: User; response: null }
  | { user: null; response: NextResponse };

/**
 * Server-to-server access with `ADMIN_API_KEY`, for CLI/cron callers that have
 * no session.
 *
 * Fails closed when the variable is unset — a route that treats "no key
 * configured" as "no check needed" is a public route. Constant-time compare so a
 * response-timing loop cannot recover the key byte by byte; the length check in
 * front of it is unavoidable (`timingSafeEqual` throws on a length mismatch) and
 * leaks only the key's length.
 */
export const hasValidAdminBearer = (request: Request): boolean => {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) return false;

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return false;

  const provided = Buffer.from(token);
  const expected = Buffer.from(adminKey);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
};

/**
 * Resolve the caller and require `profiles.role = 'admin'`.
 *
 * `route` names the caller for the log — `import`, `catalog-health` — and never
 * reaches the response.
 */
export async function requireAdminUser(supabase: Client, route: string): Promise<AdminGuardResult> {
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, response: NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    // Disposition: DENY, loudly. Not `soft(..., null)` — that would collapse
    // "we could not check" into "you are not an admin" and lose the outage in a
    // pile of ordinary 403s. The role is the only thing standing between a
    // request and a catalogue-wide upsert; an unverifiable one is not a pass.
    logger.error('admin: role check failed', error, { route, userId: user.id });
    return {
      user: null,
      response: NextResponse.json({ ok: false, error: 'Role check unavailable' }, { status: 503 })
    };
  }

  if (profile?.role !== 'admin') {
    // Includes "no profiles row at all" (`profile === null`), which is a
    // genuine non-admin, not a failure.
    logger.warn('admin: non-admin request refused', { route, userId: user.id });
    return { user: null, response: NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 }) };
  }

  return { user, response: null };
}
