'use client';

import { motion } from 'framer-motion';
import { fadeIn } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { X, Check } from 'lucide-react';

const comparisons = [
    {
        title: 'Without Ascenda',
        bullets: [
            'Confusing choices → waste time on wrong universities.',
            'Scattered info → miss deadlines.',
            'Generic advice → one size fits all stress.',
            'Frustration at every step.'
        ]
    },
    {
        title: 'With Ascenda',
        bullets: [
            'Smart matches → focus on what fits you.',
            'Centralized workspace → track everything in one place.',
            'Personalized guidance → roadmap built with you.',
            'Confidence & clarity → calm, organized journey.'
        ]
    }
];

const splitComparisonCopy = (copy: string) => {
    const [headline, detail] = copy.split('→');
    return {
        headline: headline?.trim() ?? '',
        detail: detail?.trim() ?? ''
    };
};

const comparisonPairs = comparisons[0].bullets.map((bullet, index) => {
    const withBullet = comparisons[1]?.bullets[index] ?? '';
    return {
        without: splitComparisonCopy(bullet),
        with: splitComparisonCopy(withBullet)
    };
});

export function ComparisonSection() {
    return (
        <section className="section-fade w-full bg-secondary/40 py-24 sm:py-32">
            <motion.div
                className="max-w-7xl mx-auto px-6"
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.2 }}
                variants={fadeIn}
            >
                <div
                    className={cn(
                        'relative overflow-hidden rounded-3xl text-foreground',
                        'border border-border bg-card shadow-xl',
                        'dark:bg-card dark:shadow-lg'
                    )}
                >
                    {/* Background gradient */}
                    <div className="pointer-events-none absolute inset-0 opacity-30">
                        <div className="h-full w-full bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.12),_transparent_55%)] dark:bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.08),_transparent_60%)]" />
                    </div>

                    <div className="relative p-6 sm:p-10">
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-10">
                            <div className="space-y-2">
                                <p className="text-xs uppercase tracking-[0.4em] text-primary font-semibold">With & without Ascenda</p>
                                <h2 className="text-3xl font-heading font-bold text-foreground">Same student. Different outcome.</h2>
                                <p className="text-sm text-muted-foreground max-w-lg">
                                    Feel the delta between chaos and clarity. Each row pairs the old grind with the Ascenda way.
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-4 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                                <span className="flex items-center gap-2">
                                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500/10">
                                        <X className="h-3 w-3 text-rose-500" />
                                    </span>
                                    {comparisons[0].title}
                                </span>
                                <span className="flex items-center gap-2">
                                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/10">
                                        <Check className="h-3 w-3 text-emerald-500" />
                                    </span>
                                    {comparisons[1].title}
                                </span>
                            </div>
                        </div>

                        <div className="space-y-5">
                            {comparisonPairs.map((pair, index) => (
                                <motion.div
                                    key={`${pair.without.headline}-${pair.with.headline}-${index}`}
                                    className="grid items-stretch gap-4 md:grid-cols-[1fr_auto_1fr]"
                                    initial={{ opacity: 0, y: 12 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true, amount: 0.2 }}
                                    transition={{ duration: 0.4, delay: index * 0.08 }}
                                >
                                    {/* Without card */}
                                    <div className="group rounded-2xl p-5 border border-border/60 bg-muted/30 transition-all duration-300 hover:bg-muted/50 dark:bg-muted/10">
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500/10">
                                                <X className="h-3 w-3 text-rose-500" />
                                            </span>
                                            <p className="text-[0.625rem] font-semibold uppercase tracking-[0.3em] text-rose-500">
                                                {comparisons[0].title}
                                            </p>
                                        </div>
                                        <h3 className="text-[0.9375rem] font-semibold text-foreground">{pair.without.headline}</h3>
                                        {pair.without.detail && <p className="mt-1 text-sm text-muted-foreground">{pair.without.detail}</p>}
                                    </div>

                                    {/* VS divider */}
                                    <div className="relative flex flex-col items-center justify-center gap-1">
                                        {index !== 0 && (
                                            <span className="hidden h-4 w-px md:block bg-border/60" />
                                        )}
                                        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-[0.625rem] font-bold uppercase tracking-[0.2em] text-muted-foreground shadow-sm">
                                            vs
                                        </span>
                                        {index !== comparisonPairs.length - 1 && (
                                            <span className="hidden h-4 w-px md:block bg-border/60" />
                                        )}
                                    </div>

                                    {/* With card */}
                                    <div className="group rounded-2xl p-5 border border-emerald-500/20 bg-emerald-50/60 transition-all duration-300 hover:bg-emerald-50/80 hover:shadow-md dark:border-emerald-500/15 dark:bg-emerald-500/[0.04] dark:hover:bg-emerald-500/[0.07]">
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/10">
                                                <Check className="h-3 w-3 text-emerald-500" />
                                            </span>
                                            <p className="text-[0.625rem] font-semibold uppercase tracking-[0.3em] text-emerald-600 dark:text-emerald-400">
                                                {comparisons[1].title}
                                            </p>
                                        </div>
                                        <h3 className="text-[0.9375rem] font-semibold text-foreground">{pair.with.headline}</h3>
                                        {pair.with.detail && <p className="mt-1 text-sm text-muted-foreground">{pair.with.detail}</p>}
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </div>
            </motion.div>
        </section>
    );
}
