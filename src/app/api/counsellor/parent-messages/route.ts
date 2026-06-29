import { NextResponse, type NextRequest } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';

// Persist a counsellor → parent message and bump the contact's status.
// RLS (parent_messages / parent_contacts policies) requires can_act_as_counsellor().
export async function POST(request: NextRequest) {
  const supabase = createRouteHandlerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { contactId, body, template } = await request.json();
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
  await (supabase as any)
    .from('parent_contacts')
    .update({ status: 'active', last_contacted: new Date().toISOString() })
    .eq('id', contactId);

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
