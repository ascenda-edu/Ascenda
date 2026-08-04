/**
 * POST /api/profile/preview — what the student's answers add up to, SO FAR.
 *
 * The intake wizard is six steps of data entry with no feedback until the end: you
 * type your grades, you press submit, and only then does anything happen. This
 * route is what lets the form answer back while it is being filled in — a
 * programme count for the fields chosen, and the readiness band the scoring engine
 * derives from the grades entered.
 *
 * ── Why a route rather than scoring in the browser ──────────────────────────
 * `scoreStudentProfile` is pure, so it COULD run client-side. It is a 995-line
 * engine, and `/profile/wizard` has ~10 kB of bundle budget left
 * (`scripts/check-bundle-budget.mjs`). The programme count needs the database
 * regardless, so one authenticated round trip buys both and the engine stays on
 * the server where it already lives.
 *
 * ── Why this is a COUNT and not a match ────────────────────────────────────
 * A real match score means running `runMatching` over the catalogue, which pages
 * through thousands of rows and is not something to do on a keystroke. What this
 * returns is the number of programmes in the FIELDS the student's clusters resolve
 * to — one indexed count against `idx_programs_field_id`, transferring no rows.
 * The response names it `fieldProgrammeCount` and the UI says "programmes in your
 * field", deliberately: calling it a match count would be a claim this query has
 * not earned.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { studentProfilePayloadSchema } from '@/lib/profile/intake-schema';
import { scoreStudentProfile } from '@/lib/scoring/student_scoring';
import { resolveTargetFields } from '@/lib/matching/matching_engine';
import { getFlaggedProgramIds } from '@/lib/catalog/visibility';
import type { StudentProfilePayload } from '@/lib/profile/intake-types';

export async function POST(request: NextRequest) {
  const supabase = await createRouteHandlerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  // Authenticate BEFORE parsing, for the same reason `saveStudentIntake` does:
  // a route handler is a public POST endpoint.
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // The SAME schema the save path uses. A preview must never accept a payload the
  // real submit would reject — otherwise the student is shown encouraging numbers
  // for data that cannot be saved.
  const parsed = studentProfilePayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
  const payload = parsed.data as StudentProfilePayload;

  // ── The band ──
  // Best-effort: the engine is being handed a HALF-FILLED profile, which is not
  // what it was written for. A throw here must degrade to "no band yet" rather
  // than 500 a form that is working fine.
  let band: string | null = null;
  let totalScore: number | null = null;
  try {
    const scored = scoreStudentProfile(payload);
    if (Number.isFinite(scored.total_score)) {
      band = scored.student_band;
      totalScore = Math.round(scored.total_score);
    }
  } catch (error) {
    console.error('Preview scoring failed', error);
  }

  // ── The count ──
  const fields = resolveTargetFields(payload.academic_input.intended_clusters ?? []);
  let fieldProgrammeCount: number | null = null;

  if (fields && fields.size > 0) {
    let query = supabase
      .from('programs')
      .select('id', { count: 'exact', head: true })
      .in('field', Array.from(fields));

    // Same visibility rule the matcher applies, so the preview cannot promise
    // programmes the student would never be shown.
    const flagged = getFlaggedProgramIds();
    if (flagged.length > 0) {
      query = query.not('id', 'in', `(${flagged.map((id) => `"${id}"`).join(',')})`);
    }

    const { count, error } = await query;
    // A timeout or an error means "we cannot say", not "zero".
    if (!error) fieldProgrammeCount = count ?? 0;
  }

  return NextResponse.json({
    band,
    totalScore,
    fieldProgrammeCount,
    fieldCount: fields?.size ?? 0
  });
}
