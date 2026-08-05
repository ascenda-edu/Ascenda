'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';

interface ShowMoreToggleProps {
  expanded: boolean;
  onToggle: () => void;
  /** Full item count shown in the collapsed label ("Show all 12 alerts"). */
  total: number;
  /** Plural noun for the collapsed label, e.g. "alerts", "requests". */
  noun: string;
}

/** Full-width pill that expands/collapses a truncated list. */
export function ShowMoreToggle({ expanded, onToggle, total, noun }: ShowMoreToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="flex w-full items-center justify-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary-ink transition-colors hover:border-primary/60"
    >
      {expanded ? (
        <>
          Show fewer
          <ChevronUp className="h-3.5 w-3.5" aria-hidden />
        </>
      ) : (
        <>
          Show all {total} {noun}
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        </>
      )}
    </button>
  );
}
