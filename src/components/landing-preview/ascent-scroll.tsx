'use client';

import {
    type ReactNode,
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    MotionValue,
    useMotionValue,
    useMotionValueEvent,
    useReducedMotion,
    useScroll,
    useSpring,
} from 'framer-motion';

/**
 * Shared scroll plumbing for the landing page: the document-scroll subscription,
 * the motion-readiness gate, and the scrub primitives every scrubbed band builds
 * on. Deliberately hook/context only — the pinned-section machinery lives in
 * pinned-stage.tsx, which keeps this module free of any import cycle with
 * smooth-scroll.tsx (which imports PageScrollProvider from here).
 */

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Normalised 0→1 progress of the [a, b] slice of a scrub's travel. */
export const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Derive React state from a scroll MotionValue. For values that CANNOT be a
 * MotionValue — text content and conditional classNames. `final` is what SSR and
 * reduced-motion users see, so the static frame is the end of the story.
 *
 * Keep the callback stable: `useMotionValueEvent` re-subscribes whenever the
 * callback identity changes, and scrubbed components re-render every frame.
 */
export function useScrubbed<T>(
    p: MotionValue<number>,
    ready: boolean,
    final: T,
    compute: (v: number) => T,
): T {
    const [value, setValue] = useState<T>(final);
    const computeRef = useRef(compute);
    computeRef.current = compute;
    const readyRef = useRef(ready);
    readyRef.current = ready;

    const update = useCallback((v: number) => {
        if (readyRef.current) setValue(computeRef.current(v));
    }, []);

    useMotionValueEvent(p, 'change', update);
    // Seed from the current scroll position: `change` only fires on movement, so a
    // band entered without scrolling (deep link, restored position, a pin armed
    // post-mount) needs this or it renders frame zero.
    useEffect(() => {
        if (ready) update(p.get());
    }, [p, ready, update]);

    return ready ? value : final;
}

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
 * The one scrub-smoothing knob for every scrubbed band. With Lenis smoothing the
 * scroll itself (smooth-scroll.tsx), this spring is deliberately stiff — it
 * acts as micro-smoothing on top of the glide, not a second inertia layer
 * (the original 90/26 read as floaty lag once Lenis landed).
 */
export const SCENE_SPRING = { stiffness: 170, damping: 30, mass: 0.7 };

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
