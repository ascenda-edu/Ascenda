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
        <section className="relative w-full py-32 bg-foreground text-background overflow-hidden">
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
                <div className="mx-auto h-px max-w-5xl bg-background/10 mb-12" />
                <motion.div
                    className="max-w-4xl mx-auto px-6 text-center space-y-8"
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, amount: 0.3 }}
                    variants={fadeIn}
                >
                    <motion.div
                        className="inline-flex items-center gap-2 rounded-full border border-background/20 bg-background/5 px-4 py-1.5 text-sm font-medium text-background/80 backdrop-blur-sm"
                        initial={{ opacity: 0, y: -10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        viewport={{ once: true }}
                    >
                        <Sparkles className="h-3.5 w-3.5" aria-hidden />
                        Plan confidently
                    </motion.div>

                    <div className="space-y-5">
                        <h2 className="text-4xl md:text-6xl font-heading font-bold tracking-tight leading-[1.1]">
                            Launch with the decisions<br className="hidden sm:block" /> that matter.
                        </h2>
                        <p className="text-xl max-w-2xl mx-auto leading-relaxed text-background/70">
                            Tie programs, essays, scholarships, and deadlines together — so every action is tied to the right school and nothing slips through the cracks.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
                        <Button
                            asChild
                            size="lg"
                            className="h-12 px-8 text-base bg-background text-foreground shadow-xl hover:bg-background/90 hover:shadow-2xl transition-all group"
                        >
                            <Link href={ctaHref} className="flex items-center gap-2">
                                {ctaHref === '/dashboard' ? 'Go to dashboard' : 'Sign in'}
                                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                            </Link>
                        </Button>
                    </div>

                    {/* Social proof bar */}
                    <motion.div
                        className="flex flex-wrap items-center justify-center gap-6 pt-8 text-sm text-background/50"
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
                            Secure &amp; private
                        </span>
                        <span className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            Built with design partners
                        </span>
                    </motion.div>
                </motion.div>
            </div>
        </section>
    );
}
