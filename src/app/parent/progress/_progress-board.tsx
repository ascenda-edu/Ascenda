'use client';

import { motion } from 'framer-motion';
import { ClipboardCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';
import type { ChildApplication } from '@/lib/parent/types';

// Read-only mirror of the student applications board — same tier/status tone
// families as components/applications/application-list.tsx, minus every
// action affordance.

const TIER_STYLES: Record<string, string> = {
  Reach: 'bg-rose-500/10 text-rose-600 dark:text-rose-300',
  Match: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  Safe: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
};

const STATUS_LABELS: Record<ChildApplication['status'], string> = {
  planning: 'Planning',
  in_progress: 'In progress',
  submitted: 'Submitted',
  decision: 'Awaiting decision',
  enrolled: 'Enrolled',
};

const STATUS_STYLES: Record<ChildApplication['status'], string> = {
  planning: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  in_progress: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  submitted: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  decision: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
  enrolled: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
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
                  {app.tier ? (
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', TIER_STYLES[app.tier])}>
                      {app.tier}
                    </span>
                  ) : null}
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
                        ? 'text-rose-600 dark:text-rose-300'
                        : app.daysUntilDeadline <= 7
                          ? 'text-amber-700 dark:text-amber-300'
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
                <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold', STATUS_STYLES[app.status])}>
                  {STATUS_LABELS[app.status]}
                </span>
              </div>
            </div>

            {app.tasksTotal > 0 ? (
              <div className="mt-3 flex items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/60">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      progress >= 75 ? 'bg-emerald-500/80' : progress >= 40 ? 'bg-sky-500/80' : 'bg-amber-500/70'
                    )}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground">
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
