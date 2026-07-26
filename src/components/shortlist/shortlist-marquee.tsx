'use client';

import { GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ShortlistMarqueeProps {
  className?: string;
  label?: string;
  tone?: 'light' | 'dark';
}

const marqueeItems = ['Course breakdown', 'Shortlist sync', 'Module clarity', 'Next steps'];

export const ShortlistMarquee = ({ className, label = 'Shortlist flow', tone = 'dark' }: ShortlistMarqueeProps) => {
  const isLight = tone === 'light';
  const containerClasses = isLight
    ? 'border-border bg-card text-foreground'
    : 'border-border bg-card/70 text-foreground';
  const labelClasses = 'text-muted-foreground';
  const textClasses = 'text-foreground';

  return (
    <div
      className={cn(
        'relative w-full max-w-full overflow-hidden rounded-full px-6 py-3 backdrop-blur',
        containerClasses,
        className
      )}
    >
      <div className={cn('eyebrow mb-1', labelClasses)}>{label}</div>
      <div className="flex flex-wrap items-center justify-center gap-4 text-lg font-semibold uppercase tracking-[0.3em] sm:justify-between">
        {marqueeItems.map((text) => (
          <span key={text} className={cn('flex items-center gap-2', textClasses)}>
            {text}
            <GraduationCap className={cn('h-5 w-5 text-warning')} aria-hidden />
          </span>
        ))}
      </div>
    </div>
  );
};
