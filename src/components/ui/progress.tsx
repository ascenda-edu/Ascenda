import { cn } from '@/lib/utils';
import { PROGRESS_FILL, PROGRESS_TRACK } from '@/lib/theme/categories';

/**
 * A continuous progress bar.
 *
 * WHY THIS EXISTS. An audit of the app found **49 progress/completion indicators and
 * no primitive** — every bar was hand-rolled from a track div plus a percentage-width
 * fill div. Two things went wrong as a direct result:
 *
 *  1. **Colour drifted.** Nine of them banded a quantity with the status tones, two
 *     were unconditionally amber with no threshold at all, and two carried a
 *     byte-identical copy-pasted ternary that was non-monotone in chroma. There was
 *     no single place to be right. `lint:tokens`' `quantity-as-status` rule now
 *     catches the colour half at authoring time; this component removes the reason
 *     anyone hand-rolls the markup in the first place.
 *  2. **Accessibility was absent.** Exactly **three** of the 49 carried a real
 *     `role="progressbar"` with `aria-value*`. The rest were `aria-hidden`, or simply
 *     unlabelled — a screen reader got nothing. That is the more important half, and
 *     it is why `label` is a required prop rather than an optional one: a progressbar
 *     with no accessible name is a worse defect than no progressbar at all.
 *
 * SCOPE, deliberately. This is continuous-only. `/profile`'s bar is **segmented** —
 * five cells walking `PROGRESS_SEGMENT_FILL`, because that profile has five steps and
 * a continuous bar springing to arbitrary widths implies a precision the data does not
 * have — and it owns a bespoke staggered Framer Motion wipe. One special case is not
 * a generalisation, so it stays hand-written (with its own correct `role`/`aria`) and
 * this component does not try to absorb it. If a second segmented bar ever appears,
 * that is the moment to add the variant here.
 *
 * No Framer Motion, on purpose: a CSS width transition keeps this usable from a
 * Server Component, and `motion-safe:` honours a reduced-motion preference without
 * the app-level `<MotionConfig>` having to be in scope.
 */
interface ProgressProps {
  /** 0–100. Clamped, so a caller cannot draw a bar past its own track. */
  value: number;
  /** Accessible name. Required — see the note above. */
  label: string;
  /**
   * Human phrasing of the value, e.g. "3 of 5 tasks done". Announced in place of the
   * bare percentage, which is usually the less useful of the two.
   */
  valueText?: string;
  /** Track classes. Height belongs here (`h-1.5`, `h-2`); defaults to `h-2`. */
  className?: string;
}

export function Progress({ value, label, valueText, className }: ProgressProps) {
  const pct = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-valuetext={valueText}
      className={cn('h-2 overflow-hidden rounded-full', PROGRESS_TRACK, className)}
    >
      {/* The fill is one brand colour at every value. It is NOT banded by the
          percentage: a colour that changes with the quantity reads as a status
          change, and a percentage is not a status (brand.md §4, and the
          `quantity-as-status` rule in scripts/check-design-tokens.mjs). The length
          is the encoding. */}
      <div
        className={cn('h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500', PROGRESS_FILL)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
