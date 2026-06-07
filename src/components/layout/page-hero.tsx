'use client';

import type { ReactNode } from 'react';
import { useState, useEffect, useRef } from 'react';
import { motion, useMotionValue, useSpring, useInView, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface HeroStat {
  label: string;
  value: string;
  detail?: string;
}

interface PageHeroProps {
  eyebrow?: string;
  title: string;
  description: string;
  highlight?: string;
  accent?: string;
  stats?: HeroStat[];
  actions?: ReactNode;
  breadcrumbs?: ReactNode;
  className?: string;
  /**
   * 'student' = warmer, lighter, sentence-case (default for student-facing pages).
   * 'counsellor' = denser, all-caps tracking, live-pulse pill (operational vibe).
   */
  tone?: 'student' | 'counsellor';
}

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04, delayChildren: 0 } }
};

const fadeUp = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] as const } }
};

const statVariants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] as const } }
};

const statsContainerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04, delayChildren: 0.06 } }
};

function AnimatedNumber({ value }: { value: string }) {
  const numericMatch = value.match(/-?[\d,]*\.?\d+/);
  const numericText = numericMatch ? numericMatch[0].replace(/,/g, '') : '';
  const numeric = numericText ? parseFloat(numericText) : NaN;
  const isNumeric = !Number.isNaN(numeric) && numeric > 0;
  const prefix = numericMatch ? value.slice(0, numericMatch.index) : '';
  const suffix = numericMatch ? value.slice((numericMatch.index ?? 0) + numericMatch[0].length) : '';
  const isInteger = Number.isInteger(numeric) && !numericText.includes('.');

  const formatNumber = (n: number) => {
    if (isInteger) return Math.round(n).toLocaleString('en-US');
    return (Math.round(n * 10) / 10).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  };

  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const motionVal = useMotionValue(0);
  const spring = useSpring(motionVal, { stiffness: 80, damping: 18 });
  const [display, setDisplay] = useState(isNumeric ? `${prefix}0${suffix}` : value);

  useEffect(() => {
    if (inView && isNumeric) motionVal.set(numeric);
  }, [inView, isNumeric, numeric, motionVal]);

  useEffect(() => {
    if (!isNumeric) return;
    return spring.on('change', (v) => {
      setDisplay(`${prefix}${formatNumber(v)}${suffix}`);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spring, isNumeric, numeric, prefix, suffix, isInteger]);

  // With reduced motion, skip the count-up and show the final value immediately.
  if (reduced) return <span>{value}</span>;

  return <span ref={ref}>{display}</span>;
}

export const PageHero = ({
  eyebrow,
  title,
  description,
  highlight,
  accent,
  stats,
  actions,
  breadcrumbs,
  className,
  tone = 'counsellor'
}: PageHeroProps) => {
  const isStudent = tone === 'student';
  const resolvedAccent = accent ?? (isStudent ? 'Today' : 'Live focus');
  const reduced = useReducedMotion();
  const initial = reduced ? false : 'hidden';
  return (
    <motion.section
      className={cn(
        'surface-card surface-card--static text-foreground overflow-hidden !py-3 !px-4 sm:!py-3.5 sm:!px-5',
        className
      )}
      variants={containerVariants}
      initial={initial}
      animate="show"
    >
      <div className="relative flex flex-col gap-1.5">
        {breadcrumbs ? (
          <motion.div variants={fadeUp}>
            {breadcrumbs}
          </motion.div>
        ) : null}

        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <motion.div className="space-y-1" variants={containerVariants}>
            <motion.div className="flex flex-wrap items-center gap-2" variants={fadeUp}>
              {isStudent ? (
                <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 bg-primary/5 px-2 py-0.5 text-[10px] font-medium text-primary/80">
                  <span>{resolvedAccent}</span>
                  {highlight ? (
                    <>
                      <span className="text-muted-foreground/60">·</span>
                      <span className="font-semibold text-foreground">{highlight}</span>
                    </>
                  ) : null}
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.4em] text-primary/70">
                  <span className="h-1 w-1 rounded-full bg-primary animate-pulse" />
                  <span>{resolvedAccent}</span>
                  {highlight ? <span className="text-foreground font-bold">{highlight}</span> : null}
                </div>
              )}
              {eyebrow ? (
                <span className="text-[10px] text-muted-foreground font-medium">{eyebrow}</span>
              ) : null}
            </motion.div>
            <motion.div variants={fadeUp}>
              <h1
                className={cn(
                  'font-semibold text-foreground leading-snug',
                  isStudent ? 'text-[17px] md:text-[19px]' : 'text-[15px] md:text-[17px]'
                )}
              >
                {title}
              </h1>
              <p className="mt-0.5 max-w-xl text-[11px] text-muted-foreground leading-snug">
                {description}
              </p>
            </motion.div>
            {actions ? (
              <motion.div className="flex flex-wrap gap-1.5 pt-0.5" variants={fadeUp}>
                {actions}
              </motion.div>
            ) : null}
          </motion.div>
          {stats && stats.length > 0 ? (
            <div className="border-t border-border/60 pt-2 md:border-l md:border-t-0 md:pl-4 md:shrink-0">
              <motion.div
                className={cn(
                  'flex gap-2',
                  stats.length >= 4 ? 'flex-wrap' : 'flex-row'
                )}
                variants={statsContainerVariants}
                initial={initial}
                animate="show"
              >
                {stats.map((stat) => {
                  const isNumeric = /^[-$£€¥]?\s*[\d,]+(?:\.\d+)?\s*[%a-zA-Z]{0,3}\s*$/.test(stat.value.trim());
                  return (
                  <motion.div
                    key={stat.label}
                    className="min-w-0 rounded-lg border border-border bg-background px-3 py-1.5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-primary/20"
                    variants={statVariants}
                  >
                    <p
                      className={cn(
                        'font-semibold text-foreground leading-tight',
                        isNumeric ? 'tabular-nums truncate text-sm' : 'text-xs break-words'
                      )}
                      title={stat.value}
                    >
                      <AnimatedNumber value={stat.value} />
                    </p>
                    <p className="text-[10px] text-muted-foreground font-medium truncate" title={stat.label}>
                      {stat.label}
                    </p>
                    {stat.detail ? (
                      <p className="text-[10px] text-muted-foreground truncate" title={stat.detail}>
                        {stat.detail}
                      </p>
                    ) : null}
                  </motion.div>
                  );
                })}
              </motion.div>
            </div>
          ) : null}
        </div>
      </div>
    </motion.section>
  );
};
