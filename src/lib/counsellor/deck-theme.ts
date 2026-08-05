// Shared visual theming for the counsellor deck/quest game framing.
// Consumers: the deck builder (/counsellor/universities), the student
// dashboard quest log, and the counsellor character sheet.

import { TIER_LABEL, TIER_VISUAL } from '@/lib/theme/categories';
import type { DeckCardFit, DeckCardRarity } from '@/lib/types/demo-tables';

// Rarity is an ORDINAL game scale, so it has to read as one ladder. Four separate
// HUES (gold / violet / blue / grey) could not do that: nothing about violet says
// "above blue", so the ordering lived entirely in the label and the hues were spent
// on a category.
//
// It briefly became four alpha rungs of one tone — solid / /60 / /30 / /10 — which
// was monotonic but wrong for two reasons. Text on the /60 rung measured 3.78:1 in
// dark and no ink clears 4.5:1 on a mid-gold in both themes without a `dark:`
// variant. And the star COUNT (4/3/2/1) already carries the ordinal, so encoding
// rank a second time in the fill was the same fact at two scales — the exact defect
// this whole change exists to remove.
//
// So the badge is now ONE treatment for all four rarities, and the stars are the
// rank. `--warning` as text on `--warning-subtle` is a pairing the tone solver
// verifies at >=4.5:1 in both themes, so this is AA by construction rather than by
// inspection.
const RARITY_BADGE = 'border-warning/30 bg-warning-subtle text-warning';

export const DECK_RARITY: Record<
  DeckCardRarity,
  { label: string; stars: number; color: string; badge: string }
> = {
  legendary: { label: 'Legendary', stars: 4, color: 'text-warning', badge: RARITY_BADGE },
  epic: { label: 'Epic', stars: 3, color: 'text-warning', badge: RARITY_BADGE },
  rare: { label: 'Rare', stars: 2, color: 'text-warning', badge: RARITY_BADGE },
  common: { label: 'Common', stars: 1, color: 'text-warning', badge: RARITY_BADGE },
};

// Fit now derives from TIER_VISUAL, the app-wide system of record, rather than
// carrying a fourth private copy of the reach/match/safety colours. (The old
// version also had no dark: variant on reach or safety, so those two chips were
// unreadable on dark cards.) Padding stays deck-local — these chips are more
// compact than TIER_VISUAL.chip — but the colour can no longer drift.
const fitBadge = (tier: keyof typeof TIER_VISUAL) =>
  `${TIER_VISUAL[tier].border} ${TIER_VISUAL[tier].bg} ${TIER_VISUAL[tier].text}`;

export const DECK_FIT: Record<DeckCardFit, { label: string; badge: string }> = {
  reach: { label: TIER_LABEL.reach, badge: fitBadge('reach') },
  match: { label: TIER_LABEL.match, badge: fitBadge('match') },
  safety: { label: TIER_LABEL.safety, badge: fitBadge('safety') },
};
