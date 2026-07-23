'use client';

import { useId, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FacetGroupProps {
  title: string;
  icon?: LucideIcon;
  activeCount?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function FacetGroup({ title, icon: Icon, activeCount = 0, defaultOpen = true, children }: FacetGroupProps) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex min-h-[44px] w-full items-center justify-between gap-3 py-4 text-left transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:rounded-lg"
      >
        <span className="flex items-center gap-2.5">
          {Icon ? <Icon className="h-4 w-4 text-muted-foreground" aria-hidden /> : null}
          <span className="font-heading text-sm font-semibold text-foreground">{title}</span>
          {activeCount > 0 ? (
            <span className="surface-chip !px-2 !py-0.5 !text-[0.6875rem] font-semibold text-primary">{activeCount}</span>
          ) : null}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={bodyId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            <div className="pb-4">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
