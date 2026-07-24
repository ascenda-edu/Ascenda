'use client';

import { useRef, type ReactNode } from 'react';
import { useInView, useReducedMotion } from 'framer-motion';
import { Check, Search } from 'lucide-react';
import { useAnimatedNumber } from '@/hooks/use-animated-number';
import { countryFlagEmoji } from '@/lib/utils/flag';
import { cn } from '@/lib/utils';
import { ringToneClass } from './mock-viz';

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

// Bordered tier pill treatment from the real applications board (TIER_TONE in
// application-list.tsx). Tier is strategy; ring colour is odds — they differ on
// purpose (e.g. Imperial: emerald 85 ring + amber "Match" pill).
const TIER_STYLES: Record<string, string> = {
    Match: 'text-amber-700 border-amber-500/40 bg-amber-500/10 dark:text-amber-400',
    Safe: 'text-emerald-700 border-emerald-500/40 bg-emerald-500/10 dark:text-emerald-400',
    Reach: 'text-rose-700 border-rose-500/40 bg-rose-500/10 dark:text-rose-400',
};

// Monogram tile — same stable-hash tone pattern as university-card.tsx (not
// imported: that file drags TrackProgramButton/Supabase into the public bundle).
const MONOGRAM_TONES = [
    'bg-sky-500/10 text-sky-700 dark:text-sky-300',
    'bg-violet-500/10 text-violet-700 dark:text-violet-300',
    'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    'bg-rose-500/10 text-rose-700 dark:text-rose-300',
];

const MONOGRAM_STOP_WORDS = new Set(['of', 'the', 'and', 'for', 'at', 'de', 'la']);

const monogramFor = (name: string): string => {
    const words = name.split(/\s+/).filter((w) => w && !MONOGRAM_STOP_WORDS.has(w.toLowerCase()));
    return words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || 'U';
};

export const monogramToneFor = (name: string): string => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    return MONOGRAM_TONES[hash % MONOGRAM_TONES.length];
};

export function Monogram({ name, className }: { name: string; className?: string }) {
    return (
        <span
            className={cn(
                'grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-bold',
                monogramToneFor(name),
                className,
            )}
            aria-hidden
        >
            {monogramFor(name)}
        </span>
    );
}

/**
 * A single ranked-match card, programme-first like the real UniversityCard:
 * monogram · programme + "University · 🇳🇱 location" · optional tuition meta ·
 * tier pill · fit ring. Ring tone derives from the score (fit-score.ts), so an
 * 85 is emerald even when the tier pill says Match.
 */
export function MatchCard({
    name,
    sub,
    score,
    tier,
    location,
    meta,
    compact = false,
}: {
    /** University name (drives the monogram + secondary line). */
    name: string;
    /** Programme name — the bold line. */
    sub: string;
    score: number;
    tier?: 'Match' | 'Safe' | 'Reach';
    /** "Delft, Netherlands" — flag derives from the segment after the last comma. */
    location?: string;
    /** "€18,750/yr · 2 yrs · Master's" */
    meta?: string;
    compact?: boolean;
}) {
    const flag = location ? countryFlagEmoji(location.split(',').pop()?.trim()) : null;

    return (
        <div
            className={cn(
                'flex items-center gap-3 rounded-2xl border border-border bg-card dark:border-white/10',
                compact ? 'p-3' : 'p-4',
            )}
        >
            <Monogram name={name} className={compact ? 'h-8 w-8 rounded-lg text-[0.6875rem]' : undefined} />
            <div className="min-w-0 flex-1">
                <p className={cn('truncate font-semibold tracking-tight text-foreground', compact ? 'text-sm' : 'text-[0.9375rem]')}>
                    {sub}
                </p>
                <p className={cn('truncate text-muted-foreground', compact ? 'text-xs' : 'text-[0.8125rem]')}>
                    {name}
                    {location && (
                        <>
                            {' · '}
                            {flag && <span aria-hidden>{flag} </span>}
                            {location}
                        </>
                    )}
                </p>
                {!compact && meta && <p className="mt-0.5 truncate text-[0.6875rem] tabular-nums text-muted-foreground">{meta}</p>}
            </div>
            {tier && !compact && (
                <span
                    className={cn(
                        'shrink-0 rounded-full border px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-[0.15em]',
                        TIER_STYLES[tier],
                    )}
                >
                    {tier}
                </span>
            )}
            <ProgressRing value={score} size={compact ? 40 : 48} stroke={compact ? 4.5 : 5} colorClass={ringToneClass(score)} />
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
    rose: 'text-rose-700 bg-rose-500/10 dark:text-rose-400',
    amber: 'text-amber-700 bg-amber-500/10 dark:text-amber-400',
    sky: 'text-sky-700 bg-sky-500/10 dark:text-sky-400',
    emerald: 'text-emerald-700 bg-emerald-500/10 dark:text-emerald-400',
};

const DOT_STYLES: Record<string, string> = {
    rose: 'bg-rose-500',
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
    tone: 'rose' | 'amber' | 'sky' | 'emerald';
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
export function SearchWidget({
    query,
    chips = [{ label: 'Netherlands', active: true }, { label: 'Engineering' }],
    countLine,
    children,
}: {
    /** Typed-in query (foreground text + caret); omit for the placeholder copy. */
    query?: string;
    chips?: { label: string; active?: boolean }[];
    countLine?: ReactNode;
    /** Optional result rows rendered below the count line. */
    children?: ReactNode;
}) {
    return (
        <div>
            <div
                className={cn(
                    'flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-[0.9375rem] dark:border-white/10',
                    query ? 'font-medium text-foreground' : 'text-muted-foreground',
                )}
            >
                <Search className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{query ?? 'Search universities or courses by name, subject, or vibe'}</span>
                {query && <span className="h-4 w-px animate-pulse bg-primary motion-reduce:animate-none" aria-hidden />}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
                {chips.map((chip) => (
                    <span
                        key={chip.label}
                        className={cn(
                            'rounded-full border px-3 py-1.5 text-[0.8125rem]',
                            chip.active
                                ? 'border-primary bg-primary font-semibold text-primary-foreground'
                                : 'border-border bg-card font-medium text-muted-foreground dark:border-white/10',
                        )}
                    >
                        {chip.label}
                    </span>
                ))}
            </div>
            <p className="mt-3.5 text-[0.8125rem] text-muted-foreground">
                {countLine ?? (
                    <>
                        <b className="font-semibold text-foreground tabular-nums">18</b> strong matches ranked for you
                    </>
                )}
            </p>
            {children}
        </div>
    );
}
