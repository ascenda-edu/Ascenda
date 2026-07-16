'use client';

import { motion } from 'framer-motion';
import { Sparkles, Search, GraduationCap, NotepadText } from 'lucide-react';
import { AnimatedSection } from '@/components/layout/animated-section';
import { cn } from '@/lib/utils';

const features = [
    {
        title: 'Fit Score · Find your perfect match',
        description: 'Instant, data-driven matches that feel like they were tailored for your story.',
        icon: Sparkles,
        gradient: 'from-violet-500/10 to-indigo-500/5',
        iconBg: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    },
    {
        title: 'Centralized university database',
        description: 'All universities. One place. Compare programs without the doom scroll.',
        icon: Search,
        gradient: 'from-sky-500/10 to-cyan-500/5',
        iconBg: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
    },
    {
        title: 'Campus insights',
        description: 'Real stories from real students show what life actually feels like.',
        icon: GraduationCap,
        gradient: 'from-emerald-500/10 to-green-500/5',
        iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    },
    {
        title: 'Application companion',
        description: 'Personalized timelines, tips, and steps for every part of your application.',
        icon: NotepadText,
        gradient: 'from-amber-500/10 to-orange-500/5',
        iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    }
];

export function FeaturesSection() {
    return (
        <section id="features" className="section-fade w-full py-24 bg-secondary/40 sm:py-32">
            <div className="max-w-7xl mx-auto px-6 space-y-12">
                <AnimatedSection className="max-w-3xl space-y-3">
                    <p className="text-sm font-medium uppercase tracking-widest text-primary/80">Why Ascenda</p>
                    <h2 className="text-4xl md:text-5xl font-heading font-bold text-foreground tracking-tight">Four ways to make your application journey easier</h2>
                    <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl">
                        Everything in Ascenda is tuned to blend calm clarity with clear actions — so you and your team can move through the cycle with confidence and zero guesswork.
                    </p>
                </AnimatedSection>

                <div className="grid gap-6 md:grid-cols-2">
                    {features.map((feature, index) => {
                        const Icon = feature.icon;
                        return (
                            <motion.div
                                key={feature.title}
                                className="group relative flex flex-col gap-5 rounded-2xl border border-border bg-card p-8 shadow-sm overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, amount: 0.3 }}
                                transition={{ duration: 0.5, delay: index * 0.1 }}
                            >
                                {/* Hover gradient */}
                                <div className={cn(
                                    'absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br pointer-events-none',
                                    feature.gradient
                                )} />

                                <div className="relative z-10 flex items-center justify-between">
                                    <div className={cn('flex h-12 w-12 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-110', feature.iconBg)}>
                                        <Icon className="h-6 w-6" />
                                    </div>
                                    <span className="text-4xl font-bold text-foreground/[0.04] dark:text-foreground/[0.06] font-heading select-none">
                                        {String(index + 1).padStart(2, '0')}
                                    </span>
                                </div>

                                <div className="relative z-10 space-y-2">
                                    <h3 className="text-xl font-bold text-foreground tracking-tight">{feature.title}</h3>
                                    <p className="text-base text-muted-foreground leading-relaxed">{feature.description}</p>
                                </div>

                                {/* Bottom accent line */}
                                <div className="absolute bottom-0 left-0 h-0.5 w-0 group-hover:w-full bg-gradient-to-r from-primary/40 to-primary/10 transition-all duration-500" />
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
