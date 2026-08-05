'use client';

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cva, type VariantProps } from 'class-variance-authority';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * Tabs, on Radix.
 *
 * Two places in the app hand-rolled `role="tablist"` / `role="tab"` with no
 * `tabpanel`, no `aria-controls` and no arrow-key handling (the counsellor
 * student-detail nav, and the inbox filter row — which isn't a tab set at all).
 * Radix supplies the wiring; this file only supplies the look.
 *
 * The look is deliberately the section-nav row: `.surface-toolbar` shell,
 * `.nav-pill` triggers, `.nav-pill-active` colours. A tab row and a
 * `<SectionNav>` row should be indistinguishable as design language, because to
 * a user they do the same job. Keep them in sync — if `.nav-pill` changes in
 * globals.css, this follows for free.
 */

// `.nav-pill` styles colour/background/border but declares no focus ring, so a
// keyboard-focused pill is invisible. Same utilities section-nav.tsx applies at
// its call site, for the same reason.
const PILL_FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

/* ─── Active-indicator plumbing ─────────────────────────────────────────
   The sliding indicator needs to know which trigger is active *during render*,
   which Radix's own context doesn't expose. So `Tabs` mirrors the selected
   value into a context of ours. `layoutId` is scoped per-root via useId so two
   tab sets on one page don't animate into each other (the same pattern as
   university-search/filters/SegmentedControl.tsx).

   Triggers used under a bare `TabsPrimitive.Root` still work: with no context
   they fall back to painting their own `data-[state=active]` background. */
interface TabsContextValue {
  value: string | undefined;
  layoutId: string;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

type TabsProps = React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>;

const Tabs = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Root>, TabsProps>(
  ({ value, defaultValue, onValueChange, ...props }, ref) => {
    const [uncontrolled, setUncontrolled] = React.useState(defaultValue);
    const layoutId = React.useId();
    // Radix stays the source of truth for behaviour; this is a read-only mirror
    // for the indicator, so it tracks both the controlled and uncontrolled case.
    const current = value ?? uncontrolled;

    const handleValueChange = React.useCallback(
      (next: string) => {
        setUncontrolled(next);
        onValueChange?.(next);
      },
      [onValueChange]
    );

    const ctx = React.useMemo<TabsContextValue>(() => ({ value: current, layoutId }), [current, layoutId]);

    return (
      <TabsContext.Provider value={ctx}>
        <TabsPrimitive.Root
          ref={ref}
          value={value}
          defaultValue={defaultValue}
          onValueChange={handleValueChange}
          {...props}
        />
      </TabsContext.Provider>
    );
  }
);
Tabs.displayName = 'Tabs';

const tabsListVariants = cva('flex items-center gap-2 overflow-x-auto scrollbar-none', {
  variants: {
    variant: {
      /** Free-standing row: its own toolbar surface, like `<SectionNav>`. */
      toolbar: 'surface-toolbar rounded-4xl px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3',
      /** No chrome — for a tab row that already sits inside a card. */
      plain: '-mx-1 px-1',
    },
  },
  defaultVariants: {
    variant: 'toolbar',
  },
});

interface TabsListProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>,
  VariantProps<typeof tabsListVariants> { }

const TabsList = React.forwardRef<React.ElementRef<typeof TabsPrimitive.List>, TabsListProps>(
  ({ className, variant, ...props }, ref) => (
    <TabsPrimitive.List ref={ref} className={cn(tabsListVariants({ variant }), className)} {...props} />
  )
);
TabsList.displayName = 'TabsList';

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, children, value, ...props }, ref) => {
  const ctx = React.useContext(TabsContext);
  const showIndicator = ctx !== null && ctx.value === value;

  return (
    <TabsPrimitive.Trigger
      ref={ref}
      value={value}
      className={cn(
        'nav-pill shrink-0 disabled:pointer-events-none disabled:opacity-50',
        PILL_FOCUS,
        // Active is carried by weight AND a rule, not hue alone, so it survives
        // a greyscale/CVD read. The solid fill is gone: it was the only solid
        // brand surface in the persistent frame, and chrome is not a state.
        // Ink is `primary-ink` (a text value) now that there is no fill for a
        // foreground colour to sit on.
        'data-[state=active]:font-semibold data-[state=active]:text-primary-ink',
        // Only paint the rule here when there's no morphing indicator to do it.
        !ctx &&
          'data-[state=active]:after:absolute data-[state=active]:after:inset-x-1 data-[state=active]:after:bottom-0 data-[state=active]:after:h-0.5 data-[state=active]:after:rounded-full data-[state=active]:after:bg-primary-ink data-[state=active]:after:content-[""]',
        className
      )}
      {...props}
    >
      {showIndicator ? (
        <motion.span
          layoutId={ctx.layoutId}
          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
          // A 2px rule, not a fill — see section-nav.tsx for the same change.
          // Keeping `layoutId` means it still slides between triggers.
          className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-primary-ink"
          aria-hidden
        />
      ) : null}
      <span className="whitespace-nowrap">{children}</span>
    </TabsPrimitive.Trigger>
  );
});
TabsTrigger.displayName = 'TabsTrigger';

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      // Radix makes the panel focusable, so it needs a ring like anything else.
      'mt-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      // Inactive panels unmount, so there is no exit to animate — entrance only.
      'data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-150',
      className
    )}
    {...props}
  />
));
TabsContent.displayName = 'TabsContent';

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
