'use client';

import { motion } from 'framer-motion';
import { Briefcase, Check, Clock3, FileText, Heart, Home, TrendingUp, Users, Wallet } from 'lucide-react';
import { AnimatedSection } from '@/components/layout/animated-section';
import { cn } from '@/lib/utils';
import { AppFrame, ProgressRing } from './product-widgets';
import { FunnelChart, MonitorRow } from './mock-viz';

/** Overlapping role chip on a frame's top edge — marks who the surface is for. */
function RoleBadge({ icon: Icon, label, className }: { icon: typeof Users; label: string; className: string }) {
    return (
        <span
            className={cn(
                'absolute -top-3.5 left-4 z-10 inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-[0.6875rem] font-bold uppercase tracking-[0.08em] shadow-md',
                className,
            )}
        >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
        </span>
    );
}

/**
 * "Built for the whole team" — the two non-student surfaces that close the
 * sale with the adults in the room: the counsellor cohort view (acceptance
 * gauge, docs/deadlines monitor, stage funnel) and the parent cost explorer
 * (home-currency costs + graduate outcomes). Mocks mirror
 * counsellor/_components/outcome-dashboard.tsx + deadline-monitor.tsx and
 * parent/finances/_cost-explorer.tsx.
 */

const COST_ROWS = [
    { icon: Wallet, tone: 'bg-primary/10 text-primary', label: 'Tuition', value: '€18,750', per: '/yr' },
    { icon: Home, tone: 'bg-sky-500/10 text-sky-600 dark:text-sky-400', label: 'Housing & living', value: '€9,600', per: '/yr' },
    { icon: TrendingUp, tone: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', label: 'Avg starting salary', value: '€54,000' },
    { icon: Briefcase, tone: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', label: 'Graduate employment', value: '94%' },
];

const CURRENCIES = ['€ EUR', '$ USD', '₹ INR'];

export function TeamSection() {
    return (
        <section id="team" className="w-full bg-secondary/40 py-24 sm:py-32 scroll-mt-14">
            <div className="mx-auto max-w-7xl px-6">
                <AnimatedSection className="max-w-3xl space-y-3">
                    <p className="text-sm font-medium uppercase tracking-widest text-primary/80">Not just for students</p>
                    <h2 className="font-heading text-4xl font-bold tracking-tight text-foreground md:text-5xl">
                        Built for the whole team.
                    </h2>
                    <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
                        Counsellors run the cohort from one view. Parents see what it costs — in their own currency — and
                        what it pays back.
                    </p>
                </AnimatedSection>

                <div className="mt-14 grid gap-8 md:grid-cols-2 md:gap-10">
                    <motion.div
                        initial={{ opacity: 0, y: 24 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.25 }}
                        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                    >
                        <div className="relative">
                        <RoleBadge icon={Users} label="Counsellors" className="border-violet-500/30 text-violet-700 dark:text-violet-300" />
                        <AppFrame route="/counsellor">
                            <div className="flex items-center gap-4 sm:gap-5">
                                <div className="shrink-0 text-center">
                                    <ProgressRing value={64} size={84} stroke={8} colorClass="stroke-emerald-500" label="64% cohort acceptance rate" />
                                    <p className="mt-2 text-[0.625rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                                        Acceptance rate
                                    </p>
                                </div>
                                <div className="min-w-0 flex-1 space-y-2">
                                    <MonitorRow
                                        tone="rose"
                                        icon={<Clock3 className="h-3.5 w-3.5" aria-hidden />}
                                        student="Maya"
                                        item="UCAS submission"
                                        pill="3d"
                                    />
                                    <MonitorRow
                                        tone="amber"
                                        icon={<FileText className="h-3.5 w-3.5" aria-hidden />}
                                        student="Jonas"
                                        item="transcript missing"
                                        pill="Chase"
                                    />
                                    <MonitorRow
                                        tone="emerald"
                                        icon={<Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />}
                                        student="Priya"
                                        item="reference received"
                                        pill="Done"
                                    />
                                </div>
                            </div>
                            <div className="mt-4">
                                <FunnelChart
                                    stages={[
                                        { label: 'Shortlisted', count: 24, colorClass: 'bg-violet-500', width: 100 },
                                        { label: 'Applied', count: 18, colorClass: 'bg-sky-500', width: 78 },
                                        { label: 'Offers', count: 11, colorClass: 'bg-emerald-500', width: 56 },
                                        { label: 'Enrolled', count: 8, colorClass: 'bg-amber-500', width: 40 },
                                    ]}
                                />
                            </div>
                            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[0.6875rem] font-bold text-emerald-600 dark:text-emerald-400">
                                ▲ +12% offers vs last year
                            </p>
                        </AppFrame>
                        </div>
                        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                            <span className="font-semibold text-foreground">Counsellors</span> chase missing documents and
                            looming deadlines across the whole cohort, and track outcomes — no spreadsheets.
                        </p>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 24 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.25 }}
                        transition={{ duration: 0.55, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                    >
                        <div className="relative">
                        <RoleBadge icon={Heart} label="Parents" className="border-sky-500/30 text-sky-700 dark:text-sky-300" />
                        <AppFrame route="/parent">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                                    TU Delft · Cost of attendance
                                </p>
                                <div className="flex gap-1.5">
                                    {CURRENCIES.map((c, i) => (
                                        <span
                                            key={c}
                                            className={
                                                i === 0
                                                    ? 'rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[0.6875rem] font-bold text-primary'
                                                    : 'rounded-full border border-border bg-card px-2.5 py-0.5 text-[0.6875rem] font-semibold text-muted-foreground dark:border-white/10'
                                            }
                                        >
                                            {c}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-2">
                                {COST_ROWS.map((row) => (
                                    <div
                                        key={row.label}
                                        className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 dark:border-white/10"
                                    >
                                        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${row.tone}`} aria-hidden>
                                            <row.icon className="h-4 w-4" />
                                        </span>
                                        <span className="flex-1 text-xs text-muted-foreground">{row.label}</span>
                                        <span className="text-sm font-bold tabular-nums text-foreground">
                                            {row.value}
                                            {row.per && <span className="font-medium text-muted-foreground">{row.per}</span>}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-3 flex items-baseline justify-between px-1 text-[0.8125rem] text-muted-foreground">
                                <span>Est. total · 2-year programme</span>
                                <span className="font-heading text-lg font-bold tabular-nums text-foreground">€56,700</span>
                            </div>
                        </AppFrame>
                        </div>
                        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                            <span className="font-semibold text-foreground">Parents</span> get read-only progress and the
                            full financial picture — tuition, living costs and graduate outcomes, converted to home currency.
                        </p>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}
