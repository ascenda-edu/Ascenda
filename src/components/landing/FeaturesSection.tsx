'use client';

import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { AnimatedSection } from '@/components/layout/animated-section';
import { cn } from '@/lib/utils';
import {
    AppFrame,
    MatchCard,
    ProgressRing,
    SearchWidget,
    StatTile,
    TaskRow,
} from './product-widgets';

type WidgetKind = 'fit' | 'search' | 'plan' | 'dashboard';

interface FeatureRow {
    label: string;
    title: string;
    copy: string;
    chips: string[];
    widget: WidgetKind;
    reverse?: boolean;
}

const rows: FeatureRow[] = [
    {
        label: 'Fit Score',
        title: 'See exactly where you stand.',
        copy: 'Every programme scored against your real grades, subjects and goals — sorted into reach, match and safe, with your estimated admission chance on each card.',
        chips: ['Reach / match / safe tiers', 'Odds on every card'],
        widget: 'fit',
    },
    {
        label: 'The catalogue',
        title: 'Every programme, one search.',
        copy: '119,000+ courses in one place. Filter by country, subject and the kind of life you want — and preview how each one fits your profile before you ever book a call.',
        chips: ['119,000+ programmes', 'Live fit preview'],
        widget: 'search',
        reverse: true,
    },
    {
        label: 'Your plan',
        title: 'A plan that keeps you moving.',
        copy: 'Essays, references and deadlines tracked per application — the most urgent thing surfaced first, everything else in order, with help one tap away.',
        chips: ['Per-application tracking', 'Urgent surfaced first'],
        widget: 'plan',
    },
    {
        label: 'Command centre',
        title: 'Your whole journey, one view.',
        copy: 'Matches, tasks, deadlines and your counsellor in a single home that always shows the next move — so nothing slips between the cracks.',
        chips: ['Matches, tasks & deadlines together', 'Counsellor built in'],
        widget: 'dashboard',
        reverse: true,
    },
];

function FeatureWidget({ kind }: { kind: WidgetKind }) {
    if (kind === 'fit') {
        return (
            <AppFrame route="/matches">
                <div className="space-y-2.5">
                    <MatchCard country="Netherlands" tier="safe" name="TU Delft" sub="MSc Aerospace Engineering" score={92} colorClass="stroke-emerald-500" />
                    <MatchCard country="United Kingdom" tier="match" name="Imperial College London" sub="MEng Aeronautics" score={85} colorClass="stroke-amber-500" />
                    <MatchCard country="Switzerland" tier="reach" name="ETH Zürich" sub="MSc Mechanical Engineering" score={71} colorClass="stroke-rose-500" />
                </div>
            </AppFrame>
        );
    }
    if (kind === 'search') {
        return (
            <AppFrame title="Search hub">
                <SearchWidget />
            </AppFrame>
        );
    }
    if (kind === 'plan') {
        return (
            <AppFrame route="/applications">
                <div className="mb-3 grid grid-cols-3 gap-2.5">
                    <StatTile label="Tracked" value={6} detail="applications" />
                    <StatTile label="In progress" value={4} detail="working now" />
                    <StatTile label="Submitted" value={2} detail="awaiting" accent />
                </div>
                <div className="space-y-2.5">
                    <TaskRow tone="amber" title="Tailor personal statement" sub="University of Manchester · Computer Science" due="Due in 3d" />
                    <TaskRow tone="sky" title="Confirm reference from Ms Okonkwo" sub="Imperial College London" due="In 6d" />
                    <TaskRow tone="emerald" title="Submit UCAS application" sub="University of Cambridge" due="Ready" />
                </div>
            </AppFrame>
        );
    }
    return (
        <AppFrame route="/dashboard">
            <div className="mb-3 flex items-center gap-4 rounded-2xl border border-border bg-card p-4 dark:border-white/10">
                <ProgressRing value={100} size={88} stroke={8} colorClass="stroke-emerald-500" label="Profile 100% complete" />
                <div>
                    <p className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-emerald-600 dark:text-emerald-400">
                        Profile complete
                    </p>
                    <p className="mt-1 text-[0.9375rem] font-semibold tracking-tight text-foreground">Everything&apos;s in place</p>
                    <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">
                        Matches &amp; requirements running on your full profile.
                    </p>
                </div>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
                <StatTile label="Applications" value={6} />
                <StatTile label="Due this week" value={3} />
                <StatTile label="Profile" value={100} suffix="%" accent />
            </div>
        </AppFrame>
    );
}

export function FeaturesSection() {
    return (
        <section id="features" className="section-fade w-full py-24 bg-secondary/40 sm:py-32 scroll-mt-14">
            <div className="max-w-7xl mx-auto px-6">
                <AnimatedSection className="max-w-3xl space-y-3">
                    <p className="text-sm font-medium uppercase tracking-widest text-primary/80">Inside Ascenda</p>
                    <h2 className="text-4xl md:text-5xl font-heading font-bold text-foreground tracking-tight">
                        From a blank shortlist to a submitted application.
                    </h2>
                    <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl">
                        One workspace for the whole cycle — matched programmes, a plan that knows your deadlines, and the
                        people helping you get there.
                    </p>
                </AnimatedSection>

                <div className="mt-14 space-y-16 sm:space-y-24">
                    {rows.map((row) => (
                        <motion.div
                            key={row.title}
                            className="grid items-center gap-8 md:grid-cols-2 md:gap-14"
                            initial={{ opacity: 0, y: 24 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, amount: 0.25 }}
                            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                        >
                            <div className={cn(row.reverse && 'md:order-2')}>
                                <FeatureWidget kind={row.widget} />
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">{row.label}</p>
                                <h3 className="mt-3 text-2xl font-heading font-bold tracking-tight text-foreground sm:text-[1.7rem]">
                                    {row.title}
                                </h3>
                                <p className="mt-3 text-base leading-relaxed text-muted-foreground">{row.copy}</p>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    {row.chips.map((chip) => (
                                        <span
                                            key={chip}
                                            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[0.8125rem] font-medium text-muted-foreground dark:border-white/10"
                                        >
                                            <Check className="h-3.5 w-3.5 text-emerald-500" strokeWidth={2.4} aria-hidden />
                                            {chip}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
