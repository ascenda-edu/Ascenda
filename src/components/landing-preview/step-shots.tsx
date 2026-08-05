'use client';

import type { ReactNode } from 'react';
import { MotionValue, motion, useTransform } from 'framer-motion';
import { Search } from 'lucide-react';
import { SharedWithRow } from '@/components/landing/mock-viz';
import { AppFrame, Monogram, TaskRow } from '@/components/landing/product-widgets';
import { cn } from '@/lib/utils';
import { easeOut, seg, useScrubbed } from './ascent-scroll';

/**
 * The three product shots the "how it works" stepper walks through — your inputs
 * becoming a Fit Score, the catalogue search, the application plan. Widget canon
 * and copy are unchanged from the scrubbed chapters these came out of; what was
 * retuned is the pacing, because each shot now owns roughly a third of one pinned
 * band instead of a whole one, and every window that used to open with a pre-roll
 * would now spend that pre-roll as dead air.
 *
 * Two rules govern every animated value below:
 *  1. Scroll-driven `style` is gated on `scrub`, so the SSR / reduced-motion /
 *     settled frame is the finished state, never frame zero.
 *  2. Anything that has to become *text* or a *className* goes through
 *     `useScrubbed`, which returns the final value until the pin is live.
 */

export interface ShotProps {
    /** 0→1 progress of this shot's own slice of the pin travel. */
    p: MotionValue<number>;
    /** True only while the pin is live — gate every scrubbed `style` on it. */
    scrub: boolean;
}

/** Grade/filter chip that lights up once progress passes `at`. */
function ScrubChip({ p, scrub, at, children }: ShotProps & { at: number; children: ReactNode }) {
    const on = useScrubbed(p, scrub, true, (v) => v > at);
    return (
        <span
            className={cn(
                'rounded-full border px-2.5 py-1 text-[0.71875rem] tabular-nums transition-colors duration-300',
                on
                    ? 'border-primary bg-primary/[0.07] text-primary'
                    : 'border-border text-muted-foreground/70 dark:border-white/10',
            )}
        >
            {children}
        </span>
    );
}

// Tier pill treatment mirrored from product-widgets' TIER_STYLES (not exported
// there, and these rows are hand-rolled anyway — see CascadeRow).
const TIER_PILL: Record<string, string> = {
    Match: 'text-amber-700 border-amber-500/40 bg-amber-500/10 dark:text-amber-400',
    Safe: 'text-emerald-700 border-emerald-500/40 bg-emerald-500/10 dark:text-emerald-400',
    Reach: 'text-rose-700 border-rose-500/40 bg-rose-500/10 dark:text-rose-400',
};

/**
 * One cascading result row. Hand-rolled rather than `MatchCard`, because the
 * choreography needs the fit number to *count with the scrollbar* — MatchCard's
 * ProgressRing runs its own once-on-view count-up, which can't be scrubbed.
 * Markup/classes stay faithful to the MatchCard idiom.
 */
function CascadeRow({
    p,
    scrub,
    start,
    name,
    sub,
    tier,
    score,
    percent = false,
}: ShotProps & {
    /** Start of this row's 0.12-wide entrance window. */
    start: number;
    name: string;
    sub: string;
    tier: 'Safe' | 'Match' | 'Reach';
    score: number;
    percent?: boolean;
}) {
    const q = (v: number) => easeOut(seg(v, start, start + 0.12));
    const opacity = useTransform(p, q);
    const y = useTransform(p, (v) => (1 - q(v)) * 22);
    const shown = useScrubbed(p, scrub, score, (v) => Math.round(score * q(v)));

    return (
        <motion.div
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 dark:border-white/10"
            style={scrub ? { opacity, y } : undefined}
        >
            <Monogram name={name} className="h-8 w-8 rounded-lg text-[0.6875rem]" />
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold tracking-tight text-foreground">{name}</p>
                <p className="truncate text-xs text-muted-foreground">{sub}</p>
            </div>
            <span
                className={cn(
                    'shrink-0 rounded-full border px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-[0.15em]',
                    TIER_PILL[tier],
                )}
            >
                {tier}
            </span>
            <span className="shrink-0 text-[0.8125rem] font-bold tabular-nums text-primary">
                {shown}
                {percent && '%'}
            </span>
        </motion.div>
    );
}

/* ------------------------------------------------------------- 01 · fit */

const RING_R = 49;
const RING_STROKE = 9;
const RING_SIZE = 118;
const RING_CIRC = 2 * Math.PI * RING_R;
const FIT_SCORE = 92;
const fitRingQ = (v: number) => easeOut(seg(v, 0.28, 0.62));

/**
 * Step 1: three grades light up in sequence and feed one score.
 *
 * The ranked list this shot used to cascade below the ring is gone, and its
 * absence is the deliberate part: those were the same three rows step 2 shows
 * moments later, and a Fit Score is step 2's payload ("see your ranked matches")
 * — step 1 only promises "tell us where you stand". Showing the list here had
 * step 1 answering step 2's question, twice on one screen.
 */
export function FitShot({ p, scrub }: ShotProps) {
    const dashOffset = useTransform(p, (v) => RING_CIRC * (1 - (FIT_SCORE * fitRingQ(v)) / 100));
    const score = useScrubbed(p, scrub, FIT_SCORE, (v) => Math.round(FIT_SCORE * fitRingQ(v)));

    return (
        <AppFrame route="/matches">
            <div className="mb-3.5 flex flex-wrap items-center gap-1.5" aria-hidden>
                <span className="pr-0.5 text-[0.71875rem] text-muted-foreground/70">Your inputs →</span>
                <ScrubChip p={p} scrub={scrub} at={0.08}>
                    Maths HL · 6
                </ScrubChip>
                <ScrubChip p={p} scrub={scrub} at={0.18}>
                    Physics HL · 6
                </ScrubChip>
                <ScrubChip p={p} scrub={scrub} at={0.28}>
                    English SL · 5
                </ScrubChip>
            </div>

            <div className="flex items-center gap-4">
                <div
                    className="relative shrink-0"
                    style={{ width: RING_SIZE, height: RING_SIZE }}
                    role="img"
                    aria-label={`${FIT_SCORE}% fit score for MSc Aerospace Engineering at TU Delft`}
                >
                    <svg
                        width={RING_SIZE}
                        height={RING_SIZE}
                        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
                        className="-rotate-90"
                        aria-hidden
                    >
                        <circle
                            cx={RING_SIZE / 2}
                            cy={RING_SIZE / 2}
                            r={RING_R}
                            fill="none"
                            // Not stroke-border: against the card that track measures
                            // ~1.1:1, i.e. the "remaining" arc of the ring is invisible
                            // and the score reads as a floating crescent.
                            className="stroke-muted-foreground/25"
                            strokeWidth={RING_STROKE}
                        />
                        <motion.circle
                            cx={RING_SIZE / 2}
                            cy={RING_SIZE / 2}
                            r={RING_R}
                            fill="none"
                            className="stroke-primary"
                            strokeWidth={RING_STROKE}
                            strokeLinecap="round"
                            strokeDasharray={RING_CIRC}
                            strokeDashoffset={scrub ? dashOffset : RING_CIRC * (1 - FIT_SCORE / 100)}
                        />
                    </svg>
                    <div className="absolute inset-0 grid place-content-center text-center" aria-hidden>
                        <span className="text-[1.9375rem] font-bold leading-none tabular-nums text-foreground">
                            {score}
                        </span>
                        <span className="mt-1 text-[0.5625rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                            Fit Score
                        </span>
                    </div>
                </div>
                <div className="min-w-0">
                    <p className="font-heading text-base font-semibold tracking-tight text-foreground">TU Delft</p>
                    <p className="text-[0.78125rem] text-muted-foreground">
                        MSc Aerospace Engineering · <span aria-hidden>🇳🇱</span> Delft
                    </p>
                    <p className="mt-0.5 text-[0.6875rem] tabular-nums text-muted-foreground/70">
                        €18,750/yr · 2 yrs · Master’s
                    </p>
                </div>
            </div>
        </AppFrame>
    );
}

/* ------------------------------------------------------- 02 · catalogue */

const QUERY = 'aerospace engineering in europe';

export function CatalogueShot({ p, scrub }: ShotProps) {
    // Opens at 0.02, not 0.12: the old lead-in was affordable across a whole
    // chapter and is a fifth of this step's travel spent on an empty search box.
    const typed = useScrubbed(p, scrub, QUERY, (v) =>
        QUERY.slice(0, Math.round(QUERY.length * seg(v, 0.02, 0.3))),
    );
    const footOpacity = useTransform(p, (v) => seg(v, 0.88, 1));

    return (
        <AppFrame route="/university-search">
            {/* Search bar — the query types itself out against the scrollbar */}
            <div className="flex min-h-[2.5625rem] items-center gap-1 rounded-xl border border-border bg-card px-4 py-3 text-[0.84375rem] font-medium text-foreground dark:border-white/10">
                <Search className="mr-1.5 h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate whitespace-pre">{typed}</span>
                <span
                    className="h-4 w-px shrink-0 animate-pulse bg-primary motion-reduce:animate-none"
                    aria-hidden
                />
            </div>

            <div className="mt-2.5 flex flex-wrap gap-1.5" aria-hidden>
                <ScrubChip p={p} scrub={scrub} at={0.4}>
                    Netherlands
                </ScrubChip>
                <ScrubChip p={p} scrub={scrub} at={0.46}>
                    Engineering
                </ScrubChip>
                <span className="rounded-full border border-border px-2.5 py-1 text-[0.71875rem] text-muted-foreground/70 dark:border-white/10">
                    Fees &lt; €20k
                </span>
            </div>

            <div className="mt-3 space-y-2.5">
                <CascadeRow p={p} scrub={scrub} start={0.5} name="TU Delft" sub="MSc Aerospace Engineering · Jan 15 deadline" tier="Safe" score={92} percent />
                <CascadeRow p={p} scrub={scrub} start={0.61} name="Imperial College London" sub="MEng Aeronautics · Oct 13 deadline" tier="Match" score={85} percent />
                <CascadeRow p={p} scrub={scrub} start={0.72} name="ETH Zürich" sub="MSc Mechanical Eng. · Oct 27 deadline" tier="Reach" score={71} percent />
            </div>

            <motion.p
                className="mt-3 text-[0.71875rem] tabular-nums text-muted-foreground/80"
                style={scrub ? { opacity: footOpacity } : undefined}
            >
                3 of 212 matches · ordered by your fit, not a league table
            </motion.p>
        </AppFrame>
    );
}

/* ------------------------------------------------------------ 03 · plan */

/**
 * Lane position 0→2: two eased hops, one per pipeline handoff. Both hops were
 * pulled forward and widened — the chapter version idled through the first 32% of
 * travel and the last 22%, which on a third of the travel is most of the step.
 */
const laneFor = (v: number) => easeOut(seg(v, 0.1, 0.38)) + easeOut(seg(v, 0.48, 0.78));
const stageFor = (pos: number) => (pos < 0.5 ? 0 : pos < 1.5 ? 1 : 2);

const PIPELINE = [
    { label: 'Planning', fill: 'bg-amber-500 text-amber-950' },
    { label: 'In progress', fill: 'bg-primary text-primary-foreground' },
    { label: 'Submitted', fill: 'bg-emerald-500 text-emerald-950' },
];
const LANES = ['Planning', 'In progress', 'Submitted'];
const MOVER_STATUS = ['due in 6 days', 'draft 2 in review', 'submitted Oct 12 ✓'];
/** Static end frame: lane 3 of 3, i.e. two lane widths + two 8px gaps. */
const MOVER_END_X = 'calc(200% + 16px)';

export function PlanShot({ p, scrub }: ShotProps) {
    const stage = useScrubbed(p, scrub, 2, (v) => stageFor(laneFor(v)));
    const x = useTransform(p, (v) => {
        const pos = laneFor(v);
        return `calc(${pos * 100}% + ${pos * 8}px)`;
    });

    // Six live applications: 2/2/2 at rest, with the travelling essay counted in
    // whichever stage currently hosts it.
    const counts = [stage === 0 ? 2 : 1, stage === 1 ? 3 : 2, stage === 2 ? 3 : 2];
    const done = stage === 2;

    return (
        <AppFrame route="/applications">
            {/*
             * Segment share follows the counts. flex-grow is a layout property,
             * but it changes at most twice per step (on the two discrete stage
             * flips) — never per scroll frame — and the eased CSS transition
             * carries the rebalance. Everything scrubbed is transform/opacity.
             *
             * 300ms, not the chapter's 500: the two flips are ~0.35 of travel
             * apart on a third of a band, so a fast scroll fires both inside one
             * 500ms transition and the second rebalance visibly queues behind the
             * first.
             */}
            <div className="mb-3 flex h-[34px] gap-1 overflow-hidden rounded-xl" aria-hidden>
                {PIPELINE.map((stageDef, i) => (
                    <div
                        key={stageDef.label}
                        className={cn(
                            'grid place-content-center whitespace-nowrap px-2 text-[0.6875rem] font-semibold tabular-nums transition-[flex-grow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
                            stageDef.fill,
                        )}
                        style={{ flexGrow: counts[i] }}
                    >
                        {stageDef.label} {counts[i]}
                    </div>
                ))}
            </div>

            <div
                className="grid grid-cols-3 gap-2 text-[0.625rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground/70"
                aria-hidden
            >
                {LANES.map((lane) => (
                    <span key={lane}>{lane}</span>
                ))}
            </div>

            {/* Board track: one card walks Planning → In progress → Submitted */}
            <div className="relative mb-2.5 mt-2 h-[66px]">
                <motion.div
                    className={cn(
                        'absolute inset-y-0 left-0 rounded-xl border bg-card p-2.5 shadow-sm transition-colors duration-300',
                        done ? 'border-emerald-500/50' : 'border-border dark:border-white/10',
                    )}
                    style={{ width: 'calc((100% - 16px) / 3)', x: scrub ? x : MOVER_END_X }}
                >
                    {/* No programme title on the mover any more: at a third of a lane
                        it only ever fitted by wrapping to two clamped lines, and the
                        card's job is to show a piece of work CROSSING the pipeline —
                        the status line says that on its own. The two named items live
                        in the task rows below. */}
                    <span className="text-xs font-semibold leading-snug text-foreground">
                        TU Delft
                    </span>
                    <span
                        className={cn(
                            'mt-0.5 block text-[0.65625rem] tabular-nums',
                            done ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400',
                        )}
                    >
                        {MOVER_STATUS[stage]}
                    </span>
                </motion.div>
            </div>

            {/* The step's copy promises the counsellor/family loop, so the shot has
                to show it — and this is the row's only remaining home on the page. */}
            <div className="space-y-2">
                <TaskRow tone="rose" title="Scholarship essay" sub="Imperial College" due="Today" compact />
                <TaskRow tone="amber" title="Reference letter" sub="TU Delft" due="6d" compact />
                <SharedWithRow
                    people={[
                        { initials: 'MO', name: 'Ms Okonkwo', toneClass: 'bg-violet-500/10 text-violet-700 dark:text-violet-300', dotClass: 'bg-violet-500' },
                        { initials: 'D', name: 'Dad', toneClass: 'bg-sky-500/10 text-sky-700 dark:text-sky-300', dotClass: 'bg-sky-500' },
                    ]}
                />
            </div>
        </AppFrame>
    );
}
