'use client';

import {
    ReactNode,
    RefObject,
    createContext,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    MotionValue,
    motion,
    useReducedMotion,
    useScroll,
    useSpring,
    useTransform,
} from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * Post-mount gate (the HeroSection `bgEnhanced` pattern): scroll-driven styles
 * must never be part of the SSR payload — the page renders at its final,
 * fully-legible state and motion layers in after hydration. Returns false for
 * reduced-motion users, so they keep the static final frame.
 */
export function useMotionReady(): boolean {
    const shouldReduceMotion = useReducedMotion();
    const [ready, setReady] = useState(false);
    useEffect(() => setReady(!shouldReduceMotion), [shouldReduceMotion]);
    return ready;
}

/** True once mounted, regardless of motion preference. */
export function useMounted(): boolean {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    return mounted;
}

/**
 * The one scrub-smoothing knob for every pinned scene. With Lenis smoothing the
 * scroll itself (smooth-scroll.tsx), this spring is deliberately stiff — it
 * acts as micro-smoothing on top of the glide, not a second inertia layer
 * (the original 90/26 read as floaty lag once Lenis landed).
 */
export const SCENE_SPRING = { stiffness: 170, damping: 30, mass: 0.7 };

/**
 * Smoothed 0→1 progress across a pinned scene's scroll travel (start of the
 * tall section hitting the viewport top → end of it leaving). The spring is
 * the "inertial smoothing" from the approved mock — scrubbed values ease
 * toward the scrollbar instead of snapping.
 */
export function useSceneProgress(target: RefObject<HTMLElement | null>): MotionValue<number> {
    const { scrollYProgress } = useScroll({ target, offset: ['start start', 'end end'] });
    return useSpring(scrollYProgress, SCENE_SPRING);
}

const PAGE_SPRING = { stiffness: 80, damping: 24 };

interface PageScroll {
    /** Smoothed 0→1 progress of the whole document (nav hairline, altitude wash). */
    progress: MotionValue<number>;
    /** Raw scroll offset in px (the countdown needs pixels, not normalised progress). */
    scrollY: MotionValue<number>;
}

const PageScrollContext = createContext<PageScroll | null>(null);

/**
 * One document-scroll subscription for the whole page. Every framer scroll handler
 * re-measures on each scroll event — and Lenis dirties layout every frame — so the
 * three separate `usePageProgress()` call sites this replaces cost three measure
 * passes and three springs per frame to compute one identical value.
 */
export function PageScrollProvider({ children }: { children: ReactNode }) {
    const { scrollY, scrollYProgress } = useScroll();
    const progress = useSpring(scrollYProgress, PAGE_SPRING);
    const value = useMemo<PageScroll>(() => ({ progress, scrollY }), [progress, scrollY]);
    return <PageScrollContext.Provider value={value}>{children}</PageScrollContext.Provider>;
}

export function usePageScroll(): PageScroll {
    const ctx = useContext(PageScrollContext);
    if (!ctx) throw new Error('usePageScroll must be used inside <PageScrollProvider>');
    return ctx;
}

/** Smoothed 0→1 progress of the whole document. */
export function usePageProgress(): MotionValue<number> {
    return usePageScroll().progress;
}

export interface SceneChapter {
    num: string; // '01'
    of: string; // '03'
    label: string; // 'Fit Score'
}

export interface SceneCtx {
    /** Springed 0→1 progress through the pinned travel. */
    p: MotionValue<number>;
    /** False until mounted, and always false for reduced-motion users. */
    ready: boolean;
}

/**
 * Pinned scrubbed scene scaffold: a tall section with a sticky full-viewport
 * stage inside. Handles the chapter header, ghost numeral, copy/shot entrance
 * and 3D tilt; scene-specific choreography lives in the `shot` render prop.
 *
 * Reduced-motion (and pre-JS) users see the final frame; after mount the pin
 * collapses entirely for them so there is no dead scroll.
 */
export function PinnedScene({
    chapter,
    title,
    body,
    chips,
    cue,
    ghost: _ghost,
    ghostDrift = -0.5,
    flip = false,
    alt = false,
    pinVh = 250,
    shot,
}: {
    chapter: SceneChapter;
    title: ReactNode;
    body: string;
    chips: string[];
    cue: string;
    /** @deprecated the watermark now derives from chapter.num (Luke-style solid numeral). */
    ghost?: string;
    /** Horizontal drift factor for the watermark numeral (-1..1). */
    ghostDrift?: number;
    flip?: boolean;
    alt?: boolean;
    pinVh?: number;
    shot: (ctx: SceneCtx) => ReactNode;
}) {
    const ref = useRef<HTMLElement>(null);
    const p = useSceneProgress(ref);
    const ready = useMotionReady();
    const mounted = useMounted();
    const shouldReduceMotion = useReducedMotion();
    // Collapse the pin after mount for reduced-motion users — no dead scroll.
    const pinned = !(mounted && shouldReduceMotion);

    const enter = useTransform(p, [0, 0.18], [0, 1], { clamp: true });
    const shotOpacity = useTransform(enter, [0, 0.75], [0, 1]);
    const shotY = useTransform(enter, [0, 1], [48, 0]);
    const shotScale = useTransform(enter, [0, 1], [0.95, 1]);
    const shotRotateX = useTransform(enter, [0, 1], [6, 0]);
    const shotRotateY = useTransform(enter, [0, 1], [flip ? 8 : -8, 0]);
    const copyOpacity = useTransform(p, [0, 0.14], [0, 1]);
    const copyY = useTransform(p, [0, 0.14], [24, 0]);
    const ghostX = useTransform(p, (v) => `${(v - 0.5) * ghostDrift * 55}vw`);
    // Exit ease — mirror of the entrance: over the last stretch of travel the
    // chapter's CONTENT (copy, shot and watermark together) visibly hands off to
    // the next one instead of snapping loose the instant the pin releases.
    // Deliberately not applied to the sticky stage itself: that carries the `alt`
    // background slab, and lifting it would expose a 24px strip of page beneath.
    const exitY = useTransform(p, [0.92, 1], [0, -24]);
    const exitOpacity = useTransform(p, [0.92, 1], [1, 0.85]);
    // The numeral is centred with a -50% translate, so its exit offset has to
    // compose with that rather than replace it.
    const ghostY = useTransform(exitY, (v) => `calc(-50% + ${v}px)`);

    return (
        <section
            ref={ref}
            className="relative"
            // svh: toolbar-invariant on mobile, identical to vh on desktop.
            style={pinned ? { height: `${pinVh}svh` } : undefined}
        >
            <div
                className={cn(
                    'overflow-hidden',
                    pinned
                        ? 'sticky top-0 flex min-h-[100svh] items-center py-16'
                        : 'relative py-20',
                    alt && 'bg-secondary/40',
                )}
            >
                {/* Watermark chapter numeral — solid, very low contrast, structural
                    (Luke-style "01 / 05" markers); the legible header is below. */}
                <motion.p
                    aria-hidden
                    className={cn(
                        'pointer-events-none absolute top-1/2 z-0 -translate-y-1/2 select-none whitespace-nowrap font-heading text-[clamp(220px,42vw,520px)] font-bold leading-none tracking-tighter text-foreground/[0.04] dark:text-foreground/[0.05]',
                        flip ? 'right-[-4%]' : 'left-[-4%]',
                    )}
                    style={ready ? { x: ghostX, y: ghostY, opacity: exitOpacity } : undefined}
                >
                    {chapter.num}
                </motion.p>
                <motion.div
                    className="relative z-10 mx-auto w-full max-w-7xl px-6"
                    style={ready ? { y: exitY, opacity: exitOpacity } : undefined}
                >
                    <div
                        className={cn(
                            'grid items-center gap-10 lg:gap-16 [perspective:1400px]',
                            'lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]',
                        )}
                    >
                        <motion.div
                            className={cn('max-w-xl', flip && 'lg:order-2')}
                            style={ready ? { opacity: copyOpacity, y: copyY } : undefined}
                        >
                            <div className="flex items-baseline gap-3">
                                <span className="font-heading text-5xl font-bold leading-none tracking-tight text-primary tabular-nums lg:text-6xl">
                                    {chapter.num}
                                </span>
                                <span className="font-heading text-base font-semibold text-muted-foreground/70 tabular-nums">
                                    / {chapter.of}
                                </span>
                                <span className="ml-1 rounded-full border border-primary/30 bg-primary/[0.08] px-3.5 py-1.5 font-heading text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                                    {chapter.label}
                                </span>
                            </div>
                            <h3 className="mt-5 font-heading text-3xl font-bold leading-[1.08] tracking-tight text-foreground sm:text-4xl lg:text-[2.75rem]">
                                {title}
                            </h3>
                            <p className="mt-4 text-base leading-relaxed text-muted-foreground lg:text-lg">
                                {body}
                            </p>
                            <div className="mt-4 flex flex-wrap gap-2">
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
                            <p className="mt-5 flex items-center gap-2.5 font-heading text-[0.6875rem] uppercase tracking-[0.1em] text-muted-foreground/70">
                                <span aria-hidden className="h-px w-6 bg-border" />
                                {cue}
                            </p>
                        </motion.div>
                        <motion.div
                            className={cn('[transform-style:preserve-3d]', flip && 'lg:order-1')}
                            style={
                                ready
                                    ? {
                                          opacity: shotOpacity,
                                          y: shotY,
                                          scale: shotScale,
                                          rotateX: shotRotateX,
                                          rotateY: shotRotateY,
                                      }
                                    : undefined
                            }
                        >
                            {shot({ p, ready })}
                        </motion.div>
                    </div>
                </motion.div>
            </div>
        </section>
    );
}
