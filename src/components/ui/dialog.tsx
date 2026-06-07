'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, HTMLMotionProps } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const FOCUSABLE =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface DialogContextValue {
    onOpenChange?: (open: boolean) => void;
    titleId: string;
    registerTitle: () => void;
    unregisterTitle: () => void;
}

const DialogContext = React.createContext<DialogContextValue | null>(null);

interface DialogProps {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    children: React.ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
    const [mounted, setMounted] = React.useState(false);
    const [hasTitle, setHasTitle] = React.useState(false);
    const titleId = React.useId();
    const containerRef = React.useRef<HTMLDivElement>(null);
    const previouslyFocused = React.useRef<HTMLElement | null>(null);

    const registerTitle = React.useCallback(() => setHasTitle(true), []);
    const unregisterTitle = React.useCallback(() => setHasTitle(false), []);
    const contextValue = React.useMemo<DialogContextValue>(
        () => ({ onOpenChange, titleId, registerTitle, unregisterTitle }),
        [onOpenChange, titleId, registerTitle, unregisterTitle]
    );

    React.useEffect(() => {
        setMounted(true);
    }, []);

    // Escape to close
    React.useEffect(() => {
        if (!open) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onOpenChange?.(false);
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [open, onOpenChange]);

    // Lock body scroll while open
    React.useEffect(() => {
        if (!open) return;
        const original = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = original;
        };
    }, [open]);

    // Move focus into the dialog on open, restore it on close
    React.useEffect(() => {
        if (open) {
            previouslyFocused.current = document.activeElement as HTMLElement | null;
            const node = containerRef.current;
            const target = node?.querySelector<HTMLElement>(FOCUSABLE) ?? node;
            target?.focus();
        } else {
            previouslyFocused.current?.focus?.();
        }
    }, [open]);

    // Trap Tab focus within the dialog
    const onTrapKeyDown = (e: React.KeyboardEvent) => {
        if (e.key !== 'Tab') return;
        const node = containerRef.current;
        if (!node) return;
        const focusables = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
            (el) => el.offsetParent !== null
        );
        if (focusables.length === 0) {
            e.preventDefault();
            return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && active === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && active === last) {
            e.preventDefault();
            first.focus();
        }
    };

    if (!mounted) return null;

    return createPortal(
        <AnimatePresence>
            {open && (
                <DialogContext.Provider value={contextValue}>
                    <div className="fixed inset-0 z-[200] flex items-center justify-center">
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => onOpenChange?.(false)}
                            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
                        />
                        {/* Content Wrapper handles z-index, positioning, and a11y semantics */}
                        <div
                            ref={containerRef}
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby={hasTitle ? titleId : undefined}
                            tabIndex={-1}
                            onKeyDown={onTrapKeyDown}
                            className="relative z-[205] flex w-full items-center justify-center p-4 outline-none [overscroll-behavior:contain] sm:p-6"
                        >
                            {children}
                        </div>
                    </div>
                </DialogContext.Provider>
            )}
        </AnimatePresence>,
        document.body
    );
}

interface DialogContentProps extends Omit<HTMLMotionProps<'div'>, 'ref'> {
    children: React.ReactNode;
    className?: string;
}

export const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
    ({ children, className, ...props }, ref) => {
        return (
            <motion.div
                ref={ref}
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ duration: 0.2 }}
                className={cn(
                    'relative w-full max-w-lg overflow-hidden rounded-xl border bg-background text-foreground shadow-lg sm:rounded-2xl',
                    className
                )}
                {...props}
            >
                {children}
            </motion.div>
        );
    }
);
DialogContent.displayName = 'DialogContent';

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />;
}

export function DialogTitle({ className, id, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
    const ctx = React.useContext(DialogContext);
    // Tell the Dialog a title exists so it can wire aria-labelledby; dialogs
    // without a DialogTitle then avoid a dangling aria-labelledby reference.
    React.useEffect(() => {
        if (id) return; // caller supplied their own id/labelling
        ctx?.registerTitle();
        return () => ctx?.unregisterTitle();
    }, [ctx, id]);
    return (
        <h2
            id={id ?? ctx?.titleId}
            className={cn('text-lg font-semibold leading-none tracking-tight', className)}
            {...props}
        />
    );
}
