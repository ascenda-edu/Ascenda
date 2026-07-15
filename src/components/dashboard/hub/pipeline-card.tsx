import Link from 'next/link';
import { ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { HubCard } from './hub-card';

export interface PipelineStage {
  key: string;
  label: string;
  count: number;
}

const STAGE_COLOR: Record<string, { bar: string; dot: string }> = {
  planning: { bar: 'bg-slate-400 dark:bg-slate-500', dot: 'bg-slate-400 dark:bg-slate-500' },
  in_progress: { bar: 'bg-sky-500', dot: 'bg-sky-500' },
  submitted: { bar: 'bg-emerald-500', dot: 'bg-emerald-500' },
  decision: { bar: 'bg-amber-500', dot: 'bg-amber-500' },
  enrolled: { bar: 'bg-primary', dot: 'bg-primary' }
};

/**
 * Application pipeline cell: proportional stage bar + per-stage counts,
 * everything linking into the applications board.
 */
export function PipelineCard({ stages }: { stages: PipelineStage[] }) {
  const total = stages.reduce((sum, stage) => sum + stage.count, 0);
  const active = stages.filter((stage) => stage.count > 0);

  return (
    <HubCard
      eyebrow="Pipeline"
      title="Applications"
      icon={ClipboardCheck}
      iconClassName="bg-sky-500/10 text-sky-600 ring-sky-500/15 dark:text-sky-300"
      action={total > 0 ? { label: 'Open board', href: '/applications' } : undefined}
    >
      {total === 0 ? (
        <div className="flex h-full flex-col items-start justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 p-5">
          <p className="text-sm font-semibold text-foreground">No applications tracked yet</p>
          <p className="text-xs text-muted-foreground">
            Track a programme and the board keeps deadlines, tasks and documents in one place.
          </p>
          <Button asChild size="sm">
            <Link href="/university-search/search">Find a programme</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted/50" aria-hidden>
            {active.map((stage) => (
              <div
                key={stage.key}
                className={cn('h-full rounded-full transition-all', STAGE_COLOR[stage.key]?.bar ?? 'bg-primary')}
                style={{ width: `${Math.max((stage.count / total) * 100, 6)}%` }}
              />
            ))}
          </div>
          <ul className="space-y-1">
            {stages.map((stage) => (
              <li key={stage.key}>
                <Link
                  href="/applications"
                  className={cn(
                    'group flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    stage.count === 0 && 'opacity-45'
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    <span className={cn('h-2 w-2 rounded-full', STAGE_COLOR[stage.key]?.dot ?? 'bg-primary')} aria-hidden />
                    <span className={cn('text-muted-foreground transition-colors', stage.count > 0 && 'font-medium text-foreground')}>
                      {stage.label}
                    </span>
                  </span>
                  <span className="tabular-nums text-sm font-semibold text-foreground">{stage.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </HubCard>
  );
}
