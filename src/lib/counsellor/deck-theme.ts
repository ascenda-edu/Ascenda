// Shared visual theming for the counsellor deck/quest game framing.
// Consumers: the deck builder (/counsellor/universities), the student
// dashboard quest log, and the counsellor character sheet.

import { TIER_LABEL, TIER_VISUAL } from '@/lib/theme/categories';
import type { DeckCardFit, DeckCardRarity } from '@/lib/types/demo-tables';

// Rarity is an ORDINAL game scale, not a status, so it keeps its own ramp rather
// than borrowing the status tones' meaning. The hues are the ones this UI already
// used (gold / violet / blue / grey), now expressed as tokens so they carry the
// AA-verified light and dark values instead of needing `dark:` variants.
export const DECK_RARITY: Record<
  DeckCardRarity,
  { label: string; stars: number; color: string; badge: string }
> = {
  legendary: {
    label: 'Legendary',
    stars: 4,
    color: 'text-warning',
    badge: 'border-warning/40 bg-warning-subtle text-warning',
  },
  epic: {
    label: 'Epic',
    stars: 3,
    color: 'text-feature',
    badge: 'border-feature/40 bg-feature-subtle text-feature',
  },
  rare: {
    label: 'Rare',
    stars: 2,
    color: 'text-info',
    badge: 'border-info/40 bg-info-subtle text-info',
  },
  common: {
    label: 'Common',
    stars: 1,
    color: 'text-muted-foreground',
    badge: 'border-border bg-muted/50 text-muted-foreground',
  },
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
