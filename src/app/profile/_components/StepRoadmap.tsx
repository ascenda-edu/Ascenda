'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { StepCompletionMap } from '@/lib/profile/steps';

interface Step {
  key: string;
  title: string;
  description: string;
}

interface StepRoadmapProps {
  steps: readonly Step[];
  stepCompletion: StepCompletionMap;
  initialStep: number;
}

export const StepRoadmap = ({ steps, stepCompletion, initialStep }: StepRoadmapProps) => {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      {steps.map((step, idx) => {
        const isComplete = stepCompletion[step.key as keyof StepCompletionMap];
        const isCurrent = idx + 1 === initialStep;
        return (
          <div key={step.key} className="flex items-center gap-2 shrink-0">
            {idx > 0 && (
              <div className={cn('h-px w-6', stepCompletion[steps[idx - 1].key as keyof StepCompletionMap] ? 'bg-primary' : 'bg-border')} />
            )}
            <Link
              href={'/profile/wizard?step=' + step.key}
              className={cn(
                'flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-all hover:-translate-y-0.5',
                isCurrent
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : isComplete
                    ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-200/50'
                    : 'bg-muted/60 text-muted-foreground border border-border/50'
              )}
            >
              <span className={cn(
                'flex h-5 w-5 items-center justify-center rounded-full text-[0.625rem] font-bold',
                isCurrent
                  ? 'bg-primary-foreground/20 text-primary-foreground'
                  : isComplete
                    ? 'bg-emerald-500/20 text-emerald-600'
                    : 'bg-border text-muted-foreground'
              )}>
                {isComplete ? '\u2713' : idx + 1}
              </span>
              {step.title}
            </Link>
          </div>
        );
      })}
    </div>
  );
};
