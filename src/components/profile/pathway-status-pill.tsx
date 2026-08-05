import { Check, AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PathwayInsight } from '@/lib/profile/pathway-status';

// No `pillClass` any more: this is card geometry (`rounded-2xl px-4 py-3`, two
// lines of copy), not a chip, and a tone tint may not be a card surface. The
// surface is neutral in all three states; the tone survives on the glyph and on
// the one-line status label, which is where it is read anyway.
const TONE: Record<
  PathwayInsight['status'],
  { icon: typeof Check; iconClass: string; labelClass: string }
> = {
  open: {
    icon: Check,
    iconClass: 'text-success',
    labelClass: 'text-success'
  },
  limited: {
    icon: AlertTriangle,
    iconClass: 'text-warning',
    labelClass: 'text-warning'
  },
  closed: {
    icon: XCircle,
    iconClass: 'text-danger',
    labelClass: 'text-danger'
  }
};

export const PathwayStatusPill = ({ insight }: { insight: PathwayInsight }) => {
  const tone = TONE[insight.status];
  const Icon = tone.icon;

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3">
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
