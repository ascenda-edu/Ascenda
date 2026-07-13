import { NextResponse, type NextRequest } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { parseJsonBody } from '@/lib/api/guards';
import { assignDeck, requireCounsellor, unassignDeck } from '@/lib/counsellor/decks';

// Assign a deck to one or more students. The student notification fires via
// the trg_deck_assignment_notify DB trigger — do NOT insert notifications here
// (same convention as the help-system triggers).
export async function POST(request: NextRequest) {
  const supabase = createRouteHandlerSupabaseClient();
  const auth = await requireCounsellor(supabase);
  if (!auth.user) return auth.errorResponse;

  const payload = await parseJsonBody<{ deckId?: string; studentIds?: string[]; message?: string }>(request);
  const { deckId, studentIds, message } = payload ?? {};
  if (!deckId || !Array.isArray(studentIds) || studentIds.length === 0) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { assignments, skipped, error } = await assignDeck(
    supabase,
    deckId,
    studentIds,
    auth.user.id,
    message?.trim() || null
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ assignments, skipped });
}

// Unassign (?id=<assignment id>).
export async function DELETE(request: NextRequest) {
  const supabase = createRouteHandlerSupabaseClient();
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
