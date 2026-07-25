'use client';

import { createContext, ReactNode, useContext, useEffect, useMemo, useRef } from 'react';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

interface SmoothScrollApi {
    /**
     * Glide to an anchor (`'#cta'`), pixel offset or element. Returns false when
     * Lenis is off (reduced motion, pre-mount) so callers fall back to native
     * anchor behaviour.
     */
    scrollTo: (target: string | number | HTMLElement) => boolean;
}

const SmoothScrollContext = createContext<SmoothScrollApi>({ scrollTo: () => false });

export function useSmoothScroll(): SmoothScrollApi {
    return useContext(SmoothScrollContext);
}

/** expo-out — long glide that lands softly, matching the scenes' springed scrub. */
const easeExpoOut = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

/**
 * Page-scoped Lenis smooth scrolling for the preview. Instantiated on mount and
 * destroyed on unmount, so the rest of the app never sees it. Lenis animates the
 * real `scrollTop`, which is why every existing `position: sticky` pin and
 * framer `useScroll` scrub inherits the smoothing with no changes.
 *
 * Reduced-motion users keep fully native scrolling — the check runs post-mount
 * (never an SSR branch, per the preview's hydration rules). Touch input stays
 * native (Lenis default); only wheel scrolling is smoothed.
 *
 * `lenis/dist/lenis.css` is safe to import globally: every rule is scoped to
 * the `.lenis*` classes Lenis stamps on <html> while alive, including the
 * `scroll-behavior: auto` override that stops the app-wide
 * `html { scroll-behavior: smooth }` from double-animating anchor jumps.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
    const lenisRef = useRef<Lenis | null>(null);

    useEffect(() => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        const lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
        lenisRef.current = lenis;

        let rafId = requestAnimationFrame(function raf(time: number) {
            lenis.raf(time);
            rafId = requestAnimationFrame(raf);
        });

        return () => {
            cancelAnimationFrame(rafId);
            lenis.destroy();
            lenisRef.current = null;
        };
    }, []);

    const api = useMemo<SmoothScrollApi>(
        () => ({
            scrollTo: (target) => {
                const lenis = lenisRef.current;
                if (!lenis) return false;
                lenis.scrollTo(target, { duration: 1.2, easing: easeExpoOut });
                return true;
            },
        }),
        [],
    );

    return <SmoothScrollContext.Provider value={api}>{children}</SmoothScrollContext.Provider>;
}
