'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useMotionValueEvent, useScroll, useSpring } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SCENE_SPRING, useMotionReady } from './ascent-scroll';

/**
 * Scrubbed proof points: same layout, copy and data as the static version this
 * replaced, but the count-ups and dot meters are tied to the scrollbar instead
 * of firing once on view. Each card owns its own 0→1 travel (its top crossing the viewport
 * bottom → reaching 35% height), so the three statistics fill in sequence as the
 * band rises — and scrolling back rewinds them.
 *
 * SSR and reduced-motion users get the finished numbers: state is seeded with
 * the final value and only the post-mount `useMotionReady()` gate lets the
 * scrubbed value through.
 */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

interface Metric {
    value: number;
    prefix?: string;
    suffix?: string;
    numberClass: string;
    dotClass: string;
    total: number;
    filled: number;
    label: string;
    fix: string;
}

const metrics: Metric[] = [
    {
        value: 40,
        suffix: '%',
        numberClass: 'text-rose-500',
        dotClass: 'bg-rose-500',
        total: 10,
        filled: 4,
        label: 'of students regret where or what they studied.',
        fix: 'Fit Scores steer you to programmes you’ll thrive in.',
    },
    {
        value: 20,
        prefix: '1 in ',
        numberClass: 'text-amber-500',
        dotClass: 'bg-amber-500',
        total: 20,
        filled: 1,
        label: 'block themselves by missing a single prerequisite.',
        fix: 'We flag every entry requirement before you apply.',
    },
    {
        value: 50,
        prefix: '~',
        suffix: '%',
        numberClass: 'text-primary',
        dotClass: 'bg-primary',
        total: 10,
        filled: 5,
        label: 'end up working outside the field they studied.',
        fix: 'We match to your goals, not just your grades.',
    },
];

function ProofCard({ metric }: { metric: Metric }) {
    const ready = useMotionReady();
    const cardRef = useRef<HTMLDivElement>(null);
    const { scrollYProgress } = useScroll({ target: cardRef, offset: ['start end', 'start 0.35'] });
    const q = useSpring(scrollYProgress, SCENE_SPRING);

    const [count, setCount] = useState(metric.value);
    const [filled, setFilled] = useState(metric.filled);

    const apply = (v: number) => {
        const e = easeOut(clamp01(v));
        setCount(Math.round(metric.value * e));
        setFilled(Math.round(metric.filled * e));
    };
    const applyRef = useRef(apply);
    applyRef.current = apply;
    const readyRef = useRef(ready);
    readyRef.current = ready;

    // Stable callback — useMotionValueEvent re-subscribes on callback identity
    // change, and this card re-renders on every scroll frame while scrubbing.
    const update = useCallback((v: number) => {
        if (readyRef.current) applyRef.current(v);
    }, []);

    useMotionValueEvent(q, 'change', update);
    useEffect(() => {
        if (ready) update(q.get());
    }, [q, ready, update]);

    const shownCount = ready ? count : metric.value;
    const shownFilled = ready ? filled : metric.filled;

    return (
        <div
            ref={cardRef}
            className="flex flex-col rounded-2xl border border-border bg-card p-7 shadow-sm dark:border-white/10"
        >
            <p className="text-5xl font-bold tracking-tight tabular-nums md:text-6xl">
                <span className={metric.numberClass}>
                    {metric.prefix ?? ''}
                    {shownCount}
                    {metric.suffix ?? ''}
                </span>
            </p>
            <div className="mt-5 flex flex-wrap gap-1.5" aria-hidden>
                {Array.from({ length: metric.total }).map((_, i) => (
                    <span
                        key={i}
                        className={cn(
                            'h-2 w-2 rounded-full transition-colors duration-200',
                            i < shownFilled ? metric.dotClass : 'bg-border',
                        )}
                    />
                ))}
            </div>
            <p className="mt-4 text-lg font-medium leading-relaxed text-muted-foreground">{metric.label}</p>
            <div className="mt-auto flex items-start gap-2.5 border-t border-border/60 pt-5 text-sm font-medium text-foreground">
                <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                <span>{metric.fix}</span>
            </div>
        </div>
    );
}

export function ProofScrub() {
    return (
        <section id="proof" className="w-full bg-background py-24 sm:py-32">
            <div className="mx-auto max-w-7xl px-6">
                <div className="mb-14 flex flex-col justify-between gap-8 border-b border-border/40 pb-8 md:flex-row md:items-end">
                    <motion.div
                        className="max-w-xl space-y-3"
                        initial={{ opacity: 0, y: 16 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: '-80px' }}
                        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <p className="text-sm font-medium uppercase tracking-widest text-primary/80">The reality</p>
                        <h2 className="font-heading text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                            The gaps no one warns you about.
                        </h2>
                    </motion.div>
                    <motion.p
                        className="max-w-md text-lg leading-relaxed text-muted-foreground"
                        initial={{ opacity: 0, y: 16 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: '-80px' }}
                        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
                    >
                        Three gaps that cost students years — and what we do about each.
                    </motion.p>
                </div>

                <div className="grid gap-6 md:grid-cols-3">
                    {metrics.map((metric) => (
                        <ProofCard key={metric.label} metric={metric} />
                    ))}
                </div>
            </div>
        </section>
    );
}
