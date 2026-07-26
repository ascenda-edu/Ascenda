'use client';

import { useId } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (c: boolean) => void;
  label: string;
  description?: string;
}

export function ToggleSwitch({ checked, onChange, label, description }: ToggleSwitchProps) {
  const labelId = useId();
  const descId = useId();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelId}
      aria-describedby={description ? descId : undefined}
      onClick={() => onChange(!checked)}
      className="flex min-h-[44px] w-full items-center justify-between gap-4 rounded-xl py-1.5 text-left transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:rounded-lg"
    >
      <span className="min-w-0">
        <span id={labelId} className="block text-sm font-medium text-foreground">
          {label}
        </span>
        {description ? (
          <span id={descId} className="mt-0.5 block text-xs text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
      <span
        aria-hidden
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200',
          checked ? 'bg-primary' : 'bg-muted-foreground/30'
        )}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 500, damping: 34 }}
          className={cn(
            'block h-5 w-5 rounded-full bg-background shadow-e-1',
            checked ? 'ml-auto' : 'ml-0'
          )}
        />
      </span>
    </button>
  );
}
