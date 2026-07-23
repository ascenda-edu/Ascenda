'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform, type Variants } from 'framer-motion';
import {
    ArrowRight,
    CalendarClock,
    ChevronDown,
    CheckCircle2,
    Laptop,
    Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSupabase } from '@/hooks/useSupabase';
import { useAnimatedNumber } from '@/hooks/use-animated-number';
import { RETURNING_USER_STORAGE_KEY } from '@/lib/constants';
import { fadeIn, blurIn } from '@/lib/motion';
import { useThemeMode } from '../theme/theme-provider';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '../theme/theme-toggle';

const heroHeadlinePrefix = "Find universities you'll actually ";
// Rotating payoff word — the three things every applicant actually worries about.
// Widest phrase (`thrive at.`) sets the reserved width so the headline never reflows.
const ROTATING_WORDS = ['get into.', 'afford.', 'thrive at.'] as const;
const FIT_SCORE_TARGET = 92;
const PROGRAMMES_TARGET = 119000;
const PROFILE_SEGMENTS = 5;
const PROFILE_FILLED = 4;

const topBarVariants: Variants = {
    hidden: { opacity: 0, y: -18, scale: 0.96, filter: 'blur(4px)' },
    visible: {
        opacity: 1,
        y: 0,
        scale: 1,
        filter: 'blur(0px)',
        transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] }
    }
};

const dashboardContainerVariants: Variants = {
    hidden: { opacity: 0, y: 20, scale: 0.98 },
    visible: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { duration: 0.55, ease: 'easeOut', staggerChildren: 0.08, delayChildren: 0.15 }
    }
};

const dashboardItemVariants: Variants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.38, ease: 'easeOut' } }
};

const radarItemVariants: Variants = {
    hidden: { opacity: 0, x: -12, filter: 'blur(4px)' },
    visible: { opacity: 1, x: 0, filter: 'blur(0px)', transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } }
};

const radarContainerVariants: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } }
};


/**
 * Cycles the final headline word (`get into.` → `afford.` → `thrive at.`) with a
 * vertical roll. An invisible sizer reserves the widest phrase's width so the line
 * never reflows, and the whole thing snaps to the first word for reduced-motion users.
 */
function RotatingHeadlineWord() {
    const shouldReduceMotion = useReducedMotion();
    const [index, setIndex] = useState(0);

    useEffect(() => {
        if (shouldReduceMotion) return;
        const id = setInterval(
            () => setIndex((i) => (i + 1) % ROTATING_WORDS.length),
            2300,
        );
        return () => clearInterval(id);
    }, [shouldReduceMotion]);

    return (
        <span className="relative inline-flex overflow-hidden align-bottom pb-[0.16em] -mb-[0.16em]">
            {/* Reserves the widest phrase's width so surrounding text never shifts. */}
            <span className="invisible whitespace-nowrap" aria-hidden>
                thrive at.
            </span>
            <span className="absolute inset-0 flex">
                <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                        key={index}
                        className="whitespace-nowrap bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent"
                        initial={{ y: '110%', opacity: 0 }}
                        animate={{ y: '0%', opacity: 1 }}
                        exit={{ y: '-110%', opacity: 0 }}
                        transition={{ duration: shouldReduceMotion ? 0 : 0.5, ease: [0.16, 1, 0.3, 1] }}
                    >
                        {ROTATING_WORDS[index]}
                    </motion.span>
                </AnimatePresence>
            </span>
        </span>
    );
}

export function HeroSection() {
    const [launchHref, setLaunchHref] = useState('/login');
    const supabase = useSupabase();
    const { mode } = useThemeMode();
    const shouldReduceMotion = useReducedMotion();

    // Scroll-linked dissolve for the hero background: as the hero scrolls out of
    // view the banner fades and gently zooms, melting into the page rather than
    // cutting off. Gated behind a post-mount flag so the SSR/first-paint markup
    // is identical for reduced-motion users (no hydration mismatch).
    const heroRef = useRef<HTMLElement>(null);
    const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
    const bgOpacity = useTransform(scrollYProgress, [0, 0.55, 1], [1, 1, 0]);
    const bgScale = useTransform(scrollYProgress, [0, 1], [1, 1.06]);
    const [bgEnhanced, setBgEnhanced] = useState(false);
    useEffect(() => {
        setBgEnhanced(!shouldReduceMotion);
    }, [shouldReduceMotion]);

    const fitScore = useAnimatedNumber(
        FIT_SCORE_TARGET,
        true,
        shouldReduceMotion ? 0 : 1400,
    );

    const programmes = useAnimatedNumber(
        PROGRAMMES_TARGET,
        true,
        shouldReduceMotion ? 0 : 1600,
    );

    useEffect(() => {
        let isActive = true;

        const determineDestination = async () => {
            const hasVisitedBefore =
                typeof window !== 'undefined' &&
                window.localStorage.getItem(RETURNING_USER_STORAGE_KEY) === 'true';

            if (hasVisitedBefore) {
                if (isActive) setLaunchHref('/dashboard');
                return;
            }

            const { data, error } = await supabase.auth.getSession();
            if (!error && data.session && isActive) {
                setLaunchHref('/dashboard');
            }
        };

        void determineDestination();
        return () => { isActive = false; };
    }, [supabase]);

    // NOTE: `initial` props must be identical on server and client — they serialize
    // into the SSR HTML, and branching them on useReducedMotion() (false during SSR,
    // resolved on the client) causes hydration mismatches for reduced-motion users.
    // MotionConfig reducedMotion="user" (providers.tsx) already snaps transform
    // animations for those users; reduced-motion ternaries are safe only inside
    // `transition`, which never serializes.
    const storyVariants: Variants = {
        hidden: { opacity: 0, y: 24, filter: 'blur(6px)' },
        visible: {
            opacity: 1,
            y: 0,
            filter: 'blur(0px)',
            transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1], staggerChildren: 0.1, delayChildren: 0.14 }
        }
    };

    return (
        <section ref={heroRef} className="relative min-h-[75vh]">
            {/* overflow-hidden lives here (not on the section) so it can't neutralise position:sticky elsewhere on the page */}
            <motion.div
                className="absolute inset-0 overflow-hidden"
                style={bgEnhanced ? { opacity: bgOpacity, scale: bgScale } : undefined}
            >
                {/* Static gradient blobs — perpetual motion was visual noise. */}
                <div className="absolute -left-24 top-[-15%] h-[55vw] w-[55vw] rounded-full bg-indigo-500/25 blur-3xl" aria-hidden />
                <div className="absolute -right-24 bottom-[-20%] h-[45vw] w-[45vw] rounded-full bg-emerald-400/20 blur-3xl" aria-hidden />
                <Image
                    src="/ascenda-banner.png"
                    alt=""
                    fill
                    priority
                    sizes="100vw"
                    className={cn(
                        'object-cover transition-opacity duration-300',
                        mode === 'dark' ? 'opacity-75' : 'opacity-100'
                    )}
                />
                <div
                    className={cn(
                        'absolute inset-0 pointer-events-none transition-colors duration-300',
                        // On mobile the headline is closer to the top of the banner, so we
                        // lift the wash from `transparent` → `background/40` to keep text
                        // legible (was 3:1 contrast against the night-sky banner).
                        mode === 'dark'
                            ? 'bg-gradient-to-b from-background/60 via-background/45 to-background'
                            : 'bg-gradient-to-b from-background/40 via-background/30 to-background sm:from-transparent sm:via-background/25'
                    )}
                />
            </motion.div>
            <div className="relative z-10">
                <motion.header
                    id="hero-topbar"
                    className="w-full mb-8 py-4 bg-transparent"
                    initial="hidden"
                    animate="visible"
                    variants={topBarVariants}
                >
                    <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 text-foreground sm:px-6 lg:px-10">
                        <Link href="/" className="flex items-center gap-3 text-lg font-semibold tracking-tight text-foreground">
                            <Image
                                src="/ascenda-logo.png"
                                alt="Ascenda logo"
                                width={160}
                                height={160}
                                priority
                                className="h-auto w-40 object-contain sm:w-[205px]"
                            />
                        </Link>
                        <div className="flex flex-wrap items-center gap-3">
                            <ThemeToggle compact className="backdrop-blur md:backdrop-blur-none" />
                            <Button
                                asChild
                                size="sm"
                                variant="outline"
                                className="bg-card border-border text-foreground hover:bg-muted/60"
                            >
                                <Link href={launchHref} className="flex items-center gap-2 whitespace-nowrap">
                                    <Laptop className="h-4 w-4" />
                                    Launch Ascenda
                                </Link>
                            </Button>
                        </div>
                    </div>
                </motion.header>

                <div className="w-full max-w-7xl px-4 pb-10 pt-10 sm:px-6 lg:px-10 mx-auto">
                    <section className="space-y-12 pb-16 pt-4">
                        <motion.div
                            className="grid items-center gap-10 lg:grid-cols-[0.9fr,1.1fr]"
                            initial="hidden"
                            animate="visible"
                            variants={storyVariants}
                        >
                            <div className="space-y-6">
                                <motion.div
                                    initial={{ opacity: 0.7, scale: 0.98, y: 10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                                >
                                    <motion.h1
                                        className="text-3xl font-heading font-semibold leading-[1.1] tracking-tight text-foreground [text-wrap:balance] sm:text-5xl lg:text-[3.6rem]"
                                        initial="hidden"
                                        animate="visible"
                                        variants={fadeIn}
                                    >
                                        {heroHeadlinePrefix}
                                        <RotatingHeadlineWord />
                                    </motion.h1>
                                    <motion.p
                                        className="mt-3 text-sm text-foreground/80 sm:mt-4 sm:text-lg lg:text-xl"
                                        variants={blurIn}
                                        initial="hidden"
                                        animate="visible"
                                    >
                                        Real fit scores, real deadlines, real plans — built around your grades, your goals, and the universities you&apos;re actually aiming at.
                                    </motion.p>
                                </motion.div>
                                <motion.div
                                    className="flex flex-wrap gap-3"
                                    variants={fadeIn}
                                    initial="hidden"
                                    animate="visible"
                                >
                                    <Button
                                        asChild
                                        size="lg"
                                        className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_30px_-5px_rgba(99,102,241,0.4)] group"
                                    >
                                        <Link href={launchHref} className="flex items-center gap-2">
                                            Build your plan
                                            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
                                        </Link>
                                    </Button>
                                    <Button
                                        asChild
                                        size="lg"
                                        variant="outline"
                                        className="border-border bg-card text-foreground hover:bg-muted/60"
                                    >
                                        <Link href="#features">See how it works</Link>
                                    </Button>
                                </motion.div>
                                <motion.ul
                                    className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-foreground/75"
                                    variants={fadeIn}
                                    initial="hidden"
                                    animate="visible"
                                >
                                    <li className="flex items-center gap-2">
                                        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                                        See your real odds on each programme.
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                                        Catch every deadline before it closes.
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                                        Loop in your counsellor &amp; family.
                                    </li>
                                </motion.ul>
                                <motion.p
                                    className="pt-1 text-xs text-foreground/70 tabular-nums"
                                    variants={fadeIn}
                                    initial="hidden"
                                    animate="visible"
                                >
                                    Search {programmes.toLocaleString('en-US')}+ real programmes.
                                </motion.p>
                            </div>
                            <motion.div
                                className="relative rounded-2xl border border-border/60 bg-card/70 p-3 sm:p-5 text-card-foreground shadow-xl backdrop-blur-xl overflow-hidden"
                                initial="hidden"
                                animate="visible"
                                variants={dashboardContainerVariants}
                            >
                                {/* Ambient blobs matching the real dashboard */}
                                <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/5 blur-3xl" aria-hidden />
                                <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-primary/3 blur-2xl" aria-hidden />

                                {/* Live focus badge — mirrors PageHero */}
                                <motion.div
                                    className="relative flex items-center justify-between gap-4"
                                    variants={dashboardItemVariants}
                                >
                                    <div className="flex items-center gap-2.5">
                                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/5 ring-1 ring-primary/10">
                                            <Zap className="h-4 w-4 text-primary" aria-hidden />
                                        </span>
                                        <div>
                                            <p className="text-xs font-medium text-muted-foreground">Your dashboard</p>
                                            <p className="text-sm font-semibold text-foreground">Good morning, Maya</p>
                                        </div>
                                    </div>
                                    <span className="flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-[0.6875rem] font-medium text-primary/80">
                                        Today
                                    </span>
                                </motion.div>

                                {/* Stat strip — hero fit score + secondary stats */}
                                <motion.div className="relative mt-4 sm:mt-5 grid grid-cols-3 gap-1.5 sm:gap-3" variants={dashboardItemVariants}>
                                    {/* Fit score — hero stat with extra weight */}
                                    <div className="relative min-w-0 overflow-hidden rounded-2xl border border-emerald-500/20 bg-background px-2 py-4 text-center shadow-sm sm:px-4">
                                        <div className="pointer-events-none absolute -top-8 -right-8 h-28 w-28 rounded-full bg-emerald-400 blur-2xl opacity-30" aria-hidden />
                                        <p className="text-[0.6875rem] font-medium text-muted-foreground">Fit score</p>
                                        <p className="mt-1 text-xl sm:text-4xl font-bold text-foreground leading-none tracking-tight">{fitScore}<span className="text-base sm:text-xl text-emerald-500">%</span></p>
                                        <p className="mt-1 text-[0.625rem] text-emerald-600 dark:text-emerald-400 font-medium">Top match</p>
                                    </div>
                                    {/* Due soon */}
                                    <div className="relative min-w-0 overflow-hidden rounded-2xl border border-border bg-background px-2 py-4 text-center shadow-sm sm:px-4">
                                        <div className="pointer-events-none absolute -top-6 -right-6 h-24 w-24 rounded-full bg-amber-400 blur-2xl opacity-40" aria-hidden />
                                        <p className="text-[0.6875rem] font-medium text-muted-foreground">Due soon</p>
                                        <p className="mt-1 text-xl sm:text-2xl font-semibold text-foreground leading-tight tracking-tight">3</p>
                                        <p className="mt-0.5 text-[0.625rem] text-muted-foreground">This week</p>
                                    </div>
                                    {/* Profile — with animated circular progress */}
                                    <div className="relative min-w-0 overflow-hidden rounded-2xl border border-border bg-background px-2 py-4 text-center shadow-sm sm:px-4">
                                        <div className="pointer-events-none absolute -top-6 -right-6 h-24 w-24 rounded-full bg-primary blur-2xl opacity-40" aria-hidden />
                                        <p className="text-[0.6875rem] font-medium text-muted-foreground">Profile</p>
                                        <div className="mt-1 flex min-w-0 items-center justify-center gap-2">
                                            {/* Mini circular progress ring */}
                                            <svg width="28" height="28" viewBox="0 0 28 28" className="shrink-0 -rotate-90">
                                                <circle
                                                    cx="14" cy="14" r="11"
                                                    fill="none"
                                                    className="stroke-border"
                                                    strokeWidth="3"
                                                />
                                                <motion.circle
                                                    cx="14" cy="14" r="11"
                                                    fill="none"
                                                    className="stroke-primary"
                                                    strokeWidth="3"
                                                    strokeLinecap="round"
                                                    strokeDasharray={2 * Math.PI * 11}
                                                    initial={{ strokeDashoffset: 2 * Math.PI * 11 }}
                                                    animate={{ strokeDashoffset: 2 * Math.PI * 11 * (1 - PROFILE_FILLED / PROFILE_SEGMENTS) }}
                                                    transition={{
                                                        delay: shouldReduceMotion ? 0 : 0.9,
                                                        duration: shouldReduceMotion ? 0 : 1.2,
                                                        ease: [0.22, 1, 0.36, 1],
                                                    }}
                                                />
                                            </svg>
                                            <p className="shrink text-xl sm:text-2xl font-semibold text-foreground leading-tight tracking-tight">4/5</p>
                                        </div>
                                        <p className="mt-0.5 text-[0.625rem] text-muted-foreground">80% complete</p>
                                    </div>
                                </motion.div>

                                {/* Profile completion bar — animated loading */}
                                <motion.div
                                    className="relative mt-4"
                                    variants={dashboardItemVariants}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-[0.6875rem] font-medium text-muted-foreground">Profile progress</p>
                                        <motion.p
                                            className="text-[0.6875rem] font-medium text-primary/80"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ delay: shouldReduceMotion ? 0 : 1.6, duration: 0.4 }}
                                        >
                                            80% ready
                                        </motion.p>
                                    </div>
                                    <div className="flex gap-1.5">
                                        {Array.from({ length: PROFILE_SEGMENTS }).map((_, i) => {
                                            const isFilled = i < PROFILE_FILLED;
                                            return (
                                                <motion.div
                                                    key={i}
                                                    className={cn(
                                                        'h-2 flex-1 rounded-full',
                                                        isFilled ? 'bg-primary' : 'bg-border'
                                                    )}
                                                    initial={{ scaleX: 0, opacity: 0 }}
                                                    animate={{ scaleX: 1, opacity: 1 }}
                                                    transition={{
                                                        delay: shouldReduceMotion ? 0 : 0.8 + i * 0.18,
                                                        duration: shouldReduceMotion ? 0 : 0.45,
                                                        ease: [0.22, 1, 0.36, 1],
                                                    }}
                                                    style={{ originX: 0 }}
                                                />
                                            );
                                        })}
                                    </div>
                                </motion.div>

                                {/* Focus radar — staggered entry */}
                                <motion.div
                                    className="relative mt-4 space-y-2"
                                    variants={radarContainerVariants}
                                    initial="hidden"
                                    animate="visible"
                                >
                                    <motion.div className="flex items-center gap-2" variants={radarItemVariants}>
                                        <p className="text-xs font-medium text-muted-foreground">Up next</p>
                                    </motion.div>
                                    {[
                                        { num: 1, label: 'Due today', title: 'Scholarship essay — Parsons Paris', detail: 'Final draft due Friday', border: 'border-l-rose-500', badge: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
                                        { num: 2, label: 'Milestone', title: 'UCAS submission opens', detail: 'In 4 days · ESADE + Imperial', border: 'border-l-amber-400', badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
                                        { num: 3, label: 'Checklist', title: 'Upload reference letter', detail: '2 of 3 references submitted', border: 'border-l-primary', badge: 'bg-primary/10 text-primary' },
                                    ].map((item) => (
                                        <motion.div
                                            key={item.num}
                                            className={cn('flex items-start gap-3 rounded-xl border border-border bg-background/80 backdrop-blur-sm px-4 py-3 border-l-[3px]', item.border)}
                                            variants={radarItemVariants}
                                        >
                                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/10 text-[0.6875rem] font-bold text-primary">
                                                {item.num}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className={cn('rounded-full px-2 py-0.5 text-[0.625rem] font-semibold', item.badge)}>
                                                        {item.label}
                                                    </span>
                                                </div>
                                                <p className="mt-1 text-sm font-medium text-foreground leading-snug">{item.title}</p>
                                                <p className="text-[0.6875rem] text-muted-foreground">{item.detail}</p>
                                            </div>
                                        </motion.div>
                                    ))}
                                </motion.div>

                                {/* Footer — task progress */}
                                <motion.div
                                    className="relative mt-4 flex items-center justify-between text-xs text-muted-foreground"
                                    variants={dashboardItemVariants}
                                >
                                    <div className="flex items-center gap-2">
                                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
                                        <span>7 of 12 tasks done</span>
                                    </div>
                                    <span className="flex items-center gap-1.5 text-primary/70 font-medium">
                                        <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                                        3 deadlines this week
                                    </span>
                                </motion.div>
                            </motion.div>
                        </motion.div>
                        <motion.div
                            className="flex justify-center pt-2 text-muted-foreground"
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 0.9, y: 0 }}
                            transition={{ delay: 1.55, duration: 0.6, ease: 'easeOut' }}
                        >
                            <a
                                href="#features"
                                aria-label="Scroll to features"
                                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                {/* Same DOM for all users (SSR-safe); MotionConfig snaps the
                                    y-bounce to rest for reduced-motion users */}
                                <motion.div
                                    animate={{ y: [0, 6, 0], opacity: [0.9, 0.5, 0.9] }}
                                    transition={shouldReduceMotion
                                        ? { duration: 0 }
                                        : { duration: 2, repeat: 2, ease: 'easeInOut' }}
                                >
                                    <ChevronDown className="h-5 w-5" />
                                </motion.div>
                            </a>
                        </motion.div>
                    </section>
                </div>
            </div>
        </section>
    );
}
