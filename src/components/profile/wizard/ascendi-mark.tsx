/**
 * Ascendi at badge size — a flat inline SVG, no motion and no gradients.
 *
 * ── WHY NOT THE PNG, AND WHY NOT `RocketArt` ────────────────────────────────
 * The obvious options were both wrong for this size.
 *
 * `next/image` pointed at `public/ascenda-rocket.png` was the first attempt. It
 * works, but it pulls the `next/image` client runtime onto `/profile/wizard`, and
 * that route has about 15 kB of headroom against its bundle budget — a real
 * constraint, not a theoretical one. Paying a runtime to lazily optimise a 26px
 * decorative glyph is the wrong trade, and it was measurably part of a +4 kB
 * budget overrun.
 *
 * `components/landing-preview/rocket-art.tsx` already redraws the mascot as SVG,
 * so reusing it looked right — but it is a 220×248 assembly built for the landing
 * page's docking choreography: five independently transformable groups, per-instance
 * namespaced gradient ids and a framer-motion dependency. None of that survives being
 * scaled to 26px, and importing it would have added more than the PNG did.
 *
 * So: the smallest thing that reads as the mascot. Palette sampled from the same
 * source as `rocket-art.tsx` so the character is recognisably the same one, and
 * `currentColor` is deliberately NOT used — Ascendi is a character with fixed
 * colours, not an icon that should tint with its container.
 */

/** Sampled from `public/ascenda-rocket.png`, matching `rocket-art.tsx`. */
const HULL = '#2DBFAE';
const INK = '#1B2559';
const AMBER = '#F5A524';
const CREAM = '#FFF6E5';
const FACE = '#6C5CE7';

export function AscendiMark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={className}
      // Decorative: the surrounding components carry the accessible text. Ascendi's
      // name is announced by the bubble's own heading, so a second label here would
      // read the mascot twice.
      aria-hidden="true"
      focusable="false"
    >
      {/* Fins first, so the hull overlaps their roots. */}
      <path
        d="M15.5 31.5c-3.4 1.3-5.2 4-5.6 8 3.3-.4 5.9-1.6 7.8-3.6Z"
        fill={AMBER}
        stroke={INK}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M32.5 31.5c3.4 1.3 5.2 4 5.6 8-3.3-.4-5.9-1.6-7.8-3.6Z"
        fill={AMBER}
        stroke={INK}
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* Hull. */}
      <path
        d="M24 4c5.6 4.3 8.6 10.6 8.6 17.6 0 5.2-1.2 10-3.4 14.2h-10.4c-2.2-4.2-3.4-9-3.4-14.2C15.4 14.6 18.4 8.3 24 4Z"
        fill={HULL}
        stroke={INK}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      {/* Cream highlight panel — the mascot's defining hull detail. */}
      <path d="M24 7.5c-2.4 3.4-3.8 7.6-4 12.2h8c-.2-4.6-1.6-8.8-4-12.2Z" fill={CREAM} opacity="0.85" />

      {/* Porthole, and the smile that makes it a character rather than a rocket. */}
      <circle cx="24" cy="19.5" r="5" fill={FACE} stroke={INK} strokeWidth="2" />
      <circle cx="22.2" cy="18.4" r="0.95" fill={CREAM} />
      <circle cx="25.8" cy="18.4" r="0.95" fill={CREAM} />
      <path
        d="M21.9 21.4c1.2 1.1 3 1.1 4.2 0"
        stroke={CREAM}
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Exhaust. */}
      <path
        d="M20.6 36.2 24 44l3.4-7.8Z"
        fill={AMBER}
        stroke={INK}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
