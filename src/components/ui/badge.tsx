import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Badge — the status pill, as a component.
 *
 * Geometry and tone bundles are copied verbatim from `TONE[*].chip` in
 * `src/lib/theme/categories.ts` (`rounded-full px-2.5 py-0.5 text-xs
 * font-semibold`, `-subtle` fill + tone text + `/25` border). That combination
 * already has a WCAG AA pass in both themes, and matching it exactly means
 * Badge and the existing chips are drop-in interchangeable — the intent is for
 * categories.ts to eventually hand out Badge props instead of class strings.
 *
 * Tone names here are the SEMANTIC ones (success/warning/danger/info/feature),
 * not categories.ts' legacy colour names (emerald/amber/rose/sky/violet). The
 * mapping is documented at the top of that file.
 *
 * `destructive` is intentionally absent: it belongs to destructive *actions*
 * (buttons), not to labels. A badge for a bad state is `danger`.
 *
 * HISTORICAL NOTE — this hazard is FIXED, don't let this comment stop you.
 * `.text-label` (11px) used to collide with the tone colour: tailwind-merge had no
 * font-size entry for it, so it prefix-matched into the text-COLOUR group and `cn()`
 * treated the two as rivals, dropping whichever was written first. `lib/utils.ts`
 * now registers `text-label` and `text-body-sm` in tailwind-merge's `font-size`
 * group, so both survive in either order and they correctly override `text-xs`.
 * An 11px badge size is therefore safe to add if a call site needs one.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border font-semibold whitespace-nowrap transition-colors',
  {
    variants: {
      variant: {
        neutral: 'border-border bg-muted/60 text-foreground',
        success: 'border-success/25 bg-success-subtle text-success',
        warning: 'border-warning/25 bg-warning-subtle text-warning',
        danger: 'border-danger/25 bg-danger-subtle text-danger',
        info: 'border-info/25 bg-info-subtle text-info',
        feature: 'border-feature/25 bg-feature-subtle text-feature',
        // primary-ink, not primary: --primary is tuned to carry white button
        // text and only measures 3.58:1 as text on a dark card.
        primary: 'border-primary/25 bg-primary/10 text-primary-ink',
        outline: 'border-border bg-transparent text-foreground',
        /**
         * Geometry only — no border/fill/text colour of its own.
         *
         * This exists for the class-string tone tables that still live in
         * `src/lib` (`counsellor/deck-theme.ts`, `theme/categories.ts`,
         * `counsellor/stage-colors.ts`) and for the `{label, color}` badge
         * payloads the counsellor analytics builds. Those hand out a *bundle*
         * (`border-warning/40 bg-warning-subtle text-warning`), not a variant
         * name, so pinning a real variant underneath them would only make
         * tailwind-merge arbitrate three groups for nothing.
         *
         * `<Badge variant="bare" className={TABLE[k].badge}>` therefore takes
         * the pill geometry from here and the colour from the table — one
         * definition of the shape, zero behaviour change at the call site.
         * Delete this variant once those tables emit `BadgeVariant`
         * (docs/audit/09-design-system.md, HIGH-4).
         */
        bare: '',
      },
      size: {
        /** The canonical chip. Pixel-identical to `TONE[*].chip`. */
        default: 'px-2.5 py-0.5 text-xs',
        /**
         * 11px, for chips inside a dense row — a notification kind, a meeting
         * status, a deck rarity. `.text-label` is the named 11px step and is
         * registered in tailwind-merge's font-size group (`lib/utils.ts`), so it
         * survives beside the tone colour in either order.
         */
        sm: 'px-2 py-0.5 text-label',
        /** Roomier, for a badge sitting beside an h2/h3 rather than inside a row. */
        lg: 'px-3 py-1 text-sm',
      },
    },
    defaultVariants: {
      variant: 'neutral',
      size: 'default',
    },
  }
);

/** The tone set a Badge can carry — useful for typing lookup tables. */
export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
  VariantProps<typeof badgeVariants> {
  /** Render as the single child element instead (e.g. a `<Link>` badge). */
  asChild?: boolean;
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'span';
    return <Comp ref={ref} className={cn(badgeVariants({ variant, size }), className)} {...props} />;
  }
);
Badge.displayName = 'Badge';

export { Badge, badgeVariants };
