import { NextResponse, type NextRequest } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { canActAsCounsellor, parseJsonBody } from '@/lib/api/guards';

const VALID_TYPES = new Set(['session', 'flag', 'update']);

// Persist a counsellor note about a student. RLS (counsellor_notes_insert)
// requires can_act_as_counsellor() AND author_profile_id = auth.uid();
// the in-app role check is defense in depth on top of that.
export async function POST(request: NextRequest) {
  const supabase = await createRouteHandlerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!(await canActAsCounsellor(supabase, user))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const payload = await parseJsonBody<{ studentId?: string; body?: string; noteType?: string }>(request);
  const { studentId, body, noteType } = payload ?? {};
  if (!studentId || !body?.trim() || !noteType || !VALID_TYPES.has(noteType)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { data, error } = await (supabase as any)
    .from('counsellor_notes')
    .insert({
      student_profile_id: studentId,
      author_profile_id: user.id,
      body: body.trim(),
      note_type: noteType,
    })
    .select('id, body, note_type, created_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    note: { id: data.id, content: data.body, type: data.note_type, date: data.created_at },
  });
}
