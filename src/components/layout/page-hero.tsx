'use client';

import type { ReactNode } from 'react';
import { useState, useEffect, useRef } from 'react';
import { motion, useMotionValue, useSpring, useInView, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { stagger, childFade } from '@/lib/motion';

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
  /**
   * Surface register. `'student'` (the default) accents the eyebrow with the brand
   * ink for a warmer read; `'counsellor'` keeps it neutral and operational.
   *
   * It does NOT change the heading size — it used to, which is why the previous
   * doc comment ("subtle copy weight in downstream slots") described nothing that
   * existed. The default was also `'counsellor'` while CLAUDE.md documented
   * `'student'`; 33 call sites pass `'student'` explicitly, so that is now the default.
   */
  tone?: 'student' | 'counsellor';
}

// The shared vocabulary from lib/motion, not a private fourth one. This component
// used to run its own 6px travel over 180ms on a different easing curve — below the
// threshold where movement reads as motion at all, so the hero on every page
// flickered rather than arrived.
const containerVariants = stagger;
const fadeUp = childFade;
const statVariants = childFade;
const statsContainerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.08 } }
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
  tone = 'student'
}: PageHeroProps) => {
  const reduced = useReducedMotion();
  const initial = reduced ? false : 'hidden';
  // Only render the small eyebrow row when the caller actually provided
  // content — no default "Live focus" / "Today" pill noise on every page.
  const showEyebrowRow = Boolean(eyebrow || highlight);
  return (
    <motion.section
      className={cn(
        // No `!important` needed: Tailwind emits @layer utilities after
        // @layer components, so these utilities already outrank surface-card's own
        // `p-6 sm:p-7` at every breakpoint. (Verified against the compiled
        // stylesheet — the sm: variants land after surface-card's sm: block too.)
        // `surface-card--static` dropped: static is now the default.
        'surface-card text-foreground overflow-hidden p-5 sm:p-6',
        className
      )}
      variants={containerVariants}
      initial={initial}
      animate="show"
    >
      <div className="relative flex flex-col gap-2">
        {breadcrumbs ? (
          <motion.div variants={fadeUp}>
            {breadcrumbs}
          </motion.div>
        ) : null}

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <motion.div className="space-y-1.5" variants={containerVariants}>
            {showEyebrowRow ? (
              <motion.div
                className="flex flex-wrap items-baseline gap-1.5"
                variants={fadeUp}
              >
                {/* This is what `tone` is for. It used to shrink the page title by
                    2px, which is not a tone — it's just a smaller heading. The
                    documented intent is 'student' = warm, 'counsellor' =
                    operational, so it now picks the eyebrow's accent: the student
                    surface gets the brand ink, the staff surfaces stay neutral. */}
                {eyebrow ? (
                  <span className={tone === 'student' ? 'eyebrow-accent' : 'eyebrow'}>{eyebrow}</span>
                ) : null}
                {eyebrow && highlight ? <span className="text-label text-muted-foreground">·</span> : null}
                {highlight ? (
                  <span className="text-label font-semibold text-foreground">
                    {highlight}
                  </span>
                ) : null}
              </motion.div>
            ) : null}
            <motion.div variants={fadeUp}>
              {/* On the type scale, at the h2 step (22px -> 24px at md).
                  This was `text-[1.0625rem] md:text-[1.1875rem]` for students and
                  `text-[0.9375rem] md:text-[1.0625rem]` for staff — 15-19px, which
                  made the H1 of every page in the app SMALLER than its own card
                  titles (h3 is 18px). A page title has to outrank the content
                  under it. Both tones get the same size; a heading is not a tone. */}
              {/* text-balance so a long page title doesn't leave a one-word widow
                  on the second line. The landing hero does the same. */}
              <h1 className="text-balance text-[1.375rem] font-semibold leading-snug text-foreground md:text-2xl">
                {title}
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            </motion.div>
            {actions ? (
              <motion.div className="flex flex-wrap gap-2 pt-1" variants={fadeUp}>
                {actions}
              </motion.div>
            ) : null}
          </motion.div>
          {stats && stats.length > 0 ? (
            <div className="border-t border-border pt-3 md:border-l md:border-t-0 md:pl-5 md:pt-0 md:shrink-0">
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
                    // surface-stat + hover-lift, not a hand-rolled copy of both.
                    // surface-stat existed with a single consumer app-wide while this
                    // component inlined its own near-identical treatment.
                    className="surface-stat hover-lift min-w-0 !p-3"
                    variants={statVariants}
                  >
                    <p
                      className={cn(
                        'font-semibold leading-tight text-foreground',
                        isNumeric ? 'truncate text-base tabular-nums' : 'break-words text-sm'
                      )}
                      title={stat.value}
                    >
                      <AnimatedNumber value={stat.value} />
                    </p>
                    <p className="truncate text-label font-medium text-muted-foreground" title={stat.label}>
                      {stat.label}
                    </p>
                    {stat.detail ? (
                      <p className="truncate text-label text-muted-foreground" title={stat.detail}>
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
