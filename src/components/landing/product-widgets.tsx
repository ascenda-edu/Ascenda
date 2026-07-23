'use client';

import { useRef, type ReactNode } from 'react';
import { useInView, useReducedMotion } from 'framer-motion';
import { Check, Search } from 'lucide-react';
import { useAnimatedNumber } from '@/hooks/use-animated-number';
import { cn } from '@/lib/utils';

/**
 * Rendered product widgets used across the landing sections. These recreate the
 * real in-app surfaces (fit-score cards, search hub, task lists, stat tiles,
 * profile ring) as crisp, readable, theme-aware HTML — rather than shrinking a
 * full screenshot into an unreadable frame. Counters/rings animate on scroll and
 * snap to their final value under prefers-reduced-motion (via useAnimatedNumber).
 */

/** Surface that frames a cluster of widgets like an in-app panel. */
export function AppFrame({
    route,
    title,
    className,
    children,
}: {
    route?: string;
    title?: string;
    className?: string;
    children: ReactNode;
}) {
    return (
        <div
            className={cn(
                'rounded-2xl border border-border bg-muted/50 p-4 shadow-xl dark:bg-background/60 dark:border-white/10 sm:p-5',
                className,
            )}
        >
            {route && (
                <div className="mb-4 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-rose-400/70" aria-hidden />
                    <span className="h-2 w-2 rounded-full bg-amber-400/70" aria-hidden />
                    <span className="h-2 w-2 rounded-full bg-emerald-400/70" aria-hidden />
                    <span className="ml-2 font-mono text-[0.6875rem] text-muted-foreground">ascendaedu.com{route}</span>
                </div>
            )}
            {title && (
                <p className="mb-3 text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">{title}</p>
            )}
            {children}
        </div>
    );
}

/** Circular progress ring with a count-up percentage in the centre. */
export function ProgressRing({
    value,
    size = 56,
    stroke = 6,
    colorClass = 'stroke-primary',
    className,
    label,
}: {
    value: number;
    size?: number;
    stroke?: number;
    colorClass?: string;
    className?: string;
    /** Accessible label; defaults to "{value}% fit". Set when the ring isn't a fit score. */
    label?: string;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const inView = useInView(ref, { once: true, amount: 0.5 });
    const shouldReduceMotion = useReducedMotion();
    const n = useAnimatedNumber(value, inView, shouldReduceMotion ? 0 : 1200);

    const r = (size - stroke) / 2;
    const circ = 2 * Math.PI * r;
    const offset = circ * (1 - n / 100);

    return (
        <div
            ref={ref}
            className={cn('relative shrink-0', className)}
            style={{ width: size, height: size }}
            role="img"
            aria-label={label ?? `${value}% fit`}
        >
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="stroke-border" strokeWidth={stroke} />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    className={colorClass}
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={circ}
                    strokeDashoffset={offset}
                />
            </svg>
            <span
                className="absolute inset-0 grid place-items-center font-bold tabular-nums tracking-tight"
                style={{ fontSize: Math.round(size * 0.27) }}
                aria-hidden
            >
                {n}%
            </span>
        </div>
    );
}

const TIER_STYLES: Record<string, string> = {
    match: 'text-amber-700 bg-amber-500/10 dark:text-amber-400',
    safe: 'text-emerald-700 bg-emerald-500/10 dark:text-emerald-400',
    reach: 'text-rose-700 bg-rose-500/10 dark:text-rose-400',
};

/** A single ranked-match card: fit ring + country/tier + programme name. */
export function MatchCard({
    country,
    tier,
    name,
    sub,
    score,
    colorClass,
    compact = false,
}: {
    country?: string;
    tier?: 'match' | 'safe' | 'reach';
    name: string;
    sub: string;
    score: number;
    colorClass: string;
    compact?: boolean;
}) {
    return (
        <div
            className={cn(
                'flex items-center gap-3.5 rounded-2xl border border-border bg-card dark:border-white/10',
                compact ? 'p-3' : 'p-4',
            )}
        >
            <ProgressRing value={score} size={compact ? 44 : 56} stroke={compact ? 5 : 6} colorClass={colorClass} />
            <div className="min-w-0 flex-1">
                {!compact && (country || tier) && (
                    <div className="mb-0.5 flex items-center justify-between gap-2">
                        {country && (
                            <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                                {country}
                            </span>
                        )}
                        {tier && (
                            <span
                                className={cn(
                                    'rounded-full px-2 py-0.5 text-[0.6875rem] font-bold uppercase tracking-[0.05em]',
                                    TIER_STYLES[tier],
                                )}
                            >
                                {tier}
                            </span>
                        )}
                    </div>
                )}
                <p className={cn('font-semibold tracking-tight text-foreground', compact ? 'text-sm' : 'text-[0.9375rem]')}>
                    {name}
                </p>
                <p className={cn('text-muted-foreground', compact ? 'text-xs' : 'text-[0.8125rem]')}>{sub}</p>
            </div>
        </div>
    );
}

/** Compact stat tile with a count-up value. */
export function StatTile({
    label,
    value,
    suffix = '',
    detail,
    accent = false,
}: {
    label: string;
    value: number;
    suffix?: string;
    detail?: string;
    accent?: boolean;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const inView = useInView(ref, { once: true, amount: 0.6 });
    const shouldReduceMotion = useReducedMotion();
    const n = useAnimatedNumber(value, inView, shouldReduceMotion ? 0 : 1200);

    return (
        <div ref={ref} className="rounded-xl border border-border bg-card p-3.5 dark:border-white/10">
            <p className="text-[0.6875rem] font-medium text-muted-foreground">{label}</p>
            <p
                className={cn(
                    'mt-1 text-2xl font-bold leading-none tracking-tight tabular-nums',
                    accent ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground',
                )}
            >
                {n}
                {suffix}
            </p>
            {detail && <p className="mt-1 text-[0.6875rem] text-muted-foreground">{detail}</p>}
        </div>
    );
}

const DUE_STYLES: Record<string, string> = {
    amber: 'text-amber-700 bg-amber-500/10 dark:text-amber-400',
    sky: 'text-sky-700 bg-sky-500/10 dark:text-sky-400',
    emerald: 'text-emerald-700 bg-emerald-500/10 dark:text-emerald-400',
};

const DOT_STYLES: Record<string, string> = {
    amber: 'bg-amber-500',
    sky: 'bg-sky-500',
    emerald: 'bg-emerald-500',
};

/** A single task/deadline row. */
export function TaskRow({
    tone,
    title,
    sub,
    due,
    compact = false,
}: {
    tone: 'amber' | 'sky' | 'emerald';
    title: string;
    sub?: string;
    due: string;
    compact?: boolean;
}) {
    return (
        <div
            className={cn(
                'flex items-center gap-3 rounded-xl border border-border bg-card dark:border-white/10',
                compact ? 'p-2.5' : 'p-3.5',
            )}
        >
            <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', DOT_STYLES[tone])} aria-hidden />
            <div className="min-w-0 flex-1">
                <p className={cn('font-semibold tracking-tight text-foreground', compact ? 'text-[0.8125rem]' : 'text-sm')}>
                    {title}
                </p>
                {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
            </div>
            <span className={cn('rounded-full px-2.5 py-1 text-[0.6875rem] font-bold tabular-nums', DUE_STYLES[tone])}>
                {due}
            </span>
        </div>
    );
}

/** A completed profile-checklist row. */
export function CheckItem({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
            </span>
            {label}
            <span className="ml-auto text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-emerald-700 dark:text-emerald-400">
                Done
            </span>
        </div>
    );
}

/** A read-only recreation of the search hub input + filter chips. */
export function SearchWidget() {
    return (
        <div>
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-[0.9375rem] text-muted-foreground dark:border-white/10">
                <Search className="h-[18px] w-[18px]" aria-hidden />
                Search universities or courses by name, subject, or vibe
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-primary bg-primary px-3 py-1.5 text-[0.8125rem] font-semibold text-primary-foreground">
                    Netherlands
                </span>
                <span className="rounded-full border border-border bg-card px-3 py-1.5 text-[0.8125rem] font-medium text-muted-foreground dark:border-white/10">
                    Engineering
                </span>
            </div>
            <p className="mt-3.5 text-[0.8125rem] text-muted-foreground">
                <b className="font-semibold text-foreground tabular-nums">18</b> strong matches ranked for you
            </p>
        </div>
    );
}
