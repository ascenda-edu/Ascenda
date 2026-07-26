'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';

/**
 * Radix-backed dialog. This replaced a hand-rolled modal that carried its own
 * portal, focus trap, scroll lock, Escape handler and `aria-labelledby`
 * registration — all of which Radix does, and does better (focus sentinels so
 * Tab can't escape into browser chrome, `aria-hidden` on the rest of the page,
 * a layer stack so nested dialogs dismiss in the right order).
 *
 * The public API is unchanged: `<Dialog open onOpenChange align>` wrapping a
 * `<DialogContent>`, with `DialogHeader` / `DialogTitle` inside. No consumer
 * needs a `DialogTrigger` — every call site opens from its own button and passes
 * `open` — but Trigger/Close are exported now that they're free.
 */

type DialogAlign = 'center' | 'left';

// Only `align` needs sharing, and only downward to DialogContent, so this stays a
// bare value context rather than the object the old implementation needed for its
// title-registration bookkeeping.
const DialogAlignContext = React.createContext<DialogAlign>('center');

interface DialogProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Root> {
    /**
     * Placement of the dialog surface. `'center'` (default) is the classic
     * modal; `'left'` turns it into a full-height slide-over anchored to the
     * left edge. Purely presentational — focus-trap, scroll-lock, Escape and
     * scrim behaviour are identical for both.
     */
    align?: DialogAlign;
}

export function Dialog({ align = 'center', ...props }: DialogProps) {
    return (
        <DialogAlignContext.Provider value={align}>
            <DialogPrimitive.Root {...props} />
        </DialogAlignContext.Provider>
    );
}

export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

// Shared entrance/exit timing. ~200ms in, faster out, per the house rule; the
// `duration-*` utility is re-mapped to animation-duration by tailwindcss-animate,
// and the `data-[state=closed]:` variant outranks the base by specificity.
const TIMING = 'duration-200 data-[state=closed]:duration-150';

export type DialogContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>;

export const DialogContent = React.forwardRef<
    React.ComponentRef<typeof DialogPrimitive.Content>,
    DialogContentProps
>(({ className, children, onOpenAutoFocus, onCloseAutoFocus, ...props }, ref) => {
    const align = React.useContext(DialogAlignContext);
    const isLeft = align === 'left';

    // Radix restores focus to its own DialogTrigger on close. Nothing here uses
    // one — every consumer drives `open` from a button elsewhere in the tree — so
    // Radix would drop focus to <body>. FocusScope dispatches open-auto-focus
    // *before* it moves focus, so activeElement is still the opener at that point;
    // stash it and put focus back ourselves. The ref lives as long as the mounted
    // content, which spans exactly one open→close cycle.
    const openerRef = React.useRef<HTMLElement | null>(null);

    return (
        <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay
                className={cn(
                    'fixed inset-0 z-modal bg-black/50 backdrop-blur-sm',
                    'data-[state=open]:animate-in data-[state=open]:fade-in-0',
                    'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
                    TIMING
                )}
            />
            {/* Positioning wrapper rather than translate-centring on the panel
                itself: it keeps the viewport gutter on small screens and lets the
                slide-over stretch to full height, both of which the previous
                flex-centred implementation relied on. It must not eat outside
                clicks, hence pointer-events-none here / auto on the panel. */}
            <div
                className={cn(
                    'pointer-events-none fixed inset-0 z-modal flex',
                    isLeft ? 'items-stretch justify-start' : 'items-center justify-center p-4 sm:p-6'
                )}
            >
                <DialogPrimitive.Content
                    ref={ref}
                    onOpenAutoFocus={(event) => {
                        openerRef.current = document.activeElement as HTMLElement | null;
                        onOpenAutoFocus?.(event);
                    }}
                    onCloseAutoFocus={(event) => {
                        onCloseAutoFocus?.(event);
                        if (event.defaultPrevented) return;
                        const opener = openerRef.current;
                        // isConnected: the opener is often inside a list the dialog
                        // just mutated, in which case there is nothing to return to
                        // and Radix's own fallback should run instead.
                        if (opener?.isConnected) {
                            event.preventDefault();
                            opener.focus();
                        }
                    }}
                    className={cn(
                        // e-4 is the ladder's modal step; a dialog should sit above popovers.
                        'pointer-events-auto relative overflow-hidden border bg-background text-foreground shadow-e-4',
                        // The panel is a programmatic focus target, not a control —
                        // it takes focus on open so screen readers land inside it.
                        // Every interactive element within keeps its own ring.
                        'focus:outline-none',
                        isLeft
                            ? cn(
                                'h-full w-[min(88vw,360px)] max-w-full border-y-0 border-l-0',
                                'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-left-full',
                                'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-left-full'
                            )
                            : cn(
                                'w-full max-w-lg rounded-xl sm:rounded-2xl',
                                'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-bottom-2',
                                'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:slide-out-to-bottom-2'
                            ),
                        TIMING,
                        className
                    )}
                    {...props}
                >
                    {children}
                </DialogPrimitive.Content>
            </div>
        </DialogPrimitive.Portal>
    );
});
DialogContent.displayName = 'DialogContent';

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />;
}

/**
 * Radix wires `aria-labelledby` to this automatically and omits it when no title
 * is rendered, which is what the old `registerTitle`/`unregisterTitle` dance
 * existed to achieve. Caveat: passing your own `id` overrides Radix's generated
 * one and leaves the label reference dangling — label the content instead
 * (`<DialogContent aria-label="…">`) if you need a custom scheme.
 */
export const DialogTitle = React.forwardRef<
    React.ComponentRef<typeof DialogPrimitive.Title>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Title
        ref={ref}
        className={cn('text-lg font-semibold leading-none tracking-tight', className)}
        {...props}
    />
));
DialogTitle.displayName = 'DialogTitle';

// Optional, and wired to `aria-describedby` when present. Worth using for the
// one-line "this can't be undone" copy the confirm dialogs already render as a
// loose <p>.
export const DialogDescription = React.forwardRef<
    React.ComponentRef<typeof DialogPrimitive.Description>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
));
DialogDescription.displayName = 'DialogDescription';
