'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
    AnimatePresence,
    motion,
    useMotionValueEvent,
    useTransform,
} from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLaunchHref } from '@/hooks/use-launch-href';
import { cn } from '@/lib/utils';
import { LAYOUT_SHIFT_EVENT, useMotionReady, usePageScroll } from './ascent-scroll';
// From the choreography module, never from preview-cta: the finale is lazily
// imported by the page, and reaching into it for two constants would bundle it here.
import { CTA_COPY_POINT, CTA_IGNITION_POINT } from './cta-choreography';
import { useSmoothScroll } from './smooth-scroll';

const NAV_LINKS = [
    { label: 'Inside Ascenda', href: '#features', id: 'features' },
    { label: 'How it works', href: '#how-it-works', id: 'how-it-works' },
    { label: 'FAQ', href: '#faq', id: 'faq' },
];

/** Countdown starts here and runs linearly to zero at the CTA band. */
const T_MINUS_START = 10;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Absolute document offset — offsetTop is relative to offsetParent, so walk the chain. */
function documentTop(el: HTMLElement): number {
    let top = 0;
    let node: HTMLElement | null = el;
    while (node) {
        top += node.offsetTop;
        node = node.offsetParent as HTMLElement | null;
    }
    return top;
}

/**
 * Preview companion bar — StickyNav's chrome plus the three "ascent" instruments
 * from the approved mock:
 *
 *  1. a 2px scroll-progress hairline pinned above the bar,
 *  2. a T-minus countdown chip that runs T–10.0 → READY as you approach the CTA,
 *  3. an "altitude" wash that warms the whole page as you climb.
 *
 * Like StickyNav it starts hidden (`visible` false on first paint, so SSR emits
 * no bar and there is no hydration branch) and slides in once the hero's own
 * topbar — `#preview-hero-topbar` — has scrolled away. Every scroll-driven style
 * sits behind useMotionReady(), so static/reduced-motion users get the settled
 * frame and the instruments simply don't render.
 */
export function PreviewNav() {
    const [visible, setVisible] = useState(false);
    const [overBand, setOverBand] = useState(false);
    const [activeId, setActiveId] = useState<string | null>(null);
    const navCtaRef = useRef<HTMLAnchorElement>(null);
    const [countdown, setCountdown] = useState(`T–${T_MINUS_START.toFixed(1)}`);
    const launchHref = useLaunchHref();
    const ready = useMotionReady();
    const { scrollTo } = useSmoothScroll();

    // One shared document-scroll subscription (see PageScrollProvider) — this file
    // previously owned two of the page's three duplicate ones.
    const { progress: pageProgress, scrollY } = usePageScroll();
    const hairlineScale = useTransform(pageProgress, (v) => clamp01(v));

    // Scroll offset at which the countdown reads READY: ignition, 70% through the
    // CTA band's pinned travel, so the chip flips in the same frame the rocket
    // lights (falls back to "one screen-and-a-bit before the document ends" if
    // the band is ever missing).
    const readyPointRef = useRef<number | null>(null);

    const updateCountdown = useCallback((y: number) => {
        const point = readyPointRef.current;
        if (!point) return;
        const t = T_MINUS_START * clamp01(1 - y / point);
        setCountdown(t <= 0.05 ? 'READY' : `T–${t < T_MINUS_START ? '0' : ''}${t.toFixed(1)}`);
    }, []);

    useEffect(() => {
        const measure = () => {
            const cta = document.getElementById('cta');
            const viewport = window.innerHeight;
            // Pin travel is 0 when the finale's pin is collapsed (reduced motion),
            // which degrades to READY at the band top — the static frame is
            // already fuelled and waiting there.
            const pinTravel = cta ? Math.max(0, cta.offsetHeight - viewport) : 0;
            readyPointRef.current = Math.max(
                1,
                cta
                    ? documentTop(cta) + pinTravel * CTA_IGNITION_POINT
                    : document.documentElement.scrollHeight - viewport * 2.2,
            );
            updateCountdown(window.scrollY);
        };

        // Coalesce to one measure per frame: `measure()` forces three layouts, and
        // its triggers fire in bursts (mobile URL-bar collapse emits `resize`
        // mid-scroll, and a resize drag emits continuously).
        let queued = 0;
        const schedule = () => {
            if (queued) return;
            queued = requestAnimationFrame(() => {
                queued = 0;
                measure();
            });
        };

        // schedule(), not measure(): the ResizeObserver below fires an initial
        // callback of its own, so a synchronous call here would force two full
        // layouts at mount for one result. The pre-measure countdown state (T–10.0)
        // is the correct seed for the frame in between.
        schedule();
        // Document height — not just viewport — because the scenes' pins collapse
        // AFTER mount for reduced-motion users (`pinned` depends on `mounted`, and
        // React flushes this effect before committing that re-render). That removes
        // ~1000vh of pin height without firing `resize`, which used to leave the
        // countdown frozen mid-count. Fonts and next/image settling shift it too.
        const observer = new ResizeObserver(schedule);
        observer.observe(document.documentElement);
        window.addEventListener('resize', schedule, { passive: true });
        // Pinned chapters now also collapse mid-session, one per chapter, each
        // deleting ~1 screen of document height above #cta and compensating the
        // scroll position to match. The ResizeObserver above would eventually
        // catch it, but PinnedScene announces the shift in the same commit as the
        // compensating jump — so the countdown re-maps against the new geometry
        // instead of reading the old ready point for a frame.
        window.addEventListener(LAYOUT_SHIFT_EVENT, schedule);
        return () => {
            cancelAnimationFrame(queued);
            observer.disconnect();
            window.removeEventListener('resize', schedule);
            window.removeEventListener(LAYOUT_SHIFT_EVENT, schedule);
        };
    }, [updateCountdown]);

    useMotionValueEvent(scrollY, 'change', updateCountdown);

    // Land on the payoff — the point where the ask is legible — not the band's top
    // edge, which is the rocket in pieces with the copy still at zero opacity.
    const jumpToLaunch = useCallback(() => {
        const cta = document.getElementById('cta');
        if (!cta) return;
        const pinTravel = Math.max(0, cta.offsetHeight - window.innerHeight);
        const target = documentTop(cta) + pinTravel * CTA_COPY_POINT;
        if (!scrollTo(target)) window.scrollTo({ top: target });
    }, [scrollTo]);

    useEffect(() => {
        const heroTopbar = document.getElementById('preview-hero-topbar');
        if (!heroTopbar) return;

        const observer = new IntersectionObserver(
            ([entry]) => setVisible(!entry.isIntersecting),
            { threshold: 0 },
        );
        observer.observe(heroTopbar);
        return () => observer.disconnect();
    }, []);

    // The CTA band is theme-locked dark in BOTH themes, so the default translucent
    // light bar composites over it into a mid-grey slab — muted links land at
    // 2.37:1 and the bottom hairline disappears. Swap to a dark treatment while the
    // finale owns the screen (which is the page's single longest stretch).
    useEffect(() => {
        const cta = document.getElementById('cta');
        if (!cta) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                setOverBand(entry.isIntersecting);
                // The suppressed nav CTA must not keep keyboard focus while it is
                // invisible and aria-hidden.
                if (entry.isIntersecting && navCtaRef.current?.contains(document.activeElement)) {
                    (document.activeElement as HTMLElement).blur();
                }
            },
            // Shrink the intersection root to (nearly) the viewport's top edge:
            // with the default root, a 170vh section "intersects" the moment its
            // top crosses the viewport BOTTOM — a full screen before the dark band
            // reaches the bar it is restyling. -99% not -100%: a zero-height root
            // is the least interoperable IntersectionObserver corner case, and the
            // remaining ~1% (≈9px) of early flip is imperceptible.
            { threshold: 0, rootMargin: '0px 0px -99% 0px' },
        );
        observer.observe(cta);
        return () => observer.disconnect();
    }, []);

    // Scrollspy: a section is "active" while it straddles the upper-middle band
    // of the viewport. Only one section can occupy the band at a time.
    useEffect(() => {
        const sections = NAV_LINKS
            .map((link) => document.getElementById(link.id))
            .filter((el): el is HTMLElement => el !== null);
        if (sections.length === 0) return;

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setActiveId(entry.target.id);
                    } else {
                        setActiveId((prev) => (prev === entry.target.id ? null : prev));
                    }
                });
            },
            { rootMargin: '-35% 0px -55% 0px', threshold: 0 },
        );
        sections.forEach((section) => observer.observe(section));
        return () => observer.disconnect();
    }, []);

    const launched = countdown === 'READY';

    return (
        <>
            {/* Scroll-progress hairline — above the bar so it reads as the page's own rail. */}
            {ready && (
                <motion.div
                    aria-hidden
                    className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[2px] origin-left bg-gradient-to-r from-primary to-accent"
                    style={{ scaleX: hairlineScale }}
                />
            )}

            <AnimatePresence>
                {visible && (
                    <motion.nav
                        aria-label="Page"
                        className={cn(
                            'fixed inset-x-0 top-0 z-40 border-b shadow-nav backdrop-blur-md transition-colors duration-500',
                            overBand
                                ? 'border-white/10 bg-slate-950/85 supports-[backdrop-filter]:bg-slate-950/75'
                                : 'border-border bg-background/80 supports-[backdrop-filter]:bg-background/70',
                        )}
                        initial={{ y: '-110%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '-110%' }}
                        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-2 sm:gap-4 sm:px-6 lg:px-10">
                            <Link href="/" aria-label="Ascenda home" className="shrink-0">
                                <Image
                                    src="/ascenda-rocket.png"
                                    alt=""
                                    width={34}
                                    height={34}
                                    className="h-[34px] w-[34px] object-contain"
                                />
                            </Link>

                            <div className="hidden items-center gap-1 md:flex">
                                {NAV_LINKS.map((link) => {
                                    const isActive = activeId === link.id;
                                    return (
                                        <a
                                            key={link.href}
                                            href={link.href}
                                            onClick={(event) => {
                                                // Glide instead of teleporting; native anchor
                                                // behaviour when Lenis is off (reduced motion).
                                                if (scrollTo(link.href)) event.preventDefault();
                                            }}
                                            aria-current={isActive ? 'true' : undefined}
                                            className={cn(
                                                'relative rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                                                overBand
                                                    ? isActive
                                                        ? 'text-white'
                                                        : 'text-slate-300 hover:text-white'
                                                    : isActive
                                                      ? 'text-primary'
                                                      : 'text-muted-foreground hover:text-foreground',
                                            )}
                                        >
                                            {isActive && (
                                                <motion.span
                                                    layoutId="previewnav-pill"
                                                    className={cn(
                                                        'absolute inset-0 rounded-full',
                                                        overBand ? 'bg-white/10' : 'bg-primary/10',
                                                    )}
                                                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                                                    aria-hidden
                                                />
                                            )}
                                            <span className="relative">{link.label}</span>
                                        </a>
                                    );
                                })}
                            </div>

                            {/* One right-hand cluster: the countdown belongs TO the CTA
                                (it counts down to it, and clicking it goes there), so it
                                hugs the button instead of floating mid-bar between the
                                links and the edge. */}
                            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                                {/* T-minus chip — a real control, because a countdown that
                                    promises arrival should be able to take you there. The
                                    ticking value itself stays aria-hidden behind a stable
                                    label so AT isn't read a changing number. */}
                                <button
                                    type="button"
                                    onClick={jumpToLaunch}
                                    aria-label="Jump to sign-up"
                                    className={cn(
                                        'hidden shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 font-heading text-xs font-semibold tracking-[0.07em] tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex',
                                        overBand
                                            ? launched
                                                ? 'border-emerald-400/50 text-emerald-400'
                                                : 'border-white/15 text-slate-300 hover:text-white'
                                            : launched
                                              ? 'border-emerald-500/45 text-emerald-600 dark:text-emerald-400'
                                              : 'border-border text-muted-foreground hover:text-foreground',
                                    )}
                                >
                                    {/* CSS, not framer: an Infinity-repeat JS animation held
                                        framer's frameloop awake page-wide for a 6px dot.
                                        globals.css's reduced-motion block already zeroes CSS
                                        animation durations, so no preference branch here. */}
                                    <span
                                        aria-hidden
                                        className={cn(
                                            'h-1.5 w-1.5 rounded-full',
                                            launched ? 'bg-emerald-500' : 'bg-primary',
                                        )}
                                        style={{ animation: 'soft-pulse 1.6s ease-in-out infinite' }}
                                    />
                                    <span aria-hidden>{countdown}</span>
                                </button>

                                {/* Suppressed over the finale: the band has its own primary
                                    CTA with the same label, and two competing primaries at
                                    the conversion moment is exactly what the design rules
                                    forbid. */}
                                <Button
                                    asChild
                                    size="sm"
                                    className={cn(
                                        'group rounded-full bg-primary text-primary-foreground shadow-[0_0_20px_-6px_rgba(99,102,241,0.5)] transition-opacity hover:bg-primary/90',
                                        overBand && 'pointer-events-none opacity-0',
                                    )}
                                    tabIndex={overBand ? -1 : undefined}
                                    aria-hidden={overBand || undefined}
                                >
                                    <Link ref={navCtaRef} href={launchHref} className="flex items-center gap-1.5">
                                        Build your plan
                                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                                    </Link>
                                </Button>
                            </div>
                        </div>
                    </motion.nav>
                )}
            </AnimatePresence>
        </>
    );
}
