'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
    AnimatePresence,
    motion,
    useInView,
    useReducedMotion,
    useScroll,
    useSpring,
    useTransform,
    type Variants,
} from 'framer-motion';
import { ArrowRight, ChevronDown, Laptop } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAnimatedNumber } from '@/hooks/use-animated-number';
import { useLaunchHref } from '@/hooks/use-launch-href';
import { useThemeMode } from '@/components/theme/theme-provider';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { HeroAppTour } from '@/components/landing/hero-app-tour';
import { cn } from '@/lib/utils';
import { useMotionReady } from './ascent-scroll';
import { BorderBeam } from './border-beam';

// Split so each word can arrive on its own beat; the trailing space lives inside
// the last span (whitespace-pre) so the rotating word never butts up against it.
const HEADLINE_WORDS = "Find universities you'll actually".split(' ');
// Rotating payoff word — the three things every applicant actually worries about.
// Widest phrase (`thrive at.`) sets the reserved width so the headline never reflows.
const ROTATING_WORDS = ['get into.', 'afford.', 'thrive at.'] as const;
const PROGRAMMES_TARGET = 119000;

const WORD_STAGGER = 0.08;
const CINEMATIC = [0.22, 1, 0.36, 1] as const;
/** Beat the rest of the column enters on, just after the last headline word. */
const AFTER_HEADLINE = HEADLINE_WORDS.length * WORD_STAGGER + 0.14;

const topBarVariants: Variants = {
    hidden: { opacity: 0, y: -18, scale: 0.96, filter: 'blur(4px)' },
    visible: {
        opacity: 1,
        y: 0,
        scale: 1,
        filter: 'blur(0px)',
        transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
    },
};

/**
 * Cycles the final headline word (`get into.` → `afford.` → `thrive at.`) with a
 * vertical roll. An invisible sizer reserves the widest phrase's width so the line
 * never reflows, and the whole thing snaps to the first word for reduced-motion users.
 *
 * The flip is gated the same way HeroAppTour's rotation is: it must not run while
 * the headline sits thousands of px off screen, nor in a background tab — each
 * flip is an AnimatePresence enter+exit pair, and a perpetual loop has no static
 * final frame to settle on. Off screen the word simply holds its current value.
 */
function RotatingHeadlineWord() {
    const shouldReduceMotion = useReducedMotion();
    const ref = useRef<HTMLSpanElement>(null);
    // No `once` — the roll must stop again once the hero scrolls away.
    const inView = useInView(ref, { amount: 0.4 });
    const [index, setIndex] = useState(0);

    useEffect(() => {
        if (shouldReduceMotion || !inView) return;
        const id = setInterval(() => {
            if (document.visibilityState !== 'visible') return;
            setIndex((i) => (i + 1) % ROTATING_WORDS.length);
        }, 2300);
        return () => clearInterval(id);
    }, [shouldReduceMotion, inView]);

    return (
        <span ref={ref} className="relative inline-flex overflow-hidden align-bottom pb-[0.16em] -mb-[0.16em]">
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
                        transition={{ duration: shouldReduceMotion ? 0 : 0.5, ease: CINEMATIC }}
                    >
                        {ROTATING_WORDS[index]}
                    </motion.span>
                </AnimatePresence>
            </span>
        </span>
    );
}

/**
 * Preview hero — the shipped HeroSection with two additions from the approved
 * mock: a word-by-word headline reveal on first paint, and a scrubbed exit that
 * lifts the copy and the app tour out of frame as the banner dissolves.
 *
 * NOTE: `initial` props must be identical on server and client — they serialize
 * into the SSR HTML, and branching them on useReducedMotion() (false during SSR,
 * resolved on the client) causes hydration mismatches for reduced-motion users.
 * MotionConfig reducedMotion="user" (providers.tsx) already snaps transform
 * animations for those users; reduced-motion ternaries are safe only inside
 * `transition`, which never serializes. Scroll-driven styles use the post-mount
 * `ready` gate for the same reason.
 */
export function PreviewHero() {
    const launchHref = useLaunchHref();
    const { mode } = useThemeMode();
    const shouldReduceMotion = useReducedMotion();

    // Scroll-linked dissolve for the hero background: as the hero scrolls out of
    // view the banner fades and gently zooms, melting into the page rather than
    // cutting off. The preview extends the same progress to the two content
    // columns so the whole hero lifts away. Gated behind a post-mount flag so the
    // SSR/first-paint markup is identical for reduced-motion users.
    const heroRef = useRef<HTMLElement>(null);
    const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
    const bgOpacity = useTransform(scrollYProgress, [0, 0.55, 1], [1, 1, 0]);
    const bgScale = useTransform(scrollYProgress, [0, 1], [1, 1.06]);
    const ready = useMotionReady();

    // Springed so the parallax trails the scrollbar instead of snapping to it.
    const exit = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.6 });
    const copyY = useTransform(exit, [0, 1], [0, -34]);
    const copyOpacity = useTransform(exit, [0, 1], [1, 0.1]);
    const tourY = useTransform(exit, [0, 1], [0, -56]);
    const tourOpacity = useTransform(exit, [0, 1], [1, 0.25]);
    const cueOpacity = useTransform(exit, [0, 0.4], [1, 0]);

    const programmes = useAnimatedNumber(
        PROGRAMMES_TARGET,
        true,
        shouldReduceMotion ? 0 : 1600,
    );

    return (
        <section ref={heroRef} className="relative min-h-[75vh]">
            {/* overflow-hidden lives here (not on the section) so it can't neutralise position:sticky elsewhere on the page */}
            <motion.div
                className="absolute inset-0 overflow-hidden"
                style={ready ? { opacity: bgOpacity, scale: bgScale } : undefined}
            >
                {/* Static gradient blobs — perpetual motion was visual noise. */}
                <div className="absolute -left-24 top-[-15%] h-[55vw] w-[55vw] rounded-full bg-indigo-500/25 blur-3xl" aria-hidden />
                <div className="absolute -right-24 bottom-[-20%] h-[45vw] w-[45vw] rounded-full bg-emerald-400/20 blur-3xl" aria-hidden />
                <Image
                    src="/ascenda-banner.jpg"
                    alt=""
                    fill
                    priority
                    sizes="100vw"
                    className={cn(
                        'object-cover transition-opacity duration-300',
                        mode === 'dark' ? 'opacity-75' : 'opacity-100',
                    )}
                />
                <div
                    className={cn(
                        'absolute inset-0 pointer-events-none transition-colors duration-300',
                        mode === 'dark'
                            ? 'bg-gradient-to-b from-background/60 via-background/45 to-background'
                            : 'bg-gradient-to-b from-background/40 via-background/30 to-background sm:from-transparent sm:via-background/25',
                    )}
                />
            </motion.div>
            <div className="relative z-10">
                <motion.header
                    id="preview-hero-topbar"
                    className="w-full mb-8 py-4 bg-transparent"
                    initial="hidden"
                    animate="visible"
                    variants={topBarVariants}
                >
                    <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 text-foreground sm:px-6 lg:px-10">
                        <Link href="/landing-preview" className="flex items-center gap-3 text-lg font-semibold tracking-tight text-foreground">
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
                        <div
                            // minmax(0,…) tracks: an auto/fr track would refuse to shrink below the
                            // tour's min-content (its nowrap tab-pill row) and overflow small viewports.
                            className="grid grid-cols-[minmax(0,1fr)] items-center gap-10 lg:grid-cols-[minmax(0,0.9fr),minmax(0,1.1fr)]"
                        >
                            {/* Scroll parallax lives on these wrappers; the mount
                                animations live on the children, so the two never
                                fight over the same opacity/transform. */}
                            <motion.div style={ready ? { y: copyY, opacity: copyOpacity } : undefined}>
                                <div className="space-y-6">
                                    <div>
                                        <h1 className="text-3xl font-heading font-semibold leading-[1.1] tracking-tight text-foreground [text-wrap:balance] sm:text-5xl lg:text-[3.6rem]">
                                            {HEADLINE_WORDS.map((word, i) => (
                                                <motion.span
                                                    key={word}
                                                    className="inline-block whitespace-pre"
                                                    initial={{ opacity: 0, y: '0.45em', filter: 'blur(5px)' }}
                                                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                                                    transition={{
                                                        duration: 0.6,
                                                        delay: i * WORD_STAGGER,
                                                        ease: CINEMATIC,
                                                    }}
                                                >
                                                    {word}{' '}
                                                </motion.span>
                                            ))}
                                            <RotatingHeadlineWord />
                                        </h1>
                                        <motion.p
                                            className="mt-3 text-sm text-foreground/80 sm:mt-4 sm:text-lg lg:text-xl"
                                            initial={{ opacity: 0, y: 10, filter: 'blur(8px)' }}
                                            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                                            transition={{ duration: 0.6, delay: AFTER_HEADLINE, ease: CINEMATIC }}
                                        >
                                            Fit Scores, deadlines and a plan — built around your grades, your goals and the universities you&apos;re aiming at.
                                        </motion.p>
                                    </div>
                                    <motion.div
                                        className="flex flex-wrap gap-3"
                                        initial={{ opacity: 0, y: 16 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.6, delay: AFTER_HEADLINE + 0.1, ease: CINEMATIC }}
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
                                        initial={{ opacity: 0, y: 16 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.6, delay: AFTER_HEADLINE + 0.2, ease: CINEMATIC }}
                                    >
                                        <li className="flex items-center gap-2">
                                            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                                            Your odds on every programme.
                                        </li>
                                        <li className="flex items-center gap-2">
                                            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                                            Loop in your counsellor &amp; family.
                                        </li>
                                    </motion.ul>
                                    <motion.p
                                        className="pt-1 text-xs text-foreground/70 tabular-nums"
                                        initial={{ opacity: 0, y: 16 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.6, delay: AFTER_HEADLINE + 0.28, ease: CINEMATIC }}
                                    >
                                        Search {programmes.toLocaleString('en-US')}+ real programmes.
                                    </motion.p>
                                </div>
                            </motion.div>
                            <motion.div style={ready ? { y: tourY, opacity: tourOpacity } : undefined}>
                                <motion.div
                                    // relative + the tour frame's own radius so the beam can ride
                                    // its border ring (`rounded-[inherit]`); no overflow-hidden here.
                                    className="relative rounded-2xl"
                                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    transition={{ duration: 0.6, delay: AFTER_HEADLINE + 0.06, ease: CINEMATIC }}
                                >
                                    <HeroAppTour />
                                    {/* One slow lap — reads as "this is the live app", not a beacon. */}
                                    <BorderBeam className="z-20" duration={9} />
                                </motion.div>
                            </motion.div>
                        </div>
                        <motion.div
                            className="flex justify-center pt-2 text-muted-foreground"
                            style={ready ? { opacity: cueOpacity } : undefined}
                        >
                            <motion.a
                                href="#features"
                                aria-label="Scroll to features"
                                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 0.9, y: 0 }}
                                transition={{ delay: 1.55, duration: 0.6, ease: CINEMATIC }}
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
                            </motion.a>
                        </motion.div>
                    </section>
                </div>
            </div>
        </section>
    );
}
