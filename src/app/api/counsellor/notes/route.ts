import { NextResponse, type NextRequest } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { assertCounsellorMayActOnStudent, parseJsonBody } from '@/lib/api/guards';

const VALID_TYPES = new Set(['session', 'flag', 'update']);

/**
 * Longest note we will store. Unbounded text from an authenticated caller is a
 * cheap way to fill the table (and the counsellor UI) with megabytes per request.
 */
const MAX_BODY_LENGTH = 5_000;

// Persist a counsellor note about a student.
//
// `studentId` arrives in the request body, so it is caller-controlled and must be
// authorised against the caller — RLS (counsellor_notes_insert) constrains only
// `author_profile_id = auth.uid()`, never the SUBJECT of the note. Without the
// scope check below, any caller who passes the counsellor guard can write a
// permanent note onto any student's record, and counsellor_notes_select then
// makes it readable.
export async function POST(request: NextRequest) {
  const supabase = await createRouteHandlerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await parseJsonBody<{ studentId?: string; body?: string; noteType?: string }>(request);
  const { studentId, body, noteType } = payload ?? {};
  if (!studentId || !body?.trim() || !noteType || !VALID_TYPES.has(noteType)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
  if (body.length > MAX_BODY_LENGTH) {
    return NextResponse.json(
      { error: `Note is too long (max ${MAX_BODY_LENGTH} characters).` },
      { status: 400 }
    );
  }

  const scope = await assertCounsellorMayActOnStudent(supabase, user, studentId);
  if (!scope.ok) {
    // 404 for an unknown subject so this endpoint cannot be used to probe which
    // profile ids exist; 403 once the subject is known to be out of scope.
    return scope.reason === 'not_found'
      ? NextResponse.json({ error: 'Not found' }, { status: 404 })
      : NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
    // Do not surface the raw PostgREST message — it names tables, constraints and
    // RLS policies.
    console.error('counsellor_notes insert failed:', error.message);
    return NextResponse.json({ error: 'Could not save note.' }, { status: 400 });
  }

  return NextResponse.json({
    note: { id: data.id, content: data.body, type: data.note_type, date: data.created_at },
  });
}
