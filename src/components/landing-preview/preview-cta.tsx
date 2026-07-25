'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
    MotionValue,
    motion,
    useReducedMotion,
    useScroll,
    useSpring,
    useTransform,
    type MotionStyle,
} from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useLaunchHref } from '@/hooks/use-launch-href';
import { cn } from '@/lib/utils';
import {
    SCENE_SPRING,
    clamp01,
    easeOut,
    seg,
    useMotionReady,
    useMounted,
    useScrubbed,
} from './ascent-scroll';
import { COPY, IGNITION } from './cta-choreography';
import { CursorGrid } from './cursor-grid';
import {
    ROCKET_BAYS,
    ROCKET_HEIGHT,
    ROCKET_WIDTH,
    RocketArt,
    type RocketGroupId,
} from './rocket-art';

/**
 * The launch finale: one pinned band where the vehicle assembles, takes on the
 * three widget modules the page just demonstrated, ignites and leaves — and the
 * ask lands in the space it vacates.
 *
 * Conventions carried from the rest of the preview:
 *  - the un-gated default IS the final frame (assembled rocket, all bays lit, no
 *    flame, copy visible), so SSR and reduced-motion users get the payoff; every
 *    scroll-driven style sits behind `useMotionReady()`;
 *  - the pin collapses entirely after mount for reduced-motion users, as
 *    PinnedStage does, so there is no dead scroll;
 *  - transform/opacity/canvas only — no layout animation.
 */

const PIN_VH = 170;

// Choreography breakpoints, in scene progress. Assembly first, then the ask
// rises WHILE the modules dock — the copy is legible from mid-band, and
// ignition/liftoff play out above the settled text (the vehicle translates
// -108vh, clearing it). The audited original held the copy to the last 12% of
// travel, which meant ~103vh of blank band before a single legible word.
const A_HULL: [number, number] = [0.05, 0.17];
const A_NOSE: [number, number] = [0.16, 0.28];
const A_FINS: [number, number] = [0.27, 0.38];
const A_ENGINE: [number, number] = [0.36, 0.46];
const DOCK_WINDOWS: [number, number][] = [
    [0.48, 0.585],
    [0.575, 0.665],
    [0.655, 0.75],
];
const LIFTOFF: [number, number] = [0.78, 0.97];
const PROOF: [number, number] = [0.5, 0.68];
// IGNITION and COPY live in cta-choreography.ts — preview-nav needs them without
// pulling this module into its chunk. Re-exported here so the old import path
// keeps working.
export { CTA_COPY_POINT, CTA_IGNITION_POINT } from './cta-choreography';

const T_MINUS_START = 10;
const LIFTOFF_LABEL = 'Lift-off, your plan is ready to go';
/**
 * The static frame's caption. SSR, no-JS and reduced-motion users see the rocket
 * assembled on the pad with a cold engine, so the readout must say "fuelled and
 * waiting" — seeding it with LIFTOFF_LABEL captioned a grounded rocket "Lift-off".
 */
const STANDBY_LABEL = 'Cleared for launch';

/* --------------------------------------------------------- module cards */

/** Mini widget cards, the chapters' idiom re-cut for the theme-locked dark band. */
function ModuleCard({
    p,
    ready,
    at,
    from,
    bay,
    glyph,
    label,
    sub,
    value,
}: {
    p: MotionValue<number>;
    ready: boolean;
    at: [number, number];
    /** Fly-in offset from the bay, in assembly px. */
    from: { x: number; y: number };
    bay: { x: number; y: number };
    glyph: ReactNode;
    label: string;
    sub: string;
    value: string;
}) {
    const [a, b] = at;
    const span = b - a;
    const q = (v: number) => easeOut(seg(v, a, b));
    const x = useTransform(p, (v) => from.x * (1 - q(v)));
    const y = useTransform(p, (v) => from.y * (1 - q(v)));
    // Shrinks into the bay as it arrives — the card *becomes* the module.
    const scale = useTransform(p, (v) => 1 - 0.84 * q(v));
    const opacity = useTransform(p, (v) =>
        Math.min(seg(v, a, a + span * 0.22), 1 - seg(v, b - span * 0.16, b)),
    );

    return (
        <motion.div
            aria-hidden
            className="pointer-events-none absolute w-[188px] max-w-[calc(100vw-3rem)]"
            style={{
                left: bay.x,
                top: bay.y,
                marginLeft: -94,
                marginTop: -27,
                ...(ready ? { x, y, scale, opacity } : { opacity: 0 }),
            }}
        >
            <div className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-slate-900/85 p-2.5 shadow-[0_20px_45px_-26px_rgba(2,6,23,0.95)]">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-500/15 text-indigo-300">
                    {glyph}
                </span>
                <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-[0.78125rem] font-semibold leading-tight text-slate-100">
                        {label}
                    </span>
                    <span className="block truncate text-[0.6875rem] leading-tight text-slate-400">{sub}</span>
                </span>
                <span className="shrink-0 text-[0.8125rem] font-bold tabular-nums text-emerald-400">{value}</span>
            </div>
        </motion.div>
    );
}

/* Hand-rolled glyphs — no icon-library art anywhere in this scene. */

const GAUGE_R = 7.5;
const GAUGE_C = 2 * Math.PI * GAUGE_R;

function GaugeGlyph() {
    return (
        <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" aria-hidden focusable="false">
            <circle cx={10} cy={10} r={GAUGE_R} fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth={3} />
            <circle
                cx={10}
                cy={10}
                r={GAUGE_R}
                fill="none"
                stroke="currentColor"
                strokeWidth={3}
                strokeLinecap="round"
                strokeDasharray={GAUGE_C}
                strokeDashoffset={GAUGE_C * 0.08}
                transform="rotate(-90 10 10)"
            />
        </svg>
    );
}

function DateGlyph() {
    return (
        <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" aria-hidden focusable="false">
            <rect x={3} y={5} width={14} height={12} rx={2.5} fill="none" stroke="currentColor" strokeWidth={1.6} />
            <path d="M3.8 9h12.4" stroke="currentColor" strokeWidth={1.6} />
            <path d="M7 3.4v3M13 3.4v3" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
            <rect x={6} y={11.4} width={3.2} height={3.2} rx={1} fill="currentColor" />
        </svg>
    );
}

function ChecklistGlyph() {
    return (
        <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" aria-hidden focusable="false">
            <path
                d="M3 6.4l2 2 3-3.4M3 13.4l2 2 3-3.4"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path d="M11 7h6M11 14h6" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeOpacity={0.6} />
        </svg>
    );
}

/* ----------------------------------------------------------------- scene */

/**
 * The ticking readout is a leaf on purpose: `toFixed(1)` yields ~100 distinct
 * strings across the countdown window, and owning that state here means only
 * this <p> re-renders per tick instead of the whole finale subtree (rocket SVG,
 * three module cards, copy) reconciling every ~7px of scroll.
 */
function LaunchReadout({ p, ready }: { p: MotionValue<number>; ready: boolean }) {
    const countdown = useScrubbed(p, ready, STANDBY_LABEL, (v) => {
        if (v >= IGNITION[0]) return LIFTOFF_LABEL;
        const t = T_MINUS_START * clamp01(1 - v / IGNITION[0]);
        return `T–${t < T_MINUS_START ? '0' : ''}${t.toFixed(1)}`;
    });
    const launched = countdown === LIFTOFF_LABEL;

    return (
        // Decorative pacing cue, same idiom as the nav's T-minus chip, so it
        // isn't announced.
        <p
            aria-hidden
            className={cn(
                'font-heading text-xs font-semibold uppercase tabular-nums transition-colors duration-300',
                launched ? 'tracking-[0.2em] text-emerald-400' : 'tracking-[0.28em] text-slate-400',
            )}
        >
            {countdown}
        </p>
    );
}

export function PreviewCta() {
    const ref = useRef<HTMLElement>(null);
    // The pin's scroll subscription inlined (same offsets PinnedStage uses), and
    // deliberately NOT latched. The rest of the page holds what it has played, but
    // the finale is a vehicle on a pad: latching left an empty dark band behind once
    // the rocket had gone, so scrolling back up into the last screen of the site
    // showed nothing but copy. Tracking both ways keeps the rocket there — it flies
    // out as you leave and settles back onto the pad as you return.
    const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
    const p = useSpring(scrollYProgress, SCENE_SPRING);
    const ready = useMotionReady();
    const mounted = useMounted();
    const shouldReduceMotion = useReducedMotion();
    const launchHref = useLaunchHref();

    // Post-mount viewport gates (same collapse pattern as reduced motion — the
    // SSR frame is always the pinned layout, and unpinning happens client-side):
    //  - short viewports can't fit pad + copy in one 100svh stage, so the pin
    //    would park the button below the fold for its entire travel;
    //  - narrow viewports get the module cards' vertical fly-in (a ±270px
    //    horizontal entrance starts outside a 375px stage entirely).
    const [shortViewport, setShortViewport] = useState(false);
    const [compact, setCompact] = useState(false);
    useEffect(() => {
        const short = window.matchMedia('(max-height: 719px)');
        // 767, not the pad's own sm breakpoint: the ±270px fly-in needs roughly
        // (768 - 220)/2 = 274px of stage on each side of the pad to start inside
        // the overflow-hidden edge.
        const narrow = window.matchMedia('(max-width: 767px)');
        const apply = () => {
            setShortViewport(short.matches);
            setCompact(narrow.matches);
        };
        apply();
        short.addEventListener('change', apply);
        narrow.addEventListener('change', apply);
        return () => {
            short.removeEventListener('change', apply);
            narrow.removeEventListener('change', apply);
        };
    }, []);

    // Collapse the pin after mount for reduced-motion users and viewports the
    // stage can't fit — no dead scroll, straight to the assembled final frame.
    const pinned = !(mounted && (shouldReduceMotion || shortViewport));
    // Scrub only while pinned: an unpinned band has almost no travel, so driving
    // the choreography from p would strand a short-viewport (but motion-enabled)
    // user on a half-assembled rocket. Collapsed ⇒ static final frame.
    const scrub = ready && pinned;

    // Staged assembly: hull rises onto the pad, nose lowers on, fins sweep in,
    // engine bell docks from below.
    const hullY = useTransform(p, (v) => (1 - easeOut(seg(v, ...A_HULL))) * 150);
    const hullOpacity = useTransform(p, (v) => seg(v, A_HULL[0], A_HULL[0] + 0.06));
    const noseY = useTransform(p, (v) => (1 - easeOut(seg(v, ...A_NOSE))) * -120);
    const noseOpacity = useTransform(p, (v) => seg(v, A_NOSE[0], A_NOSE[0] + 0.05));
    const finProgress = (v: number) => 1 - easeOut(seg(v, ...A_FINS));
    const finLeftX = useTransform(p, (v) => finProgress(v) * -84);
    const finLeftRotate = useTransform(p, (v) => finProgress(v) * -24);
    const finRightX = useTransform(p, (v) => finProgress(v) * 84);
    const finRightRotate = useTransform(p, (v) => finProgress(v) * 24);
    const finOpacity = useTransform(p, (v) => seg(v, A_FINS[0], A_FINS[0] + 0.05));
    const engineY = useTransform(p, (v) => (1 - easeOut(seg(v, ...A_ENGINE))) * 92);
    const engineOpacity = useTransform(p, (v) => seg(v, A_ENGINE[0], A_ENGINE[0] + 0.05));

    // Stable identity: the MotionValues never change across renders, and a fresh
    // object here would re-render RocketArt's ~70 SVG nodes on every state tick.
    const groups: Partial<Record<RocketGroupId, MotionStyle>> = useMemo(
        () => ({
            gHull: { y: hullY, opacity: hullOpacity },
            gNose: { y: noseY, opacity: noseOpacity },
            gFinL: { x: finLeftX, rotate: finLeftRotate, opacity: finOpacity },
            gFinR: { x: finRightX, rotate: finRightRotate, opacity: finOpacity },
            gEngine: { y: engineY, opacity: engineOpacity },
        }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    );

    // Ignition → liftoff. The jitter is a high-frequency function of the scrub,
    // so it shudders as you scroll rather than running on its own clock.
    const shakeX = useTransform(
        p,
        (v) =>
            Math.sin(v * 520) *
            2.6 *
            seg(v, IGNITION[0], IGNITION[0] + 0.04) *
            (1 - seg(v, 0.88, 0.94)),
    );
    const liftY = useTransform(p, (v) => `${-Math.pow(seg(v, ...LIFTOFF), 2.2) * 108}vh`);
    const flame = useTransform(p, (v) => seg(v, IGNITION[0], IGNITION[1] + 0.02));
    const smoke = useTransform(p, (v) => seg(v, IGNITION[0] + 0.02, 0.95));
    const padGlow = useTransform(
        p,
        (v) => seg(v, ...IGNITION) * (1 - seg(v, 0.86, 0.95)),
    );
    const cameraScale = useTransform(p, (v) => 1 + easeOut(seg(v, ...LIFTOFF)) * 0.06);
    const fieldY = useTransform(p, (v) => easeOut(seg(v, ...LIFTOFF)) * 30);

    const copyOpacity = useTransform(p, (v) => seg(v, ...COPY));
    const copyY = useTransform(p, (v) => (1 - easeOut(seg(v, ...COPY))) * 24);
    const proofOpacity = useTransform(p, (v) => seg(v, ...PROOF));

    const litBays = useScrubbed(p, scrub, ROCKET_BAYS.length, (v) =>
        DOCK_WINDOWS.filter(([, end]) => v >= end - 0.015).length,
    );
    // `< 0.99`: p clamps at 1, so without the ceiling both flicker keyframe loops
    // would run forever after the user scrolls past the band.
    const flicker = useScrubbed(p, scrub, false, (v) => v > IGNITION[0] + 0.02 && v < 0.99);
    // Pointer gate for the copy block: until the reveal, the primary CTA is at
    // opacity 0 and must not be a phantom click target. Threshold is the middle
    // of the rise so the cursor can't land on a ~4%-opacity button either.
    // Driven by the same latched `p` as `copyOpacity`, so interactivity tracks
    // visibility exactly — and both stay on once the reveal has happened.
    const revealed = useScrubbed(p, scrub, true, (v) => v > (COPY[0] + COPY[1]) / 2);
    // Keyboard/AT stay welcome the whole time: the block is never inert (an inert
    // finale would remove the page's primary CTA from the tab order and the
    // accessibility tree entirely), and tabbing into it forces the copy visible
    // so focus never sits on an invisible control.
    const [focusRevealed, setFocusRevealed] = useState(false);
    const shown = revealed || focusRevealed;

    return (
        // Theme-locked: this band is deliberately dark in BOTH themes. The semantic
        // bg-foreground/text-background pair would invert to a white slab in dark
        // mode, so the fixed palette classes are intentional.
        <section
            ref={ref}
            id="cta"
            className="relative w-full scroll-mt-14 bg-slate-950 text-slate-50"
            // svh, not vh: mobile toolbars resize vh mid-scroll, which re-measures
            // the pin travel and visibly jumps the scrub. svh is toolbar-invariant.
            style={pinned ? { height: `${PIN_VH}svh` } : undefined}
        >
            <div
                className={cn(
                    'overflow-hidden',
                    pinned ? 'sticky top-0 flex min-h-[100svh] items-center' : 'relative py-24',
                )}
            >
                {/* Instrument lattice — lights up under the cursor, and drifts down
                    as the camera follows the vehicle up. Deliberately NOT
                    pointer-events-none: the grid owns its own pointer listeners
                    instead of one on window. */}
                <motion.div
                    aria-hidden
                    className="absolute inset-0"
                    style={scrub ? { y: fieldY } : undefined}
                >
                    {/* Turned up from the original settings: at gridOpacity 0.05 the
                        lattice was barely there on a slate-950 band, so the one
                        interactive surface on the page read as flat black unless you
                        happened to sweep the cursor across it. A brighter resting
                        lattice, a wider and stronger pointer bloom and a faint cell
                        fill make it visible while scrolling past, not only on hover. */}
                    <CursorGrid
                        interactive={ready}
                        cellSize={64}
                        radius={210}
                        falloff="smooth"
                        holdTime={450}
                        fadeDuration={1100}
                        lineWidth={1}
                        maxOpacity={0.72}
                        fillOpacity={0.12}
                        gridOpacity={0.14}
                        pulseSpeed={520}
                    />
                </motion.div>
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-slate-950"
                />

                {/* pointer-events-none so pointermove reaches the CursorGrid under
                    the whole central column — only the copy block opts back in.
                    Everything else here is decorative. */}
                <div className="pointer-events-none relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center gap-4 px-6 py-6 text-center sm:gap-6 sm:py-10">
                    {/* Pad scale wrapper: on narrow viewports the 248px-tall pad is
                        most of the fixed chrome that overflows a small 100svh stage,
                        so it renders at 0.66. The explicit height keeps layout in
                        step, since scale alone doesn't give space back. Everything
                        inside (cards included) shares the scaled space, so bay
                        coordinates keep mapping 1:1. */}
                    <div className="h-[164px] origin-top scale-[0.66] sm:h-[248px] sm:scale-100">
                    {/* Launch pad: the assembly box is 1:1 with the art's viewBox,
                        so bay coordinates double as docking pixel offsets. */}
                    <motion.div
                        className="relative shrink-0"
                        style={{
                            width: ROCKET_WIDTH,
                            height: ROCKET_HEIGHT,
                            ...(scrub ? { scale: cameraScale } : {}),
                        }}
                    >
                        <div className="pointer-events-none absolute left-1/2 top-[188px] h-16 w-56 -translate-x-1/2">
                            <motion.div
                                className="h-full w-full rounded-[50%] bg-indigo-400/40 blur-2xl"
                                style={{ opacity: scrub ? padGlow : 0 }}
                            />
                        </div>

                        <motion.div
                            className="pointer-events-none absolute inset-0"
                            style={scrub ? { x: shakeX, y: liftY } : undefined}
                        >
                            <RocketArt
                                groups={scrub ? groups : undefined}
                                litBays={litBays}
                                flame={scrub ? flame : undefined}
                                smoke={scrub ? smoke : undefined}
                                flicker={flicker}
                            />
                        </motion.div>

                        {/* On narrow stages the horizontal fly-in would start beyond
                            the overflow-hidden edge and the card labels — the beat's
                            whole payload — would never be readable, so it becomes a
                            short vertical rise. */}
                        <ModuleCard
                            p={p}
                            ready={scrub}
                            at={DOCK_WINDOWS[0]}
                            from={compact ? { x: 0, y: -64 } : { x: -268, y: -76 }}
                            bay={ROCKET_BAYS[0]}
                            glyph={<GaugeGlyph />}
                            label="Fit Score locked"
                            sub="TU Delft · Aerospace"
                            value="92"
                        />
                        <ModuleCard
                            p={p}
                            ready={scrub}
                            at={DOCK_WINDOWS[1]}
                            from={compact ? { x: 0, y: -64 } : { x: 274, y: 8 }}
                            bay={ROCKET_BAYS[1]}
                            glyph={<DateGlyph />}
                            label="Deadline tracked"
                            sub="Application closes"
                            value="Jan 15"
                        />
                        <ModuleCard
                            p={p}
                            ready={scrub}
                            at={DOCK_WINDOWS[2]}
                            from={compact ? { x: 0, y: -64 } : { x: -276, y: 48 }}
                            bay={ROCKET_BAYS[2]}
                            glyph={<ChecklistGlyph />}
                            label="Requirements green"
                            sub="Every prerequisite met"
                            value="6/6"
                        />
                    </motion.div>
                    </div>

                    <LaunchReadout p={p} ready={scrub} />

                    {/* Focus force-reveal: Tab reaching the CTA snaps the copy to
                        full opacity (the un-gated static frame), so keyboard focus
                        is never on an invisible control — while the block stays in
                        the tab order and the accessibility tree at all times. */}
                    <div
                        className="w-full"
                        onFocus={() => setFocusRevealed(true)}
                        onBlur={(event) => {
                            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                                setFocusRevealed(false);
                            }
                        }}
                    >
                    <motion.div
                        className={cn(
                            'w-full space-y-5',
                            shown ? 'pointer-events-auto' : 'pointer-events-none',
                        )}
                        // Static 1/0 override rather than dropping the binding:
                        // framer leaves the last written inline value (opacity 0)
                        // behind when a MotionValue simply disappears from style.
                        style={
                            scrub
                                ? {
                                      opacity: focusRevealed ? 1 : copyOpacity,
                                      y: focusRevealed ? 0 : copyY,
                                  }
                                : undefined
                        }
                    >
                        <h2 className="font-heading text-4xl font-bold leading-[1.1] tracking-tight [text-wrap:balance] sm:text-5xl">
                            Your shortlist is waiting.
                        </h2>
                        <p className="mx-auto max-w-2xl text-lg leading-relaxed text-slate-300">
                            Five minutes to set up — then every programme, essay and deadline lives in one plan.
                        </p>
                        <div className="flex flex-wrap items-center justify-center gap-4 pt-1">
                            <Button
                                asChild
                                size="lg"
                                className="group h-12 bg-slate-50 px-8 text-base text-slate-900 shadow-xl transition-all hover:bg-slate-100 hover:shadow-2xl"
                            >
                                <Link href={launchHref} className="flex items-center gap-2">
                                    Launch Ascenda
                                    <svg
                                        viewBox="0 0 16 16"
                                        className="h-4 w-4 transition-transform group-hover:translate-x-1"
                                        aria-hidden
                                        focusable="false"
                                    >
                                        <path
                                            d="M2.5 8h10M9 4.5L12.5 8 9 11.5"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth={1.8}
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                    </svg>
                                </Link>
                            </Button>
                        </div>
                        <motion.div
                            className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-3 text-sm text-slate-400"
                            style={scrub ? { opacity: proofOpacity } : undefined}
                        >
                            <span className="flex items-center gap-2">
                                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                Invite-only access
                            </span>
                            <span className="flex items-center gap-2">
                                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                In-region data · MFA sign-in
                            </span>
                            <span className="flex items-center gap-2">
                                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                Built with school counsellors
                            </span>
                        </motion.div>
                    </motion.div>
                    </div>
                </div>
            </div>
        </section>
    );
}
