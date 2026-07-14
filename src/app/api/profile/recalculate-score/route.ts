import { NextResponse } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { buildStudentProfilePayload } from '@/lib/scoring/student_score_loader';
import { scoreStudentProfile } from '@/lib/scoring/student_scoring';

export async function POST() {
  const supabase = createRouteHandlerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const payload = await buildStudentProfilePayload(supabase, user.id);
    if (!payload) {
      return NextResponse.json({ error: 'Profile intake data is incomplete' }, { status: 400 });
    }

    const scoring = scoreStudentProfile(payload);
    const { error } = await supabase.from('student_scores').upsert({
      profile_id: user.id,
      total_score: scoring.total_score,
      student_band: scoring.student_band,
      eligibility_flags: scoring.eligibility_flags,
      readiness_flags: scoring.readiness_flags,
      breakdown: scoring.breakdown
    });
    if (error) {
      console.error('[recalculate-score] upsert failed', error);
      return NextResponse.json({ error: 'Could not save your score' }, { status: 500 });
    }

    return NextResponse.json({ score: scoring.total_score, band: scoring.student_band, breakdown: scoring.breakdown });
  } catch (err) {
    console.error('[recalculate-score]', err);
    return NextResponse.json({ error: 'Scoring failed' }, { status: 500 });
  }
}
