// Server-side shortlist writes for the agentic chat WriteTool. Mirrors the row
// shape the client hook (components/university-search/shortlist-store.ts →
// upsertRemoteItem) writes, so a programme added by the assistant shows up
// identically in the shortlist UI. RLS scopes writes to the caller's rows.

import type { SupabaseClient } from '@supabase/supabase-js';

type Client = SupabaseClient<any, any, any>;

const TABLE_NAME = 'shortlisted_programs';

/** The table may be absent on a remote deployment (see CLAUDE.md); the client
 * hook then falls back to localStorage, which the server can never see. Detect
 * that case so tools report "sync unavailable" instead of a misleading generic
 * failure (42P01 = Postgres undefined_table, PGRST205 = PostgREST missing from
 * schema cache). */
export const isMissingShortlistTable = (
  error: { code?: string; message?: string } | null | undefined
): boolean => error?.code === '42P01' || error?.code === 'PGRST205';

export const SHORTLIST_SYNC_UNAVAILABLE =
  "Shortlist sync isn't enabled on this deployment — the shortlist lives in the user's browser and can't be changed from here. Suggest the Shortlist page instead.";

export type AddToShortlistResult =
  | { ok: true; already: boolean; programName: string; universityName: string }
  | { ok: false; error: string };

export async function addToShortlist(
  supabase: Client,
  userId: string,
  programId: string
): Promise<AddToShortlistResult> {
  const { data: program, error: programError } = await supabase
    .from('programs')
    .select('id, course_name, study_level, universities(name, country, city)')
    .eq('id', programId)
    .maybeSingle();

  if (programError || !program) {
    return { ok: false, error: 'Programme not found' };
  }

  const uni = Array.isArray((program as any).universities)
    ? (program as any).universities[0]
    : (program as any).universities;
  const programName = (program as any).course_name ?? 'Programme';
  const universityName = uni?.name ?? 'University';
  const location = [uni?.city, uni?.country].filter(Boolean).join(', ') || null;

  // Detect a pre-existing row first so the confirm-card message can distinguish
  // "added" from "already on your shortlist".
  const { data: existing, error: existingError } = await supabase
    .from(TABLE_NAME)
    .select('program_id')
    .eq('profile_id', userId)
    .eq('program_id', programId)
    .limit(1);
  if (isMissingShortlistTable(existingError)) {
    return { ok: false, error: SHORTLIST_SYNC_UNAVAILABLE };
  }
  const already = Boolean(existing && existing.length > 0);

  const { error: upsertError } = await supabase.from(TABLE_NAME).upsert(
    {
      profile_id: userId,
      program_id: programId,
      program_name: programName,
      university_name: universityName,
      location,
      fit_score: null,
      stage: 'Researching',
      next_action: null,
      due_date: null,
      metadata: null
    },
    { onConflict: 'profile_id,program_id' }
  );

  if (upsertError) {
    if (isMissingShortlistTable(upsertError)) {
      return { ok: false, error: SHORTLIST_SYNC_UNAVAILABLE };
    }
    return { ok: false, error: 'Could not add to your shortlist' };
  }

  return { ok: true, already, programName, universityName };
}
