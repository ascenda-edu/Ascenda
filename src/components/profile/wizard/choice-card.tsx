'use client';

import { useCallback, useRef, type KeyboardEvent } from 'react';
import { Check, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The wizard's large choice control, and the group that owns it.
 *
 * It replaces a `<Chip>` for the two questions that carry the most intent — "what
 * do you want to study?" and "which qualification are you taking?" — plus the three
 * lifestyle groups. A ten-item chip grid rendered the single most identity-forming
 * question in the product as a row of text toggles; this gives each option an icon
 * tile, a label and a line of real information about what choosing it means.
 *
 * ── SINGLE-CHOICE GROUPS ARE RADIOGROUPS, BUT ONLY WHEN THE ANSWER IS REQUIRED ──
 * `chip.tsx` concedes in its own header that `aria-pressed` is the wrong semantic
 * for a single-choice group and points at
 * `university-search/filters/SegmentedControl.tsx`, which already does it properly.
 * The behavioural difference is not cosmetic: a radiogroup announces "2 of 10", and
 * arrow keys MOVE THE SELECTION rather than only the focus, so changing an answer
 * costs one key instead of arrow-then-space.
 *
 * The boundary is `required`, and it is load-bearing. ARIA radios have no unchecked
 * state you can reach by re-activating them, so a radiogroup can never be cleared.
 * That is correct for subject area and qualification — both mandatory — and WRONG
 * for teaching style or campus size, where it would trap a student who picked an
 * option and then wanted no preference at all. Those groups therefore stay
 * `aria-pressed` toggles that can be un-picked. (The alternative, an explicit "No
 * preference" card, needs a way to distinguish "unset" from "chose none"; the
 * location and campus groups already have such an option and use it, so they get
 * both.)
 *
 * ── ROVING TABINDEX ──
 * A grid of ten cards is ONE control conceptually. Without roving tabindex the
 * arrow keys work but Tab still walks all ten, so reaching the Next button costs
 * eleven presses. Exactly one card is a tab stop: the selected one, or the first
 * when nothing is selected yet.
 */

export interface ChoiceOption {
  value: string;
  label: string;
  /** One line on what choosing this actually means. Optional, but it is the point. */
  note?: string;
  icon: LucideIcon;
  disabled?: boolean;
}

interface ChoiceGroupProps {
  options: readonly ChoiceOption[];
  /** Currently chosen values. Single-choice groups pass an array of 0 or 1. */
  selected: readonly string[];
  onSelect: (value: string) => void;
  /**
   * The group's accessible name. Required — a radiogroup with no name is announced
   * as an anonymous group, which is worse than no role at all.
   */
  label: string;
  /**
   * `true` → `role="radiogroup"` of radios that cannot be cleared.
   * `false` → toggle buttons that can. See the header.
   */
  required?: boolean;
  /** Taller cards with a larger tile. For the two hero questions. */
  size?: 'md' | 'lg';
  /** Grid density. `duo` is the two-option qualification question. */
  columns?: 'duo' | 'auto';
  className?: string;
  /** Hangs the `data-field` that `focusFirstError` scrolls to. */
  fieldKey?: string;
}

export function ChoiceGroup({
  options,
  selected,
  onSelect,
  label,
  required = false,
  size = 'md',
  columns = 'auto',
  className,
  fieldKey
}: ChoiceGroupProps) {
  const gridRef = useRef<HTMLDivElement | null>(null);

  const activeIndex = (() => {
    const chosen = options.findIndex((o) => selected.includes(o.value));
    return chosen >= 0 ? chosen : 0;
  })();

  /**
   * Arrow keys, Home and End move between cards; in a radiogroup they also SELECT.
   *
   * The column count is read from the live layout rather than assumed, so it stays
   * correct across the breakpoint reflow — a grid that is 3-up on desktop and 2-up
   * on a phone has no fixed "next row".
   */
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const keys = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'];
      if (!keys.includes(event.key)) return;
      const grid = gridRef.current;
      if (!grid) return;
      const cards = Array.from(
        grid.querySelectorAll<HTMLButtonElement>('button[data-choice]:not([disabled])')
      );
      const at = cards.indexOf(event.target as HTMLButtonElement);
      if (at < 0) return;
      event.preventDefault();

      const columnCount = Math.max(
        1,
        new Set(cards.map((c) => Math.round(c.getBoundingClientRect().left))).size
      );

      let to = at;
      if (event.key === 'ArrowRight') to = at + 1;
      else if (event.key === 'ArrowLeft') to = at - 1;
      else if (event.key === 'ArrowDown') to = at + columnCount;
      else if (event.key === 'ArrowUp') to = at - columnCount;
      else if (event.key === 'Home') to = 0;
      else if (event.key === 'End') to = cards.length - 1;

      // Horizontal movement wraps; vertical movement stops, because wrapping a
      // column jump lands somewhere unrelated to where the eye is.
      if (to < 0) to = event.key === 'ArrowUp' ? at : cards.length - 1;
      if (to > cards.length - 1) to = event.key === 'ArrowDown' ? at : 0;
      if (to === at) return;

      cards[to].focus();
      if (required) onSelect(cards[to].dataset.choice as string);
    },
    [onSelect, required]
  );

  return (
    <div
      ref={gridRef}
      onKeyDown={onKeyDown}
      {...(fieldKey ? { 'data-field': fieldKey } : {})}
      {...(required ? { role: 'radiogroup', 'aria-label': label } : {})}
      className={cn(
        'grid gap-2.5 sm:gap-3',
        columns === 'duo'
          ? 'grid-cols-1 sm:grid-cols-2'
          : 'grid-cols-2 sm:grid-cols-3',
        className
      )}
    >
      {options.map((option, index) => {
        const isSelected = selected.includes(option.value);
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            data-choice={option.value}
            disabled={option.disabled}
            // Exactly one tab stop per group — see the header.
            tabIndex={index === activeIndex ? 0 : -1}
            {...(required
              ? { role: 'radio', 'aria-checked': isSelected }
              : { 'aria-pressed': isSelected })}
            onClick={() => onSelect(option.value)}
            className={cn(
              'group relative flex flex-col items-start gap-2 rounded-2xl border text-left',
              'transition-[transform,border-color,box-shadow,background-color] duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              size === 'lg' ? 'min-h-[8.75rem] p-4 sm:p-5' : 'min-h-[6.5rem] p-4',
              // Selection is carried by the TILE going solid (below) plus a ring —
              // deliberately not by filling the whole card the way `Chip` now does.
              // These cards hold a `note` of real running text, and a full primary
              // fill would put two type sizes on a saturated ground for the sake of
              // a state that the tile already states unmistakably.
              isSelected
                ? 'border-primary bg-primary/10 text-primary-ink shadow-e-2 ring-1 ring-primary/30'
                : 'border-primary/10 bg-card text-foreground hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-e-2',
              option.disabled &&
                'cursor-not-allowed border-border bg-muted text-muted-foreground hover:translate-y-0 hover:border-border hover:shadow-none'
            )}
          >
            {isSelected ? (
              <span
                aria-hidden
                className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground"
              >
                <Check className="h-3 w-3" />
              </span>
            ) : null}

            {/* The tile and the glyph change together, because the icon inherits
              * `currentColor`. That is what makes selection read as one object
              * changing state rather than a border appearing — and it is the thing
              * an emoji could not do.
              *
              * This tile is what carries selection on these cards, so its two states
              * are a full step apart: a brand tint at rest, the solid fill when
              * chosen. At rest it used to be `bg-muted text-muted-foreground`, which
              * made the subject-area screen — the first screen a new student sees, and
              * the most identity-forming question in the product — a twelve-cell grid
              * of flat grey squares. The tint is the `TONE[*].swatch` recipe from
              * lib/theme/categories.ts, i.e. the shape this pattern already has
              * everywhere else in the app. */}
            <span
              aria-hidden
              className={cn(
                'flex shrink-0 items-center justify-center rounded-xl transition-colors duration-150',
                size === 'lg' ? 'h-10 w-10' : 'h-9 w-9',
                isSelected
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-primary/10 text-primary-ink ring-1 ring-primary/30'
              )}
            >
              <Icon className={size === 'lg' ? 'h-5 w-5' : 'h-[1.15rem] w-[1.15rem]'} />
            </span>

            <span className="flex min-w-0 flex-col gap-0.5">
              <span
                className={cn(
                  'text-body-sm font-semibold leading-snug',
                  isSelected ? 'text-primary-ink' : 'text-foreground'
                )}
              >
                {option.label}
              </span>
              {option.note ? (
                <span className="text-label font-normal leading-snug text-muted-foreground">
                  {option.note}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
