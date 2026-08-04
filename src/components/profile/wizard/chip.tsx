'use client';

import { Check, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The intake form's toggle chip — the control behind every choice in the wizard
 * that is not a text field or a Select: programme type, clusters, gender,
 * leadership roles, teaching style, campus size, and a dozen more.
 *
 * `aria-pressed` rather than `role="radio"` or a checkbox, because the same
 * component serves both single- and multi-select groups. That is a compromise
 * worth naming: for a genuinely single-choice group a `role="radiogroup"` of
 * radios is the better semantic, and `SegmentedControl`
 * (`src/components/university-search/filters/SegmentedControl.tsx`) already
 * implements it with arrow-key navigation. Converting the single-choice groups
 * over is worth doing; it is a per-group behaviour change, so it is not folded
 * into a component move.
 *
 * Tap size needs no `min-h`: `py-3` (12 + 12) plus the 20px `text-sm` line box is
 * exactly the 44px floor, and a wrapped label or a `description` only makes it
 * taller. An explicit `min-h-[44px]` here would be redundant AND would add to the
 * arbitrary-geometry ratchet for nothing.
 */
export function Chip({
  label,
  selected,
  onClick,
  disabled,
  icon: Icon,
  description
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  /**
   * Replaces the old `emoji` prop.
   *
   * Emoji were dropped from this component's callers entirely: they are rendered by
   * the OS, so the same chip was a flat glyph on one platform and a glossy 3D blob
   * on another, they never matched the icon weight used elsewhere in the product,
   * and — the mechanical reason — they do not inherit `currentColor`, so a selected
   * chip tinted its label and border while the emoji inside stayed put. A Lucide
   * icon changes colour with the chip, which is what makes selection read as one
   * object changing state. See `wizard-icons.ts`.
   */
  icon?: LucideIcon;
  description?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'group flex flex-col items-start gap-0.5 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-[color,background-color,border-color,box-shadow] duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        selected
          ? 'border-primary bg-primary/8 text-primary-ink shadow-e-1'
          : 'border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted/50',
        // NOT `opacity-40`. Composited on a card that measured 2.50:1 (label) and
        // 1.81:1 (description) — unreadable, and for the groups that do have a real
        // cap the faded chip is the ONLY signal the cap was hit. Muted tokens keep
        // it legible while still reading as unavailable.
        disabled && !selected && 'cursor-not-allowed border-border/60 bg-muted/40 text-muted-foreground hover:border-border/60 hover:bg-muted/40'
      )}
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          {Icon ? <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" /> : null}
          {label}
        </span>
        {selected ? <Check className="h-3.5 w-3.5 shrink-0 text-primary-ink" aria-hidden /> : null}
      </span>
      {description ? (
        <span className="text-label font-normal leading-snug text-muted-foreground">{description}</span>
      ) : null}
    </button>
  );
}
