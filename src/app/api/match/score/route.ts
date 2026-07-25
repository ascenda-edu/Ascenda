import { NextResponse, type NextRequest } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { scoreProgramsForProfile } from '@/lib/matching/service';

// One explore page is 50 results; leave headroom without letting a caller
// batch-score the catalogue through this route.
const MAX_PROGRAM_IDS = 100;

// POST /api/match/score — on-demand fit scores for an explicit list of
// programs. Complements the cached ranked set in student_matches: the cache
// only holds the student's top ~300, but every card on the explore page needs
// a score, so anything outside the cache is classified here on request.
export async function POST(request: NextRequest) {
  const supabase = await createRouteHandlerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const rawIds = (body as { programIds?: unknown })?.programIds;
  if (!Array.isArray(rawIds) || rawIds.some((id) => typeof id !== 'string' || !id.trim())) {
    return NextResponse.json({ error: 'programIds must be an array of ids' }, { status: 400 });
  }
  if (rawIds.length > MAX_PROGRAM_IDS) {
    return NextResponse.json(
      { error: `programIds is capped at ${MAX_PROGRAM_IDS} per request` },
      { status: 400 }
    );
  }

  const scores = await scoreProgramsForProfile(supabase, user.id, rawIds as string[]);
  return NextResponse.json({ scores });
}
