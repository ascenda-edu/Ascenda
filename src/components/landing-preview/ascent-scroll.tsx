'use client';

import {
    ReactNode,
    RefObject,
    createContext,
    useContext,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    MotionValue,
    motion,
    useMotionValue,
    useMotionValueEvent,
    useReducedMotion,
    useScroll,
    useSpring,
    useTransform,
} from 'framer-motion';
import { cn } from '@/lib/utils';
// Import cycle by design: smooth-scroll.tsx imports PageScrollProvider from here.
// It is inert — both directions are referenced only at render/call time, never
// during module evaluation, so whichever module the bundler reaches first the
// other's bindings are initialised by the time anything reads them.
import { useSmoothScroll } from './smooth-scroll';

/**
 * Fired once a pinned scene has collapsed and its compensating scroll jump has
 * landed. A collapse removes ~1 screen of document height WITHOUT a `resize`
 * event, so anything caching a document offset (the nav's T-minus countdown maps
 * scroll offsets onto `#cta`'s position) has to re-measure.
 */
export const LAYOUT_SHIFT_EVENT = 'ascenda:layout-shift';

/**
 * The collapse compensation has to land before paint or the page visibly jumps,
 * but React warns when a component calls useLayoutEffect during SSR — so alias it
 * on the server, exactly as framer-motion does internally. Nothing in this effect
 * runs outside the browser anyway.
 */
const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * One-way scroll progress: mirrors `source` but never decreases, so scrubbed
 * reveals play forward once and stay settled when the user scrolls back up —
 * content that has "loaded" never unloads (2026-07 polish pass decision).
 *
 * Latch the RAW scrollYProgress and spring the latched value, not the other
 * way around: latching a spring's output would freeze any overshoot as the
 * permanent maximum.
 */
export function useLatchedProgress(source: MotionValue<number>): MotionValue<number> {
    const latched = useMotionValue(source.get());
    useEffect(() => {
        const sync = (v: number) => {
            if (v > latched.get()) latched.set(v);
        };
        sync(source.get());
        return source.on('change', sync);
    }, [source, latched]);
    return latched;
}

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
    /**
     * Springed 0→1 progress through the pinned travel. Latched: it never runs
     * backwards, so scene choreography plays forward once and stays settled.
     */
    p: MotionValue<number>;
    /**
     * False until mounted, always false for reduced-motion users, and false again
     * once the scene has collapsed — in all three cases the shot renders its
     * static final frame.
     */
    ready: boolean;
}

/**
 * Pinned scrubbed scene scaffold: a tall section with a sticky full-viewport
 * stage inside. Handles the chapter header, ghost numeral, copy/shot entrance
 * and 3D tilt; scene-specific choreography lives in the `shot` render prop.
 *
 * Reduced-motion (and pre-JS) users see the final frame; after mount the pin
 * collapses entirely for them so there is no dead scroll.
 *
 * The pin is also strictly single-use (2026-07 polish pass): a chapter that has
 * been scrubbed to the end and then scrolled off the top collapses to a plain,
 * fully-settled section — same rendering reduced-motion users get — with the lost
 * height compensated out of the scroll position before paint. Scrolling back up
 * re-reads the chapter as a normal band of the page instead of forcing the whole
 * pin travel again in reverse.
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
    pinVh = 190,
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
    const { scrollYProgress: raw } = useScroll({ target: ref, offset: ['start start', 'end end'] });
    // Two springs off the one raw progress, deliberately:
    //  · `p` springs the LATCHED value — every scrubbed reveal in the scene (and
    //    everything the `shot` render prop derives from ctx.p) plays forward once
    //    and holds, so nothing un-animates on the way back up;
    //  · `live` springs the raw value and therefore tracks both directions. Only
    //    the exit handoff reads it: latching that would leave a chapter the user
    //    has already passed permanently dimmed and lifted by 24px.
    // Latching before the spring, never after — see useLatchedProgress.
    const p = useSpring(useLatchedProgress(raw), SCENE_SPRING);
    const live = useSpring(raw, SCENE_SPRING);
    const ready = useMotionReady();
    const mounted = useMounted();
    const shouldReduceMotion = useReducedMotion();
    const [collapsed, setCollapsed] = useState(false);
    // Collapse the pin after mount for reduced-motion users — no dead scroll —
    // and for everyone else once the chapter has played out and left the screen.
    const pinned = !(mounted && shouldReduceMotion) && !collapsed;
    // Scrubbed styles live and die with the pin: a collapsed scene renders the
    // static final frame, byte for byte the one reduced-motion users get.
    const scrub = ready && !collapsed;
    const { jumpBy } = useSmoothScroll();

    // Refs, not state: this runs inside a scroll subscription, and re-rendering
    // per frame to track "has it finished" would undo the whole point of driving
    // the scene with MotionValues.
    const completedRef = useRef(false);
    const collapsedRef = useRef(false);
    /** Pinned height + viewport-relative bottom edge captured at collapse time. */
    const heightRef = useRef(0);
    const bottomRef = useRef(0);

    useMotionValueEvent(raw, 'change', (v) => {
        // 0.999, not 1: the closing frame of a scrub routinely lands a hair short.
        if (v >= 0.999) completedRef.current = true;
    });

    // The "gone above the viewport" check CANNOT ride `raw`: MotionValue only
    // notifies when the value actually changes, and once the user scrolls past
    // the section `scrollYProgress` sits clamped at 1 — the exact stretch where
    // the section's bottom finally crosses the viewport top is silent. Page
    // scrollY keeps changing, so the check rides that instead.
    const { scrollY: pageScrollY } = usePageScroll();
    useMotionValueEvent(pageScrollY, 'change', () => {
        if (!completedRef.current || collapsedRef.current) return;
        const node = ref.current;
        if (!node) return;
        // Only once the WHOLE section sits above the viewport. Collapsing while any
        // of it is still on screen would pull a screen of height out from under
        // content the user is reading. (One rect read per frame, and only during
        // the stretch between "finished" and "gone".)
        const bottom = node.getBoundingClientRect().bottom;
        if (bottom > 0) return;
        collapsedRef.current = true;
        heightRef.current = node.offsetHeight;
        bottomRef.current = bottom;
        setCollapsed(true);
    });

    useBeforePaint(() => {
        if (!collapsed) return;
        const node = ref.current;
        if (!node) return;

        const delta = heightRef.current - node.offsetHeight;
        if (delta > 0) {
            // The section shrank entirely above the viewport, so everything below
            // it just moved up by `delta`. Scroll up by the same amount, before
            // paint, and the user sees nothing move at all.
            if (!jumpBy(-delta)) {
                // Native path only: the browser's own scroll anchoring may already
                // have absorbed this shift, in which case the jump above
                // double-counted it. Trust the measurement instead of the maths —
                // put the section's bottom edge back where it was.
                const residual = node.getBoundingClientRect().bottom - bottomRef.current;
                if (Math.abs(residual) > 0.5) window.scrollBy(0, residual);
            }
        }
        window.dispatchEvent(new Event(LAYOUT_SHIFT_EVENT));
    }, [collapsed, jumpBy]);

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
    // Driven by `live`, not `p`: a handoff is a position, not a reveal, so it has
    // to un-happen when the user scrolls back into the chapter.
    const exitY = useTransform(live, [0.92, 1], [0, -24]);
    const exitOpacity = useTransform(live, [0.92, 1], [1, 0.85]);
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
                    style={scrub ? { x: ghostX, y: ghostY, opacity: exitOpacity } : undefined}
                >
                    {chapter.num}
                </motion.p>
                <motion.div
                    className="relative z-10 mx-auto w-full max-w-7xl px-6"
                    style={scrub ? { y: exitY, opacity: exitOpacity } : undefined}
                >
                    <div
                        className={cn(
                            'grid items-center gap-10 lg:gap-16 [perspective:1400px]',
                            'lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]',
                        )}
                    >
                        <motion.div
                            className={cn('max-w-xl', flip && 'lg:order-2')}
                            style={scrub ? { opacity: copyOpacity, y: copyY } : undefined}
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
                                scrub
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
                            {/* `scrub`, not `ready`: a collapsed scene hands the shot
                                the same static-final-frame contract it gets on SSR —
                                which for a chapter played to the end is the frame it
                                is already showing, so the swap is invisible. */}
                            {shot({ p, ready: scrub })}
                        </motion.div>
                    </div>
                </motion.div>
            </div>
        </section>
    );
}
