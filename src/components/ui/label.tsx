import * as React from 'react';
import { Label as RadixLabel } from '@radix-ui/react-label';
import { cn } from '@/lib/utils';

export interface LabelProps extends React.ComponentProps<typeof RadixLabel> {}

// Base treatment matches the `.form-label` component class, which is what 5 of the
// 8 call sites were already asking for by passing `className="form-label"` — and
// silently not getting. Tailwind emits @layer utilities after @layer components, so
// this component's own utilities (text-xs, text-muted-foreground) outranked
// .form-label's text-sm/text-foreground at every one of those call sites, and
// twMerge can't reconcile them because `form-label` isn't a utility it recognises.
//
// Resolved in favour of the form-label treatment: 12px uppercase tracked-out muted
// text is an eyebrow, which is over-styled and under-contrasted for a form label.
// Call sites no longer need to pass `form-label`; the class remains for plain
// <label> elements that aren't using this component.
export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(({ className, ...props }, ref) => (
  <RadixLabel
    ref={ref}
    className={cn('text-sm font-semibold text-foreground', className)}
    {...props}
  />
));
Label.displayName = 'Label';
