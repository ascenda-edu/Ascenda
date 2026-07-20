// Pure server-side helpers for the application tracker + checklist. Extracted
// from the /api/applications/track and /api/checklist route handlers so both
// the routes AND the agentic chat WriteTools can share one implementation.
//
// These take a user-scoped Supabase client (RLS is the real enforcement) and
// return a small discriminated result rather than throwing or building a
// NextResponse — the caller maps the result to HTTP or to a ToolActionResult.

import type { SupabaseClient } from '@supabase/supabase-js';

type Client = SupabaseClient<any, any, any>;

/** Expected-failure codes the callers translate (route → HTTP status).
 * Row-missing and exists-but-not-owned deliberately share the single opaque
 * 'not_found' so no caller can turn the distinction into a UUID existence
 * oracle (counsellor read policies make non-owned rows SELECTable). */
export type ActionErrorCode = '23503' | 'not_found';

export type ActionResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: string; code?: ActionErrorCode };

const VALID_TASK_STATUSES = new Set(['todo', 'doing', 'done']);

// Start tracking an application for the given user. Idempotent: a prior
// check-then-insert race can leave duplicate rows (no unique (profile_id,
// program_id) constraint), so we select with .limit(1) — NOT .maybeSingle(),
// which errors (PGRST116) on more than one match — and return 'exists'.
export async function trackProgram(
  supabase: Client,
  userId: string,
  programId: string
): Promise<ActionResult<{ status: 'created' | 'exists'; applicationId: string }>> {
  const { data: existing, error: existingError } = await supabase
    .from('applications')
    .select('id')
    .eq('profile_id', userId)
    .eq('program_id', programId)
    .limit(1);
  if (existingError) {
    console.error('[applications/track] lookup failed', existingError);
    return { ok: false, error: 'Could not start tracking this programme' };
  }
  if (existing && existing.length > 0) {
    return { ok: true, status: 'exists', applicationId: existing[0].id };
  }

  const { data, error } = await supabase
    .from('applications')
    .insert({ profile_id: userId, program_id: programId, status: 'planning' })
    .select('id')
    .single();
  if (error) {
    // 23503 = foreign-key violation: the programId doesn't exist in programs.
    if (error.code === '23503') {
      return { ok: false, error: 'Programme not found', code: '23503' };
    }
    console.error('[applications/track] insert failed', error);
    return { ok: false, error: 'Could not start tracking this programme' };
  }

  return { ok: true, status: 'created', applicationId: data.id };
}

// Create a checklist task under one of the user's own applications. Confirms
// ownership by loading the parent application first (RLS also scopes writes).
export async function createChecklistTask(
  supabase: Client,
  userId: string,
  args: { applicationId: string; taskName: string; dueDate?: string | null }
): Promise<ActionResult<{ task: Record<string, unknown> }>> {
  const { data: application, error: appError } = await supabase
    .from('applications')
    .select('id, profile_id')
    .eq('id', args.applicationId)
    .single();

  // Collapse missing-row and exists-but-not-owned into one opaque 'not_found':
  // a distinct code would let an authenticated user probe which application
  // UUIDs exist. RLS still blocks the write regardless.
  if (appError || !application || application.profile_id !== userId) {
    return { ok: false, error: 'Application not found', code: 'not_found' };
  }

  const { data, error: insertError } = await supabase
    .from('application_checklist')
    .insert({
      application_id: args.applicationId,
      task_name: args.taskName,
      status: 'todo',
      due_date: args.dueDate ? args.dueDate : null
    })
    .select('*')
    .single();

  if (insertError) {
    console.error('[checklist] insert failed', insertError);
    return { ok: false, error: 'Could not create the task' };
  }

  return { ok: true, task: data as Record<string, unknown> };
}

// Update a checklist task's status. Ownership is enforced through the
// applications!inner(profile_id) join, mirroring the route handler.
export async function updateChecklistTaskStatus(
  supabase: Client,
  userId: string,
  args: { taskId: string; status: 'todo' | 'doing' | 'done' }
): Promise<ActionResult<{ item: Record<string, unknown> }>> {
  if (!VALID_TASK_STATUSES.has(args.status)) {
    return { ok: false, error: 'Invalid status' };
  }

  const { data: checklistRow, error: checklistError } = await supabase
    .from('application_checklist')
    .select('id, application_id, status, applications!inner(profile_id)')
    .eq('id', args.taskId)
    .single();

  // Collapse missing-row and exists-but-not-owned into one opaque 'not_found':
  // a distinct code would let an authenticated user probe which task UUIDs
  // exist. RLS still blocks the write regardless.
  if (checklistError || !checklistRow || (checklistRow as any).applications?.profile_id !== userId) {
    return { ok: false, error: 'Checklist item not found', code: 'not_found' };
  }

  const { data, error: updateError } = await supabase
    .from('application_checklist')
    .update({ status: args.status })
    .eq('id', args.taskId)
    .select('*')
    .single();

  if (updateError) {
    console.error('[checklist] update failed', updateError);
    return { ok: false, error: 'Could not update the task' };
  }

  return { ok: true, item: data as Record<string, unknown> };
}
