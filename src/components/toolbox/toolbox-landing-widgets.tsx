'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export function ToolboxProgressRing({ value }: { value: number }) {
  const circumference = 2 * Math.PI * 28;
  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64" role="img" aria-label={`${value}% progress`}>
        <title>{value}% progress</title>
        <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="4" className="text-muted/20" />
        <motion.circle
          cx="32" cy="32" r="28" fill="none" strokeWidth="4" strokeLinecap="round"
          className={cn(value >= 80 ? 'stroke-success' : value >= 50 ? 'stroke-warning' : 'stroke-danger')}
          initial={{ strokeDasharray: `0 ${circumference}` }}
          animate={{ strokeDasharray: `${(value / 100) * circumference} ${circumference}` }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.span
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={cn('text-sm font-bold tabular-nums', value >= 80 ? 'text-success' : value >= 50 ? 'text-warning' : 'text-danger')}
        >
          {value}%
        </motion.span>
      </div>
    </div>
  );
}

export function ToolboxCountdown({ days }: { days: number }) {
  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={cn(
        'flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl border',
        days <= 3 ? 'bg-danger-subtle border-danger/25' : days <= 7 ? 'bg-warning-subtle border-warning/25' : 'bg-primary/10 border-primary/20'
      )}
    >
      <span className={cn(
        'text-lg font-bold leading-none tabular-nums',
        days <= 3 ? 'text-danger' : days <= 7 ? 'text-warning' : 'text-primary-ink'
      )}>
        {days}
      </span>
      <span className="text-label font-semibold text-muted-foreground mt-0.5">
        {days === 1 ? 'day' : 'days'}
      </span>
    </motion.div>
  );
}
