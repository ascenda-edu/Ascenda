'use client';

import { motion } from 'framer-motion';
import { ArrowRight, Check, X } from 'lucide-react';
import { fadeIn } from '@/lib/motion';

// Positions form an overlapping diagonal "pile" on md+ (fills the box instead of
// pinning cards to empty corners); on mobile they render as a plain stacked list.
const chaosNotes = [
    { h: 'Rankings', body: 'League table says one thing, the forum says another.', pos: 'md:left-[5%] md:top-[3%] md:z-10 md:-rotate-[5deg]' },
    { h: 'Everywhere', body: '40 tabs, 3 spreadsheets, a notes app.', pos: 'md:left-[34%] md:top-[24%] md:z-30 md:rotate-[3deg]' },
    { h: 'Too late', body: 'Found out about the deadline the day it closed.', pos: 'md:left-[8%] md:top-[47%] md:z-20 md:-rotate-[2deg]' },
    { h: 'Vague', body: '“Just apply broadly and see what happens.”', pos: 'md:left-[33%] md:top-[68%] md:z-40 md:rotate-[4deg]' },
];

const clarityPoints = [
    'One ranked list, scored to you.',
    'Every programme, task and deadline in one workspace.',
    'Deadlines that find you first.',
];

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
                <div className="max-w-2xl space-y-3">
                    <p className="text-sm font-medium uppercase tracking-widest text-primary/80">With &amp; without Ascenda</p>
                    <h2 className="text-3xl md:text-4xl font-heading font-bold text-foreground tracking-tight">
                        Same student. Different year.
                    </h2>
                </div>

                <div className="mt-12 grid items-center gap-8 md:grid-cols-[1fr_auto_1fr] md:gap-6">
                    {/* Without — chaos */}
                    <div>
                        <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-rose-500/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.05em] text-rose-700 dark:text-rose-400">
                            <X className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
                            Without Ascenda
                        </span>
                        {/* Mobile: a plain stacked list. md+: absolutely-positioned, rotated "mess". */}
                        <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-rose-500/30 bg-rose-500/[0.04] p-4 md:relative md:block md:h-[360px] md:overflow-hidden md:p-0">
                            {/* faint stack of browser tabs behind the pile (scatter only) */}
                            <div className="absolute right-[6%] top-[38%] hidden -rotate-6 gap-1.5 opacity-40 md:flex">
                                {[0, 1, 2, 3].map((i) => (
                                    <span key={i} className="h-[30px] w-[50px] rounded-t-md border border-b-0 border-border bg-muted/60" />
                                ))}
                            </div>
                            {chaosNotes.map((note) => (
                                <div
                                    key={note.h}
                                    className={`rounded-xl border border-border bg-card p-3.5 text-[0.8125rem] font-medium leading-snug shadow-lg dark:border-white/10 md:absolute md:max-w-[236px] ${note.pos}`}
                                >
                                    <span className="mb-1 block text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-rose-700 dark:text-rose-400">
                                        {note.h}
                                    </span>
                                    {note.body}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Arrow */}
                    <div className="grid place-items-center">
                        <span className="grid h-11 w-11 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-md max-md:rotate-90">
                            <ArrowRight className="h-5 w-5" aria-hidden />
                        </span>
                    </div>

                    {/* With — clarity */}
                    <div>
                        <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.05em] text-emerald-700 dark:text-emerald-400">
                            <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
                            With Ascenda
                        </span>
                        <div className="flex flex-col gap-3">
                            {clarityPoints.map((pt) => (
                                <div
                                    key={pt}
                                    className="flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 text-[0.9375rem] font-medium leading-snug text-foreground shadow-sm"
                                >
                                    <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" strokeWidth={2.4} aria-hidden />
                                    {pt}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </motion.div>
        </section>
    );
}
