import type { CohortStats } from './types';

interface CohortBreakdownProps {
  programmeBreakdown: CohortStats['programmeBreakdown'];
  fieldDistribution: { key: string; label: string; count: number }[];
  onNavigateProgramme?: (programme: 'IB' | 'A_LEVEL') => void;
  onNavigateField?: (field: string) => void;
}

export const CohortBreakdown = ({ programmeBreakdown, fieldDistribution, onNavigateProgramme, onNavigateField }: CohortBreakdownProps) => {
  const total = programmeBreakdown.ib + programmeBreakdown.aLevel || 1;
  const ibPct = Math.round((programmeBreakdown.ib / total) * 100);
  const aLevelPct = 100 - ibPct;
  const maxField = Math.max(...fieldDistribution.map((f) => f.count), 1);

  return (
    <div className="space-y-5">
      {/* Programme type */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Programme Type</p>
        <div className="flex h-6 overflow-hidden rounded-xl border border-border/50">
          <button
            className="flex h-full items-center justify-center bg-violet-500/70 text-[11px] font-bold text-white transition-all duration-700 hover:bg-violet-500/90 hover:brightness-110"
            style={{ width: `${ibPct}%` }}
            onClick={() => onNavigateProgramme?.('IB')}
            title={`View IB students (${programmeBreakdown.ib})`}
          >
            {ibPct > 10 ? `IB ${ibPct}%` : ''}
          </button>
          <button
            className="flex h-full items-center justify-center bg-sky-500/70 text-[11px] font-bold text-white transition-all duration-700 hover:bg-sky-500/90 hover:brightness-110"
            style={{ width: `${aLevelPct}%` }}
            onClick={() => onNavigateProgramme?.('A_LEVEL')}
            title={`View A-Level students (${programmeBreakdown.aLevel})`}
          >
            {aLevelPct > 10 ? `A-Level ${aLevelPct}%` : ''}
          </button>
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <button
            onClick={() => onNavigateProgramme?.('IB')}
            className="flex items-center gap-1.5 hover:text-foreground transition"
          >
            <span className="h-2.5 w-2.5 rounded-sm bg-violet-500/70" />
            IB — {programmeBreakdown.ib} students
          </button>
          <button
            onClick={() => onNavigateProgramme?.('A_LEVEL')}
            className="flex items-center gap-1.5 hover:text-foreground transition"
          >
            <span className="h-2.5 w-2.5 rounded-sm bg-sky-500/70" />
            A-Level — {programmeBreakdown.aLevel} students
          </button>
        </div>
      </div>

      {/* Field distribution */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Fields of Interest</p>
        <div className="space-y-1.5">
          {fieldDistribution.slice(0, 6).map(({ key, label, count }) => (
            <button
              key={label}
              onClick={() => onNavigateField?.(key)}
              className="flex w-full items-center gap-2 rounded-lg hover:bg-muted/40 transition px-1 py-0.5 group"
              title={`View ${label} students`}
            >
              <div className="h-5 flex-1 overflow-hidden rounded-lg bg-muted/50">
                <div
                  className="h-full rounded-lg bg-primary/60 transition-all duration-700 group-hover:bg-primary/80 group-focus-within:bg-primary/80"
                  style={{ width: `${(count / maxField) * 100}%` }}
                />
              </div>
              <div className="flex w-44 items-center justify-between">
                <span className="text-xs text-muted-foreground group-hover:text-foreground group-focus-within:text-foreground transition">{label}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-foreground">{count}</span>
                  <span className="text-[10px] text-primary opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition font-medium">View →</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
