'use client';

import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { useAnimatedNumber } from '@/hooks/use-animated-number';

const metrics = [
    { value: 40, suffix: '%', label: 'of students regret what/where they study.', color: 'text-rose-500' },
    { value: 20, prefix: '1 in ', suffix: '', label: 'block themselves by missing prerequisites.', color: 'text-amber-500' },
    { value: 50, prefix: '~', suffix: '%', label: 'of grads work outside their field.', color: 'text-primary' }
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
        <span className={metric.color}>
            {metric.prefix ?? ''}{display}{metric.suffix}
        </span>
    );
}

export function ProofPointsSection() {
    const ref = useRef<HTMLDivElement>(null);
    const inView = useInView(ref, { once: true, amount: 0.4 });
    const shouldReduceMotion = useReducedMotion();

    return (
        <section className="w-full py-24 bg-background" ref={ref}>
            <div className="max-w-7xl mx-auto px-6">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-16 border-b border-border/40 pb-8">
                    <motion.div
                        className="max-w-xl"
                        initial={{ opacity: 0, y: 16 }}
                        animate={inView ? { opacity: 1, y: 0 } : undefined}
                        transition={{ duration: 0.5 }}
                    >
                        <p className="text-sm font-medium uppercase tracking-widest text-primary/80 mb-3">The Reality</p>
                        <h2 className="text-3xl font-heading font-bold text-foreground">Why the old way isn&#39;t working</h2>
                    </motion.div>
                    <motion.p
                        className="text-muted-foreground max-w-md text-lg"
                        initial={{ opacity: 0, y: 16 }}
                        animate={inView ? { opacity: 1, y: 0 } : undefined}
                        transition={{ duration: 0.5, delay: 0.1 }}
                    >
                        Students and families feel the delta immediately, and the data backs it up.
                    </motion.p>
                </div>

                <div className="grid gap-6 md:grid-cols-3">
                    {metrics.map((metric, index) => (
                        <motion.div
                            key={metric.label}
                            className="group relative flex flex-col justify-between p-8 rounded-3xl border border-border/30 bg-card hover:bg-card/80 transition-all duration-500 hover:shadow-lg hover:-translate-y-1 overflow-hidden"
                            initial={{ opacity: 0, y: 24 }}
                            animate={inView ? { opacity: 1, y: 0 } : undefined}
                            transition={{ duration: 0.5, delay: index * 0.15 }}
                        >
                            {/* Subtle gradient accent */}
                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-primary/[0.03] to-transparent pointer-events-none" />

                            <div className="relative z-10 space-y-4">
                                <p className="text-5xl md:text-6xl font-bold tracking-tight">
                                    <AnimatedMetric
                                        metric={metric}
                                        inView={inView}
                                        reduceMotion={shouldReduceMotion}
                                    />
                                </p>
                                <p className="text-lg text-muted-foreground font-medium leading-relaxed">{metric.label}</p>
                            </div>

                            {/* Decorative number */}
                            <span className="absolute -bottom-4 -right-2 text-8xl font-bold text-foreground/[0.02] dark:text-foreground/[0.04] font-heading select-none pointer-events-none">
                                {String(index + 1).padStart(2, '0')}
                            </span>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
