/**
 * Application reads — the one implementation of the nested
 * `applications → programs → universities/deadlines + application_checklist`
 * query that four modules had each written for themselves.
 *
 * WHY THIS IS A MODULE AND NOT JUST A CONSTANT
 * --------------------------------------------
 * Sharing the select string (`./columns.ts`) stops the COLUMNS diverging. It
 * does not stop the ERROR HANDLING diverging, and that was the other half of
 * the bug: the student board discarded the error and rendered an empty state,
 * the parent portal threw, the tasks page threw, and nobody could see that
 * those were three different answers to the same question. A function carries
 * both decisions together, so a new caller inherits them instead of re-deciding
 * by accident.
 *
 * The disposition for each read is stated at the function, with its reason.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import type { MatchTier } from '@/lib/matching/match-tier';
import {
  APPLICATION_BOARD_SELECT,
  APPLICATION_LABEL_SELECT,
  APPLICATION_SUMMARY_SELECT,
  APPLICATION_TASKS_SELECT,
  DOCUMENT_SELECT,
  MATCH_TIER_SELECT,
  type ApplicationBoardRow,
  type ApplicationLabelRow,
  type ApplicationSummaryRow,
  type ApplicationTasksRow,
  type DocumentRow,
  type MatchTierRow,
} from './columns';
import { soft, unwrap } from './errors';

type Client = SupabaseClient<Database>;

/**
 * PostgREST's generated types do not model aliased columns inside an embed
 * (`name:course_name`), so the response type never lines up with the row shape
 * the query actually returns. Every previous call site solved this with its own
 * `as unknown as SomeLocalInterface`. The cast happens ONCE, here, against the
 * shape derived from the generated schema in `./columns.ts` — so there is a
 * single place to check when the schema moves, instead of four.
 */
const castRows = <T>(rows: unknown): T[] => (rows ?? []) as T[];

/* -------------------------------------------------------------------------- */
/* reads                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The full board: status, notes, programme, deadlines, checklist.
 *
 * Disposition: **unwrap**. This query IS the page. A failure that renders as
 * zero rows is indistinguishable from a student who has never applied
 * anywhere — which is precisely the empty state `/applications` used to show
 * when this read failed.
 */
export async function loadApplicationBoard(
  supabase: Client,
  profileId: string,
  // The assistant's `get_my_applications` tool caps its read at 20 rows so a
  // heavy user cannot blow out the model's context. That cap is a property of
  // ONE caller, not of the board, so it is an option here rather than a second
  // copy of the query.
  options?: { limit?: number }
): Promise<ApplicationBoardRow[]> {
  const query = supabase
    .from('applications')
    .select(APPLICATION_BOARD_SELECT)
    .eq('profile_id', profileId);
  const rows = unwrap(
    await (options?.limit === undefined ? query : query.limit(options.limit)),
    'applications.board'
  );
  return castRows<ApplicationBoardRow>(rows);
}

/**
 * Applications with no embeds — id, status, program_id only.
 *
 * The student dashboard counts these into its pipeline card and hero stats and
 * resolves the programme side itself (deadlines are fetched separately, by
 * program_id).
 *
 * Disposition: **unwrap**. Zero rows renders "0 applications / nothing in your
 * pipeline" beside a "You're all caught up" hero — the same lie the board used
 * to tell, on the page students actually land on.
 */
export async function loadApplicationSummaries(
  supabase: Client,
  profileId: string
): Promise<ApplicationSummaryRow[]> {
  const rows = unwrap(
    await supabase
      .from('applications')
      .select(APPLICATION_SUMMARY_SELECT)
      .eq('profile_id', profileId),
    'applications.summaries'
  );
  return castRows<ApplicationSummaryRow>(rows);
}

/**
 * Applications with their checklist, without the deadlines embed.
 *
 * Ordered by id so that the "(1)"/"(2)" label-collision suffixes the task
 * tracker appends stay attached to the same application between refreshes.
 *
 * Disposition: **unwrap** — rendering "No tasks yet" to a student who has tasks
 * is the same lie in a different costume.
 */
export async function loadApplicationsWithTasks(
  supabase: Client,
  profileId: string
): Promise<ApplicationTasksRow[]> {
  const rows = unwrap(
    await supabase
      .from('applications')
      .select(APPLICATION_TASKS_SELECT)
      .eq('profile_id', profileId)
      .order('id', { ascending: true }),
    'applications.tasks'
  );
  return castRows<ApplicationTasksRow>(rows);
}

/**
 * Just the applications, for labelling a picker.
 *
 * Disposition: **unwrap** — the documents page derives its whole application
 * list from this, and an empty documents page for a user who has uploads reads
 * as data loss.
 */
export async function loadApplicationLabels(
  supabase: Client,
  profileId: string
): Promise<ApplicationLabelRow[]> {
  const rows = unwrap(
    await supabase.from('applications').select(APPLICATION_LABEL_SELECT).eq('profile_id', profileId),
    'applications.labels'
  );
  return castRows<ApplicationLabelRow>(rows);
}

/**
 * One application, by id, with just enough to name it — "Add a task to
 * <course>". RLS scopes the row to the caller, so an id belonging to someone
 * else comes back as no row rather than as a label.
 *
 * Disposition: **soft**, fallback = null. The one caller (the assistant's
 * `create_task` confirm card) reads null as "don't draft a card at all", which
 * is the honest response to "we cannot say what you would be confirming" —
 * unlike the list reads above, an absent row here removes a UI affordance rather
 * than asserting the student has nothing.
 */
export async function loadApplicationLabel(
  supabase: Client,
  applicationId: string
): Promise<ApplicationLabelRow | null> {
  const row = soft<unknown>(
    await supabase
      .from('applications')
      .select(APPLICATION_LABEL_SELECT)
      .eq('id', applicationId)
      .maybeSingle(),
    'applications.label',
    null
  );
  return (row ?? null) as ApplicationLabelRow | null;
}

/**
 * Uploaded documents for a set of applications, newest first.
 *
 * Disposition: **unwrap**, for the reason above.
 */
export async function loadDocumentsForApplications(
  supabase: Client,
  applicationIds: string[]
): Promise<DocumentRow[]> {
  if (applicationIds.length === 0) return [];
  const rows = unwrap(
    await supabase
      .from('documents')
      .select(DOCUMENT_SELECT)
      .in('application_id', applicationIds)
      .order('uploaded_at', { ascending: false }),
    'applications.documents'
  );
  return castRows<DocumentRow>(rows);
}

/* -------------------------------------------------------------------------- */
/* tier lookup                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `student_matches.breakdown` is free-form JSON; the tier is one key inside it.
 *
 * Exported because the counsellor cohort loader reads the same key out of the
 * same column, then falls back to a score-derived tier when it is absent — a
 * fallback the student/parent boards deliberately do NOT have (see
 * `loadTierByProgram`). The EXTRACTION is shared; the fallback policy stays with
 * the caller that owns it.
 */
export const tierFromBreakdown = (breakdown: MatchTierRow['breakdown']): MatchTier | null => {
  if (!breakdown || typeof breakdown !== 'object' || Array.isArray(breakdown)) return null;
  const tier = (breakdown as Record<string, unknown>).tier;
  return tier === 'Reach' || tier === 'Match' || tier === 'Safe' ? tier : null;
};

/**
 * program_id → Reach/Match/Safe, from the cached `student_matches` rows.
 *
 * Disposition: **soft**, fallback = no tiers. A tier is a badge on a row that is
 * already fully rendered and useful without it; failing the whole board because
 * a decoration could not be fetched trades a small degradation for a total one.
 * The failure is logged, which is the part that was previously missing — the
 * student board discarded this error entirely, so every Reach/Match/Safe badge
 * could vanish site-wide with no signal at all.
 *
 * This is the same call the parent portal made, where it used to throw. Both
 * now degrade identically: a parent and their child see the same board.
 */
export async function loadTierByProgram(
  supabase: Client,
  profileId: string,
  programIds: string[]
): Promise<Map<string, MatchTier>> {
  const map = new Map<string, MatchTier>();
  if (programIds.length === 0) return map;

  const rows = soft<MatchTierRow[]>(
    await supabase
      .from('student_matches')
      .select(MATCH_TIER_SELECT)
      .eq('profile_id', profileId)
      .in('program_id', programIds),
    'applications.tierByProgram',
    []
  );

  for (const row of rows) {
    const tier = tierFromBreakdown(row.breakdown);
    if (tier) map.set(row.program_id, tier);
  }
  return map;
}
