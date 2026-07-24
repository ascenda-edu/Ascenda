'use client';

import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { useAnimatedNumber } from '@/hooks/use-animated-number';
import { cn } from '@/lib/utils';

const metrics = [
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
        suffix: '',
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

function AnimatedMetric({ metric, inView, reduceMotion }: {
    metric: typeof metrics[number];
    inView: boolean;
    reduceMotion: boolean | null;
}) {
    const display = useAnimatedNumber(
        metric.value,
        reduceMotion ? true : inView,
        reduceMotion ? 0 : 1200,
    );

    return (
        <span className={metric.numberClass}>
            {metric.prefix ?? ''}{display}{metric.suffix}
        </span>
    );
}

/** Dot-meter: a light visual encoding of the proportion (k of n filled). */
function DotMeter({ total, filled, dotClass }: { total: number; filled: number; dotClass: string }) {
    return (
        <div className="flex flex-wrap gap-1.5" aria-hidden>
            {Array.from({ length: total }).map((_, i) => (
                <span key={i} className={cn('h-2 w-2 rounded-full', i < filled ? dotClass : 'bg-border')} />
            ))}
        </div>
    );
}

export function ProofPointsSection() {
    const ref = useRef<HTMLDivElement>(null);
    const inView = useInView(ref, { once: true, amount: 0.3 });
    const shouldReduceMotion = useReducedMotion();

    return (
        <section className="w-full py-24 bg-background sm:py-32" ref={ref}>
            <div className="max-w-7xl mx-auto px-6">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-14 border-b border-border/40 pb-8">
                    <motion.div
                        className="max-w-xl space-y-3"
                        initial={{ opacity: 0, y: 16 }}
                        animate={inView ? { opacity: 1, y: 0 } : undefined}
                        transition={{ duration: 0.5 }}
                    >
                        <p className="text-sm font-medium uppercase tracking-widest text-primary/80">The reality</p>
                        <h2 className="text-3xl md:text-4xl font-heading font-bold text-foreground tracking-tight">
                            The gaps no one warns you about.
                        </h2>
                    </motion.div>
                    <motion.p
                        className="text-muted-foreground max-w-md text-lg leading-relaxed"
                        initial={{ opacity: 0, y: 16 }}
                        animate={inView ? { opacity: 1, y: 0 } : undefined}
                        transition={{ duration: 0.5, delay: 0.1 }}
                    >
                        Three gaps that cost students years — and what we do about each.
                    </motion.p>
                </div>

                <div className="grid gap-6 md:grid-cols-3">
                    {metrics.map((metric, index) => (
                        <motion.div
                            key={metric.label}
                            className="flex flex-col rounded-2xl border border-border bg-card p-7 shadow-sm dark:border-white/10"
                            initial={{ opacity: 0, y: 24 }}
                            animate={inView ? { opacity: 1, y: 0 } : undefined}
                            transition={{ duration: 0.5, delay: index * 0.12 }}
                        >
                            <p className="text-5xl md:text-6xl font-bold tracking-tight tabular-nums">
                                <AnimatedMetric metric={metric} inView={inView} reduceMotion={shouldReduceMotion} />
                            </p>
                            <div className="mt-5">
                                <DotMeter total={metric.total} filled={metric.filled} dotClass={metric.dotClass} />
                            </div>
                            <p className="mt-4 text-lg font-medium leading-relaxed text-muted-foreground">{metric.label}</p>
                            <div className="mt-auto flex items-start gap-2.5 border-t border-border/60 pt-5 text-sm font-medium text-foreground">
                                <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                                <span>{metric.fix}</span>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
