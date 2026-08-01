'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { fadeUp, stagger as staggerVariant, childFade } from '@/lib/motion';

// These render the same motion.div for every user — branching to a plain <div>
// on useReducedMotion() caused SSR hydration mismatches (the hook is false on
// the server). MotionConfig reducedMotion="user" (providers.tsx) already snaps
// the transforms for reduced-motion users.

interface AnimatedSectionProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  /**
   * Element to render. Defaults to `div`, but pass `'section'` when this wrapper is
   * replacing a semantic `<section>` — otherwise adding the reveal silently downgrades
   * a landmark to a plain div, which costs screen-reader users the page's structure.
   */
  as?: 'div' | 'section' | 'article' | 'aside';
}

export function AnimatedSection({ children, className, delay = 0, as = 'div' }: AnimatedSectionProps) {
  const showTarget = typeof fadeUp.show === 'object' ? fadeUp.show as Record<string, unknown> : {};
  const showTransition = (showTarget.transition ?? {}) as Record<string, unknown>;
  const Motion = motion[as];

  return (
    <Motion
      className={cn(className)}
      variants={{
        hidden: fadeUp.hidden,
        show: { ...showTarget, transition: { ...showTransition, delay } },
      }}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-40px' }}
    >
      {children}
    </Motion>
  );
}

export function AnimatedGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={cn(className)}
      variants={staggerVariant}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-40px' }}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedGridItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={cn(className)} variants={childFade}>
      {children}
    </motion.div>
  );
}
