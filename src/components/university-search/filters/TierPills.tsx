'use client';

import type { MatchTier } from '@/lib/matching/match-tier';
import { cn } from '@/lib/utils';

interface TierPillsProps {
  selected: MatchTier[];
  onToggle: (t: MatchTier) => void;
}

const TIERS: MatchTier[] = ['Reach', 'Match', 'Safe'];

export function TierPills({ selected, onToggle }: TierPillsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {TIERS.map((tier) => {
        const isSelected = selected.includes(tier);
        return (
          <button
            key={tier}
            type="button"
            onClick={() => onToggle(tier)}
            role="switch"
            aria-checked={isSelected}
            aria-label={`${tier} tier filter ${isSelected ? 'on' : 'off'}`}
            className={cn(
              'flex h-11 min-h-[44px] items-center rounded-full border px-4 text-sm font-medium transition-[transform,box-shadow,border-color,color,background-color] duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              isSelected
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {tier}
          </button>
        );
      })}
    </div>
  );
}
