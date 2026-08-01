import { NextResponse } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { logger } from '@/lib/observability/logger';
import { parseJsonBody } from '@/lib/api/guards';
import { requireAdminUser } from '../admin-guard';

export async function POST(request: Request) {
  const supabase = await createRouteHandlerSupabaseClient();

  // Role check + its error handling live in ../admin-guard (the `error` from
  // the profiles lookup used to be discarded here).
  const { user, response } = await requireAdminUser(supabase, 'update-deadlines');
  if (!user) return response;

  const {
    data: { session }
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // The body is forwarded verbatim to the edge function, so a malformed one is
  // a 400 here rather than an unhandled throw.
  const payload = await parseJsonBody(request);
  if (payload === null) {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const upstream = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/update_deadlines`, {
    method: 'POST',
    headers: {
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!upstream.ok) {
    // Was `{ error: await response.text() }` — the edge function's raw body,
    // whatever it happens to contain, echoed to the browser. Log it, return the
    // status.
    const detail = await upstream.text();
    logger.error('admin: update_deadlines edge function failed', undefined, {
      route: 'update-deadlines',
      status: upstream.status,
      detail
    });
    // Status left at 500 (not 502) so the route's contract is unchanged; only
    // the leaked upstream body is gone.
    return NextResponse.json({ ok: false, error: 'The deadline update job could not be started.' }, { status: 500 });
  }

  return NextResponse.json({ status: 'queued' });
}
