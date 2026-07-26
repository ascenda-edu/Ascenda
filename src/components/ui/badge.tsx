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
 * DO NOT give a size `.text-label` (11px). tailwind-merge has no font-size entry
 * for it, so it falls through to the text-COLOUR group and `cn()` then treats it
 * and the tone colour as rivals — last one written wins, the other vanishes:
 *   twMerge('text-success text-label') -> 'text-label'    // colour gone
 *   twMerge('text-label text-success') -> 'text-success'  // 11px gone
 * Both sizes here therefore use real font-size utilities. (The second form is
 * already live at application-overview.tsx:134/155/205, where three chips lose
 * their 11px to their own tone class — out of scope, but that's the shape of it.)
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
      },
      size: {
        /** The canonical chip. Pixel-identical to `TONE[*].chip`. */
        default: 'px-2.5 py-0.5 text-xs',
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
