'use client';

import { useId, useRef } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface SegmentedControlProps {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
}

export function SegmentedControl({ options, value, onChange, ariaLabel }: SegmentedControlProps) {
  const groupId = useId();
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const focusIndex = (index: number) => {
    const clamped = (index + options.length) % options.length;
    const opt = options[clamped];
    onChange(opt.value);
    btnRefs.current[clamped]?.focus();
  };

  const onKeyDown = (index: number) => (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      focusIndex(index + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      focusIndex(index - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusIndex(options.length - 1);
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex w-full items-stretch gap-1 rounded-full bg-muted/50 p-1"
    >
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              btnRefs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={onKeyDown(index)}
            className={cn(
              'relative flex min-h-[44px] flex-1 items-center justify-center rounded-full px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              active ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {/* The thumb is an ELEVATED NEUTRAL surface, not a brand fill.
                Two reasons it changed. A filter row can hold several of these at
                once, and a solid `--primary` each would put three or four
                level-5 fills in one viewport against a cap of one — selecting a
                filter value is not the loudest thing on a search page. And the
                label was `text-primary-foreground` on `bg-primary`, which is
                3.94:1 in dark.

                A raised neutral thumb on a recessed track is also the platform
                convention for a segmented control, so this reads as more
                familiar rather than less. The `layoutId` is untouched: the thumb
                still slides. */}
            {active ? (
              <motion.span
                layoutId={`${groupId}-active`}
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                className="absolute inset-0 rounded-full border border-border bg-card shadow-e-1"
                aria-hidden
              />
            ) : null}
            <span className="relative z-10 whitespace-nowrap">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
