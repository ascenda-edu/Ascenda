import { Check, AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PathwayInsight } from '@/lib/profile/pathway-status';

const TONE: Record<
  PathwayInsight['status'],
  { icon: typeof Check; pillClass: string; iconClass: string; labelClass: string }
> = {
  open: {
    icon: Check,
    pillClass: 'border-success/25 bg-success-subtle',
    iconClass: 'text-success',
    labelClass: 'text-success'
  },
  limited: {
    icon: AlertTriangle,
    pillClass: 'border-warning/25 bg-warning-subtle',
    iconClass: 'text-warning',
    labelClass: 'text-warning'
  },
  closed: {
    icon: XCircle,
    pillClass: 'border-danger/25 bg-danger-subtle',
    iconClass: 'text-danger',
    labelClass: 'text-danger'
  }
};

export const PathwayStatusPill = ({ insight }: { insight: PathwayInsight }) => {
  const tone = TONE[insight.status];
  const Icon = tone.icon;

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-2xl border px-4 py-3',
        tone.pillClass
      )}
    >
      <div className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center', tone.iconClass)}>
        <Icon className="h-4 w-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-semibold', tone.labelClass)}>{insight.label}</p>
        <p className="text-xs text-muted-foreground">{insight.message}</p>
      </div>
    </div>
  );
};
