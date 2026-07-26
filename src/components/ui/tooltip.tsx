'use client';

import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

/**
 * Radix-backed tooltip. The content is PORTALLED to the body, which is the whole
 * point: the counsellor analytics charts hand-roll their hover labels as
 * `absolute -top-8` children of the bar, so any ancestor with `overflow-hidden`
 * silently clips them (that bug shipped). A portalled layer cannot be clipped by
 * an ancestor, and `z-overlay` puts it above panels but below modals.
 *
 * `TooltipProvider` must wrap anything that renders a `Tooltip` — Radix throws
 * "`Tooltip` must be used within `TooltipProvider`" otherwise. It IS mounted
 * app-wide, once, in `app/providers.tsx`, so consumers should NOT wrap locally:
 * `skipDelayDuration` is grouped per provider, and a nested one would restart the
 * open delay for every tooltip instead of letting a sweep across neighbours feel
 * instant.
 */

// 200ms, not Radix's 700ms default: these label chart bars and icon buttons, where
// a deliberate hover should feel immediate. `skipDelayDuration` (Radix's 300ms)
// then makes sweeping across neighbouring bars instant rather than 200ms-per-bar,
// which is why grouping under ONE provider matters.
export function TooltipProvider({
    delayDuration = 200,
    ...props
}: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Provider>) {
    return <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />;
}

export const Tooltip = TooltipPrimitive.Root;

// Almost always used with `asChild` so the trigger is the consumer's own button —
// Radix then hangs `aria-describedby` off it, so the tooltip text is announced
// rather than being a mouse-only affordance.
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = React.forwardRef<
    React.ComponentRef<typeof TooltipPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, children, ...props }, ref) => (
    <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
            ref={ref}
            sideOffset={sideOffset}
            className={cn(
                'z-overlay max-w-xs rounded-lg border border-border bg-popover px-2.5 py-1.5',
                'text-xs font-medium leading-snug text-popover-foreground shadow-e-3',
                // No data-[state=open] guard on the entrance: Radix opens tooltips in
                // two states (`instant-open` when the skip window is active,
                // `delayed-open` otherwise) and both should animate in.
                'animate-in fade-in-0 zoom-in-95 duration-150',
                'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:duration-100',
                'data-[side=top]:slide-in-from-bottom-1 data-[side=bottom]:slide-in-from-top-1',
                'data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1',
                className
            )}
            {...props}
        >
            {children}
            {/* Radix's arrow is one <polygon>, so it takes the surface fill but not
                the 1px border — stroking it would draw a line across the tooltip's
                own edge. Fill-only is the honest trade. */}
            <TooltipPrimitive.Arrow width={11} height={5} className="fill-popover" />
        </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
));
TooltipContent.displayName = 'TooltipContent';
