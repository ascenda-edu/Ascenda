// Initials-avatar colour rotation for the counsellor surface.
//
// This existed three times over: `AVATAR_PALETTE` + `avatarColor()` byte-identical
// in student-card.tsx and students/[id]/page.tsx, plus a five-entry `AVATAR_COLORS`
// in top-students.tsx. One list now, one accessor each for the two ways it is
// indexed (stable per student id, or by list position).
//
// There is ONE colour now. This used to rotate the categorical series slots
// (--series-1..5) so each student got a different tint, but identity is not data:
// the hue was derived from a name hash, so it distinguished nothing the initials
// don't already say, and five tints of chrome competed with the tones that do mean
// something. A single brand tint, with ink for the initials so it passes contrast
// in both themes.
//
// The array shape and both accessors are kept so callers are unaffected; the
// modulo simply always lands on the same entry.

export const AVATAR_PALETTE = ['bg-primary/10 text-primary-ink'];

/** Stable colour for a student, derived from their id. */
export function avatarColor(id: string) {
  const hash = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

/** Colour for row `idx` of an ordered list. */
export function avatarColorAt(idx: number) {
  return AVATAR_PALETTE[idx % AVATAR_PALETTE.length];
}
