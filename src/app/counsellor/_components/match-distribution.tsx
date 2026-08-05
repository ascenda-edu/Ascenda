import { cn } from '@/lib/utils';
import { TIER_VISUAL } from '@/lib/theme/categories';
import type { CohortStats } from './types';

interface MatchDistributionProps {
  tiers: CohortStats['matchTiers'];
  activeTier?: 'reach' | 'match' | 'safe' | null;
  onSelectTier?: (tier: 'reach' | 'match' | 'safe') => void;
  onNavigateTier?: (tier: 'reach' | 'match' | 'safe') => void;
}

// Reach / Match / Safe styling is TIER_VISUAL's — same tones as the tier pills on
// student cards and the student-detail match summary.
const TIERS = [
  { key: 'reach' as const, label: 'Reach', color: TIER_VISUAL.reach.bar, text: TIER_VISUAL.reach.text, light: TIER_VISUAL.reach.bg },
  { key: 'match' as const, label: 'Match', color: TIER_VISUAL.match.bar, text: TIER_VISUAL.match.text, light: TIER_VISUAL.match.bg },
  { key: 'safe' as const, label: 'Safe', color: TIER_VISUAL.safety.bar, text: TIER_VISUAL.safety.text, light: TIER_VISUAL.safety.bg }
];

export const MatchDistribution = ({ tiers, activeTier, onSelectTier, onNavigateTier }: MatchDistributionProps) => {
  const total = tiers.reach + tiers.match + tiers.safe || 1;

  return (
    <div className="space-y-4">
      {/* Stacked bar */}
      <div className="flex h-8 overflow-hidden rounded-2xl border border-border">
        {TIERS.map(({ key, color }) => {
          const pct = (tiers[key] / total) * 100;
          const isSelected = activeTier === key;
          const isAnythingSelected = activeTier !== null && activeTier !== undefined;

          return pct > 0 ? (
            <button
              key={key}
              type="button"
              disabled={!onSelectTier}
              aria-pressed={isSelected}
              aria-label={`${TIERS.find(t => t.key === key)?.label}: ${tiers[key]} students${onSelectTier ? ' — filter by this tier' : ''}`}
              className={cn(
                color,
                "transition-[width,opacity,filter] duration-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                onSelectTier && "cursor-pointer",
                isAnythingSelected && !isSelected && "opacity-20 grayscale-[0.8]"
              )}
              style={{ width: `${pct}%` }}
              title={`${TIERS.find(t => t.key === key)?.label}: ${tiers[key]}`}
              onClick={() => onSelectTier?.(key)}
            />
          ) : null;
        })}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-3 gap-3">
        {TIERS.map(({ key, label, text, light }) => {
          const pct = Math.round((tiers[key] / total) * 100);
          const isSelected = activeTier === key;
          const isAnythingSelected = activeTier !== null && activeTier !== undefined;

          return (
            <div
              key={key}
              className={cn(
                "relative rounded-2xl border transition-[transform,background-color,border-color,box-shadow,opacity,filter]",
                onSelectTier && "hover:scale-[1.02]",
                isSelected ? "border-primary bg-primary/10 shadow-e-1" : "border-border",
                light,
                isAnythingSelected && !isSelected && "opacity-40 grayscale-[0.5]"
              )}
            >
              {/* Stretched filter button — keyboard-accessible sibling of the
                  View link, so no interactive element nests inside another. */}
              {onSelectTier && (
                <button
                  type="button"
                  onClick={() => onSelectTier(key)}
                  aria-pressed={isSelected}
                  aria-label={`Filter students by ${label} tier`}
                  className="absolute inset-0 cursor-pointer rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              )}
              <div className="px-4 py-3 text-center">
                <p className={`text-xl font-bold tabular-nums ${text}`}>{tiers[key]}</p>
                <p className="text-xs font-semibold text-muted-foreground">{label}</p>
                <p className="text-label text-muted-foreground">{pct}%</p>
                {onNavigateTier && tiers[key] > 0 && (
                  <button
                    type="button"
                    onClick={() => onNavigateTier(key)}
                    aria-label={`View ${label} tier students`}
                    className="relative z-raised mt-1 text-label text-primary-ink hover:underline underline-offset-2 font-medium"
                  >
                    View →
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground">{total} students with matches</p>
    </div>
  );
};
