import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';

const safeTokenEqual = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
};

const unauthorized = () =>
  NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

// Lightweight health check to verify catalog data is present and key fields are usable.
export async function GET(request: Request) {
  const supabase = await createRouteHandlerSupabaseClient();

  // Access requires EITHER a server-to-server bearer token (ADMIN_API_KEY, for
  // CLI/cron use) OR an authenticated admin user. Without one of these the
  // endpoint must not leak catalogue data — previously the bearer check was
  // opt-in, leaving the route fully public whenever ADMIN_API_KEY was unset.
  const adminKey = process.env.ADMIN_API_KEY;
  const header = request.headers.get('authorization');
  const token = header?.replace(/^Bearer\s+/i, '');
  const hasValidBearer = Boolean(adminKey && token && safeTokenEqual(token, adminKey));

  if (!hasValidBearer) {
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return unauthorized();

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }
  }

  const [{ count: universityCount, error: uniErr }, { count: programCount, error: progErr }] =
    await Promise.all([
      supabase.from('universities').select('*', { count: 'exact', head: true }),
      supabase.from('programs').select('*', { count: 'exact', head: true })
    ]);

  if (uniErr || progErr) {
    const err = uniErr ?? progErr;
    return NextResponse.json({ ok: false, error: err?.message ?? 'Count failed' }, { status: 500 });
  }

  // Pull a couple of sample programs with the new UCAS fields to confirm availability.
  const sample = await supabase
    .from('programs')
    .select(
      'id, course_name, study_level, campus, start_date, ucas_code, course_summary, modules, assessment_methods, provider_course_url, provider_apply_url'
    )
    .limit(3);

  if (sample.error) {
    return NextResponse.json({ ok: false, error: sample.error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    counts: {
      universities: universityCount ?? 0,
      programs: programCount ?? 0
    },
    samplePrograms: sample.data ?? []
  });
}
