'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, UserCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { HubCard } from './hub-card';

export interface ProfileStepStatus {
  key: string;
  title: string;
  done: boolean;
}

interface ProfileProgressCardProps {
  percent: number;
  steps: ProfileStepStatus[];
  nextStepTitle: string | null;
}

const RADIUS = 34;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Profile completion cell: animated ring + per-section checklist. A complete
 * profile flips to a calm "all set" state instead of nagging.
 */
export function ProfileProgressCard({ percent, steps, nextStepTitle }: ProfileProgressCardProps) {
  const reduced = useReducedMotion();
  const complete = percent >= 100;
  const dashTarget = CIRCUMFERENCE * (1 - Math.min(percent, 100) / 100);

  return (
    <HubCard
      eyebrow="Profile"
      title={complete ? 'Profile complete' : 'Finish your profile'}
      icon={UserCircle}
      iconClassName={
        complete ? 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/15 dark:text-emerald-300' : undefined
      }
    >
      <div className="flex h-full flex-col gap-4">
        <div className="flex items-center gap-4">
          <div className="relative h-20 w-20 shrink-0" role="img" aria-label={`Profile ${percent}% complete`}>
            <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
              <circle cx="40" cy="40" r={RADIUS} fill="none" strokeWidth="7" className="stroke-muted/60" />
              <motion.circle
                cx="40"
                cy="40"
                r={RADIUS}
                fill="none"
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                className={complete ? 'stroke-emerald-500' : 'stroke-primary'}
                initial={{ strokeDashoffset: reduced ? dashTarget : CIRCUMFERENCE }}
                whileInView={{ strokeDashoffset: dashTarget }}
                viewport={{ once: true }}
                transition={{ duration: 1, ease: [0.25, 0.46, 0.45, 0.94] }}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-lg font-semibold tabular-nums text-foreground">
              {percent}%
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {complete
              ? 'Everything is in place — matches and requirements are running on your full profile.'
              : nextStepTitle
                ? `${nextStepTitle} is the next section — richer details mean sharper matches.`
                : 'A few details left to unlock sharper matches.'}
          </p>
        </div>

        <ul className="space-y-1.5">
          {steps.map((step) => (
            <li key={step.key} className="flex items-center gap-2.5 text-sm">
              <span
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                  step.done
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                    : 'border-border bg-muted/40 text-transparent'
                )}
                aria-hidden
              >
                <Check className="h-3 w-3" />
              </span>
              <span className={cn(step.done ? 'text-muted-foreground line-through decoration-border' : 'font-medium text-foreground')}>
                {step.title}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-auto pt-1">
          <Button asChild size="sm" variant={complete ? 'outline' : 'default'} className="w-full">
            <Link href={complete ? '/profile' : '/profile/wizard'}>
              {complete ? 'Review profile' : 'Continue setup'}
            </Link>
          </Button>
        </div>
      </div>
    </HubCard>
  );
}
