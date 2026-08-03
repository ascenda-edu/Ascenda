import { NextResponse } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { reportDataError } from '@/lib/data/errors';
import { hasValidAdminBearer, requireAdminUser } from '../admin-guard';

// Lightweight health check to verify catalog data is present and key fields are usable.
export async function GET(request: Request) {
  const supabase = await createRouteHandlerSupabaseClient();

  // Access requires EITHER a server-to-server bearer token (ADMIN_API_KEY, for
  // CLI/cron use) OR an authenticated admin user. Without one of these the
  // endpoint must not leak catalogue data — previously the bearer check was
  // opt-in, leaving the route fully public whenever ADMIN_API_KEY was unset.
  //
  // The bearer path deliberately SKIPS the role check: it is not a user, it has
  // no profile, and the key IS the authorisation. It is the only such path in
  // /api/admin — `import` and `update-deadlines` accept no bearer at all, so a
  // leaked key cannot be used to write to the catalogue, only to read these two
  // counts and three sample rows.
  if (!hasValidAdminBearer(request)) {
    const { user, response } = await requireAdminUser(supabase, 'catalog-health');
    if (!user) return response;
  }

  const [{ count: universityCount, error: uniErr }, { count: programCount, error: progErr }] =
    await Promise.all([
      supabase.from('universities').select('*', { count: 'exact', head: true }),
      supabase.from('programs').select('*', { count: 'exact', head: true })
    ]);

  if (uniErr || progErr) {
    // Disposition: fail the response. This route's ONE job is to report whether
    // the catalogue is readable — degrading to `counts: { universities: 0 }`
    // would answer "the catalogue is empty" to the question "is the catalogue
    // reachable", which is the exact confusion this endpoint exists to resolve.
    const failure = reportDataError('admin.catalogHealth.counts', uniErr ?? progErr);
    return NextResponse.json({ ok: false, error: failure.message }, { status: 500 });
  }

  // Pull a couple of sample programs with the new UCAS fields to confirm availability.
  const sample = await supabase
    .from('programs')
    .select(
      'id, course_name, study_level, campus, start_date, ucas_code, course_summary, modules, assessment_methods, provider_course_url, provider_apply_url'
    )
    .limit(3);

  if (sample.error) {
    const failure = reportDataError('admin.catalogHealth.sample', sample.error);
    return NextResponse.json({ ok: false, error: failure.message }, { status: 500 });
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
