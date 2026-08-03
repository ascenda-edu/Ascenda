'use client';

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { MotionValue, motion, useMotionValue, useTransform } from 'framer-motion';
import { ScrollRevealHeading } from '@/components/landing/scroll-reveal-heading';
import { AnimatedSection } from '@/components/layout/animated-section';
import { cn } from '@/lib/utils';
import { seg, useScrubbed } from './ascent-scroll';
import { PinnedStage, type PinnedStageCtx } from './pinned-stage';
import { CatalogueShot, FitShot, PlanShot, type ShotProps } from './step-shots';

/**
 * "How it works" — one section, one set of three step cards, two arrangements.
 *
 * `StepGrid` is the resting tree: the three-card grid this section has always
 * shipped, and what SSR, no-JS, reduced-motion, mobile and anyone arriving from
 * below get. `StepMorph` is the pinned excursion, and it renders THE SAME cards —
 * the stepper is those cards displaced, and the converge is the displacement
 * relaxing to nothing. Nobody cross-fades into anybody.
 *
 * A second tree rather than reusing this one, because the scrub's last frame is
 * still inside a 240svh pin: PinnedStage's `settled` prop is what gets the visitor
 * off that and onto a normal-length section, and the two trees are built to land
 * on the same geometry so the swap has nothing to give away.
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
        window: [0.04, 0.26],
        Shot: FitShot,
    },
    {
        id: 'matches',
        num: '2',
        lab: 'Explore',
        title: 'See your ranked matches',
        copy: 'Fit Scores and admission odds, ordered by what suits you — not a league table.',
        chips: ['119,000+ programmes', 'Fit preview on every result'],
        window: [0.26, 0.48],
        Shot: CatalogueShot,
    },
    {
        id: 'plan',
        num: '3',
        lab: 'Act',
        title: 'Build & share your plan',
        copy: 'Auto-timelines for essays and deadlines — shared with your counsellor and family in a tap.',
        chips: ['Per-application tracking', 'Counsellor built in'],
        window: [0.48, 0.68],
        Shot: PlanShot,
    },
];

/**
 * Which row is lit, in pin progress. The flip points are the window boundaries —
 * i.e. the centres of the cross-fades below — so the list and the visual change on
 * the same frame instead of one leading the other.
 */
const stepAt = (v: number) => (v < 0.26 ? 0 : v < 0.48 ? 1 : 2);

/** Half-width of the dissolve either side of a window boundary. */
const FADE = 0.02;

/**
 * The finale: once the third step has played, the three steps travel out of the
 * list and into the grid, one after another, so the row assembles rather than
 * appearing. That is the whole point — the visitor has to be able to SEE the
 * vertical list becoming a horizontal one, and recognise the grid as its result on
 * the way back up.
 *
 * Each step gets CONVERGE_SPAN of travel starting CONVERGE_STAGGER after the one
 * before. The legs overlap by design (a span is nearly three staggers wide): three
 * steps arriving strictly in series reads as three animations, not one layout
 * changing. The last one is home at 0.95, leaving the pin's tail as hold.
 *
 * BOTTOM of the list first, and that is not a style choice. Every row has to fall
 * to the same caption line, and the only order in which a row's path down is
 * already clear is from the bottom up — top-first sends row 1 straight through
 * rows 2 and 3, which is exactly what it looks like.
 */
const CONVERGE_START = 0.66;
const CONVERGE_SPAN = 0.17;
const CONVERGE_STAGGER = 0.06;

/**
 * Cubic in-out. ascent-scroll's `easeOut` starts at full speed, which is right for
 * something arriving and wrong for something with somewhere to be: these steps
 * cross most of the stage, and leaving at maximum velocity reads as a snap.
 */
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(2 - 2 * t, 3) / 2);

/** Raw 0→1 of step `index`'s own leg of the converge — the un-eased clock. */
const legAt = (v: number, index: number) => {
    const from = CONVERGE_START + (STEPS.length - 1 - index) * CONVERGE_STAGGER;
    return seg(v, from, from + CONVERGE_SPAN);
};

/**
 * A leg is played in beats, because the six things in flight would otherwise cross
 * straight through one another. The text FALLS to the caption line before it
 * SLIDES along it — sideways-first would drag every row through the pooled shots
 * on its way to the far column. The shot only DEALS once the row it was sitting
 * beside has dropped clear of the shot band. And the numeral travels WITH its own
 * text rather than along a path of its own, breaking for the card's top-right
 * corner only at the end (BADGE_RISE): any independent slide crosses the lab and
 * title of the very row it numbers.
 *
 * The windows overlap, so each part curves rather than turning a corner.
 */
const TEXT_FALL: [number, number] = [0, 0.55];
const TEXT_SLIDE: [number, number] = [0.4, 1];
const SHOT_DEAL: [number, number] = [0.35, 1];
const BADGE_RISE: [number, number] = [0.35, 1];

/** 0 = where the stepper puts this part, 1 = where the grid does. */
const beatAt = (v: number, index: number, [a, b]: [number, number]) => easeInOut(seg(legAt(v, index), a, b));

/**
 * The stepper's one-at-a-time dissolve. Step 1 is already on screen when the pin
 * arms — the stage rides into view normally, so it has no fade-in of its own — and
 * the last step never fades out, because its frame is where the stepper ends.
 */
const crossFadeAt = (v: number, index: number) => {
    const [a, b] = STEPS[index].window;
    const arrive = index === 0 ? 1 : seg(v, a - FADE, a + FADE);
    const leave = index === STEPS.length - 1 ? 1 : 1 - seg(v, b - FADE, b + FADE);
    return Math.min(arrive, leave);
};

/**
 * The two shots that are not showing come back as they deal out from under the
 * pooled stack, where the fade itself is hidden. Bringing all three up before
 * anything moves would instead flash the taller ones' edges out past the card on
 * top — the pool is aligned to the shots' grid position, not centred, so their
 * bottom edges do not line up.
 */
// Narrow and early, ending while the card is still barely out from under the pool.
// A long fade looks reasonable in isolation and terrible in motion: the legs
// overlap, so a card at half opacity spends its whole crossing superimposed on the
// one it is passing, and two half-transparent product mocks on top of each other
// read as a rendering fault rather than a card being dealt.
const DEAL_IN: [number, number] = [0.36, 0.47];
const shotOpacityAt = (v: number, index: number) =>
    Math.max(crossFadeAt(v, index), seg(legAt(v, index), DEAL_IN[0], DEAL_IN[1]));

/**
 * Copy and chips are the stepper's payload and the grid frame has no room for them
 * (see StepCard), so they leave on the fall. Early, and measurably so: the block
 * overhangs its column by 60%, and the step BELOW is already sliding right across
 * that overhang while this one is still coming down.
 */
const TAIL_OUT = 0.25;
const tailOpacityAt = (v: number, index: number) => 1 - seg(legAt(v, index), 0, TAIL_OUT);

/** -1 once the converge starts: the grid dims nothing, so neither does the finale. */
const litAt = (v: number) => (v >= CONVERGE_START ? -1 : stepAt(v));

/** The chip idiom the deleted chapters used — pill, hairline border, emerald tick.
 *  Tinted to match `.surface-chip`, the app's real neutral pill: this is a mock of
 *  the product's own chrome, so it has to move when that treatment moves. */
function StepChips({ chips, className }: { chips: string[]; className?: string }) {
    return (
        <div className={cn('flex flex-wrap gap-2', className)}>
            {chips.map((chip) => (
                <span
                    key={chip}
                    className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 bg-primary/8 px-3 py-1.5 text-xs font-medium text-foreground"
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
                            {/* The three shots are different heights (the fit card is
                                ~170px shorter than the other two), so without a floor
                                the labels beneath them land on three different lines.
                                lg only: stacked, each card sets its own height. */}
                            <div className="lg:min-h-[26rem]">
                                <step.Shot p={p} scrub={false} />
                            </div>
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

/* ------------------------------------------------------- pinned: the morph */

/**
 * The pinned stage renders the SAME three cards the settled grid does, in the same
 * flow layout, and displaces them. Each step's numeral, shot and text is one node
 * for the whole pass: the stepper is those nodes pushed out of the grid — the list
 * stacked down the left, the three shots pooled on the right where they take turns
 * — and the converge is that displacement relaxing to zero, card by card.
 *
 * The grid is the flow and the stepper is the offset, not the other way round, for
 * three reasons. The resting shape is the one that has to be pixel-exact, because
 * the pin swaps to it off-screen. An un-measured frame then renders as the grid
 * rather than as a pile. And every card lands on `transform: none`, so nothing is
 * left resampled or a half-pixel off once the travel is over.
 *
 * Only transform and opacity ever change, so the flow — and therefore the stage's
 * height — is identical on every frame. A height change inside a sticky stage
 * re-measures the pin mid-scrub and jumps the scroll.
 */

/** Space the stepper's numeral badges own, left of the step text. */
const BADGE_GUTTER = 52;
/** Vertical gap between the stepper's stacked rows. */
const ROW_GAP = 24;

interface Offset {
    x: number;
    y: number;
}

/**
 * Where a step's three parts sit in the stepper, RELATIVE to where the grid puts
 * them. All zeros is the grid itself, which is why it doubles as the value used
 * before anything has been measured.
 *
 * `shot.y` is one of those zeros on every frame — the pool sits on the grid's own
 * shot row, deliberately (see measure) — and is carried anyway so the pool can be
 * moved without re-plumbing the card.
 */
interface StepOffsets {
    badge: Offset;
    shot: Offset;
    text: Offset;
}

const AT_REST: StepOffsets[] = STEPS.map(() => ({
    badge: { x: 0, y: 0 },
    shot: { x: 0, y: 0 },
    text: { x: 0, y: 0 },
}));

/** The four nodes per step the measurement pass needs a handle on. */
interface StepNodes {
    badge: HTMLElement | null;
    shot: HTMLElement | null;
    text: HTMLElement | null;
    tail: HTMLElement | null;
}

/**
 * Layout position of `el` within `root`, walking the offsetParent chain.
 *
 * Deliberately not getBoundingClientRect: by the time a resize re-measures, these
 * nodes are already carrying morph transforms, and a rect includes them — so the
 * "base" position it reports is wherever the last measurement happened to put the
 * element, and the error compounds on every resize. offsetLeft/offsetTop are the
 * untransformed layout box, which is the only thing worth measuring here.
 */
function layoutOffset(el: HTMLElement, root: HTMLElement): Offset {
    let x = 0;
    let y = 0;
    let node: HTMLElement | null = el;
    while (node && node !== root) {
        x += node.offsetLeft;
        y += node.offsetTop;
        node = node.offsetParent as HTMLElement | null;
    }
    return { x, y };
}

const sameOffsets = (a: StepOffsets[], b: StepOffsets[]) =>
    a.length === b.length &&
    a.every((o, i) =>
        (['badge', 'shot', 'text'] as const).every((part) => o[part].x === b[i][part].x && o[part].y === b[i][part].y),
    );

/**
 * One card: numeral, shot, text — each its own transform, because the three do not
 * travel together. In the stepper the numeral and the text are a row in the list
 * on the left while the shot waits in the pool on the right; over the converge they
 * meet, and the card assembles around the shot the visitor was already looking at.
 *
 * A leaf so that every step's derived values have their own fixed hook order,
 * whichever step happens to be live.
 */
function StepCard({
    p,
    scrub,
    index,
    step,
    lit,
    offsets,
    nodes,
}: PinnedStageCtx & {
    index: number;
    step: Step;
    lit: boolean;
    offsets: StepOffsets;
    nodes: StepNodes;
}) {
    // The shot's own 0→1 choreography progress. Deliberately NOT re-sprung: `p`
    // arrives already sprung from PinnedStage, and a second spring on top is the
    // floaty double inertia SCENE_SPRING was tuned to avoid. Every window closes
    // before CONVERGE_START, so all three shots are on their finished frame — the
    // same frame `scrub={false}` draws — for the whole of the morph.
    const local = useTransform(p, step.window, [0, 1], { clamp: true });

    // The numeral rides its own row rather than taking an independent path across it.
    // Sliding it along the row first looked right on paper — the lane beside a row is
    // empty — but the row's OWN lab and title are in that lane, so the badge ploughed
    // straight through the words it belongs to. Riding the text means zero relative
    // motion against its own copy; only the final break to the card's top-right
    // corner (BADGE_RISE) is the badge's own, and it happens over a card that is
    // already dealing in underneath it, with the badge at z-10 on top.
    const badgeBreak = (v: number) => 1 - beatAt(v, index, BADGE_RISE);
    const badgeX = useTransform(
        p,
        (v) => offsets.text.x * (1 - beatAt(v, index, TEXT_SLIDE)) + (offsets.badge.x - offsets.text.x) * badgeBreak(v),
    );
    const badgeY = useTransform(
        p,
        (v) => offsets.text.y * (1 - beatAt(v, index, TEXT_FALL)) + (offsets.badge.y - offsets.text.y) * badgeBreak(v),
    );
    const shotX = useTransform(p, (v) => offsets.shot.x * (1 - beatAt(v, index, SHOT_DEAL)));
    const textX = useTransform(p, (v) => offsets.text.x * (1 - beatAt(v, index, TEXT_SLIDE)));
    const textY = useTransform(p, (v) => offsets.text.y * (1 - beatAt(v, index, TEXT_FALL)));
    const shotOpacity = useTransform(p, (v) => shotOpacityAt(v, index));
    // On while the card is in flight, off by the time it lands. Card 3 never travels
    // (its pool position IS its grid position), so it never needs backing.
    const travelBacking = useTransform(p, (v) => {
        if (!scrub || offsets.shot.x === 0) return 0;
        const leg = legAt(v, index);
        return seg(leg, SHOT_DEAL[0], SHOT_DEAL[0] + 0.08) * (1 - seg(leg, 0.88, 1));
    });
    const tailOpacity = useTransform(p, (v) => tailOpacityAt(v, index));

    return (
        // min-w-0: a grid item's default min-width is auto, and these shots have a
        // wide min-content (the catalogue's result rows measure 467px), which would
        // otherwise blow the track out past its third of the row.
        <li className="relative min-w-0">
            {/* Right, not left, in the grid: these shots carry AppFrame's route bar,
                whose traffic lights sit in the top-left corner. The stepper puts the
                same badge at the head of its row, which is what makes the numeral
                legible as the thing that travels. Decorative either way — the <ol>
                numbers these for assistive tech. */}
            <motion.span
                ref={(el) => {
                    nodes.badge = el;
                }}
                aria-hidden
                className={cn(
                    'absolute -right-1.5 -top-3.5 z-10 grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br text-sm font-bold text-white shadow-lg transition-opacity duration-300',
                    NUMBER_GRADIENTS[index],
                    lit ? 'opacity-100' : 'opacity-50',
                )}
                style={scrub ? { x: badgeX, y: badgeY } : undefined}
            >
                {step.num}
            </motion.span>

            {/* Same floor as the settled grid: the three shots are different heights
                (the fit card is ~140px shorter than the other two), so without it the
                labels beneath them land on three different lines — and the point of
                this frame is that it IS the grid. The slot holds the height; the
                shot inside it is what moves. */}
            <div className="min-h-[26rem]">
                {/* The <ol> carries the meaning, and the pooled shots overlap two-deep
                    mid-stepper — FitShot's role="img" alone would be announced three
                    times over. */}
                {/* Stacked so a shot dealing across the stage passes OVER whatever list
                    rows are still standing rather than through them; the numeral
                    badges sit at z-10 and stay on top of both. Ordered by WHEN each
                    card deals, not by column: the legs run bottom-up, so the card
                    still in flight is always the lower-indexed one and has to travel
                    over the columns that have already landed. */}
                <motion.div
                    ref={(el) => {
                        nodes.shot = el;
                    }}
                    aria-hidden
                    className={cn(
                        'pointer-events-none relative',
                        ['z-[3]', 'z-[2]', 'z-[1]'][index],
                    )}
                    style={scrub ? { x: shotX, opacity: shotOpacity } : undefined}
                >
                    {/* AppFrame is translucent by design (bg-muted/50, and
                        background/60 in dark), so a card crossing another one lets it
                        show straight through and the pair reads as a rendering fault
                        rather than one card passing over another. This is an opaque
                        backing that exists only while a card is actually travelling —
                        it fades out as the card lands, so the resting frame keeps the
                        translucency the mock is drawn with. Radius matches AppFrame's
                        rounded-2xl. The shot is wrapped in its own positioned box
                        rather than left static: a positioned sibling paints above a
                        static one whatever the DOM order, so an unwrapped shot ends up
                        UNDER its own backing and the card travels as a blank slab. */}
                    <motion.span
                        aria-hidden
                        className="absolute inset-0 rounded-2xl bg-background"
                        style={{ opacity: travelBacking }}
                    />
                    <div className="relative">
                        <step.Shot p={local} scrub={scrub} />
                    </div>
                </motion.div>
            </div>

            <motion.div
                ref={(el) => {
                    nodes.text = el;
                }}
                className={cn(
                    'relative mt-4 transition-opacity duration-300',
                    // opacity-50, not 45: Tailwind's opacity scale has no 45, so that
                    // class emitted no rule at all and the inactive rows read exactly
                    // as loud as the lit one.
                    lit ? 'opacity-100' : 'opacity-50',
                )}
                style={scrub ? { x: textX, y: textY } : undefined}
            >
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">{step.lab}</p>
                <h3 className="mt-1.5 text-xl font-heading font-bold tracking-tight text-foreground">{step.title}</h3>
                {/*
                 * Absolute, and this is what makes the whole morph fit. In flow, copy
                 * and chips add ~130px to a card, which puts the grid frame at ~790px
                 * — taller than the 656px the stage has at the pin's 1280x768 floor,
                 * so it would clip. Out of flow they cost the stage nothing, the
                 * stepper still gets to make its concrete claims, and they are gone
                 * before their card lands. The settled grid, which is not inside a
                 * pin, keeps them in flow.
                 *
                 * 170% ≈ max-w-2xl, so the stepper's rows read on the same measure as
                 * the heading above them and every copy line fits on one.
                 */}
                <motion.div
                    ref={(el) => {
                        nodes.tail = el;
                    }}
                    className="pointer-events-none absolute left-0 top-full mt-2 w-[170%]"
                    // Un-scrubbed, the static frame is the end of the story, and the
                    // end of this one is the grid. Nothing renders this stage
                    // un-pinned today; the fallback is what stops the tail hanging
                    // over its neighbours if that ever changes.
                    style={{ opacity: scrub ? tailOpacity : 0 }}
                >
                    <p className="text-sm leading-relaxed text-muted-foreground">{step.copy}</p>
                    <StepChips chips={step.chips} className="mt-2.5" />
                </motion.div>
            </motion.div>
        </li>
    );
}

function StepMorph({ p, scrub }: PinnedStageCtx) {
    const gridRef = useRef<HTMLOListElement>(null);
    const nodesRef = useRef<StepNodes[]>(STEPS.map(() => ({ badge: null, shot: null, text: null, tail: null })));
    const [offsets, setOffsets] = useState<StepOffsets[]>(AT_REST);
    const active = useScrubbed(p, scrub, -1, litAt);

    const measure = useCallback(() => {
        const grid = gridRef.current;
        const nodes = nodesRef.current;
        if (!grid || nodes.some((n) => !n.badge || !n.shot || !n.text || !n.tail)) return;

        const width = grid.offsetWidth;
        // A row is its text block plus the copy/chips hanging off the bottom of it.
        // The tail is absolute, so nothing else in the tree knows how tall it is.
        const rows = nodes.map((n) => n.tail!.offsetTop + n.tail!.offsetHeight);
        // Both columns hang from the top of the grid area: the list runs ~410px and
        // so does the tallest shot, so top-aligning is what balances them — and it
        // leaves the caption line at the bottom clear, which is where every row is
        // about to fall to.
        let top = 0;

        const next = nodes.map((n, i) => {
            const badge = layoutOffset(n.badge!, grid);
            const shot = layoutOffset(n.shot!, grid);
            const text = layoutOffset(n.text!, grid);
            const rowTop = top;
            top += rows[i] + ROW_GAP;
            return {
                // Centred on the lab+title block rather than aligned to its top: the
                // badge is 36px against a 16px eyebrow, and top-aligning drops it
                // through the title.
                badge: {
                    x: -badge.x,
                    y: rowTop + (n.text!.offsetHeight - n.badge!.offsetHeight) / 2 - badge.y,
                },
                text: { x: BADGE_GUTTER - text.x, y: rowTop - text.y },
                // Right-aligned, which is also exactly where the grid puts the LAST
                // card's shot — so the shot the visitor is looking at when the
                // converge begins never moves at all, and the other two deal out
                // leftwards from underneath it. Vertically the pool IS the grid row,
                // so no shot ever moves down into the falling captions.
                shot: { x: width - n.shot!.offsetWidth - shot.x, y: 0 },
            };
        });
        setOffsets((prev) => (sameOffsets(prev, next) ? prev : next));
    }, []);

    // useLayoutEffect, not the SSR-safe alias: PinnedStage renders `settled` until
    // its pin arms, so this tree only ever mounts in the browser. Before paint
    // matters — an unmeasured frame is the grid, and the grid is not what the stage
    // opens on.
    useLayoutEffect(() => {
        if (!scrub) return;
        measure();
        const grid = gridRef.current;
        if (!grid) return;
        // The tails wrap against a percentage of the track, so every reflow that can
        // change a row's height also changes the grid's width. Fonts are the one
        // exception: they swap in without a resize and move every text metric here.
        let live = true;
        document.fonts?.ready
            .then(() => {
                if (live) measure();
            })
            // Purely cosmetic: `measure()` has already run once above, so a
            // rejected font-loading promise only means the layout is not
            // re-measured after a font swap. Nothing to show the visitor, but
            // the rejection must not float.
            .catch((err: unknown) => {
                console.warn('how-it-works: font-ready remeasure skipped', err);
            });
        const observer = new ResizeObserver(measure);
        observer.observe(grid);
        return () => {
            live = false;
            observer.disconnect();
        };
    }, [scrub, measure]);

    return (
        // No entrance animation, deliberately. `p` is 0 at the top of the section,
        // which is exactly where an anchor lands — and `#how-it-works` is a nav link,
        // the hero's secondary CTA and an inbound-link target. A fade keyed to the
        // first slice of travel therefore greeted every one of those visitors with a
        // blank screen until they scrolled. The stage needs no entrance anyway: until
        // the pin engages it rides at the section top and scrolls into view normally,
        // which is also what lets the heading's word reveal play where it can be seen.
        <div className="mx-auto w-full max-w-7xl px-6">
            {/* Same measure and same margin as the settled grid's header, and it never
                moves: with the heading nailed down, the only thing travelling is the
                three steps, which is the one thing the morph is trying to say. */}
            <div className="max-w-2xl space-y-4 mb-10">
                <p className="text-sm font-medium uppercase tracking-widest text-primary/80">{EYEBROW}</p>
                <ScrollRevealHeading as="h2" className={HEADING_CLASS}>
                    {HEADING}
                </ScrollRevealHeading>
            </div>

            {/*
             * role="list" is not redundant: Tailwind's preflight sets list-style:
             * none, and Safari/VoiceOver drops list semantics entirely from an
             * unstyled list — which would silence the only numbering assistive tech
             * gets here, since the visible numerals are aria-hidden.
             *
             * relative so it is the offsetParent every measurement resolves against.
             */}
            <ol ref={gridRef} role="list" className="relative grid grid-cols-3 gap-x-6">
                {STEPS.map((step, index) => (
                    <StepCard
                        key={step.id}
                        p={p}
                        scrub={scrub}
                        index={index}
                        step={step}
                        lit={active === -1 || active === index}
                        offsets={offsets[index]}
                        nodes={nodesRef.current[index]}
                    />
                ))}
            </ol>
        </div>
    );
}

export function HowItWorksScrub() {
    // A stable 1 for the settled grid: `useScrubbed(p, false, …)` returns its final
    // value whatever `p` holds, and 1 is the honest reading of that frame — the end
    // of the choreography.
    const staticP = useMotionValue(1);

    return (
        // Both gates are measured, not inherited. Width 1280: the morph's flow layout
        // is the three-across grid, whose shots the settled tree only puts side by
        // side from `lg` up — below that they stack, and a stacked flow has no
        // horizontal row to lay anything out into. Height 768: the pinned frame
        // measures ~638px there, which clears the 53px fixed nav with room to spare;
        // any shorter and the stage's overflow-hidden starts cropping the cards.
        // Everything under either gate keeps the grid, unpinned — which is a correct
        // layout at every width.
        <PinnedStage
            id="how-it-works"
            className="scroll-mt-14 bg-background"
            // py-14 so `items-center` centres the stage in the space BELOW the fixed
            // nav rather than in the raw viewport.
            stageClassName="py-14"
            // 380svh → 280svh of actual scrub travel (the first 100 is the sticky
            // stage riding into place), and the number comes from measured scroll
            // rates rather than taste. A MacBook two-finger flick runs 400–1500 px/s
            // and a wheel notch is 100–120px; at the old 240 (140svh ≈ 1075px at the
            // pin's 768px height floor) each step owned 0.22 of travel ≈ 236px, so a
            // step was over in 0.16–0.6s and ONE notch advanced ~9% of the whole
            // choreography — the three beats blurred into a single flicker for
            // anybody scrolling normally. At 280svh a step is ~473px (0.3–1.2s) and a
            // notch moves ~4.5%, which is a gradient rather than a jump.
            //
            // Not longer than that: the stage plays forward once and then holds, so
            // every svh of travel is also svh a visitor has to scroll back through if
            // they turn around inside it — and past ~4 screens the section starts
            // reading as scrolljacking however smooth it is.
            pinVh={380}
            pinQuery="(min-width: 1280px) and (min-height: 768px)"
            settled={({ afterPin }) => <StepGrid p={staticP} afterPin={afterPin} />}
        >
            {/* Invoked inside a conditional branch — one component, no hooks here. */}
            {({ p, scrub }) => <StepMorph p={p} scrub={scrub} />}
        </PinnedStage>
    );
}
