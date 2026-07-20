import { cn } from '@/lib/utils';
import type { CohortStats } from './types';

interface ApplicationFunnelProps {
  funnel: CohortStats['appFunnel'];
  totalStudents?: number;
  activeStage?: 'planning' | 'inProgress' | 'submitted' | 'decision' | null;
  onSelectStage?: (stage: 'planning' | 'inProgress' | 'submitted' | 'decision') => void;
  onNavigateStage?: (stage: 'planning' | 'inProgress' | 'submitted' | 'decision') => void;
}

const STAGES = [
  { key: 'planning' as const, label: 'Planning', color: 'bg-muted', text: 'text-muted-foreground', border: 'border-border', active: 'ring-2 ring-primary ring-offset-2' },
  { key: 'inProgress' as const, label: 'In Progress', color: 'bg-sky-500/20', text: 'text-sky-700 dark:text-sky-400', border: 'border-sky-200/60 dark:border-sky-500/30', active: 'ring-2 ring-sky-500 ring-offset-2' },
  { key: 'submitted' as const, label: 'Submitted', color: 'bg-violet-500/15', text: 'text-violet-700 dark:text-violet-400', border: 'border-violet-200/60 dark:border-violet-500/30', active: 'ring-2 ring-violet-500 ring-offset-2' },
  { key: 'decision' as const, label: 'Decision', color: 'bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200/60 dark:border-emerald-500/30', active: 'ring-2 ring-emerald-500 ring-offset-2' }
];

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
              "relative space-y-1 transition-all",
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
                    className="relative z-10 text-[0.625rem] text-primary hover:underline underline-offset-2 font-medium"
                  >
                    View →
                  </button>
                )}
              </div>
            </div>
            <div className={cn(
              "h-7 overflow-hidden rounded-xl border border-border/50 bg-muted/40 transition-all",
              isSelected && active
            )}>
              <div
                className={`flex h-full items-center rounded-xl border px-3 text-xs font-semibold transition-all duration-700 ${color} ${border} ${text}`}
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
