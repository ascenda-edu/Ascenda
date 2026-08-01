'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { FilterPill } from '@/components/university-search/filter-pill';
import { DURATION, EASE, EASE_POP } from '@/lib/motion';

interface ActiveFilterBarProps {
  chips: { key: string; label: string; onRemove: () => void }[];
  onClearAll: () => void;
}

export function ActiveFilterBar({ chips, onClearAll }: ActiveFilterBarProps) {
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <AnimatePresence mode="popLayout" initial={false}>
        {chips.map((chip) => (
          <motion.div
            key={chip.key}
            layout
            initial={{ opacity: 0, scale: 0.8 }}
            // A chip pops in with overshoot — it reads as "filter added", not "filter
            // appeared". Removal is plain: EASE_POP on the way out would bulge first.
            animate={{ opacity: 1, scale: 1, transition: { duration: DURATION.fast, ease: EASE_POP } }}
            exit={{ opacity: 0, scale: 0.8, transition: { duration: DURATION.exit, ease: EASE } }}
          >
            <FilterPill label={chip.label} onRemove={chip.onRemove} />
          </motion.div>
        ))}
      </AnimatePresence>

      <button
        type="button"
        onClick={onClearAll}
        className="inline-flex min-h-[44px] items-center rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors cursor-pointer hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        Clear all
      </button>
    </div>
  );
}
