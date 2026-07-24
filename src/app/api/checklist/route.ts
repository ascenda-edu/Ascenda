import { NextResponse, type NextRequest } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { parseJsonBody } from '@/lib/api/guards';
import { createChecklistTask, updateChecklistTaskStatus } from '@/lib/applications/server-actions';
import { isValidDate, clampText } from '@/lib/utils/dates';

const VALID_STATUSES = new Set(['todo', 'doing', 'done']);

const MAX_TASK_NAME = 200;

// Map an expected-failure helper code to an HTTP status. The server actions
// collapse exists-but-not-yours into 'not_found' at the source, so an
// authenticated user can't probe which task/application UUIDs exist
// (counsellor read policies make non-owned rows SELECTable). Genuine
// no-user cases return 401 at the top of each handler, not through this map.
const statusForCode = (code?: 'not_found' | '23503'): number =>
  code === 'not_found' ? 404 : 400;

// The BODY carries the generic not-found text on a 404, never the helper's raw
// error, so it can't reopen the existence oracle the status mapping closes.
const failureResponse = (
  result: { error: string; code?: 'not_found' | '23503' },
  notFoundMessage: string
) => {
  const status = statusForCode(result.code);
  return NextResponse.json({ error: status === 404 ? notFoundMessage : result.error }, { status });
};

export async function PATCH(request: NextRequest) {
  const supabase = await createRouteHandlerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id, status } = (await parseJsonBody<{ id?: string; status?: 'todo' | 'doing' | 'done' }>(request)) ?? {};

  if (!id || !status || !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const result = await updateChecklistTaskStatus(supabase, user.id, { taskId: id, status });
  if (!result.ok) {
    return failureResponse(result, 'Checklist item not found');
  }

  return NextResponse.json({ item: result.item });
}

// Create a new checklist task under one of the user's own applications.
export async function POST(request: NextRequest) {
  const supabase = await createRouteHandlerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { application_id, task_name, due_date } =
    (await parseJsonBody<{ application_id?: string; task_name?: string; due_date?: string }>(request)) ?? {};
  const trimmedName = clampText(task_name, MAX_TASK_NAME);

  if (!application_id || !trimmedName) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // An absent/empty due_date is allowed (stored as null). A provided one must
  // be a real YYYY-MM-DD calendar date.
  const hasDueDate = typeof due_date === 'string' && due_date.length > 0;
  if (hasDueDate && !isValidDate(due_date as string)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const result = await createChecklistTask(supabase, user.id, {
    applicationId: application_id,
    taskName: trimmedName,
    dueDate: hasDueDate ? (due_date as string) : null
  });
  if (!result.ok) {
    return failureResponse(result, 'Application not found');
  }

  return NextResponse.json({ item: result.task }, { status: 201 });
}

// Delete a checklist task the caller owns.
export async function DELETE(request: NextRequest) {
  const supabase = await createRouteHandlerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = (await parseJsonBody<{ id?: string }>(request)) ?? {};
  if (!id) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { data: checklistRow, error: checklistError } = await supabase
    .from('application_checklist')
    .select('id, applications!inner(profile_id)')
    .eq('id', id)
    .single();

  if (checklistError || !checklistRow) {
    return NextResponse.json({ error: 'Checklist item not found' }, { status: 404 });
  }
  if (checklistRow.applications?.profile_id !== user.id) {
    // 404, not 401: the row exists but isn't the caller's. Returning 404 (same
    // as "doesn't exist") stops an authenticated user probing which UUIDs are
    // real — counsellor read policies make non-owned rows SELECTable here.
    return NextResponse.json({ error: 'Checklist item not found' }, { status: 404 });
  }

  const { error: deleteError } = await supabase.from('application_checklist').delete().eq('id', id);
  if (deleteError) {
    console.error('[checklist] delete failed', deleteError);
    return NextResponse.json({ error: 'Could not delete the task' }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
