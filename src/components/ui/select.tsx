'use client';

import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// The trigger is deliberately a clone of the `.form-input` component class in
// tailwind.config.ts — same radius, same `border-input`, same background, same
// px-4/py-3 box, same hover and the same focus-visible ring. A Select sitting
// beside an Input has to read as its sibling, and the 13 native `<select>`
// elements this replaces were all hand-styled in five different shapes (none of
// them with `appearance-none`, so they rendered as raw OS widgets).
//
// It is not literally `.form-input` because the trigger also needs flex layout
// for the chevron, the placeholder/disabled states a `<button>` needs rather
// than the ones an `<input>` needs, and `group` for the chevron rotation.
const selectTriggerVariants = cva(
  'group flex w-full items-center justify-between gap-2 border border-input bg-background text-foreground shadow-e-1 transition-[border-color,box-shadow] duration-200 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:bg-muted/40 disabled:text-muted-foreground disabled:opacity-60 disabled:shadow-none disabled:hover:border-input data-[placeholder]:text-muted-foreground/80 [&>span]:min-w-0 [&>span]:truncate [&>span]:text-left',
  {
    variants: {
      size: {
        // Matches `.form-input` exactly: rounded-2xl + px-4 py-3 + text-sm.
        default: 'rounded-2xl px-4 py-3 text-sm',
        // For the dense inline filters in toolbars, which were `px-3 py-1
        // text-xs` natively. py-1.5 rather than py-1 because a button with no
        // intrinsic height needs the extra 2px to keep a ~28px tap box, and
        // rounded-xl because 18px of radius on a 28px control is a pill.
        sm: 'rounded-xl px-3 py-1.5 text-xs',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  }
);

const Select = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

export interface SelectTriggerProps
  extends React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>,
  VariantProps<typeof selectTriggerVariants> { }

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  SelectTriggerProps
>(({ className, size, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(selectTriggerVariants({ size, className }))}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown
        className={cn(
          'shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180',
          size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'
        )}
      />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const scrollButtonClass =
  'flex cursor-default items-center justify-center py-1 text-muted-foreground';

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton ref={ref} className={cn(scrollButtonClass, className)} {...props}>
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton ref={ref} className={cn(scrollButtonClass, className)} {...props}>
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', sideOffset = 6, ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      position={position}
      sideOffset={sideOffset}
      className={cn(
        // z-overlay: above panels and docked chrome, below modals — a Select
        // inside a Dialog (z-modal) is handled by the portal order, not z-index.
        'relative z-overlay max-h-[var(--radix-select-content-available-height)] min-w-[8rem] overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-e-3',
        // Anchor the zoom to whichever corner Radix chose, so the panel appears
        // to grow out of the trigger rather than out of its own middle.
        'origin-[var(--radix-select-content-transform-origin)]',
        'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:duration-100',
        'data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1',
        className
      )}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn(
          // p-1 + the items' pl-3 puts an item's label at 16px from the panel
          // edge, which is exactly the trigger's px-4 — the selected value does
          // not visibly shift when the panel opens over it.
          'max-h-80 overflow-y-auto p-1 scrollbar-thin',
          position === 'popper' && 'w-full min-w-[var(--radix-select-trigger-width)]'
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label ref={ref} className={cn('eyebrow px-3 py-1.5', className)} {...props} />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      // rounded-xl is the panel's rounded-2xl minus its p-1 — nested radii that
      // are actually concentric.
      'relative flex w-full cursor-default select-none items-center rounded-xl py-2 pl-3 pr-9 text-sm outline-none',
      // Two separable states: highlighted (pointer/keyboard cursor) is a tint,
      // selected is weight + primary-ink + the check. A solid indigo band for
      // highlight would make the two indistinguishable once one row is both.
      'data-[highlighted]:bg-accent/15 data-[highlighted]:text-foreground',
      'data-[state=checked]:font-medium data-[state=checked]:text-primary-ink',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className
    )}
    {...props}
  >
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    <span className="absolute right-3 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-3.5 w-3.5" />
      </SelectPrimitive.ItemIndicator>
    </span>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator ref={ref} className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
  selectTriggerVariants,
};
