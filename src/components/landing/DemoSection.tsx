'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { fadeIn } from '@/lib/motion';
import { Button } from '@/components/ui/button';
import { Play, ArrowRight, Zap, Globe, NotebookPen } from 'lucide-react';
import { useSupabase } from '@/hooks/useSupabase';
import { RETURNING_USER_STORAGE_KEY } from '@/lib/constants';
import { DemoPreview } from './DemoPreview';

export function DemoSection() {
    const shouldReduceMotion = useReducedMotion();
    const supabase = useSupabase();
    const [tryHref, setTryHref] = useState('/login');

    useEffect(() => {
        const checkAuth = async () => {
            const hasVisited =
                typeof window !== 'undefined' &&
                window.localStorage.getItem(RETURNING_USER_STORAGE_KEY) === 'true';
            if (hasVisited) { setTryHref('/dashboard'); return; }
            const { data, error } = await supabase.auth.getSession();
            if (!error && data.session) setTryHref('/dashboard');
        };
        void checkAuth();
    }, [supabase]);

    return (
        <section className="section-fade w-full bg-secondary/40 py-24 sm:py-32">
            <motion.div
                className="max-w-7xl mx-auto px-6 grid gap-12 md:grid-cols-[0.9fr_1.1fr] items-center"
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.3 }}
                variants={fadeIn}
            >
                <div className="space-y-8">
                    <div className="space-y-4">
                        <p className="text-sm font-medium uppercase tracking-widest text-primary/80">Quick demo</p>
                        <h2 className="text-4xl font-heading font-bold text-foreground tracking-tight">Aim higher. Land smarter.</h2>
                        <p className="text-lg text-muted-foreground leading-relaxed">
                            Paste predicted grades, hit enter, and Ascenda animates Fit Scores, timelines, and required actions in real time. No extra UI noise — just the next move.
                        </p>
                    </div>

                    <ul className="space-y-4">
                        {[
                            { icon: Zap, text: 'Live Fit Score recalculations', color: 'text-amber-500 bg-amber-500/10' },
                            { icon: Globe, text: 'Scholarships + visa checks in-line', color: 'text-emerald-500 bg-emerald-500/10' },
                            { icon: NotebookPen, text: 'Notes stay synced automatically', color: 'text-sky-500 bg-sky-500/10' },
                        ].map((item) => {
                            const Icon = item.icon;
                            return (
                                <li key={item.text} className="flex items-center gap-3 text-muted-foreground group">
                                    <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${item.color} transition-transform group-hover:scale-110`}>
                                        <Icon className="h-4 w-4" />
                                    </span>
                                    <span className="text-[0.9375rem]">{item.text}</span>
                                </li>
                            );
                        })}
                    </ul>

                    <div className="flex flex-wrap gap-4 pt-4">
                        <Button asChild size="lg" className="rounded-full shadow-lg hover:shadow-xl transition-all group">
                            <Link href={tryHref} className="flex items-center gap-2">
                                <Play className="h-4 w-4" />
                                Sign in
                                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                            </Link>
                        </Button>
                        <Button asChild size="lg" variant="outline" className="rounded-full border-border hover:bg-background/80">
                            <Link href="#features">Explore features</Link>
                        </Button>
                    </div>
                </div>

                <motion.div
                    className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-xl group"
                    whileHover={shouldReduceMotion ? undefined : { scale: 1.01 }}
                    transition={{ type: 'spring', stiffness: 300 }}
                >
                    {/* Glow effect */}
                    <div className="absolute inset-x-4 top-4 h-16 rounded-full bg-primary/15 blur-3xl opacity-60 group-hover:opacity-80 transition-opacity" />

                    {/* Browser chrome */}
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50 bg-muted/30">
                        <div className="flex gap-1.5">
                            <div className="h-2.5 w-2.5 rounded-full bg-rose-400/60" />
                            <div className="h-2.5 w-2.5 rounded-full bg-amber-400/60" />
                            <div className="h-2.5 w-2.5 rounded-full bg-emerald-400/60" />
                        </div>
                        <div className="flex-1 mx-8">
                            <div className="h-5 rounded-full bg-muted/50 max-w-xs mx-auto flex items-center justify-center">
                                <span className="text-[0.625rem] text-muted-foreground/50 font-mono">app.ascenda.com</span>
                            </div>
                        </div>
                    </div>

                    <div className="p-3 min-h-[360px]">
                        <DemoPreview />
                    </div>
                </motion.div>
            </motion.div>
        </section>
    );
}
