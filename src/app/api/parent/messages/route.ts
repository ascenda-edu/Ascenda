import { NextResponse, type NextRequest } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { parseJsonBody } from '@/lib/api/guards';
import { resolveLinkedChildIds } from '@/features/parent';

const MAX_BODY_LENGTH = 4000;
const MAX_TEMPLATE_LENGTH = 100;

// Persist a parent → counsellor message and flag the contact for a response.
//
// Linkage check (defence in depth beyond the client's scoped UI): the target
// contact's student must be one of the caller's guardian_links children —
// otherwise 403. RLS on parent_messages/parent_contacts is currently the
// counsellor-open policy (any authenticated session), so this app-layer check
// is the enforcement that matters until Phase 2 tightens the DB.
export async function POST(request: NextRequest) {
  const supabase = await createRouteHandlerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await parseJsonBody<{ contactId?: string; body?: string; template?: string | null }>(request);
  const { contactId, body, template } = payload ?? {};
  const trimmedBody = body?.trim();
  if (!contactId || !trimmedBody) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
  if (trimmedBody.length > MAX_BODY_LENGTH || (template && template.length > MAX_TEMPLATE_LENGTH)) {
    return NextResponse.json({ error: 'Message too long' }, { status: 400 });
  }

  // Verify the contact belongs to a linked child before writing anything.
  const [{ data: contact, error: contactLookupError }, linkedChildIds] = await Promise.all([
    (supabase as any)
      .from('parent_contacts')
      .select('id, student_profile_id')
      .eq('id', contactId)
      .maybeSingle(),
    resolveLinkedChildIds(supabase, user.id),
  ]);
  if (contactLookupError) {
    console.error('[parent-messages] contact lookup failed:', contactLookupError.message);
    return NextResponse.json({ error: 'Unable to send message' }, { status: 400 });
  }
  if (!contact || !linkedChildIds.includes(contact.student_profile_id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await (supabase as any)
    .from('parent_messages')
    .insert({ contact_id: contactId, sender: 'parent', body: trimmedBody, template: template ?? null })
    .select('id, contact_id, sender, body, template, read_at, created_at')
    .single();

  if (error) {
    console.error('[parent-messages] insert failed:', error.message);
    return NextResponse.json({ error: 'Unable to send message' }, { status: 400 });
  }

  // A parent message needs the counsellor's attention — surface it in their
  // queue (the counsellor route sets 'active' because a reply resolves it).
  const { error: contactError } = await (supabase as any)
    .from('parent_contacts')
    .update({ status: 'needs-response', last_contacted: new Date().toISOString() })
    .eq('id', contactId);
  if (contactError) {
    // The message row exists but the thread state didn't move — tell the
    // caller instead of returning a clean 200 with the thread stuck.
    console.error('[parent-messages] contact status update failed:', contactError.message);
    return NextResponse.json(
      { error: 'Message saved but the conversation state could not be updated' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    message: {
      id: data.id,
      sender: data.sender,
      content: data.body,
      template: data.template,
      read: Boolean(data.read_at),
      date: data.created_at,
    },
  });
}
