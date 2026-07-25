'use client';

import type { ReactNode } from 'react';
import { MotionValue, motion, useMotionValue, useTransform } from 'framer-motion';
import { ScrollRevealHeading } from '@/components/landing/scroll-reveal-heading';
import { AnimatedSection } from '@/components/layout/animated-section';
import { cn } from '@/lib/utils';
import { useScrubbed } from './ascent-scroll';
import { PinnedStage, type PinnedStageCtx } from './pinned-stage';
import { CatalogueShot, FitShot, PlanShot, type ShotProps } from './step-shots';

/**
 * "How it works" — one section, two presentations of the same three steps.
 *
 * `StepGrid` is the resting tree: the three-card grid this section has always
 * shipped, and what SSR, no-JS, reduced-motion, mobile and anyone arriving from
 * below get. `StepStage` is the pinned excursion: one screen where the step list
 * holds still and the product shot cross-dissolves from step to step as the pin
 * scrubs.
 *
 * Two presentations rather than one, because the scrub's last frame shows only
 * step 3's shot — a frame that hides two thirds of the section is not a resting
 * state to leave anyone on. That is exactly the case PinnedStage's `settled` prop
 * exists for.
 */

const EYEBROW = 'How it works';
const HEADING = 'Three steps from sign-up to a plan you can share.';
/** Shared so the two presentations of the same heading cannot drift apart. */
const HEADING_CLASS = 'text-3xl md:text-4xl font-heading font-bold text-foreground tracking-tight';

const NUMBER_GRADIENTS = [
    'from-indigo-500 to-violet-500',
    'from-violet-500 to-sky-400',
    'from-sky-400 to-emerald-400',
];

interface Step {
    id: string;
    num: string;
    lab: string;
    title: string;
    copy: string;
    /** Concrete claims, re-homed from the deleted chapters so they stay on the page. */
    chips: string[];
    /** This step's slice of the pin travel. Boundaries are the flip points below. */
    window: [number, number];
    Shot: (props: ShotProps) => ReactNode;
}

const STEPS: Step[] = [
    {
        id: 'profile',
        num: '1',
        lab: 'Set up once',
        title: 'Tell us where you stand',
        copy: 'Predicted grades, subjects and what you want from a place. Five minutes, once.',
        chips: ['Reach / match / safe', 'Recalculates as your profile grows'],
        window: [0.08, 0.34],
        Shot: FitShot,
    },
    {
        id: 'matches',
        num: '2',
        lab: 'Explore',
        title: 'See your ranked matches',
        copy: 'Fit Scores and admission odds, ordered by what suits you — not a league table.',
        chips: ['119,000+ programmes', 'Fit preview on every result'],
        window: [0.34, 0.68],
        Shot: CatalogueShot,
    },
    {
        id: 'plan',
        num: '3',
        lab: 'Act',
        title: 'Build & share your plan',
        copy: 'Auto-timelines for essays and deadlines — shared with your counsellor and family in a tap.',
        chips: ['Per-application tracking', 'Counsellor built in'],
        window: [0.68, 0.92],
        Shot: PlanShot,
    },
];

/**
 * Which row is lit, in pin progress. The flip points are the window boundaries —
 * i.e. the centres of the cross-fades below — so the list and the visual change on
 * the same frame instead of one leading the other.
 */
const stepAt = (v: number) => (v < 0.34 ? 0 : v < 0.68 ? 1 : 2);

/** Half-width of the dissolve either side of a window boundary. */
const FADE = 0.02;

/**
 * Cross-fade keyframes for step `index`, as [input, output]. Step 1 is already on
 * screen when the pin arms — the stage's own entrance brings it in, so it has no
 * fade-in of its own — and the last step never fades out, because its frame is
 * where the scrub ends.
 */
function fadeKeyframes(index: number, [a, b]: [number, number]): [number[], number[]] {
    const input = index === 0 ? [0] : [a - FADE, a + FADE];
    const output = index === 0 ? [1] : [0, 1];
    if (index === STEPS.length - 1) return [[...input, 1], [...output, 1]];
    return [
        [...input, b - FADE, b + FADE],
        [...output, 1, 0],
    ];
}

/** The chip idiom the deleted chapters used — pill, hairline border, emerald tick. */
function StepChips({ chips, className }: { chips: string[]; className?: string }) {
    return (
        <div className={cn('flex flex-wrap gap-2', className)}>
            {chips.map((chip) => (
                <span
                    key={chip}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground dark:border-white/10"
                >
                    <span aria-hidden className="text-[0.6875rem] font-bold text-emerald-600 dark:text-emerald-400">
                        ✓
                    </span>
                    {chip}
                </span>
            ))}
        </div>
    );
}

/* ------------------------------------------------------ settled: the grid */

/**
 * The resting presentation. `p` exists only to satisfy `ShotProps`: at
 * `scrub={false}` every shot renders its static final frame and never reads it.
 */
function StepGrid({ p, afterPin }: { p: MotionValue<number>; afterPin: boolean }) {
    // After the pin, this whole tree mounts above the viewport, where a whileInView
    // entrance never fires — the visitor scrolling back up would meet ~300px of empty
    // section before the cards caught up, and the branch's own rule is that finished
    // content stays finished. So the entrances only exist on the first mount, where
    // the section really is being met for the first time.
    const Header = afterPin ? 'div' : AnimatedSection;
    return (
        <div className="w-full py-24 sm:py-32">
            <div className="max-w-7xl mx-auto px-6">
                <Header className="max-w-2xl space-y-4 mb-10">
                    <p className="text-sm font-medium uppercase tracking-widest text-primary/80">{EYEBROW}</p>
                    <ScrollRevealHeading as="h2" className={HEADING_CLASS}>
                        {HEADING}
                    </ScrollRevealHeading>
                </Header>

                {/* lg, not md: these are the chapters' shots, drawn for a ~600px column.
                    Three across at 768-1023px leaves ~182px of content width, where the
                    route bar, the ranked rows' tier pills and the plan pipeline all
                    overflow. Stacked, each card gets the full width instead. */}
                {/* grid-cols-[minmax(0,1fr)] on the single-column base, not the implicit
                    `auto` track: these shots have a wide min-content (the catalogue's
                    result rows measure 467px), and an auto track sizes to it — on a
                    375px phone every card was 467px wide with ~92px sliced off and
                    unreachable, since the page itself never scrolls sideways. */}
                <div className="grid grid-cols-[minmax(0,1fr)] gap-y-12 gap-x-6 lg:grid-cols-3">
                    {STEPS.map((step, index) => (
                        <motion.div
                            key={step.id}
                            // min-w-0: a grid item's default min-width is auto, which
                            // would reintroduce the min-content blowout inside the track.
                            className="relative min-w-0"
                            initial={afterPin ? false : { opacity: 0, y: 24 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, amount: 0.3 }}
                            transition={{ duration: 0.4, delay: index * 0.08 }}
                        >
                            {/* Right, not left: these shots carry AppFrame's route bar,
                                whose traffic lights sit in the top-left corner the badge
                                used to occupy. */}
                            <span
                                aria-hidden
                                className={cn(
                                    'absolute -right-1.5 -top-3.5 z-10 grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br text-sm font-bold text-white shadow-lg',
                                    NUMBER_GRADIENTS[index],
                                )}
                            >
                                {step.num}
                            </span>
                            <step.Shot p={p} scrub={false} />
                            <p className="mt-4 text-xs font-bold uppercase tracking-[0.12em] text-primary">{step.lab}</p>
                            <h3 className="mt-1.5 text-xl font-heading font-bold tracking-tight text-foreground">
                                {step.title}
                            </h3>
                            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.copy}</p>
                            <StepChips chips={step.chips} className="mt-3" />
                        </motion.div>
                    ))}
                </div>
            </div>
        </div>
    );
}

/* ------------------------------------------------------- pinned: the stage */

/**
 * One row of the pinned list. Every row is permanently mounted and only its
 * treatment changes, so no text ever appears or disappears mid-scrub and the
 * accessibility tree is identical on every frame.
 */
function StepRow({ step, active }: { step: Step; active: boolean }) {
    return (
        <li
            className={cn(
                'grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 transition-opacity duration-300',
                // opacity-50, not 45: Tailwind's opacity scale has no 45, so that
                // class emitted no rule at all and the inactive rows read exactly as
                // loud as the lit one.
                active ? 'opacity-100' : 'opacity-50',
            )}
        >
            {/* Decorative: the <ol> already numbers these for assistive tech. */}
            <span
                aria-hidden
                className={cn(
                    'font-heading text-2xl font-bold leading-none tabular-nums transition-colors duration-300',
                    active ? 'text-primary' : 'text-muted-foreground',
                )}
            >
                {step.num}
            </span>
            <div>
                <p
                    className={cn(
                        'text-xs font-bold uppercase tracking-[0.12em] transition-colors duration-300',
                        active ? 'text-primary' : 'text-muted-foreground',
                    )}
                >
                    {step.lab}
                </p>
                <h3 className="mt-1 font-heading text-lg font-bold tracking-tight text-foreground">{step.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.copy}</p>
                <StepChips chips={step.chips} className="mt-2.5" />
            </div>
        </li>
    );
}

/**
 * The lit row. A leaf because it is the only thing here holding React state:
 * `useScrubbed` re-renders on each flip, and owning it at this depth keeps the
 * three shots out of that reconciliation.
 *
 * `final` is the LAST step, per the house convention that the static frame is the
 * end of the story — though only the pinned tree ever renders this list, so that
 * value is never actually what a visitor lands on.
 */
function StepList({ p, scrub }: PinnedStageCtx) {
    const active = useScrubbed(p, scrub, STEPS.length - 1, stepAt);
    return (
        // role="list" is not redundant: Tailwind's preflight sets list-style: none,
        // and Safari/VoiceOver drops list semantics entirely from an unstyled list —
        // which would silence the only numbering assistive tech gets here, since the
        // visible numerals are aria-hidden.
        <ol role="list" className="mt-7 space-y-5">
            {STEPS.map((step, index) => (
                <StepRow key={step.id} step={step} active={index === active} />
            ))}
        </ol>
    );
}

/**
 * One shot in the stacked visual column. A leaf so that each step's derived values
 * have their own fixed hook order, whichever step happens to be live.
 */
function StepVisual({ p, scrub, index, step }: PinnedStageCtx & { index: number; step: Step }) {
    const [fadeInput, fadeOutput] = fadeKeyframes(index, step.window);
    // The shot's own 0→1 choreography progress. Deliberately NOT re-sprung: `p`
    // arrives already sprung from PinnedStage, and a second spring on top is the
    // floaty double inertia SCENE_SPRING was tuned to avoid.
    const local = useTransform(p, step.window, [0, 1], { clamp: true });
    const opacity = useTransform(p, fadeInput, fadeOutput);

    return (
        <motion.div
            // All three stay in flow, in one cell: the cell sizes to the tallest
            // shot and then never changes height. A height change inside a sticky
            // stage mid-scrub would re-measure the pin travel and jump the scrub.
            // self-center, not self-start: FitShot is ~170px shorter than the other
            // two (its ranked rows moved to step 2), and top-aligning it in the
            // shared cell left step 1 hanging above a slab of dead space while the
            // outer items-center kept the text centred against the full cell.
            className="col-start-1 row-start-1 self-center"
            // Un-scrubbed, only the last step shows — the same end-of-the-story
            // contract the shots follow. Nothing renders this stage un-pinned
            // today; the fallback is what stops three shots stacking if that ever
            // changes.
            style={{ opacity: scrub ? opacity : index === STEPS.length - 1 ? 1 : 0 }}
        >
            <step.Shot p={local} scrub={scrub} />
        </motion.div>
    );
}

function StepStage({ p, scrub }: PinnedStageCtx) {
    return (
        // No entrance animation, deliberately. `p` is 0 at the top of the section,
        // which is exactly where an anchor lands — and `#how-it-works` is a nav link,
        // the hero's secondary CTA and an inbound-link target. A fade keyed to the
        // first slice of travel therefore greeted every one of those visitors with a
        // blank screen until they scrolled. The stage needs no entrance anyway: until
        // the pin engages it rides at the section top and scrolls into view normally,
        // which is also what lets the heading's word reveal play where it can be seen.
        <div className="mx-auto w-full max-w-7xl px-6">
            <div className="grid items-center gap-10 lg:gap-16 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
                <div className="max-w-xl">
                    {/* No AnimatedSection: the stage entrance above already carries it. */}
                    <p className="text-sm font-medium uppercase tracking-widest text-primary/80">{EYEBROW}</p>
                    <ScrollRevealHeading as="h2" className={cn('mt-4', HEADING_CLASS)}>
                        {HEADING}
                    </ScrollRevealHeading>
                    <StepList p={p} scrub={scrub} />
                </div>
                {/* The list carries the meaning, and three shots overlap mid-dissolve —
                    FitShot's role="img" alone would be announced three times over. */}
                <div className="pointer-events-none grid grid-cols-[minmax(0,1fr)]" aria-hidden>
                    {STEPS.map((step, index) => (
                        <StepVisual key={step.id} p={p} scrub={scrub} index={index} step={step} />
                    ))}
                </div>
            </div>
        </div>
    );
}

export function HowItWorksScrub() {
    // A stable 1 for the settled grid: `useScrubbed(p, false, …)` returns its final
    // value whatever `p` holds, and 1 is the honest reading of that frame — the end
    // of the choreography.
    const staticP = useMotionValue(1);

    return (
        // Both gates are measured, not inherited. Width 1280: the stage's two columns
        // are `lg:`, and at 1024-1279 the heading wraps to three lines and the whole
        // stack measures ~712px — which fits 720px of viewport only if you ignore the
        // 53px fixed nav sitting on top of it, and it doesn't: the eyebrow lands
        // entirely underneath. Height 768: at 1280 the content measures ~597px, which
        // clears the nav with room to spare. Everything under either gate keeps the
        // grid, unpinned — which is now a correct layout at every width.
        <PinnedStage
            id="how-it-works"
            className="scroll-mt-14 bg-background"
            // py-14 so `items-center` centres the stage in the space BELOW the fixed
            // nav rather than in the raw viewport.
            stageClassName="py-14"
            // 240, not 300: the stage plays forward once and then holds, so every svh
            // of travel is also svh a visitor has to scroll back through if they turn
            // around inside it. 140svh of scrub is enough for the three steps.
            pinVh={240}
            pinQuery="(min-width: 1280px) and (min-height: 768px)"
            settled={({ afterPin }) => <StepGrid p={staticP} afterPin={afterPin} />}
        >
            {/* Invoked inside a conditional branch — one component, no hooks here. */}
            {({ p, scrub }) => <StepStage p={p} scrub={scrub} />}
        </PinnedStage>
    );
}
