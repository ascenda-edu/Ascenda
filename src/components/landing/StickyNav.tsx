'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLaunchHref } from '@/hooks/use-launch-href';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
    { label: 'Inside Ascenda', href: '#features', id: 'features' },
    { label: 'How it works', href: '#how-it-works', id: 'how-it-works' },
    { label: 'FAQ', href: '#faq', id: 'faq' },
];

/**
 * Slim companion bar for the landing page. Invisible at the top — the hero's
 * own header owns that space — and slides in only once the hero header scrolls
 * out of view (IntersectionObserver, so it's exact at any viewport size).
 *
 * The links carry a scrollspy pill (GooeyNav-inspired, minus the particle
 * burst) that glides to whichever section is currently in view via framer's
 * layoutId — so the bar tells you where you are, not just where you can go.
 *
 * Mount/unmount via AnimatePresence keeps hidden links out of the tab order,
 * and the initial `false` state means SSR/first paint render nothing — no
 * hydration branch. MotionConfig reducedMotion="user" (providers.tsx) snaps
 * the slide and pill motion for reduced-motion users.
 */
export function StickyNav() {
    const [visible, setVisible] = useState(false);
    const [activeId, setActiveId] = useState<string | null>(null);
    const launchHref = useLaunchHref();

    useEffect(() => {
        const heroTopbar = document.getElementById('hero-topbar');
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

    return (
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
                    <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-2 sm:px-6 lg:px-10">
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
                                        aria-current={isActive ? 'true' : undefined}
                                        className={cn(
                                            'relative rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                                            isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                                        )}
                                    >
                                        {isActive && (
                                            <motion.span
                                                layoutId="stickynav-pill"
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
    );
}
