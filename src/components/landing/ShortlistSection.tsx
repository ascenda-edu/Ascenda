'use client';

import { motion } from 'framer-motion';
import { AnimatedSection } from '@/components/layout/animated-section';
import { cn } from '@/lib/utils';
import { AppFrame, CheckItem, MatchCard, TaskRow } from './product-widgets';

const NUMBER_GRADIENTS = [
    'from-indigo-500 to-violet-500',
    'from-violet-500 to-sky-400',
    'from-sky-400 to-emerald-400',
];

const steps = [
    {
        lab: 'Set up once',
        title: 'Tell us where you stand',
        copy: 'Predicted grades, subjects and what you want from a place. Five minutes, once.',
        widget: (
            <AppFrame title="Profile · 5/5">
                <div className="flex flex-col gap-2.5">
                    <CheckItem label="Personal info" />
                    <CheckItem label="Your studies" />
                    <CheckItem label="Grades & tests" />
                    <CheckItem label="Activities" />
                    <CheckItem label="Lifestyle" />
                </div>
            </AppFrame>
        ),
    },
    {
        lab: 'Explore',
        title: 'See your ranked matches',
        copy: 'Fit Scores and admission odds, ordered by what suits you — not a league table.',
        widget: (
            <AppFrame title="Top matches">
                <div className="space-y-2.5">
                    <MatchCard name="TU Delft" sub="MSc Aerospace Eng." location="Netherlands" score={92} compact />
                    <MatchCard name="Imperial College" sub="MEng Aeronautics" location="United Kingdom" score={85} compact />
                </div>
            </AppFrame>
        ),
    },
    {
        lab: 'Act',
        title: 'Build & share your plan',
        copy: 'Auto-timelines for essays and deadlines — shared with your counsellor and family in a tap.',
        widget: (
            <AppFrame title="This week">
                <div className="space-y-2.5">
                    <TaskRow tone="rose" title="Scholarship essay" sub="Imperial" due="Today" compact />
                    <TaskRow tone="amber" title="Reference letter" sub="TU Delft" due="6d" compact />
                    <TaskRow tone="sky" title="UCAS opens" sub="ESADE + Imperial" due="4d" compact />
                </div>
            </AppFrame>
        ),
    },
];

export function ShortlistSection() {
    return (
        <section id="how-it-works" className="w-full py-24 bg-background sm:py-32 scroll-mt-14">
            <div className="max-w-7xl mx-auto px-6">
                <AnimatedSection className="max-w-2xl space-y-4 mb-14">
                    <p className="text-sm font-medium uppercase tracking-widest text-primary/80">How it works</p>
                    <h2 className="text-4xl md:text-5xl font-heading font-bold text-foreground tracking-tight">
                        Three steps from sign-up to a plan you can share.
                    </h2>
                </AnimatedSection>

                <div className="grid gap-y-12 gap-x-6 md:grid-cols-3">
                    {steps.map((step, index) => (
                        <motion.div
                            key={step.title}
                            className="relative"
                            initial={{ opacity: 0, y: 24 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, amount: 0.3 }}
                            transition={{ duration: 0.5, delay: index * 0.12 }}
                        >
                            <span
                                className={cn(
                                    'absolute -left-1.5 -top-3.5 z-10 grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br text-sm font-bold text-white shadow-lg',
                                    NUMBER_GRADIENTS[index],
                                )}
                            >
                                {index + 1}
                            </span>
                            {step.widget}
                            <p className="mt-4 text-xs font-bold uppercase tracking-[0.12em] text-primary">{step.lab}</p>
                            <h3 className="mt-1.5 text-xl font-heading font-bold tracking-tight text-foreground">{step.title}</h3>
                            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.copy}</p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
