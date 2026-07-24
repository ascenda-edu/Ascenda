'use client';

import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { AnimatedSection } from '@/components/layout/animated-section';
import { cn } from '@/lib/utils';
import {
    AppFrame,
    MatchCard,
    SearchWidget,
    TaskRow,
} from './product-widgets';
import { PipelineBar } from './mock-viz';

type WidgetKind = 'fit' | 'search' | 'plan';

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
        copy: 'Every programme scored against your grades, subjects and goals — sorted into reach, match and safe, with your admission odds on each card.',
        chips: ['Reach / match / safe', 'Recalculates as your profile grows'],
        widget: 'fit',
    },
    {
        label: 'The catalogue',
        title: 'Every programme, one search.',
        copy: '119,000+ courses, one search. Filter by country, subject and the life you want — and see your fit before you shortlist.',
        chips: ['119,000+ programmes', 'Fit preview on every result'],
        widget: 'search',
        reverse: true,
    },
    {
        label: 'Your plan',
        title: 'A plan that keeps you moving.',
        copy: 'Essays, references and deadlines tracked per application — the most urgent thing always on top.',
        chips: ['Per-application tracking', 'Counsellor built in'],
        widget: 'plan',
    },
];

function FeatureWidget({ kind }: { kind: WidgetKind }) {
    if (kind === 'fit') {
        return (
            <AppFrame route="/matches">
                <div className="space-y-2.5">
                    <MatchCard name="TU Delft" sub="MSc Aerospace Engineering" location="Delft, Netherlands" tier="Safe" score={92} meta="€18,750/yr · 2 yrs · Master's" />
                    <MatchCard name="Imperial College London" sub="MEng Aeronautics" location="London, United Kingdom" tier="Match" score={85} meta="£40,940/yr · 4 yrs · Master's" />
                    <MatchCard name="ETH Zürich" sub="MSc Mechanical Engineering" location="Zürich, Switzerland" tier="Reach" score={71} meta="CHF 1,460/yr · 2 yrs · Master's" />
                </div>
            </AppFrame>
        );
    }
    if (kind === 'search') {
        return (
            <AppFrame title="Search hub">
                <SearchWidget
                    query="aerospace engineering in europe"
                    chips={[{ label: 'Netherlands', active: true }, { label: 'Engineering' }, { label: "Master's" }]}
                />
            </AppFrame>
        );
    }
    return (
        <AppFrame route="/applications">
            <div className="mb-3.5">
                <PipelineBar
                    stages={[
                        { label: 'Planning', count: 1, colorClass: 'bg-slate-400' },
                        { label: 'In progress', count: 3, colorClass: 'bg-sky-500' },
                        { label: 'Submitted', count: 2, colorClass: 'bg-emerald-500' },
                    ]}
                />
            </div>
            <div className="space-y-2.5">
                <TaskRow tone="rose" title="Tailor personal statement" sub="Imperial College London" due="2d" />
                <TaskRow tone="amber" title="Confirm reference from Ms Okonkwo" sub="TU Delft" due="6d" />
                <TaskRow tone="sky" title="Submit UCAS application" sub="ESADE + Imperial" due="12d" />
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
                        Three things do the heavy lifting: scores you can trust, one searchable catalogue, and a plan that
                        keeps moving.
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
