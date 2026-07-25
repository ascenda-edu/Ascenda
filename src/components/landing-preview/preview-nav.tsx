'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
    AnimatePresence,
    motion,
    useMotionValueEvent,
    useReducedMotion,
    useScroll,
    useTransform,
} from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLaunchHref } from '@/hooks/use-launch-href';
import { cn } from '@/lib/utils';
import { useMotionReady, usePageProgress } from './ascent-scroll';

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
    const [activeId, setActiveId] = useState<string | null>(null);
    const [countdown, setCountdown] = useState(`T–${T_MINUS_START.toFixed(1)}`);
    const launchHref = useLaunchHref();
    const shouldReduceMotion = useReducedMotion();
    const ready = useMotionReady();

    const pageProgress = usePageProgress();
    const hairlineScale = useTransform(pageProgress, (v) => clamp01(v));

    // Scroll offset at which the countdown reads READY. Prefer the CTA section's
    // own position; it carries no id today, so fall back to "one screen-and-a-bit
    // before the document ends", which lands in the same band.
    const readyPointRef = useRef<number | null>(null);
    const { scrollY } = useScroll();

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
            readyPointRef.current = Math.max(
                1,
                cta
                    ? documentTop(cta) - viewport * 0.6
                    : document.documentElement.scrollHeight - viewport * 2.2,
            );
            updateCountdown(window.scrollY);
        };

        measure();
        window.addEventListener('resize', measure, { passive: true });
        return () => window.removeEventListener('resize', measure);
    }, [updateCountdown]);

    useMotionValueEvent(scrollY, 'change', updateCountdown);

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
                        className="fixed inset-x-0 top-0 z-40 border-b border-border bg-background/80 shadow-nav backdrop-blur-md supports-[backdrop-filter]:bg-background/70"
                        initial={{ y: '-110%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '-110%' }}
                        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                    >
                        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-2 sm:gap-4 sm:px-6 lg:px-10">
                            <Link href="/landing-preview" aria-label="Ascenda home" className="shrink-0">
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
                                            aria-current={isActive ? 'true' : undefined}
                                            className={cn(
                                                'relative rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                                                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                                            )}
                                        >
                                            {isActive && (
                                                <motion.span
                                                    layoutId="previewnav-pill"
                                                    className="absolute inset-0 rounded-full bg-primary/10"
                                                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                                                    aria-hidden
                                                />
                                            )}
                                            <span className="relative">{link.label}</span>
                                        </a>
                                    );
                                })}
                            </div>

                            {/* T-minus chip — decorative pacing cue, hidden from
                                assistive tech so the ticking value isn't announced. */}
                            <span
                                aria-hidden
                                className={cn(
                                    'hidden shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 font-heading text-xs font-semibold tracking-[0.07em] tabular-nums transition-colors sm:inline-flex',
                                    launched
                                        ? 'border-emerald-500/45 text-emerald-600 dark:text-emerald-400'
                                        : 'border-border text-muted-foreground',
                                )}
                            >
                                <motion.span
                                    className={cn(
                                        'h-1.5 w-1.5 rounded-full',
                                        launched ? 'bg-emerald-500' : 'bg-primary',
                                    )}
                                    animate={{ opacity: [1, 0.3, 1] }}
                                    transition={
                                        shouldReduceMotion
                                            ? { duration: 0 }
                                            : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
                                    }
                                />
                                {countdown}
                            </span>

                            <Button
                                asChild
                                size="sm"
                                className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_-6px_rgba(99,102,241,0.5)] group"
                            >
                                <Link href={launchHref} className="flex items-center gap-1.5">
                                    Build your plan
                                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                                </Link>
                            </Button>
                        </div>
                    </motion.nav>
                )}
            </AnimatePresence>
        </>
    );
}
