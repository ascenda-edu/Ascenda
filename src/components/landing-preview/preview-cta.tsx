'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
    MotionValue,
    motion,
    useMotionValueEvent,
    useReducedMotion,
    useTransform,
    type MotionStyle,
} from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useLaunchHref } from '@/hooks/use-launch-href';
import { cn } from '@/lib/utils';
import { useMotionReady, useMounted, useSceneProgress } from './ascent-scroll';
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
 *    PinnedScene does, so there is no dead scroll;
 *  - transform/opacity/canvas only — no layout animation.
 */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Normalised 0→1 progress of the [a, b] slice of the scene's travel. */
const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

const PIN_VH = 220;

// Choreography breakpoints, in scene progress. Assembly first, then the modules
// dock, then ignition overlaps the start of liftoff, then the ask rises.
const A_HULL: [number, number] = [0.05, 0.17];
const A_NOSE: [number, number] = [0.16, 0.28];
const A_FINS: [number, number] = [0.27, 0.38];
const A_ENGINE: [number, number] = [0.36, 0.46];
const DOCK_WINDOWS: [number, number][] = [
    [0.48, 0.585],
    [0.575, 0.665],
    [0.655, 0.75],
];
const IGNITION: [number, number] = [0.7, 0.78];
/** Ignition as a fraction of the pin travel — preview-nav lands its READY here. */
export const CTA_IGNITION_POINT = IGNITION[0];
const LIFTOFF: [number, number] = [0.78, 0.97];
const COPY: [number, number] = [0.86, 0.98];

const T_MINUS_START = 10;
const LIFTOFF_LABEL = 'Lift-off · your plan is go';

/**
 * Derive React state from the scrub. Mirrors the private helper in scenes.tsx:
 * `final` is what SSR and reduced-motion users see, so the static frame is the
 * end of the story, and the callback is stable because this component
 * re-renders on every scroll frame.
 */
function useScrubbed<T>(p: MotionValue<number>, ready: boolean, final: T, compute: (v: number) => T): T {
    const [value, setValue] = useState<T>(final);
    const computeRef = useRef(compute);
    computeRef.current = compute;
    const readyRef = useRef(ready);
    readyRef.current = ready;

    const update = useCallback((v: number) => {
        if (readyRef.current) setValue(computeRef.current(v));
    }, []);

    useMotionValueEvent(p, 'change', update);
    // `change` only fires on movement — seed from the current position so a band
    // entered without scrolling (deep link, restored position) is correct.
    useEffect(() => {
        if (ready) update(p.get());
    }, [p, ready, update]);

    return ready ? value : final;
}

/* ------------------------------------------------------------- dot field */

const DOT_GAP = 26;
const DOT_R = 1.5;
const DOT_REST = 'rgba(148,163,184,0.3)';
/** indigo-400, tinted in by cursor proximity. */
const DOT_ACCENT = '129,140,248';
const INTERACTION_RADIUS = 120;
const REPULSION = 0.42;
const SPRING_K = 0.055;
const DAMPING = 0.86;
/** Hard cap on displacement — the field stays a grid, it doesn't billow. */
const MAX_OFFSET = 10;
const IDLE_MS = 2800;
const REST_EPSILON = 0.04;

interface Dot {
    ox: number;
    oy: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    tint: number;
}

/**
 * Calm interactive dot grid (physics adapted from nexus-ui's "Interactive Dot
 * Grid Hero"): cursor proximity tints and gently repels, a spring pulls every
 * dot home. The loop runs only while the band is on screen AND something is
 * still moving — once the pointer has been idle a few seconds and the grid has
 * settled it stops until the next pointer move.
 *
 * `active` false (pre-mount, reduced motion) draws the resting grid once with no
 * loop at all.
 */
function DotField({ active }: { active: boolean }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let width = 0;
        let height = 0;
        let dots: Dot[] = [];
        let raf = 0;

        const build = () => {
            const cols = Math.floor(width / DOT_GAP) + 1;
            const rows = Math.floor(height / DOT_GAP) + 1;
            const insetX = (width - (cols - 1) * DOT_GAP) / 2;
            const insetY = (height - (rows - 1) * DOT_GAP) / 2;
            const next: Dot[] = [];
            for (let r = 0; r < rows; r += 1) {
                for (let c = 0; c < cols; c += 1) {
                    const ox = insetX + c * DOT_GAP;
                    const oy = insetY + r * DOT_GAP;
                    next.push({ ox, oy, x: ox, y: oy, vx: 0, vy: 0, tint: 0 });
                }
            }
            dots = next;
        };

        const resize = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            width = canvas.offsetWidth;
            height = canvas.offsetHeight;
            canvas.width = Math.max(1, Math.round(width * dpr));
            canvas.height = Math.max(1, Math.round(height * dpr));
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            build();
        };

        /** One pass: rest dots batched into a single path, tinted ones on top. */
        const paint = () => {
            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = DOT_REST;
            ctx.beginPath();
            for (const dot of dots) {
                if (dot.tint > 0) continue;
                ctx.moveTo(dot.x + DOT_R, dot.y);
                ctx.arc(dot.x, dot.y, DOT_R, 0, Math.PI * 2);
            }
            ctx.fill();
            for (const dot of dots) {
                if (dot.tint <= 0) continue;
                ctx.fillStyle = `rgba(${DOT_ACCENT},${(0.28 + 0.5 * dot.tint).toFixed(3)})`;
                ctx.beginPath();
                ctx.arc(dot.x, dot.y, DOT_R + dot.tint * 0.5, 0, Math.PI * 2);
                ctx.fill();
            }
        };

        // Resizing reallocates (and so clears) the bitmap — always repaint, even
        // in the active path, where the loop may currently be idle-stopped.
        const observer = new ResizeObserver(() => {
            resize();
            paint();
        });
        observer.observe(canvas);
        resize();

        if (!active) {
            paint();
            return () => observer.disconnect();
        }

        const pointer = { x: -9999, y: -9999, active: false };
        let lastMove = 0;
        let onScreen = true;

        const start = () => {
            if (!raf && onScreen && !document.hidden) raf = requestAnimationFrame(frame);
        };

        const trackPointer = (clientX: number, clientY: number) => {
            const rect = canvas.getBoundingClientRect();
            pointer.x = clientX - rect.left;
            pointer.y = clientY - rect.top;
            pointer.active = true;
            lastMove = performance.now();
            start();
        };

        const onPointerMove = (event: PointerEvent) => trackPointer(event.clientX, event.clientY);
        const onPointerLeave = () => {
            pointer.active = false;
            lastMove = performance.now();
            start();
        };

        function frame() {
            if (document.hidden || !onScreen) {
                raf = 0;
                return;
            }

            const radius = INTERACTION_RADIUS;
            const radius2 = radius * radius;
            let busy = false;

            for (const dot of dots) {
                dot.tint = 0;
                if (pointer.active) {
                    const dx = dot.x - pointer.x;
                    const dy = dot.y - pointer.y;
                    const dist2 = dx * dx + dy * dy;
                    if (dist2 < radius2) {
                        const dist = Math.sqrt(dist2) || 0.001;
                        const falloff = (radius - dist) / radius;
                        dot.tint = falloff;
                        const force = falloff * falloff * REPULSION;
                        dot.vx += (dx / dist) * force;
                        dot.vy += (dy / dist) * force;
                    }
                }

                dot.vx = (dot.vx + (dot.ox - dot.x) * SPRING_K) * DAMPING;
                dot.vy = (dot.vy + (dot.oy - dot.y) * SPRING_K) * DAMPING;
                dot.x += dot.vx;
                dot.y += dot.vy;

                // Clamp displacement so the repel can never exceed MAX_OFFSET.
                const offX = dot.x - dot.ox;
                const offY = dot.y - dot.oy;
                const off = Math.hypot(offX, offY);
                if (off > MAX_OFFSET) {
                    const k = MAX_OFFSET / off;
                    dot.x = dot.ox + offX * k;
                    dot.y = dot.oy + offY * k;
                }

                if (
                    !busy &&
                    (Math.abs(dot.vx) > REST_EPSILON ||
                        Math.abs(dot.vy) > REST_EPSILON ||
                        off > REST_EPSILON ||
                        dot.tint > 0)
                ) {
                    busy = true;
                }
            }

            paint();

            // Idle stop: pointer parked and the grid has settled.
            if (!busy && performance.now() - lastMove > IDLE_MS) {
                raf = 0;
                return;
            }
            raf = requestAnimationFrame(frame);
        }

        const io = new IntersectionObserver(
            ([entry]) => {
                onScreen = entry?.isIntersecting ?? true;
                if (onScreen) start();
            },
            { threshold: 0 },
        );
        io.observe(canvas);

        const onVisibility = () => start();
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('pointermove', onPointerMove, { passive: true });
        // pointerleave doesn't bubble — bind the root element, not window.
        document.documentElement.addEventListener('pointerleave', onPointerLeave);

        lastMove = performance.now();
        start();

        return () => {
            cancelAnimationFrame(raf);
            raf = 0;
            observer.disconnect();
            io.disconnect();
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('pointermove', onPointerMove);
            document.documentElement.removeEventListener('pointerleave', onPointerLeave);
        };
    }, [active]);

    return <canvas ref={canvasRef} aria-hidden className="absolute inset-0 h-full w-full" />;
}

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
            className="pointer-events-none absolute w-[188px]"
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

export function PreviewCta() {
    const ref = useRef<HTMLElement>(null);
    const p = useSceneProgress(ref);
    const ready = useMotionReady();
    const mounted = useMounted();
    const shouldReduceMotion = useReducedMotion();
    const launchHref = useLaunchHref();
    // Collapse the pin after mount for reduced-motion users — no dead scroll.
    const pinned = !(mounted && shouldReduceMotion);

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

    const groups: Partial<Record<RocketGroupId, MotionStyle>> = {
        gHull: { y: hullY, opacity: hullOpacity },
        gNose: { y: noseY, opacity: noseOpacity },
        gFinL: { x: finLeftX, rotate: finLeftRotate, opacity: finOpacity },
        gFinR: { x: finRightX, rotate: finRightRotate, opacity: finOpacity },
        gEngine: { y: engineY, opacity: engineOpacity },
    };

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
    const proofOpacity = useTransform(p, (v) => seg(v, COPY[0] + 0.04, 1));

    const litBays = useScrubbed(p, ready, ROCKET_BAYS.length, (v) =>
        DOCK_WINDOWS.filter(([, end]) => v >= end - 0.015).length,
    );
    const flicker = useScrubbed(p, ready, false, (v) => v > IGNITION[0] + 0.02);
    const countdown = useScrubbed(p, ready, LIFTOFF_LABEL, (v) => {
        if (v >= IGNITION[0]) return LIFTOFF_LABEL;
        const t = T_MINUS_START * clamp01(1 - v / IGNITION[0]);
        return `T–${t < T_MINUS_START ? '0' : ''}${t.toFixed(1)}`;
    });
    const launched = countdown === LIFTOFF_LABEL;

    return (
        // Theme-locked: this band is deliberately dark in BOTH themes. The semantic
        // bg-foreground/text-background pair would invert to a white slab in dark
        // mode, so the fixed palette classes are intentional.
        <section
            ref={ref}
            id="cta"
            className="relative w-full bg-slate-950 text-slate-50"
            style={pinned ? { height: `${PIN_VH}vh` } : undefined}
        >
            <div
                className={cn(
                    'overflow-hidden',
                    pinned ? 'sticky top-0 flex min-h-[100svh] items-center' : 'relative py-24',
                )}
            >
                {/* Dot field — drifts down as the camera follows the vehicle up. */}
                <motion.div
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={ready ? { y: fieldY } : undefined}
                >
                    <DotField active={ready} />
                </motion.div>
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-slate-950"
                />

                <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center gap-6 px-6 py-10 text-center">
                    {/* Launch pad: the assembly box is 1:1 with the art's viewBox,
                        so bay coordinates double as docking pixel offsets. */}
                    <motion.div
                        className="relative shrink-0"
                        style={{
                            width: ROCKET_WIDTH,
                            height: ROCKET_HEIGHT,
                            ...(ready ? { scale: cameraScale } : {}),
                        }}
                    >
                        <div className="pointer-events-none absolute left-1/2 top-[188px] h-16 w-56 -translate-x-1/2">
                            <motion.div
                                className="h-full w-full rounded-[50%] bg-amber-400/45 blur-2xl"
                                style={{ opacity: ready ? padGlow : 0 }}
                            />
                        </div>

                        <motion.div
                            className="pointer-events-none absolute inset-0"
                            style={ready ? { x: shakeX, y: liftY } : undefined}
                        >
                            <RocketArt
                                groups={ready ? groups : undefined}
                                litBays={litBays}
                                flame={ready ? flame : undefined}
                                smoke={ready ? smoke : undefined}
                                flicker={flicker}
                            />
                        </motion.div>

                        <ModuleCard
                            p={p}
                            ready={ready}
                            at={DOCK_WINDOWS[0]}
                            from={{ x: -268, y: -76 }}
                            bay={ROCKET_BAYS[0]}
                            glyph={<GaugeGlyph />}
                            label="Fit Score locked"
                            sub="TU Delft · Aerospace"
                            value="92"
                        />
                        <ModuleCard
                            p={p}
                            ready={ready}
                            at={DOCK_WINDOWS[1]}
                            from={{ x: 274, y: 8 }}
                            bay={ROCKET_BAYS[1]}
                            glyph={<DateGlyph />}
                            label="Deadline tracked"
                            sub="Application closes"
                            value="Jan 15"
                        />
                        <ModuleCard
                            p={p}
                            ready={ready}
                            at={DOCK_WINDOWS[2]}
                            from={{ x: -276, y: 84 }}
                            bay={ROCKET_BAYS[2]}
                            glyph={<ChecklistGlyph />}
                            label="Requirements green"
                            sub="Every prerequisite met"
                            value="6/6"
                        />
                    </motion.div>

                    {/* Launch readout — decorative pacing cue, same idiom as the
                        nav's T-minus chip, so it isn't announced. */}
                    <p
                        aria-hidden
                        className={cn(
                            'font-heading text-[0.6875rem] font-semibold uppercase tabular-nums transition-colors duration-300',
                            launched ? 'tracking-[0.2em] text-emerald-400' : 'tracking-[0.28em] text-slate-400',
                        )}
                    >
                        {countdown}
                    </p>

                    <motion.div
                        className="w-full space-y-5"
                        style={ready ? { opacity: copyOpacity, y: copyY } : undefined}
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
                                className="group h-12 bg-white px-8 text-base text-slate-900 shadow-xl transition-all hover:bg-white/90 hover:shadow-2xl"
                            >
                                <Link href={launchHref} className="flex items-center gap-2">
                                    {launchHref === '/dashboard' ? 'Go to dashboard' : 'Build your plan'}
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
                            style={ready ? { opacity: proofOpacity } : undefined}
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
        </section>
    );
}
