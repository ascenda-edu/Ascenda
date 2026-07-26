// Initials-avatar colour rotation for the counsellor surface.
//
// This existed three times over: `AVATAR_PALETTE` + `avatarColor()` byte-identical
// in student-card.tsx and students/[id]/page.tsx, plus a five-entry `AVATAR_COLORS`
// in top-students.tsx. One list now, one accessor each for the two ways it is
// indexed (stable per student id, or by list position).
//
// The colours are the CATEGORICAL series slots (--series-1..5), not the tone tokens
// — an avatar carries identity, not status, so a "rose" student must never read as
// urgent. Five slots for the reason chart-palette.ts documents: past five hues the
// adjacent pairs stop being distinguishable, so a sixth carries no information.
// Identity rides on the tint and the initials wear ink, which is what keeps them
// legible in both themes (the old `text-violet-700 dark:text-violet-300` pairs had
// no contrast pass at all).

export const AVATAR_PALETTE = [
  'bg-series-1/20 text-foreground',
  'bg-series-2/20 text-foreground',
  'bg-series-3/20 text-foreground',
  'bg-series-4/20 text-foreground',
  'bg-series-5/20 text-foreground',
];

/** Stable colour for a student, derived from their id. */
export function avatarColor(id: string) {
  const hash = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

/** Colour for row `idx` of an ordered list. */
export function avatarColorAt(idx: number) {
  return AVATAR_PALETTE[idx % AVATAR_PALETTE.length];
}
