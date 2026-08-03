import { cn } from '@/lib/utils';
import { APPLICATION_STATUS_VISUAL } from '@/lib/theme/categories';
import {
  FUNNEL_STAGES,
  FUNNEL_STAGE_TO_STATUS,
  STAGE_LABEL,
  type FunnelStage
} from '@/lib/counsellor/stage-colors';
import type { CohortStats } from './types';

interface ApplicationFunnelProps {
  funnel: CohortStats['appFunnel'];
  totalStudents?: number;
  activeStage?: FunnelStage | null;
  onSelectStage?: (stage: FunnelStage) => void;
  onNavigateStage?: (stage: FunnelStage) => void;
}

// Stage colours are APPLICATION_STATUS_VISUAL's, so this funnel can no longer drift
// from the kanban board and the analytics stage chart (they disagreed on all four
// stages before — see lib/counsellor/stage-colors.ts). The selected ring is
// `primary` for every stage: it means "you picked this", not "this stage is blue".
//
// The stage list is now DERIVED from FUNNEL_STAGE_TO_STATUS rather than hand-written,
// so a new application status shows up here automatically. Hand-writing it is how
// `enrolled` ended up absent from the funnel entirely.
const stage = (key: FunnelStage) => {
  const v = APPLICATION_STATUS_VISUAL[FUNNEL_STAGE_TO_STATUS[key]];
  return {
    key,
    label: STAGE_LABEL[FUNNEL_STAGE_TO_STATUS[key]],
    color: v.bg,
    text: v.text,
    border: v.border,
    active: 'ring-2 ring-primary ring-offset-2'
  };
};

const STAGES = FUNNEL_STAGES.map(stage);

export const ApplicationFunnel = ({ funnel, totalStudents, activeStage, onSelectStage, onNavigateStage }: ApplicationFunnelProps) => {
  const denominator = totalStudents ?? (Object.values(funnel).reduce((a, b) => a + b, 0) || 1);
  const maxVal = Math.max(...Object.values(funnel), 1);

  return (
    <div className="space-y-3">
      {STAGES.map(({ key, label, color, text, border, active }) => {
        const count = funnel[key];
        const pct = Math.round((count / denominator) * 100);
        const barWidth = Math.round((count / maxVal) * 100);
        const isSelected = activeStage === key;

        return (
          <div
            key={key}
            className={cn(
              "relative space-y-1 transition-[transform,opacity,filter]",
              onSelectStage && "hover:opacity-80",
              isSelected ? "scale-[1.02]" : "opacity-60 grayscale-[0.5]"
            )}
          >
            {/* Stretched filter button — keyboard-accessible sibling of the
                View link, so no interactive element nests inside another. */}
            {onSelectStage && (
              <button
                type="button"
                onClick={() => onSelectStage(key)}
                aria-pressed={isSelected}
                aria-label={`Filter students by ${label} stage`}
                className="absolute inset-0 cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            )}
            <div className="flex items-center justify-between text-xs">
              <span className={cn("font-medium", isSelected ? "text-foreground font-bold" : "text-muted-foreground")}>{label}</span>
              <div className="flex items-center gap-2">
                <span className={`font-bold ${text}`}>{count} <span className="font-normal text-muted-foreground">({pct}%)</span></span>
                {onNavigateStage && count > 0 && (
                  <button
                    type="button"
                    onClick={() => onNavigateStage(key)}
                    aria-label={`View ${label} stage students`}
                    className="relative z-raised text-label text-primary-ink hover:underline underline-offset-2 font-medium"
                  >
                    View →
                  </button>
                )}
              </div>
            </div>
            <div className={cn(
              "h-7 overflow-hidden rounded-xl border border-border/50 bg-muted/40 transition-shadow",
              isSelected && active
            )}>
              <div
                className={`flex h-full items-center rounded-xl border px-3 text-xs font-semibold transition-[width] duration-700 ${color} ${border} ${text}`}
                style={{ width: `${Math.max(barWidth, count > 0 ? 8 : 0)}%` }}
              >
                {count > 0 && count}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
