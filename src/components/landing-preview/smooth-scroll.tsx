'use client';

import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { PageScrollProvider } from './ascent-scroll';

interface SmoothScrollApi {
    /**
     * Glide to an anchor (`'#cta'`), pixel offset or element. Returns false when
     * Lenis is off (reduced motion, pre-mount, coarse pointer, or the tick before
     * its chunk has loaded) OR when an anchor doesn't resolve, so callers can fall
     * back to native anchor behaviour rather than swallowing the click — Lenis
     * itself only warns and returns in that case.
     */
    scrollTo: (target: string | number | HTMLElement) => boolean;
    /**
     * Instant, unanimated scroll adjustment — the pin-collapse compensation in
     * PinnedScene, where the whole point is that nothing appears to move.
     * Returns true when Lenis owns the offset and false when the native
     * fallback ran, so callers that also have to reason about the browser's own
     * scroll anchoring can tell which engine just moved the page.
     */
    jumpBy: (delta: number) => boolean;
}

const SmoothScrollContext = createContext<SmoothScrollApi>({
    scrollTo: () => false,
    // Outside the provider there is no Lenis to keep in sync, so the native jump
    // is the whole implementation (only ever called from effects, never on SSR).
    jumpBy: (delta) => {
        window.scrollBy(0, delta);
        return false;
    },
});

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
 * (never an SSR branch, per the preview's hydration rules). Lenis only smooths
 * the wheel (`syncTouch` is off by default), so it is skipped entirely on coarse
 * pointers, where it would install a perpetual rAF and eight listeners to smooth
 * nothing at all. Neither capability is downloaded for, either: the library is
 * imported inside the effect, after both guards.
 *
 * `lenis/dist/lenis.css` is safe to import here: every rule is scoped to the
 * `.lenis*` classes Lenis stamps on <html>, and Next scopes the import to this
 * route's stylesheet. It does NOT contain a `scroll-behavior` override — the
 * app-wide `html { scroll-behavior: smooth }` in globals.css is instead defused
 * by Lenis writing scroll with `behavior: 'instant'`, and for the native-anchor
 * fallback path by globals.css's own reduced-motion `scroll-behavior: auto`.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
    const lenisRef = useRef<Lenis | null>(null);
    // Starts false so SSR and the first paint emit the native-scroll tree; Lenis
    // has only ever existed post-mount, so this is not a new behaviour.
    const [enabled, setEnabled] = useState(false);

    // Capability is tracked for the session's whole life, not sampled once:
    // plugging a mouse into a tablet, or flipping the OS reduced-motion switch,
    // otherwise leaves the page in the mode it booted in until a reload.
    useEffect(() => {
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
        // Nothing to smooth without a wheel, and instantiating anyway would cost a
        // permanent rAF plus eight listeners on every phone.
        const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
        const sync = () => setEnabled(fine.matches && !reduced.matches);

        sync();
        reduced.addEventListener('change', sync);
        fine.addEventListener('change', sync);
        return () => {
            reduced.removeEventListener('change', sync);
            fine.removeEventListener('change', sync);
        };
    }, []);

    useEffect(() => {
        if (!enabled) return;

        let alive = true;
        let lenis: Lenis | null = null;
        let rafId = 0;

        // Lenis registers no `keydown` listener, so PageDown/Space/Home/End would
        // otherwise jump natively while the wheel glides — two physics on one page,
        // with the harsher one going to keyboard users.
        // Reads the instance off the ref rather than closing over it: the handler is
        // defined before the chunk resolves.
        const onKeyDown = (event: KeyboardEvent) => {
            const instance = lenisRef.current;
            if (!instance) return;
            if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
            const target = event.target as HTMLElement | null;
            // Never hijack keys while focus is on anything interactive. Space is
            // the dangerous one: a button's synthetic click fires on keyup only if
            // its Space KEYDOWN ran the default handler, so preventDefault() here
            // would silently break keyboard activation of every button on the page
            // (FAQ accordion, the countdown chip). Fields keep their keys too.
            if (
                target?.closest(
                    'button, [role="button"], a[href], summary, input, textarea, select, ' +
                        '[contenteditable=""], [contenteditable="true"], ' +
                        '[role="checkbox"], [role="switch"], [role="menuitem"], [role="option"], [role="tab"]',
                )
            ) {
                return;
            }

            const page = window.innerHeight * 0.9;
            let to: number | null = null;
            if (event.key === 'PageDown' || (event.key === ' ' && !event.shiftKey)) to = instance.actualScroll + page;
            else if (event.key === 'PageUp' || (event.key === ' ' && event.shiftKey)) to = instance.actualScroll - page;
            else if (event.key === 'Home') to = 0;
            else if (event.key === 'End') to = document.documentElement.scrollHeight;
            if (to === null) return;

            event.preventDefault();
            instance.scrollTo(to, { duration: 0.8, easing: easeExpoOut });
        };

        // Deferred import: Lenis is ~6 kB gz of critical-path JS that every phone
        // and every reduced-motion visitor would download only for the guards above
        // to discard it. `scrollTo` reports false until this resolves, and each
        // caller already has a native fallback for that.
        void import('lenis').then(({ default: LenisCtor }) => {
            if (!alive) return;
            const instance = new LenisCtor({ lerp: 0.1, smoothWheel: true });
            lenis = instance;
            lenisRef.current = instance;

            rafId = requestAnimationFrame(function raf(time: number) {
                instance.raf(time);
                rafId = requestAnimationFrame(raf);
            });
            window.addEventListener('keydown', onKeyDown);
        });

        return () => {
            alive = false;
            cancelAnimationFrame(rafId);
            window.removeEventListener('keydown', onKeyDown);
            lenis?.destroy();
            lenisRef.current = null;
        };
    }, [enabled]);

    const api = useMemo<SmoothScrollApi>(
        () => ({
            scrollTo: (target) => {
                const lenis = lenisRef.current;
                if (!lenis) return false;

                // Resolve anchors ourselves: Lenis only console.warns and returns
                // for a missing target, and callers preventDefault() on `true` —
                // so reporting success blindly turns a renamed section into a link
                // that does nothing at all, which is worse than no smoothing.
                let node: HTMLElement | null = null;
                if (typeof target === 'string') {
                    if (!target.startsWith('#')) return false;
                    node = document.getElementById(target.slice(1));
                    if (!node) return false;
                } else if (typeof target !== 'number') {
                    node = target;
                }

                // Runs when the glide lands, not while it is in flight: an engine
                // that ignores `preventScroll` would otherwise teleport mid-glide.
                const el = node;
                const settle = el
                    ? () => {
                          // preventDefault() cost us both of native fragment navigation's
                          // side effects: a shareable/back-navigable hash, and the reset of
                          // the sequential-focus starting point (without which the next Tab
                          // continues from the nav, not the section just navigated to).
                          // Repeated clicks replace rather than push — native fragment
                          // navigation adds no history entry when the URL is unchanged,
                          // and five identical #faq entries would break the Back button.
                          const href = `#${el.id}`;
                          if (location.hash === href) history.replaceState(null, '', href);
                          else history.pushState(null, '', href);
                          if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
                          // A programmatically-focused section must not draw the UA focus
                          // ring around its entire box.
                          el.classList.add('outline-none');
                          el.focus({ preventScroll: true });
                      }
                    : undefined;

                lenis.scrollTo(node ?? (target as number), {
                    duration: 1.2,
                    easing: easeExpoOut,
                    onComplete: settle,
                });
                return true;
            },
            jumpBy: (delta) => {
                const lenis = lenisRef.current;
                if (!lenis) {
                    // Coarse pointer, reduced motion, or the tick before the chunk
                    // resolves: nothing is animating the scroll, so the native jump
                    // IS the truth. Reported as false — the caller may need to
                    // account for the browser's own scroll anchoring.
                    window.scrollBy(0, delta);
                    return false;
                }

                // Through Lenis, never window.scrollBy: mid-glide Lenis writes the
                // real scrollTop from its own `targetScroll` on every rAF, so a
                // native jump would be lerped straight back out within a frame or
                // two. Moving `targetScroll` instead keeps the glide continuous.
                // `immediate` because this must be invisible rather than animated
                // (an eased "compensation" is exactly the jump it exists to hide),
                // and `force` so it is not clamped or dropped while an animation is
                // in flight or the instance is momentarily stopped.
                lenis.scrollTo(lenis.targetScroll + delta, { immediate: true, force: true });
                return true;
            },
        }),
        [],
    );

    return (
        <SmoothScrollContext.Provider value={api}>
            {/* Nested here so the page needs one wrapper: the scroll subscription and
                the smoothing that drives it share a lifetime. */}
            <PageScrollProvider>{children}</PageScrollProvider>
        </SmoothScrollContext.Provider>
    );
}
