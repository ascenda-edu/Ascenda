import { NextResponse, type NextRequest } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { filterActionableStudentIds, parseJsonBody } from '@/lib/api/guards';
import { assignDeck, requireCounsellor, unassignDeck } from '@/lib/counsellor/decks';

/** One request may not fan out past a plausible cohort. */
const MAX_STUDENTS_PER_ASSIGN = 200;
/** `message` is interpolated into a notification body by the DB trigger. */
const MAX_MESSAGE_LENGTH = 1_000;

// Assign a deck to one or more students. The student notification fires via
// the trg_deck_assignment_notify DB trigger — do NOT insert notifications here
// (same convention as the help-system triggers).
//
// Because that trigger is SECURITY DEFINER and writes into the SUBJECT's
// notification feed, `studentIds` is the security-critical input: every id here
// becomes a row in someone else's feed carrying caller-supplied `message` text.
// deck_assignments_write checks that the DECK belongs to the caller but says
// nothing about the students, so the subjects are authorised here.
export async function POST(request: NextRequest) {
  const supabase = await createRouteHandlerSupabaseClient();
  const auth = await requireCounsellor(supabase);
  if (!auth.user) return auth.errorResponse;

  const payload = await parseJsonBody<{ deckId?: string; studentIds?: string[]; message?: string }>(request);
  const { deckId, studentIds, message } = payload ?? {};
  if (!deckId || !Array.isArray(studentIds) || studentIds.length === 0) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
  if (studentIds.length > MAX_STUDENTS_PER_ASSIGN) {
    return NextResponse.json(
      { error: `Too many students in one request (max ${MAX_STUDENTS_PER_ASSIGN}).` },
      { status: 400 }
    );
  }
  if (!studentIds.every((id) => typeof id === 'string')) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
  if (message && message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters).` },
      { status: 400 }
    );
  }

  const allowedStudentIds = await filterActionableStudentIds(supabase, auth.user, studentIds);
  if (allowedStudentIds === null) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (allowedStudentIds.length === 0) {
    return NextResponse.json({ error: 'No assignable students in request.' }, { status: 400 });
  }

  const { assignments, skipped, error } = await assignDeck(
    supabase,
    deckId,
    allowedStudentIds,
    auth.user.id,
    message?.trim() || null
  );

  if (error) {
    console.error('deck assign failed:', error.message);
    return NextResponse.json({ error: 'Could not assign deck.' }, { status: 400 });
  }

  // Ids dropped by the scope filter are reported as skipped, so a partially
  // out-of-scope request is not silently reported as a full success.
  const outOfScope = new Set(studentIds).size - allowedStudentIds.length;
  return NextResponse.json({ assignments, skipped: skipped + outOfScope });
}

// Unassign (?id=<assignment id>).
export async function DELETE(request: NextRequest) {
  const supabase = await createRouteHandlerSupabaseClient();
  const auth = await requireCounsellor(supabase);
  if (!auth.user) return auth.errorResponse;

  const assignmentId = new URL(request.url).searchParams.get('id');
  if (!assignmentId) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { error } = await unassignDeck(supabase, assignmentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
