import { NextResponse, type NextRequest } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { parseJsonBody } from '@/lib/api/guards';

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

  // Because there is no unique (profile_id, program_id) constraint, a prior
  // check-then-insert race can leave duplicate rows for the same pair. Don't
  // use .maybeSingle() here — it errors (PGRST116) when more than one row
  // matches. Take the first row instead so we still report { status: 'exists' }.
  const { data: existing, error: existingError } = await supabase
    .from('applications')
    .select('id')
    .eq('profile_id', user.id)
    .eq('program_id', programId)
    .limit(1);
  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 400 });
  }
  if (existing && existing.length > 0) {
    return NextResponse.json({ status: 'exists', applicationId: existing[0].id });
  }

  const { data, error } = await supabase
    .from('applications')
    .insert({ profile_id: user.id, program_id: programId, status: 'planning' })
    .select('id')
    .single();
  if (error) {
    // 23503 = foreign-key violation: the programId doesn't exist in programs.
    if (error.code === '23503') {
      return NextResponse.json({ error: 'Programme not found' }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ status: 'created', applicationId: data.id });
}
