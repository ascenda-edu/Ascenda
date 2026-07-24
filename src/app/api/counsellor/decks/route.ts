import { NextResponse, type NextRequest } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { parseJsonBody } from '@/lib/api/guards';
import { createDeck, deleteDeck, requireCounsellor } from '@/lib/counsellor/decks';
import type { DeckTheme } from '@/lib/types/demo-tables';

// Counsellor deck CRUD. RLS (counsellor_decks_*) requires
// can_act_as_counsellor() and counsellor_id = auth.uid() for writes;
// the in-app requireCounsellor check is defense in depth on top of that.

export async function POST(request: NextRequest) {
  const supabase = await createRouteHandlerSupabaseClient();
  const auth = await requireCounsellor(supabase);
  if (!auth.user) return auth.errorResponse;

  const payload = await parseJsonBody<{ name?: string; description?: string; theme?: DeckTheme }>(request);
  const name = payload?.name?.trim();
  if (!name) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { data, error } = await createDeck(supabase, {
    counsellor_id: auth.user.id,
    name,
    description: payload?.description?.trim() || null,
    theme: payload?.theme ?? {},
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ deck: data });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createRouteHandlerSupabaseClient();
  const auth = await requireCounsellor(supabase);
  if (!auth.user) return auth.errorResponse;

  const deckId = new URL(request.url).searchParams.get('id');
  if (!deckId) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { error } = await deleteDeck(supabase, deckId, auth.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
