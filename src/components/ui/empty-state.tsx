'use client';

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * The app's empty state.
 *
 * `size` exists because the single fixed `min-h-[280px]` centred layout was the
 * reason a dozen call sites kept hand-rolling their own: it can't sit inside a
 * dashboard hub cell or a list row without dwarfing them. `inline` is the compact,
 * left-aligned form for those places.
 *
 * `tone` exists for the same reason — some of these states are *positive*
 * ("Nothing urgent, everything on track"), and rendering those in the neutral
 * dashed treatment flattened the good news into an absence.
 */
interface EmptyStateProps {
    /**
     * A RENDERED icon element, e.g. `icon={<Inbox />}` — not a component reference.
     *
     * This is deliberate and load-bearing: EmptyState is a Client Component, and a
     * Lucide icon is a forwardRef object carrying a `render` FUNCTION. Functions
     * aren't serialisable across the server/client boundary, so `icon={Inbox}` from a
     * Server Component throws "Functions cannot be passed directly to Client
     * Components" and takes the whole route's error boundary with it. That was live on
     * five server pages. A rendered element serialises fine.
     *
     * The wrapper sizes whatever you pass, so call sites don't set icon dimensions.
     */
    icon?: ReactNode;
    title: string;
    description?: string;
    hint?: string;
    action?: React.ReactNode;
    /** `default` fills a page region; `inline` fits a hub cell or list row. */
    size?: 'default' | 'inline';
    /** `positive` for "all clear" states, which are good news rather than absence. */
    tone?: 'neutral' | 'positive';
    className?: string;
}

export function EmptyState({
    icon,
    title,
    description,
    hint,
    action,
    size = 'default',
    tone = 'neutral',
    className,
}: EmptyStateProps) {
    const inline = size === 'inline';
    const positive = tone === 'positive';

    return (
        <motion.div
            className={cn(
                "flex flex-col rounded-2xl border border-dashed",
                inline
                    ? "items-start p-4 text-left"
                    : "min-h-[280px] items-center justify-center p-8 text-center",
                positive
                    ? "border-success/30 bg-success-subtle"
                    : "border-border/60 bg-muted/10",
                className
            )}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
        >
            {icon && (
                <div
                    aria-hidden
                    className={cn(
                        "flex items-center justify-center rounded-2xl ring-1",
                        inline ? "h-9 w-9" : "h-12 w-12",
                        // Size and colour the passed element from here, so call sites
                        // stay `icon={<Inbox />}` with no styling of their own.
                        inline ? "[&>svg]:h-4 [&>svg]:w-4" : "[&>svg]:h-5 [&>svg]:w-5",
                        positive
                            ? "bg-success/10 ring-success/25 [&>svg]:text-success"
                            : "bg-primary/5 ring-primary/10 [&>svg]:text-primary-ink/50"
                    )}
                >
                    {icon}
                </div>
            )}
            <h3
                className={cn(
                    "font-semibold text-foreground",
                    inline ? "mt-3 text-sm" : "mt-5 text-lg"
                )}
            >
                {title}
            </h3>
            {description && (
                <p
                    className={cn(
                        "leading-relaxed text-muted-foreground",
                        inline ? "mt-1 text-xs" : "mt-2 max-w-sm text-center text-sm"
                    )}
                >
                    {description}
                </p>
            )}
            {hint && (
                <p
                    className={cn(
                        "text-muted-foreground/60",
                        inline ? "mt-1 text-label" : "mt-1.5 max-w-sm text-center text-xs"
                    )}
                >
                    {hint}
                </p>
            )}
            {action && <div className={inline ? "mt-3" : "mt-5"}>{action}</div>}
        </motion.div>
    );
}
