import { NextResponse, type NextRequest } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { parseJsonBody } from '@/lib/api/guards';
import { removeDeckCard, requireCounsellor, upsertDeckCard } from '@/lib/counsellor/decks';
import type { DeckCardFit, DeckCardRarity } from '@/lib/types/demo-tables';

const VALID_RARITIES = new Set(['legendary', 'epic', 'rare', 'common']);
const VALID_FITS = new Set(['reach', 'match', 'safety']);

// Add a programme card to a deck. RLS (counsellor_deck_programs_write)
// requires the deck to belong to the caller.
export async function POST(request: NextRequest) {
  const supabase = createRouteHandlerSupabaseClient();
  const auth = await requireCounsellor(supabase);
  if (!auth.user) return auth.errorResponse;

  const payload = await parseJsonBody<{
    deckId?: string;
    programId?: string;
    rarity?: string;
    fit?: string;
    note?: string;
  }>(request);
  const { deckId, programId, rarity, fit, note } = payload ?? {};
  if (
    !deckId ||
    !programId ||
    (rarity && !VALID_RARITIES.has(rarity)) ||
    (fit && !VALID_FITS.has(fit))
  ) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { data, error } = await upsertDeckCard(supabase, {
    deck_id: deckId,
    program_id: programId,
    ...(rarity ? { rarity: rarity as DeckCardRarity } : {}),
    ...(fit ? { fit: fit as DeckCardFit } : {}),
    note: note?.trim() || null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ card: data });
}

// Remove a card from a deck (?id=<card row id>).
export async function DELETE(request: NextRequest) {
  const supabase = createRouteHandlerSupabaseClient();
  const auth = await requireCounsellor(supabase);
  if (!auth.user) return auth.errorResponse;

  const cardId = new URL(request.url).searchParams.get('id');
  if (!cardId) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { error } = await removeDeckCard(supabase, cardId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
