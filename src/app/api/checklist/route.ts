import { NextResponse, type NextRequest } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { parseJsonBody } from '@/lib/api/guards';
import { createChecklistTask, updateChecklistTaskStatus } from '@/lib/applications/server-actions';

const VALID_STATUSES = new Set(['todo', 'doing', 'done']);

// Map an expected-failure helper code to the HTTP status the route used before.
const statusForCode = (code?: 'not_found' | 'unauthorized' | '23503'): number =>
  code === 'not_found' ? 404 : code === 'unauthorized' ? 401 : 400;

export async function PATCH(request: NextRequest) {
  const supabase = createRouteHandlerSupabaseClient();
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
    return NextResponse.json({ error: result.error }, { status: statusForCode(result.code) });
  }

  return NextResponse.json({ item: result.item });
}

// Create a new checklist task under one of the user's own applications.
export async function POST(request: NextRequest) {
  const supabase = createRouteHandlerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { application_id, task_name, due_date } =
    (await parseJsonBody<{ application_id?: string; task_name?: string; due_date?: string }>(request)) ?? {};
  const trimmedName = typeof task_name === 'string' ? task_name.trim() : '';

  if (!application_id || !trimmedName) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const result = await createChecklistTask(supabase, user.id, {
    applicationId: application_id,
    taskName: trimmedName,
    dueDate: typeof due_date === 'string' && due_date ? due_date : null
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: statusForCode(result.code) });
  }

  return NextResponse.json({ item: result.task }, { status: 201 });
}

// Delete a checklist task the caller owns.
export async function DELETE(request: NextRequest) {
  const supabase = createRouteHandlerSupabaseClient();
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
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { error: deleteError } = await supabase.from('application_checklist').delete().eq('id', id);
  if (deleteError) {
    console.error('[checklist] delete failed', deleteError);
    return NextResponse.json({ error: 'Could not delete the task' }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
