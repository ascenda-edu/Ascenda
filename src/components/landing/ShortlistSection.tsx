'use client';

import { motion } from 'framer-motion';
import { UserPlus, Search, Rocket } from 'lucide-react';
import { AnimatedSection } from '@/components/layout/animated-section';
import { cn } from '@/lib/utils';

const steps = [
    {
        title: 'Start Ascenda',
        copy: 'Create your profile once: predicted grades, subjects, languages, interests, and vibe.',
        icon: UserPlus,
        iconBg: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    },
    {
        title: 'Explore ranked results',
        copy: 'See Fit Scores, compare modules & requirements, and tune lifestyle filters.',
        icon: Search,
        iconBg: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
    },
    {
        title: 'Build & share your plan',
        copy: 'Automatic timelines for essays, tests, references, and direct apply quirks. Share with collaborators instantly.',
        icon: Rocket,
        iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    }
];

export function ShortlistSection() {
    return (
        <section className="w-full py-24 bg-background">
            <div className="max-w-7xl mx-auto px-6">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-16">
                    <AnimatedSection className="max-w-2xl space-y-4">
                        <h2 className="text-4xl md:text-5xl font-heading font-bold text-foreground tracking-tight">Your shortlist in 3 steps</h2>
                        <p className="text-lg text-muted-foreground leading-relaxed max-w-xl">The easiest way to see what&apos;s next, why it matters, and how to act.</p>
                    </AnimatedSection>
                </div>

                <div className="grid gap-6 md:grid-cols-3">
                    {steps.map((step, index) => {
                        const Icon = step.icon;
                        return (
                            <motion.div
                                key={step.title}
                                className="group relative flex flex-col justify-between rounded-3xl border border-border/40 bg-card p-8 hover:shadow-lg transition-all duration-500 hover:-translate-y-1"
                                initial={{ opacity: 0, y: 24 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, amount: 0.3 }}
                                transition={{ duration: 0.5, delay: index * 0.12 }}
                            >
                                <div className="space-y-6">
                                    <div className="flex items-center gap-4">
                                        <div className={cn('flex h-12 w-12 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-110', step.iconBg)}>
                                            <Icon className="h-5 w-5" />
                                        </div>
                                        <span className="text-xs font-bold uppercase tracking-widest text-primary/70">Step {index + 1}</span>
                                    </div>

                                    <div>
                                        <h3 className="text-2xl font-bold text-foreground mb-3">{step.title}</h3>
                                        <p className="text-muted-foreground leading-relaxed">{step.copy}</p>
                                    </div>
                                </div>

                                {/* Connecting line between steps */}
                                {index < steps.length - 1 && (
                                    <div className="absolute -right-3 top-1/2 hidden md:flex items-center z-10">
                                        <div className="h-px w-6 bg-border" />
                                        <div className="h-2 w-2 rounded-full border-2 border-border bg-background" />
                                    </div>
                                )}

                                {/* Bottom accent */}
                                <div className="absolute bottom-0 left-0 h-0.5 w-0 group-hover:w-full bg-gradient-to-r from-primary/30 to-transparent transition-all duration-500" />
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
