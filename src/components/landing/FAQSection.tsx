'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fadeIn } from '@/lib/motion';
import { Plus, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

const faqs = [
    {
        question: 'What happens when a requirement changes mid-cycle?',
        answer:
            'Universities move deadlines and tweak entry requirements more often than you’d think. Ascenda flags the change on your plan the moment it lands — so you adjust in days, not after the deadline.'
    },
    {
        question: 'Who is Ascenda for?',
        answer: 'International school students (IB and A-Level), and the counsellors and families supporting them — across the US, Canada, UK, EU, Australia, Singapore and Hong Kong, with visa insights for each.'
    },
    {
        question: 'How do I get access?',
        answer:
            'Ascenda is currently invite-only while we work closely with a small group of schools. Reach out to your Ascenda contact to have an account set up for you.'
    },
    {
        question: 'Is my data private?',
        answer:
            'Yes. Ascenda stores data in region, enforces multi-factor sign-in, and gives you control over exactly who sees what — student, counsellor, or parent.'
    }
];

export function FAQSection() {
    const [openFaq, setOpenFaq] = useState<string | null>(faqs[0].question);

    return (
        <section id="faq" className="w-full py-24 bg-background sm:py-32 scroll-mt-14">
            <div className="max-w-7xl mx-auto px-6 grid gap-12 lg:grid-cols-[0.4fr_0.6fr]">
                <motion.div
                    className="space-y-4"
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, amount: 0.3 }}
                    variants={fadeIn}
                >
                    <p className="text-sm font-medium uppercase tracking-widest text-primary/80">FAQ</p>
                    <h2 className="text-3xl md:text-4xl font-heading font-bold text-foreground tracking-tight">Common questions.</h2>
                    <div className="pt-4">
                        <div className="rounded-2xl border border-primary/10 bg-primary/5 p-5 space-y-2">
                            <p className="text-sm font-semibold text-foreground">Still deciding?</p>
                            <p className="text-sm text-muted-foreground">Talk to a real person on the team — no bots, no sales script.</p>
                            <a href="mailto:hello@ascendaedu.com" className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors mt-1">
                                Get in touch
                            </a>
                        </div>
                    </div>
                </motion.div>

                <div className="space-y-3">
                    {faqs.map((faq, index) => {
                        const isOpen = openFaq === faq.question;
                        return (
                            <motion.div
                                key={faq.question}
                                className={cn(
                                    'rounded-2xl border overflow-hidden transition-all duration-300',
                                    isOpen
                                        ? 'border-primary/20 bg-primary/[0.03] shadow-sm'
                                        : 'border-border/50 bg-card hover:bg-muted/20'
                                )}
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: true, amount: 0.3 }}
                                variants={{
                                    hidden: { opacity: 0, y: 12 },
                                    visible: { opacity: 1, y: 0, transition: { duration: 0.4, delay: index * 0.05 } }
                                }}
                            >
                                <button
                                    type="button"
                                    id={`faq-btn-${index}`}
                                    className="flex w-full items-center justify-between p-5 text-left group"
                                    onClick={() => setOpenFaq((prev) => (prev === faq.question ? null : faq.question))}
                                    aria-expanded={isOpen}
                                    aria-controls={`faq-panel-${index}`}
                                >
                                    <span className="text-[0.9375rem] font-semibold text-foreground pr-4 leading-snug">{faq.question}</span>
                                    <span className={cn(
                                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-300',
                                        isOpen
                                            ? 'bg-primary text-primary-foreground rotate-0'
                                            : 'bg-muted/60 text-muted-foreground group-hover:bg-muted'
                                    )}>
                                        {isOpen ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                    </span>
                                </button>
                                <AnimatePresence initial={false}>
                                    {isOpen && (
                                        <motion.div
                                            id={`faq-panel-${index}`}
                                            role="region"
                                            aria-labelledby={`faq-btn-${index}`}
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
                                            className="overflow-hidden"
                                        >
                                            <div className="px-5 pb-5 pt-0">
                                                <p className="text-[0.9375rem] text-muted-foreground leading-relaxed">{faq.answer}</p>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
