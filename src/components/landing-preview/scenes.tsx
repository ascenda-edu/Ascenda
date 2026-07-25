'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { MotionValue, motion, useMotionValueEvent, useTransform } from 'framer-motion';
import { Search } from 'lucide-react';
import { AppFrame, Monogram, TaskRow } from '@/components/landing/product-widgets';
import { cn } from '@/lib/utils';
import { PinnedScene, type SceneCtx } from './ascent-scroll';

/**
 * The three scrubbed chapters of "The Ascent" — Fit Score, the catalogue, your
 * plan. Copy and widget canon come from the features section this replaced; the
 * only new thing here is the choreography: each widget *performs* its story as
 * you scroll through the pinned scene rather than fading in whole.
 *
 * Two rules govern every animated value below:
 *  1. Scroll-driven `style` is gated on `useMotionReady()` (see ascent-scroll)
 *     so the SSR/reduced-motion frame is the finished state, never frame zero.
 *  2. Anything that has to become *text* or a *className* goes through
 *     `useScrubbed`, which returns the final value until motion is ready.
 */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Normalised 0→1 progress of the [a, b] slice of a scene's travel. */
const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Derive React state from a scroll MotionValue. Used only for values that can't
 * be a MotionValue — text content and conditional classNames. `final` is what
 * SSR and reduced-motion users see, so the static frame is the end of the story.
 */
function useScrubbed<T>(p: MotionValue<number>, ready: boolean, final: T, compute: (v: number) => T): T {
    const [value, setValue] = useState<T>(final);
    const computeRef = useRef(compute);
    computeRef.current = compute;
    const readyRef = useRef(ready);
    readyRef.current = ready;

    // Stable callback: useMotionValueEvent re-subscribes whenever the callback
    // identity changes, and these components re-render on every scroll frame.
    const update = useCallback((v: number) => {
        if (readyRef.current) setValue(computeRef.current(v));
    }, []);

    useMotionValueEvent(p, 'change', update);
    // Seed from the current scroll position: `change` only fires on movement, so
    // a scene entered without scrolling (deep link, restored position) needs this.
    useEffect(() => {
        if (ready) update(p.get());
    }, [p, ready, update]);

    return ready ? value : final;
}

/** Grade/filter chip that lights up once progress passes `at`. */
function ScrubChip({
    p,
    ready,
    at,
    children,
}: {
    p: MotionValue<number>;
    ready: boolean;
    at: number;
    children: ReactNode;
}) {
    const on = useScrubbed(p, ready, true, (v) => v > at);
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
    ready,
    start,
    name,
    sub,
    tier,
    score,
    percent = false,
}: {
    p: MotionValue<number>;
    ready: boolean;
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
    const shown = useScrubbed(p, ready, score, (v) => Math.round(score * q(v)));

    return (
        <motion.div
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 dark:border-white/10"
            style={ready ? { opacity, y } : undefined}
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

/* ------------------------------------------------------------------ intro */

export function ChapterIntro() {
    return (
        <section
            id="features"
            className="w-full scroll-mt-14 bg-secondary/40 pb-10 pt-24 sm:pb-12 sm:pt-32"
        >
            <motion.div
                className="mx-auto max-w-7xl px-6"
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-100px' }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
                <span className="inline-flex rounded-full border border-primary/30 bg-primary/[0.08] px-3 py-1 font-heading text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-primary">
                    Inside Ascenda
                </span>
                <h2 className="mt-4 max-w-3xl font-heading text-4xl font-bold tracking-tight text-foreground md:text-5xl">
                    From a blank shortlist to a submitted application.
                </h2>
                <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                    Three chapters — your Fit Score, the catalogue, your plan. Scroll through each one.
                </p>
            </motion.div>
        </section>
    );
}

/* ------------------------------------------------------------- 01 · fit */

const RING_R = 49;
const RING_STROKE = 9;
const RING_SIZE = 118;
const RING_CIRC = 2 * Math.PI * RING_R;
const FIT_SCORE = 92;
const fitRingQ = (v: number) => easeOut(seg(v, 0.34, 0.58));

function FitShot({ p, ready }: SceneCtx) {
    const dashOffset = useTransform(p, (v) => RING_CIRC * (1 - (FIT_SCORE * fitRingQ(v)) / 100));
    const score = useScrubbed(p, ready, FIT_SCORE, (v) => Math.round(FIT_SCORE * fitRingQ(v)));

    return (
        <AppFrame route="/matches">
            {/* Inputs → score: the grades light up in sequence, then feed the ring */}
            <div className="mb-3.5 flex flex-wrap items-center gap-1.5" aria-hidden>
                <span className="pr-0.5 text-[0.71875rem] text-muted-foreground/70">Your inputs →</span>
                <ScrubChip p={p} ready={ready} at={0.2}>
                    Maths HL · 6
                </ScrubChip>
                <ScrubChip p={p} ready={ready} at={0.27}>
                    Physics HL · 6
                </ScrubChip>
                <ScrubChip p={p} ready={ready} at={0.34}>
                    English SL · 5
                </ScrubChip>
            </div>

            <div className="flex items-center gap-4 pb-3.5">
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
                            className="stroke-border"
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
                            strokeDashoffset={ready ? dashOffset : RING_CIRC * (1 - FIT_SCORE / 100)}
                        />
                    </svg>
                    <div className="absolute inset-0 grid place-content-center text-center font-heading" aria-hidden>
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

            <div className="space-y-2.5">
                <CascadeRow p={p} ready={ready} start={0.58} name="TU Delft" sub="MSc Aerospace Engineering" tier="Safe" score={92} />
                <CascadeRow p={p} ready={ready} start={0.69} name="Imperial College London" sub="MEng Aeronautics" tier="Match" score={85} />
                <CascadeRow p={p} ready={ready} start={0.8} name="ETH Zürich" sub="MSc Mechanical Engineering" tier="Reach" score={71} />
            </div>
        </AppFrame>
    );
}

export function SceneFit() {
    return (
        <PinnedScene
            chapter={{ num: '01', of: '03', label: 'Fit Score' }}
            ghost="01 — FIT SCORE"
            ghostDrift={-0.5}
            alt
            pinVh={250}
            title={
                <>
                    See exactly{' '}
                    <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                        where you stand.
                    </span>
                </>
            }
            body="Every programme scored against your grades, subjects and goals — sorted into reach, match and safe, with your admission odds on each card."
            chips={['Reach / match / safe', 'Recalculates as your profile grows']}
            cue="Your grades feed the score"
            shot={(ctx) => <FitShot {...ctx} />}
        />
    );
}

/* ------------------------------------------------------- 02 · catalogue */

const QUERY = 'aerospace engineering in europe';

function CatalogueShot({ p, ready }: SceneCtx) {
    const typed = useScrubbed(p, ready, QUERY, (v) =>
        QUERY.slice(0, Math.round(QUERY.length * seg(v, 0.12, 0.36))),
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
                <ScrubChip p={p} ready={ready} at={0.4}>
                    Netherlands
                </ScrubChip>
                <ScrubChip p={p} ready={ready} at={0.46}>
                    Engineering
                </ScrubChip>
                <span className="rounded-full border border-border px-2.5 py-1 text-[0.71875rem] text-muted-foreground/70 dark:border-white/10">
                    Fees &lt; €20k
                </span>
            </div>

            <div className="mt-3 space-y-2.5">
                <CascadeRow p={p} ready={ready} start={0.5} name="TU Delft" sub="MSc Aerospace Engineering · Jan 15 deadline" tier="Safe" score={92} percent />
                <CascadeRow p={p} ready={ready} start={0.61} name="Imperial College London" sub="MEng Aeronautics · Oct 13 deadline" tier="Match" score={85} percent />
                <CascadeRow p={p} ready={ready} start={0.72} name="ETH Zürich" sub="MSc Mechanical Eng. · Oct 27 deadline" tier="Reach" score={71} percent />
            </div>

            <motion.p
                className="mt-3 text-[0.71875rem] tabular-nums text-muted-foreground/80"
                style={ready ? { opacity: footOpacity } : undefined}
            >
                3 of 212 matches · ordered by your fit, not a league table
            </motion.p>
        </AppFrame>
    );
}

export function SceneCatalogue() {
    return (
        <PinnedScene
            chapter={{ num: '02', of: '03', label: 'The catalogue' }}
            ghost="02 — THE CATALOGUE"
            ghostDrift={0.5}
            flip
            pinVh={260}
            title={
                <>
                    Every programme,{' '}
                    <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                        one search.
                    </span>
                </>
            }
            body="119,000+ courses, one search. Filter by country, subject and the life you want — and see your fit before you shortlist."
            chips={['119,000+ programmes', 'Fit preview on every result']}
            cue="Watch the search run itself"
            shot={(ctx) => <CatalogueShot {...ctx} />}
        />
    );
}

/* ------------------------------------------------------------ 03 · plan */

/** Lane position 0→2: two eased hops, one per pipeline handoff. */
const laneFor = (v: number) => easeOut(seg(v, 0.32, 0.5)) + easeOut(seg(v, 0.6, 0.78));
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

function PlanShot({ p, ready }: SceneCtx) {
    const stage = useScrubbed(p, ready, 2, (v) => stageFor(laneFor(v)));
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
             * but it changes at most twice per scene (on the two discrete stage
             * flips) — never per scroll frame — and the eased CSS transition
             * carries the rebalance. Everything scrubbed is transform/opacity.
             */}
            <div className="mb-3 flex h-[34px] gap-1 overflow-hidden rounded-xl" aria-hidden>
                {PIPELINE.map((stageDef, i) => (
                    <div
                        key={stageDef.label}
                        className={cn(
                            'grid place-content-center whitespace-nowrap px-2 font-heading text-[0.6875rem] font-semibold tabular-nums transition-[flex-grow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
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
                    style={{ width: 'calc((100% - 16px) / 3)', x: ready ? x : MOVER_END_X }}
                >
                    <span className="block font-heading text-xs font-semibold leading-snug text-foreground">
                        Motivation letter — TU Delft
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

            <div className="space-y-2">
                <TaskRow tone="rose" title="Scholarship essay" sub="Imperial College" due="Today" compact />
                <TaskRow tone="amber" title="Reference letter" sub="TU Delft" due="6d" compact />
            </div>
        </AppFrame>
    );
}

export function ScenePlan() {
    return (
        <PinnedScene
            chapter={{ num: '03', of: '03', label: 'Your plan' }}
            ghost="03 — YOUR PLAN"
            ghostDrift={-0.4}
            alt
            pinVh={260}
            title={
                <>
                    A plan that{' '}
                    <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                        keeps you moving.
                    </span>
                </>
            }
            body="Essays, references and deadlines tracked per application — the most urgent thing always on top."
            chips={['Per-application tracking', 'Counsellor built in']}
            cue="Scroll to push the essay through"
            shot={(ctx) => <PlanShot {...ctx} />}
        />
    );
}
