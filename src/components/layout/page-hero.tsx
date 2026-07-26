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
  title: ReactNode;
  description: string;
  /** Short bold value rendered next to the eyebrow (e.g. "13 total"). */
  highlight?: string;
  stats?: HeroStat[];
  actions?: ReactNode;
  breadcrumbs?: ReactNode;
  className?: string;
  /** Tone still controls subtle copy weight in downstream slots. */
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
  stats,
  actions,
  breadcrumbs,
  className,
  tone = 'counsellor'
}: PageHeroProps) => {
  const isStudent = tone === 'student';
  const reduced = useReducedMotion();
  const initial = reduced ? false : 'hidden';
  // Only render the small eyebrow row when the caller actually provided
  // content — no default "Live focus" / "Today" pill noise on every page.
  const showEyebrowRow = Boolean(eyebrow || highlight);
  return (
    <motion.section
      className={cn(
        // No `!important` needed: Tailwind emits @layer utilities after
        // @layer components, so these px/py utilities already outrank
        // surface-card's own `p-6 sm:p-7` at every breakpoint. (Verified against
        // the compiled stylesheet — the sm: variants land after
        // surface-card's sm: block too.) `surface-card--static` dropped: static
        // is now the default and the modifier is an empty no-op.
        'surface-card text-foreground overflow-hidden py-3 px-4 sm:py-3.5 sm:px-5',
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
            {showEyebrowRow ? (
              <motion.div
                className="flex flex-wrap items-baseline gap-1.5 text-label text-muted-foreground"
                variants={fadeUp}
              >
                {eyebrow ? <span className="font-medium">{eyebrow}</span> : null}
                {eyebrow && highlight ? <span className="text-muted-foreground/40">·</span> : null}
                {highlight ? (
                  <span className="font-semibold text-foreground">
                    {highlight}
                  </span>
                ) : null}
              </motion.div>
            ) : null}
            <motion.div variants={fadeUp}>
              <h1
                className={cn(
                  'font-semibold text-foreground leading-snug',
                  isStudent ? 'text-[1.0625rem] md:text-[1.1875rem]' : 'text-[0.9375rem] md:text-[1.0625rem]'
                )}
              >
                {title}
              </h1>
              <p className="mt-0.5 max-w-xl text-label text-muted-foreground leading-snug">
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
                    className="min-w-0 rounded-lg border border-border bg-background px-3 py-1.5 shadow-e-1 transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-e-2 hover:border-primary/20"
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
                    <p className="text-label text-muted-foreground font-medium truncate" title={stat.label}>
                      {stat.label}
                    </p>
                    {stat.detail ? (
                      <p className="text-label text-muted-foreground truncate" title={stat.detail}>
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
