'use client';

import type { ReactNode } from 'react';

interface FilterRailProps {
  children: ReactNode;
  onClearAll: () => void;
  activeFilterCount: number;
}

export function FilterRail({ children, onClearAll, activeFilterCount }: FilterRailProps) {
  // top offset clears the fixed navbar, which grows at `sm` (60px logo) — so the
  // sticky offset bumps at `sm` too, not `md`. max-h keeps the rail self-scrolling.
  return (
    <aside className="surface-card sticky top-20 sm:top-24 max-h-[calc(100vh-7.5rem)] overflow-y-auto !p-0">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 dark:border-white/10">
        <h2 className="font-heading text-base font-semibold text-foreground">Filters</h2>
        {activeFilterCount > 0 ? (
          <button
            type="button"
            onClick={onClearAll}
            className="rounded-full px-2 py-1 text-sm font-medium text-primary-ink transition-colors cursor-pointer hover:text-primary-ink/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Clear all
          </button>
        ) : null}
      </div>
      <div className="px-5 py-1">{children}</div>
    </aside>
  );
}
