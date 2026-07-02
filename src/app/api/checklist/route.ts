import { NextResponse, type NextRequest } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { parseJsonBody } from '@/lib/api/guards';

const VALID_STATUSES = new Set(['todo', 'doing', 'done']);

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

  const { data: checklistRow, error: checklistError } = await supabase
    .from('application_checklist')
    .select('id, application_id, status, applications!inner(profile_id)')
    .eq('id', id)
    .single();

  if (checklistError || !checklistRow) {
    return NextResponse.json({ error: 'Checklist item not found' }, { status: 404 });
  }

  if (checklistRow.applications?.profile_id !== user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error: updateError } = await supabase
    .from('application_checklist')
    .update({ status })
    .eq('id', id)
    .select('*')
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ item: data });
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

  // Confirm the target application belongs to the caller before inserting.
  const { data: application, error: appError } = await supabase
    .from('applications')
    .select('id, profile_id')
    .eq('id', application_id)
    .single();

  if (appError || !application) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  }
  if (application.profile_id !== user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error: insertError } = await supabase
    .from('application_checklist')
    .insert({
      application_id,
      task_name: trimmedName,
      status: 'todo',
      due_date: typeof due_date === 'string' && due_date ? due_date : null
    })
    .select('*')
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  return NextResponse.json({ item: data }, { status: 201 });
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
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
