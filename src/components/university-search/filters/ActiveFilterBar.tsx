'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { FilterPill } from '@/components/university-search/filter-pill';

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
            animate={{ opacity: 1, scale: 1, transition: { duration: 0.25, ease: [0.34, 1.56, 0.64, 1] } }}
            exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.12, ease: [0.25, 0.46, 0.45, 0.94] } }}
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
