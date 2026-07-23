'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { fadeIn } from '@/lib/motion';
import { Button } from '@/components/ui/button';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useSupabase } from '@/hooks/useSupabase';
import { RETURNING_USER_STORAGE_KEY } from '@/lib/constants';

export function CTASection() {
    const shouldReduceMotion = useReducedMotion();
    const supabase = useSupabase();
    const [ctaHref, setCtaHref] = useState('/login');

    useEffect(() => {
        const checkAuth = async () => {
            const hasVisited =
                typeof window !== 'undefined' &&
                window.localStorage.getItem(RETURNING_USER_STORAGE_KEY) === 'true';
            if (hasVisited) {
                setCtaHref('/dashboard');
                return;
            }
            const { data, error } = await supabase.auth.getSession();
            if (!error && data.session) {
                setCtaHref('/dashboard');
            }
        };
        void checkAuth();
    }, [supabase]);

    return (
        // Theme-locked: this band is deliberately dark in BOTH themes. Using the
        // semantic bg-foreground/text-background pair here would invert to a white
        // slab in dark mode, so fixed palette classes are intentional.
        <section className="relative w-full py-32 bg-slate-950 text-slate-50 overflow-hidden">
            {/* Animated gradient orbs — same DOM/`initial` for all users (SSR-safe).
                The reduced-motion branch lives in `transition`, which never serialises
                into the SSR HTML: duration 0 + no repeat snaps the orb to its final
                keyframe (a static dim glow) so the perpetual opacity/transform loop
                never runs for reduced-motion users. */}
            <motion.div
                className="absolute -left-32 -top-32 h-[400px] w-[400px] rounded-full bg-primary/20 blur-[100px]"
                whileInView={{ x: [0, 40, -20, 0], y: [0, 20, -10, 0], opacity: [0.2, 0.35, 0.2] }}
                viewport={{ once: false }}
                transition={shouldReduceMotion
                    ? { duration: 0 }
                    : { duration: 12, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
                className="absolute -right-32 -bottom-32 h-[350px] w-[350px] rounded-full bg-emerald-500/15 blur-[100px]"
                whileInView={{ x: [0, -30, 20, 0], y: [0, -15, 25, 0], opacity: [0.15, 0.3, 0.15] }}
                viewport={{ once: false }}
                transition={shouldReduceMotion
                    ? { duration: 0 }
                    : { duration: 14, repeat: Infinity, ease: 'easeInOut' }}
            />

            <div className="relative z-10">
                <div className="mx-auto h-px max-w-5xl bg-white/10 mb-12" />
                <motion.div
                    className="max-w-4xl mx-auto px-6 text-center space-y-8"
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, amount: 0.3 }}
                    variants={fadeIn}
                >
                    <motion.div
                        className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-1.5 text-sm font-medium text-slate-200 backdrop-blur-sm"
                        initial={{ opacity: 0, y: -10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        viewport={{ once: true }}
                    >
                        <Sparkles className="h-3.5 w-3.5" aria-hidden />
                        Five minutes to set up
                    </motion.div>

                    <div className="space-y-5">
                        <h2 className="text-4xl md:text-6xl font-heading font-bold tracking-tight leading-[1.1] [text-wrap:balance]">
                            Your shortlist is waiting.
                        </h2>
                        <p className="text-xl max-w-2xl mx-auto leading-relaxed text-slate-300">
                            Tell us where you stand, and every programme, essay, scholarship and deadline lives in one plan — nothing slips through the cracks.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
                        <Button
                            asChild
                            size="lg"
                            className="h-12 px-8 text-base bg-white text-slate-900 shadow-xl hover:bg-white/90 hover:shadow-2xl transition-all group"
                        >
                            <Link href={ctaHref} className="flex items-center gap-2">
                                {ctaHref === '/dashboard' ? 'Go to dashboard' : 'Build your plan'}
                                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                            </Link>
                        </Button>
                    </div>

                    {/* Social proof bar */}
                    <motion.div
                        className="flex flex-wrap items-center justify-center gap-6 pt-8 text-sm text-slate-400"
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        transition={{ delay: 0.6 }}
                        viewport={{ once: true }}
                    >
                        <span className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            Invite-only access
                        </span>
                        <span className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            In-region data · MFA sign-in
                        </span>
                        <span className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            Built with school counsellors
                        </span>
                    </motion.div>
                </motion.div>
            </div>
        </section>
    );
}
