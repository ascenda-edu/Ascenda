import { NextResponse, type NextRequest } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { canActAsCounsellor, parseJsonBody } from '@/lib/api/guards';

// Persist a counsellor → parent message and bump the contact's status.
// RLS (parent_messages / parent_contacts policies) requires
// can_act_as_counsellor(); the in-app role check is defense in depth.
export async function POST(request: NextRequest) {
  const supabase = createRouteHandlerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!(await canActAsCounsellor(supabase, user))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const payload = await parseJsonBody<{ contactId?: string; body?: string; template?: string | null }>(request);
  const { contactId, body, template } = payload ?? {};
  if (!contactId || !body?.trim()) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { data, error } = await (supabase as any)
    .from('parent_messages')
    .insert({ contact_id: contactId, sender: 'counsellor', body: body.trim(), template: template ?? null })
    .select('id, contact_id, sender, body, template, read_at, created_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // A counsellor reply moves the thread to "active" and records the contact time.
  const { error: contactError } = await (supabase as any)
    .from('parent_contacts')
    .update({ status: 'active', last_contacted: new Date().toISOString() })
    .eq('id', contactId);
  if (contactError) {
    // The message row exists but the thread state didn't move — tell the
    // caller instead of returning a clean 200 with the thread stuck.
    return NextResponse.json(
      { error: `Message saved but contact status update failed: ${contactError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    message: {
      id: data.id,
      parentContactId: data.contact_id,
      sender: data.sender,
      content: data.body,
      template: data.template,
      read: Boolean(data.read_at),
      date: data.created_at,
    },
  });
}
