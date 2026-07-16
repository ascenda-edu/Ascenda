import { NextResponse, type NextRequest } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { parseJsonBody } from '@/lib/api/guards';
import { trackProgram } from '@/lib/applications/server-actions';

// Start tracking an application for the signed-in student. Used by the student
// Quests tab ("Start application" on a counsellor-assigned deck card) and safe
// to call from anywhere a programme can be turned into a planner entry.
//
// Idempotent: if the student already has an application for this programme we
// return { status: 'exists' } instead of inserting a duplicate (there is no
// unique (profile_id, program_id) constraint, so we guard in code). RLS
// (applications_self) is the real enforcement — a student can only ever write
// rows where profile_id = auth.uid().
export async function POST(request: NextRequest) {
  const supabase = createRouteHandlerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await parseJsonBody<{ programId?: string }>(request);
  const programId = payload?.programId?.trim();
  if (!programId) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const result = await trackProgram(supabase, user.id, programId);
  if (!result.ok) {
    // 23503 = the programId doesn't exist → 404; everything else → 400.
    const status = result.code === '23503' ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ status: result.status, applicationId: result.applicationId });
}
