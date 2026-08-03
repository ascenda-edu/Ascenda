/**
 * Server-side probes for the checklist signals that need a query of their own.
 *
 * Everything else the checklist needs is already loaded by whatever page is
 * rendering it. These are the two that are not — and one of them has to reach a
 * table the generated types do not know about, so the `any` cast is contained
 * here rather than smeared across call sites (the same containment used by
 * lib/demo/help-request-client.ts).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';

type Client = SupabaseClient<Database>;

/**
 * Has this student shortlisted anything?
 *
 * Returns `null` — not `false` — when the answer cannot be established.
 *
 * `shortlisted_programs` is declared in schema.sql but **may not exist on the
 * remote database**, which is why the shortlist store feature-detects it and
 * falls back to localStorage. On such a deployment there is no server-side
 * answer at all: the student's shortlist lives in their browser. Reporting
 * `false` there would pin a permanently-unstickable row to every student's
 * checklist; `null` makes `buildChecklist` omit the item instead.
 *
 * `head: true` with an exact count is an index probe — it transfers no rows.
 */
export const probeHasShortlist = async (client: Client, profileId: string): Promise<boolean | null> => {
  // Cast: the table is absent from `database.ts` (generated, and it lags the
  // schema). Typed narrowly on the way out so nothing downstream sees `any`.
  const { count, error } = await (client as any)
    .from('shortlisted_programs')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .limit(1);

  if (error) return null;
  return (count ?? 0) > 0;
};
