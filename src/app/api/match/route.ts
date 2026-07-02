import { NextResponse, type NextRequest } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { loadMatchesForProfile } from '@/lib/matching/service';

export async function GET(request: NextRequest) {
  const supabase = createRouteHandlerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;

  // The v4 engine has no tunable weights — reject the legacy w_* params
  // instead of silently ignoring them (callers assumed they worked).
  const legacyWeightParams = ['w_eligibility', 'w_academic', 'w_preference', 'w_outcomes'].filter((key) =>
    searchParams.has(key)
  );
  if (legacyWeightParams.length > 0) {
    return NextResponse.json(
      { error: `Unsupported parameters: ${legacyWeightParams.join(', ')} — match weights are no longer tunable` },
      { status: 400 }
    );
  }

  const forceRefresh = searchParams.get('refresh') === '1';

  const matchResult = await loadMatchesForProfile(supabase, user.id, {
    resultLimit: 20,
    forceRefresh
  });

  if (matchResult.error) {
    return NextResponse.json(
      { error: matchResult.error.message, stage: matchResult.error.stage },
      { status: 500 }
    );
  }

  if (matchResult.missingSections.length > 0) {
    return NextResponse.json({ matches: [], missingSections: matchResult.missingSections });
  }

  const matches = matchResult.matches.map((match) => ({
    program_id: match.program.id,
    university_id: match.university.id,
    score: match.score,
    breakdown: match.breakdown,
    blockingReasons: match.blockingReasons,
    tier: match.tier
  }));

  return NextResponse.json({ matches });
}
