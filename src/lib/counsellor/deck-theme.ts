// Shared visual theming for the counsellor deck/quest game framing.
// Consumers: the deck builder (/counsellor/universities), the student
// dashboard quest log, and the counsellor character sheet.

import { TIER_LABEL } from '@/lib/theme/categories';
import type { DeckCardFit, DeckCardRarity } from '@/lib/types/demo-tables';

export const DECK_RARITY: Record<
  DeckCardRarity,
  { label: string; stars: number; color: string; badge: string }
> = {
  legendary: {
    label: 'Legendary',
    stars: 4,
    color: 'text-amber-500',
    badge: 'border-amber-400/60 bg-amber-500/15 text-amber-600 dark:text-amber-300',
  },
  epic: {
    label: 'Epic',
    stars: 3,
    color: 'text-violet-500',
    badge: 'border-violet-400/60 bg-violet-500/15 text-violet-600 dark:text-violet-300',
  },
  rare: {
    label: 'Rare',
    stars: 2,
    color: 'text-sky-500',
    badge: 'border-sky-400/60 bg-sky-500/15 text-sky-600 dark:text-sky-300',
  },
  common: {
    label: 'Common',
    stars: 1,
    color: 'text-muted-foreground',
    badge: 'border-border bg-muted/50 text-muted-foreground',
  },
};

// Labels come from the app-wide TIER_LABEL map. The badge classes are the
// deck-specific compact chips; TIER_VISUAL in @/lib/theme/categories is the
// app-wide fit styling (different padding/dark-mode treatment) — converge on
// it later if the deck UI should match the rest of the app.
export const DECK_FIT: Record<DeckCardFit, { label: string; badge: string }> = {
  reach: { label: TIER_LABEL.reach, badge: 'border-rose-200/60 bg-rose-500/10 text-rose-600' },
  match: {
    label: TIER_LABEL.match,
    badge: 'border-amber-200/60 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  },
  safety: {
    label: TIER_LABEL.safety,
    badge: 'border-emerald-200/60 bg-emerald-500/10 text-emerald-600',
  },
};
