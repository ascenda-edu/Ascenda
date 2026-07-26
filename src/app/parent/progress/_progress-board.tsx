'use client';

import { motion } from 'framer-motion';
import { ClipboardCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';
import {
  APPLICATION_STATUS_VISUAL,
  TIER_VISUAL,
  type CategoryVisual,
  type FitTier,
} from '@/lib/theme/categories';
import type { ChildApplication } from '@/lib/parent/types';

// Read-only mirror of the student applications board — same tier/status tone
// families as components/applications/application-list.tsx, minus every
// action affordance.
//
// Tone comes from lib/theme/categories (TIER_VISUAL / APPLICATION_STATUS_VISUAL),
// the single source of truth; only the label→key mappings live here, because the
// parent payload spells the safety tier 'Safe' and adds an 'enrolled' status.
const TIER_KEY: Record<string, FitTier> = {
  Reach: 'reach',
  Match: 'match',
  Safe: 'safety',
};

const tierChip = (label: string): string | undefined => {
  const key = TIER_KEY[label];
  return key ? TIER_VISUAL[key].chip : undefined;
};

const STATUS_LABELS: Record<ChildApplication['status'], string> = {
  planning: 'Planning',
  in_progress: 'In progress',
  submitted: 'Submitted',
  decision: 'Awaiting decision',
  enrolled: 'Enrolled',
};

const STATUS_VISUAL: Record<ChildApplication['status'], CategoryVisual> = {
  ...APPLICATION_STATUS_VISUAL,
  // No 'enrolled' tone exists app-wide; it reads as a settled/positive state, the
  // same as submitted.
  enrolled: APPLICATION_STATUS_VISUAL.submitted,
};

// Sort working applications first, settled ones last (student board order).
const STATUS_ORDER: Record<ChildApplication['status'], number> = {
  in_progress: 0,
  planning: 1,
  decision: 2,
  submitted: 3,
  enrolled: 4,
};

export function ProgressBoard({
  applications,
  childFirstName,
}: {
  applications: ChildApplication[];
  childFirstName: string;
}) {
  if (applications.length === 0) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="No applications tracked yet"
        description={`When ${childFirstName} starts tracking applications, each one will appear here with its stage and remaining work.`}
      />
    );
  }

  const rows = [...applications].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

  return (
    <ul className="space-y-3">
      {rows.map((app, index) => {
        const progress =
          app.tasksTotal > 0 ? Math.round(((app.tasksTotal - app.tasksOpen) / app.tasksTotal) * 100) : 0;
        return (
          <motion.li
            key={app.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: index * 0.03 }}
            className="rounded-2xl border border-border bg-card/60 p-4 sm:p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-foreground">{app.university}</p>
                  {app.tier ? <span className={tierChip(app.tier)}>{app.tier}</span> : null}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {app.program} · {app.country}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {app.daysUntilDeadline !== null ? (
                  <span
                    className={cn(
                      'text-xs font-medium',
                      app.daysUntilDeadline < 0
                        ? 'text-danger'
                        : app.daysUntilDeadline <= 7
                          ? 'text-warning'
                          : 'text-muted-foreground'
                    )}
                  >
                    {app.daysUntilDeadline < 0
                      ? 'Deadline passed'
                      : app.daysUntilDeadline === 0
                        ? 'Deadline today'
                        : `${app.daysUntilDeadline}d to deadline`}
                  </span>
                ) : null}
                <span className={STATUS_VISUAL[app.status].chip}>{STATUS_LABELS[app.status]}</span>
              </div>
            </div>

            {app.tasksTotal > 0 ? (
              <div className="mt-3 flex items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/60">
                  <div
                    className={cn(
                      'h-full rounded-full transition-[width]',
                      progress >= 75 ? 'bg-success-fill' : progress >= 40 ? 'bg-info-fill' : 'bg-warning-fill'
                    )}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="shrink-0 text-label text-muted-foreground">
                  {app.tasksTotal - app.tasksOpen}/{app.tasksTotal} tasks done
                </span>
              </div>
            ) : null}
          </motion.li>
        );
      })}
    </ul>
  );
}
