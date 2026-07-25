'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import { MotionValue, motion, useScroll, useSpring, useTransform } from 'framer-motion';
import { ArrowRight, Check, X } from 'lucide-react';
import { MatchCard, TaskRow } from '@/components/landing/product-widgets';
import { PipelineBar, TierTiles } from '@/components/landing/mock-viz';
import { SCENE_SPRING, useLatchedProgress, useMotionReady } from './ascent-scroll';

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

// Positions form an overlapping diagonal "pile" on md+ (fills the box instead of
// pinning cards to empty corners); on mobile they render as a plain stacked list.
// The `top` percentages resolve against the chaos box, which no longer has a fixed
// 400px height — it stretches to the answers column (~440px), so the tops are
// spread 3%→72% rather than the old 3%→68%: at the old values the extra height all
// landed as dead space under the last note. A note is ~85px tall, so ~72% is the
// deepest top that still keeps the bottom edge inside the box.
// `rotate` is the note's final tilt as a number: the md: rotate class still ships
// for static/reduced-motion users, but once scrubbing takes over the inline
// transform owns the whole rotation (base + scatter), since an inline transform
// replaces Tailwind's.
// `scatter` is the extra [x, y, rotate] the note settles *from* as the scrub runs.
const chaosNotes = [
    {
        h: 'Rankings',
        body: 'League table says one thing, the forum says another.',
        pos: 'md:left-[5%] md:top-[3%] md:z-10 md:-rotate-[5deg]',
        rotate: -5,
        scatter: [-60, -50, -16] as const,
    },
    {
        h: 'Everywhere',
        body: '40 tabs, 3 spreadsheets, a notes app.',
        pos: 'md:left-[34%] md:top-[26%] md:z-30 md:rotate-[3deg]',
        rotate: 3,
        scatter: [70, -30, 14] as const,
    },
    {
        h: 'Too late',
        body: 'Found out about the deadline the day it closed.',
        pos: 'md:left-[8%] md:top-[49%] md:z-20 md:-rotate-[2deg]',
        rotate: -2,
        scatter: [-70, 40, -12] as const,
    },
    {
        h: 'Vague',
        body: '“Just apply broadly and see what happens.”',
        pos: 'md:left-[33%] md:top-[72%] md:z-40 md:rotate-[4deg]',
        rotate: 4,
        scatter: [60, 60, 15] as const,
    },
];

/**
 * Matches the `md:` breakpoint the pile layout switches at. Resolved post-mount
 * only, and only ever consulted alongside the `ready` gate — so SSR markup is
 * unaffected. Recomputed on change, so no stale transform closures after resize.
 */
function useDesktopPile() {
    const [isDesktop, setIsDesktop] = useState(false);
    useEffect(() => {
        const mq = window.matchMedia('(min-width: 768px)');
        const sync = () => setIsDesktop(mq.matches);
        sync();
        mq.addEventListener('change', sync);
        return () => mq.removeEventListener('change', sync);
    }, []);
    return isDesktop;
}

/**
 * One chaos note. Desktop: settles from a scattered offset/tilt into its final
 * pile position. Mobile: a plain 18px lift on the inner wrapper. The two live on
 * different elements so neither branch can leave a stale transform behind.
 */
function ChaosNote({
    note,
    index,
    p,
    ready,
    isDesktop,
}: {
    note: (typeof chaosNotes)[number];
    index: number;
    p: MotionValue<number>;
    ready: boolean;
    isDesktop: boolean;
}) {
    const start = index * 0.08;
    const q = useTransform(p, [start, start + 0.6], [0, 1], { clamp: true, ease: easeOutCubic });
    const x = useTransform(q, (v) => note.scatter[0] * (1 - v));
    const y = useTransform(q, (v) => note.scatter[1] * (1 - v));
    const rotate = useTransform(q, (v) => note.rotate + note.scatter[2] * (1 - v));
    const stackY = useTransform(q, (v) => (1 - v) * 18);
    const opacity = useTransform(q, (v) => 0.2 + v * 0.8);

    return (
        <motion.div
            className={`rounded-xl border border-border bg-card p-3.5 text-[0.8125rem] font-medium leading-snug shadow-lg dark:border-white/10 md:absolute md:max-w-[236px] ${note.pos}`}
            style={ready ? (isDesktop ? { opacity, x, y, rotate } : { opacity }) : undefined}
        >
            <motion.div style={ready && !isDesktop ? { y: stackY } : undefined}>
                <span className="mb-1 block text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-rose-700 dark:text-rose-400">
                    {note.h}
                </span>
                {note.body}
            </motion.div>
        </motion.div>
    );
}

/** Rebuttal panel: slides in from the right, staggered behind the pile settling. */
function RebuttalPanel({
    index,
    p,
    ready,
    className,
    children,
}: {
    index: number;
    p: MotionValue<number>;
    ready: boolean;
    className: string;
    children: ReactNode;
}) {
    const q = useTransform(p, [0.25 + index * 0.11, 0.55 + index * 0.11], [0, 1], {
        clamp: true,
        ease: easeOutCubic,
    });
    const x = useTransform(q, (v) => (1 - v) * 26);

    return (
        <motion.div className={className} style={ready ? { opacity: q, x } : undefined}>
            {children}
        </motion.div>
    );
}

// Each chaos pain gets a direct product answer in the same order: the eyebrow
// strikes the pain word and names the answer, so the 1:1 mapping reads even
// though the left pile is scattered.
function RebuttalEyebrow({ pain, answer }: { pain: string; answer: string }) {
    return (
        <p className="mb-2 text-[0.6875rem] font-bold uppercase tracking-[0.1em]">
            <s className="mr-1.5 text-rose-700 line-through decoration-2 dark:text-rose-400">{pain}</s>
            <span className="text-emerald-700 dark:text-emerald-400">→ {answer}</span>
        </p>
    );
}

const PANEL_BASE = 'rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04]';

/**
 * "Same student. Different year." with the mock's scrub-settle motion: the chaos
 * pile flies in from a scatter and settles into place as the section rises through
 * the viewport, while the answers slide in from the right behind it.
 *
 * Not a pinned scene — the scrub rides the section's normal travel (start end →
 * center 0.75, i.e. settled before the section reaches the middle) so the layout
 * matches the static comparison grid it replaced. The travel is latched one-way,
 * so a settled pile stays settled when the user scrolls back up. Static and
 * reduced-motion users see the settled final state (the `md:` position and
 * rotation classes carry it).
 */
export function ComparisonSettle() {
    const sectionRef = useRef<HTMLElement>(null);
    const { scrollYProgress } = useScroll({
        target: sectionRef,
        offset: ['start end', 'center 0.75'],
    });
    // Latch the RAW progress, then spring it — latching the spring's output would
    // freeze its overshoot as the permanent maximum.
    const p = useSpring(useLatchedProgress(scrollYProgress), SCENE_SPRING);
    const ready = useMotionReady();
    const isDesktop = useDesktopPile();

    return (
        <section ref={sectionRef} className="section-fade w-full bg-secondary/40 py-24 sm:py-32">
            <div className="max-w-7xl mx-auto px-6">
                <div className="max-w-2xl space-y-3">
                    <p className="text-sm font-medium uppercase tracking-widest text-primary/80">With &amp; without Ascenda</p>
                    <h2 className="text-3xl md:text-4xl font-heading font-bold text-foreground tracking-tight">
                        Same student. Different year.
                    </h2>
                </div>

                {/* items-stretch (not items-center): the right column's four panels
                    are the tallest cell, so they define the row height and the
                    chaos box grows to match it — the two sides read as one pair of
                    equal boxes instead of a short box beside a tall stack. */}
                <div className="mt-12 grid items-stretch gap-8 md:grid-cols-[1fr_auto_1fr] md:gap-6">
                    {/* Without — chaos */}
                    <div className="flex flex-col">
                        {/* self-start: the wrapper is now a flex column, whose default
                            stretch would blow this pill out to the full column width. */}
                        <span className="mb-4 inline-flex self-start items-center gap-2 rounded-full bg-rose-500/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.05em] text-rose-700 dark:text-rose-400">
                            <X className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
                            Without Ascenda
                        </span>
                        {/* Mobile: a plain stacked list. md+: absolutely-positioned, rotated "mess".
                            md:flex-1 replaces the old fixed md:h-[400px] — the box now takes
                            whatever height the answers column sets, so the note `pos`
                            percentages below resolve against a taller box. */}
                        <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-rose-500/30 bg-rose-500/[0.04] p-4 md:relative md:block md:flex-1 md:overflow-hidden md:p-0">
                            {/* faint stack of browser tabs behind the pile (scatter only) */}
                            <div className="absolute right-[6%] top-[42%] hidden -rotate-6 gap-1.5 opacity-40 md:flex">
                                {[0, 1, 2, 3].map((i) => (
                                    <span key={i} className="h-[30px] w-[50px] rounded-t-md border border-b-0 border-border bg-muted/60" />
                                ))}
                            </div>
                            {chaosNotes.map((note, i) => (
                                <ChaosNote
                                    key={note.h}
                                    note={note}
                                    index={i}
                                    p={p}
                                    ready={ready}
                                    isDesktop={isDesktop}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Arrow — self-center so it stays on the row's midline now that
                        the two columns stretch to full height. */}
                    <div className="grid place-items-center self-center">
                        <span className="grid h-11 w-11 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-md max-md:rotate-90">
                            <ArrowRight className="h-5 w-5" aria-hidden />
                        </span>
                    </div>

                    {/* With — the same four pains, answered by the product. This
                        column's natural height is what the row (and so the chaos
                        box opposite) is sized from. */}
                    <div className="flex flex-col">
                        {/* self-start — same flex-column stretch caveat as the pill opposite. */}
                        <span className="mb-4 inline-flex self-start items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.05em] text-emerald-700 dark:text-emerald-400">
                            <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
                            With Ascenda
                        </span>
                        <div className="flex flex-col gap-3">
                            <RebuttalPanel index={0} p={p} ready={ready} className={`${PANEL_BASE} p-3`}>
                                <RebuttalEyebrow pain="Rankings" answer="Scored to you" />
                                <MatchCard name="TU Delft" sub="MSc Aerospace Engineering" location="Netherlands" score={92} compact />
                            </RebuttalPanel>
                            <RebuttalPanel index={1} p={p} ready={ready} className={`${PANEL_BASE} p-3.5`}>
                                <RebuttalEyebrow pain="40 tabs" answer="One workspace" />
                                <PipelineBar
                                    stages={[
                                        { label: 'Planning', count: 1, colorClass: 'bg-slate-400' },
                                        { label: 'In progress', count: 3, colorClass: 'bg-sky-500' },
                                        { label: 'Submitted', count: 2, colorClass: 'bg-emerald-500' },
                                    ]}
                                />
                            </RebuttalPanel>
                            <RebuttalPanel index={2} p={p} ready={ready} className={`${PANEL_BASE} p-3`}>
                                <RebuttalEyebrow pain="Too late" answer="Deadlines find you first" />
                                <TaskRow tone="emerald" title="UCAS submission" sub="Flagged 3 weeks out" due="21d" compact />
                            </RebuttalPanel>
                            <RebuttalPanel index={3} p={p} ready={ready} className={`${PANEL_BASE} p-3.5`}>
                                <RebuttalEyebrow pain="“Apply broadly”" answer="A real strategy" />
                                <TierTiles counts={{ safety: 1, match: 1, reach: 1 }} />
                            </RebuttalPanel>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
