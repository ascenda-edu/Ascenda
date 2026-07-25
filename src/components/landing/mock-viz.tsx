'use client';

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { useInView, useReducedMotion } from 'framer-motion';
import { AlertCircle, Check, Clock3 } from 'lucide-react';
import { getFitScoreVisuals } from '@/lib/theme/fit-score';
import { cn } from '@/lib/utils';

/**
 * Data-viz mock primitives for the landing page. Each recreates one of the
 * platform's real visualizations (chances calculator, requirements checker,
 * deadline calendar, counsellor analytics, parent cost explorer) as crisp,
 * theme-aware HTML/SVG — never by importing the real components, which drag
 * Supabase/data deps into the public bundle. Same rule as product-widgets.tsx.
 */

/**
 * Post-mount reduced-motion flag. `useReducedMotion()` returns the true
 * preference on the FIRST client render while SSR always computed `false`, so
 * feeding it straight into rendered `style` props mismatches the server HTML
 * ("Prop `style` did not match") for every reduced-motion visitor. Gating on
 * mount keeps render #1 identical to SSR; the effect flush then snaps those
 * users to the final values with zero-duration transitions, as before.
 */
function useMountedReducedMotion(): boolean {
    const shouldReduceMotion = useReducedMotion();
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    return mounted && !!shouldReduceMotion;
}

/** Ring stroke class from the real score→tone mapping (fit-score.ts). */
export const ringToneClass = (score: number): string => {
    const tone = getFitScoreVisuals(score).tone;
    if (tone === 'strong') return 'stroke-emerald-500';
    if (tone === 'solid') return 'stroke-amber-500';
    if (tone === 'risk') return 'stroke-orange-500';
    return 'stroke-muted-foreground';
};

/**
 * ReactBits "Spotlight Card", adapted: a pointer-tracked radial glow overlay.
 * Pointer-driven only, so it needs no reduced-motion handling.
 */
export function SpotlightPanel({ className, children }: { className?: string; children: ReactNode }) {
    const ref = useRef<HTMLDivElement>(null);
    const [spot, setSpot] = useState<{ x: number; y: number } | null>(null);

    return (
        <div
            ref={ref}
            className={cn('relative', className)}
            onMouseMove={(e) => {
                const rect = ref.current?.getBoundingClientRect();
                if (rect) setSpot({ x: e.clientX - rect.left, y: e.clientY - rect.top });
            }}
            onMouseLeave={() => setSpot(null)}
        >
            <div
                className="pointer-events-none absolute inset-0 z-10 transition-opacity duration-500"
                style={{
                    opacity: spot ? 1 : 0,
                    background: spot
                        ? `radial-gradient(circle at ${spot.x}px ${spot.y}px, hsl(var(--primary) / 0.08), transparent 70%)`
                        : undefined,
                }}
                aria-hidden
            />
            {children}
        </div>
    );
}

/**
 * The "why this score?" factor bars — mirrors the assistant matches-widget
 * rendering of EnrichedMatch.breakdown (eligibility / academicFit /
 * preferenceFit / outcomes). Bars grow on scroll-in; snap under reduced motion.
 */
export function FactorBars({ factors }: { factors: { label: string; value: number }[] }) {
    const ref = useRef<HTMLDivElement>(null);
    const inView = useInView(ref, { once: true, amount: 0.5 });
    const reduced = useMountedReducedMotion();
    const play = inView || reduced;

    return (
        <div ref={ref} className="rounded-xl border border-border bg-card p-3.5 dark:border-white/10">
            <div className="flex flex-col gap-2.5">
                {factors.map((f, i) => (
                    <div key={f.label} className="grid grid-cols-[92px_1fr_32px] items-center gap-2.5">
                        <span className="truncate text-[0.6875rem] font-semibold text-muted-foreground">{f.label}</span>
                        {/* dark:bg-white/10 — this track sits on bg-card, and on dark
                            --muted is close enough to --card to disappear entirely. */}
                        <span className="h-1.5 overflow-hidden rounded-full bg-muted dark:bg-white/10">
                            <span
                                className="block h-full origin-left rounded-full bg-primary transition-transform duration-700 ease-out"
                                style={{
                                    transform: `scaleX(${play ? f.value / 100 : 0})`,
                                    transitionDelay: reduced ? '0ms' : `${i * 90}ms`,
                                    transitionDuration: reduced ? '0ms' : undefined,
                                }}
                            />
                        </span>
                        <span className="text-right text-xs font-bold tabular-nums text-foreground">{f.value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

const CHANCE_TIER_META = {
    safety: { label: 'Safety', ring: 'stroke-emerald-500', bar: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
    match: { label: 'Match', ring: 'stroke-amber-500', bar: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
    reach: { label: 'Reach', ring: 'stroke-rose-500', bar: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400' },
} as const;

export type ChanceTier = keyof typeof CHANCE_TIER_META;

export const IB_MIN = 24;
export const IB_MAX = 45;

/** The chances-calculator what-if model (marketing-simplified, same shape). */
export const chanceFor = (score: number, minScore: number) =>
    Math.max(4, Math.min(96, Math.round(50 + (score - minScore) * 8)));

export const chanceTierFor = (score: number, minScore: number): ChanceTier => {
    if (score >= minScore + 2) return 'safety';
    if (score >= minScore - 1) return 'match';
    return 'reach';
};

/**
 * One chances-calculator row: monogram + programme, a score-comparison bar with
 * the programme's minimum-score marker, and a live chance-% ring. Unlike
 * ProgressRing this ring is slider-driven, so it transitions between values via
 * CSS instead of count-up-from-zero.
 */
export function ChanceMeter({
    monogram,
    monogramClass,
    name,
    sub,
    minScore,
    score,
}: {
    monogram: string;
    monogramClass: string;
    name: string;
    sub: string;
    minScore: number;
    score: number;
}) {
    const chance = chanceFor(score, minScore);
    const tier = CHANCE_TIER_META[chanceTierFor(score, minScore)];
    const size = 44;
    const strokeW = 4.5;
    const r = (size - strokeW) / 2;
    const circ = 2 * Math.PI * r;
    const pct = (v: number) => ((v - IB_MIN) / (IB_MAX - IB_MIN)) * 100;

    return (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 dark:border-white/10">
            <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[0.6875rem] font-bold', monogramClass)}>
                {monogram}
            </span>
            <div className="min-w-0 flex-1">
                <p className="truncate text-[0.8125rem] font-semibold text-foreground">
                    {name} <span className="font-normal text-muted-foreground">· {sub}</span>
                </p>
                {/* dark:bg-white/10 — see FactorBars: --muted is invisible on bg-card in dark. */}
                <div className="relative mt-2 h-1.5 rounded-full bg-muted dark:bg-white/10">
                    <span
                        className={cn('absolute inset-y-0 left-0 rounded-full transition-all duration-300', tier.bar)}
                        style={{ width: `${pct(score)}%` }}
                    />
                    <span
                        className="absolute -inset-y-1 w-0.5 rounded-full bg-muted-foreground/70"
                        style={{ left: `${pct(minScore)}%` }}
                        title={`Minimum score ${minScore}`}
                    />
                </div>
            </div>
            <div
                className="relative shrink-0"
                style={{ width: size, height: size }}
                role="img"
                aria-label={`${chance}% chance at ${name} (${tier.label})`}
            >
                <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
                    <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="stroke-border" strokeWidth={strokeW} />
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={r}
                        fill="none"
                        className={cn('transition-all duration-300', tier.ring)}
                        strokeWidth={strokeW}
                        strokeLinecap="round"
                        strokeDasharray={circ}
                        strokeDashoffset={circ * (1 - chance / 100)}
                    />
                </svg>
                <span className={cn('absolute inset-0 grid place-items-center text-[0.625rem] font-bold tabular-nums', tier.text)} aria-hidden>
                    {chance}%
                </span>
            </div>
        </div>
    );
}

export type CalendarChipTone = 'rose' | 'amber' | 'sky' | 'more';

const CAL_CHIP_STYLES: Record<CalendarChipTone, string> = {
    rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    sky: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
    more: 'bg-muted text-muted-foreground',
};

/**
 * Compact month grid — mirrors the deadline-timeline-tool calendar view
 * (Mon-start, today highlighted, colour-coded per-day deadline chips).
 */
export function MiniCalendar({
    month,
    startPad,
    daysInMonth,
    today,
    chips,
    legend,
}: {
    month: string;
    /** Blank leading cells before day 1 (Mon-start). */
    startPad: number;
    daysInMonth: number;
    today: number;
    chips: Record<number, { tone: CalendarChipTone; label: string }[]>;
    legend: { tone: Exclude<CalendarChipTone, 'more'>; label: string }[];
}) {
    const dows = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
    const LEGEND_DOTS: Record<string, string> = { rose: 'bg-rose-500', amber: 'bg-amber-500', sky: 'bg-sky-500' };

    return (
        <div className="rounded-xl border border-border bg-card p-3.5 dark:border-white/10">
            <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[0.8125rem] font-bold tracking-tight text-foreground">{month}</p>
                <div className="flex items-center gap-2.5 text-[0.5625rem] text-muted-foreground">
                    {legend.map((l) => (
                        <span key={l.label} className="flex items-center gap-1">
                            <span className={cn('h-1.5 w-1.5 rounded-full', LEGEND_DOTS[l.tone])} aria-hidden />
                            {l.label}
                        </span>
                    ))}
                </div>
            </div>
            <div className="grid grid-cols-7 gap-[3px]">
                {dows.map((d) => (
                    <span key={d} className="pb-1 text-center text-[0.5625rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                        {d}
                    </span>
                ))}
                {Array.from({ length: startPad }).map((_, i) => (
                    <span key={`pad-${i}`} aria-hidden />
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const dayChips = chips[day] ?? [];
                    return (
                        <div
                            key={day}
                            className={cn(
                                'flex min-h-[34px] flex-col gap-px rounded-md bg-muted/40 px-[3px] py-0.5 text-[0.625rem] tabular-nums text-muted-foreground',
                                day === today && 'font-bold text-foreground ring-[1.5px] ring-inset ring-primary',
                            )}
                        >
                            <span>{day}</span>
                            {dayChips.map((chip) => (
                                <span
                                    key={chip.label}
                                    className={cn(
                                        'truncate rounded px-[3px] text-[0.5rem] font-bold leading-tight',
                                        CAL_CHIP_STYLES[chip.tone],
                                    )}
                                >
                                    {chip.label}
                                </span>
                            ))}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export type HeatCellStatus = 'ok' | 'wip' | 'warn';

const HEAT_CELL_STYLES: Record<HeatCellStatus, { cls: string; label: string }> = {
    ok: { cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', label: 'Complete' },
    wip: { cls: 'bg-sky-500/10 text-sky-600 dark:text-sky-400', label: 'In progress' },
    warn: { cls: 'bg-rose-500/10 text-rose-600 dark:text-rose-400', label: 'Needs attention' },
};

function HeatCell({ status }: { status: HeatCellStatus }) {
    const meta = HEAT_CELL_STYLES[status];
    const Icon = status === 'ok' ? Check : status === 'wip' ? Clock3 : AlertCircle;
    return (
        <span
            className={cn(
                'grid h-9 w-full place-items-center rounded-lg transition-transform duration-150 hover:scale-105',
                meta.cls,
            )}
            role="img"
            aria-label={meta.label}
        >
            <Icon className="h-3.5 w-3.5" strokeWidth={status === 'ok' ? 3 : 2.4} aria-hidden />
        </span>
    );
}

/**
 * University × requirement status matrix — mirrors the requirements-checker
 * grid (emerald check / sky clock / rose warning tiles).
 */
export function HeatmapGrid({
    columns,
    rows,
}: {
    columns: string[];
    rows: { label: string; cells: HeatCellStatus[] }[];
}) {
    return (
        <div className="rounded-xl border border-border bg-card p-3 dark:border-white/10">
            <div
                className="grid items-center gap-1"
                style={{ gridTemplateColumns: `minmax(0,auto) repeat(${columns.length}, minmax(0,1fr))` }}
            >
                <span aria-hidden />
                {columns.map((c) => (
                    <span key={c} className="pb-1 text-center text-[0.5625rem] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                        {c}
                    </span>
                ))}
                {rows.map((row) => (
                    // Fragments add no DOM node, so label + cells flow into the shared grid.
                    <Fragment key={row.label}>
                        <span className="whitespace-nowrap pr-2 text-[0.6875rem] font-semibold text-foreground">
                            {row.label}
                        </span>
                        {row.cells.map((cell, i) => (
                            <HeatCell key={columns[i]} status={cell} />
                        ))}
                    </Fragment>
                ))}
            </div>
        </div>
    );
}

/**
 * Stepped stage funnel — mirrors FullFunnel in the counsellor analytics
 * (tapering colored bars with counts). Bars grow on scroll-in.
 */
export function FunnelChart({ stages }: { stages: { label: string; count: number; colorClass: string; width: number }[] }) {
    const ref = useRef<HTMLDivElement>(null);
    const inView = useInView(ref, { once: true, amount: 0.5 });
    const reduced = useMountedReducedMotion();
    const play = inView || reduced;

    return (
        <div ref={ref} className="flex flex-col gap-1.5">
            {stages.map((stage, i) => (
                <div key={stage.label} className="flex items-center gap-2.5">
                    <span
                        className={cn(
                            'flex h-[22px] origin-left items-center overflow-hidden whitespace-nowrap rounded-lg px-2.5 text-[0.625rem] font-bold text-white transition-transform duration-700 ease-out',
                            stage.colorClass,
                        )}
                        style={{
                            width: `${stage.width}%`,
                            transform: `scaleX(${play ? 1 : 0})`,
                            transitionDelay: reduced ? '0ms' : `${i * 100}ms`,
                            transitionDuration: reduced ? '0ms' : undefined,
                        }}
                    >
                        {stage.label}
                    </span>
                    <span className="w-6 text-right text-xs font-bold tabular-nums text-foreground">{stage.count}</span>
                </div>
            ))}
        </div>
    );
}

const TIER_TILE_STYLES = {
    safety: { label: 'Safety', cls: 'text-emerald-600 dark:text-emerald-400' },
    match: { label: 'Match', cls: 'text-amber-600 dark:text-amber-400' },
    reach: { label: 'Reach', cls: 'text-rose-600 dark:text-rose-400' },
} as const;

/** The chances-calculator tier summary tiles (Safety / Match / Reach counts). */
export function TierTiles({ counts }: { counts: { safety: number; match: number; reach: number } }) {
    return (
        <div className="grid grid-cols-3 gap-2">
            {(['safety', 'match', 'reach'] as const).map((tier) => (
                <div key={tier} className="rounded-xl border border-border bg-card px-2 py-1.5 text-center dark:border-white/10">
                    <p className={cn('font-heading text-lg font-bold leading-tight tabular-nums', TIER_TILE_STYLES[tier].cls)}>
                        {counts[tier]}
                    </p>
                    <p className={cn('text-[0.5625rem] font-bold uppercase tracking-[0.1em]', TIER_TILE_STYLES[tier].cls)}>
                        {TIER_TILE_STYLES[tier].label}
                    </p>
                </div>
            ))}
        </div>
    );
}

/** "Shared with" avatar chips + live dot — mirrors the counsellor/guardian loop. */
export function SharedWithRow({ people }: { people: { initials: string; name: string; toneClass: string; dotClass: string }[] }) {
    return (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-[0.6875rem] text-muted-foreground dark:border-white/10">
            Shared with
            {people.map((p) => (
                <span
                    key={p.name}
                    className={cn('inline-flex items-center gap-1.5 rounded-full py-0.5 pl-1 pr-2.5 text-[0.6875rem] font-semibold', p.toneClass)}
                >
                    <span className={cn('grid h-5 w-5 place-items-center rounded-full text-[0.5625rem] font-extrabold text-white', p.dotClass)} aria-hidden>
                        {p.initials}
                    </span>
                    {p.name}
                </span>
            ))}
            <span className="ml-auto inline-flex items-center gap-1.5 text-[0.625rem] font-bold text-emerald-600 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 motion-reduce:animate-none" aria-hidden />
                Live
            </span>
        </div>
    );
}

/**
 * Proportional application-stage bar + legend — mirrors the dashboard
 * PipelineCard (STAGE_COLOR palette, segments sized by count).
 */
export function PipelineBar({ stages }: { stages: { label: string; count: number; colorClass: string }[] }) {
    const total = stages.reduce((sum, s) => sum + s.count, 0) || 1;
    return (
        <div>
            <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
                {stages
                    .filter((s) => s.count > 0)
                    .map((s) => (
                        <span
                            key={s.label}
                            className={cn('h-full rounded-sm', s.colorClass)}
                            style={{ width: `${Math.max(6, (s.count / total) * 100)}%` }}
                            aria-hidden
                        />
                    ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-[0.6875rem] tabular-nums text-muted-foreground">
                {stages.map((s) => (
                    <span key={s.label} className="flex items-center gap-1.5">
                        <span className={cn('h-1.5 w-1.5 rounded-full', s.colorClass)} aria-hidden />
                        {s.label} {s.count}
                    </span>
                ))}
            </div>
        </div>
    );
}

const MONITOR_TONES = {
    rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
} as const;

/**
 * One cohort docs/deadlines monitor row — mirrors the counsellor
 * deadline-monitor / documents surface (icon tile + student + action pill).
 */
export function MonitorRow({
    tone,
    icon,
    student,
    item,
    pill,
}: {
    tone: keyof typeof MONITOR_TONES;
    icon: ReactNode;
    student: string;
    item: string;
    pill: string;
}) {
    return (
        <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2 dark:border-white/10">
            <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-lg', MONITOR_TONES[tone])} aria-hidden>
                {icon}
            </span>
            <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{student}</span> · {item}
            </p>
            <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-[0.625rem] font-bold tabular-nums', MONITOR_TONES[tone])}>
                {pill}
            </span>
        </div>
    );
}
