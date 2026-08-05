'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PROGRESS_FILL, TIER_VISUAL } from '@/lib/theme/categories';
import { HelpRequestModal, type HelpRequestModalApp } from './help-request-modal';

export interface ApplicationRow {
  id: string;
  university: string;
  program: string;
  status: 'planning' | 'in_progress' | 'submitted' | 'decision' | 'enrolled' | string;
  tier?: 'Reach' | 'Match' | 'Safe' | null;
  daysUntilDeadline: number | null;
  tasksOpen: number;
  tasksTotal: number;
}

interface Props {
  rows: ApplicationRow[];
}

const STATUS_LABEL: Record<string, string> = {
  planning: 'Planning',
  in_progress: 'In progress',
  submitted: 'Submitted',
  decision: 'Decision',
  enrolled: 'Enrolled'
};

// Order: in_progress + planning at top, submitted/decision/enrolled at bottom.
const STATUS_ORDER: Record<string, number> = {
  in_progress: 0,
  planning: 1,
  decision: 2,
  submitted: 3,
  enrolled: 4
};

// Built from TIER_VISUAL (lib/theme/categories) rather than re-deriving status
// colours by hand. The bundles are used piecewise instead of `.chip` because
// this badge keeps its own smaller, uppercase geometry.
const TIER_TONE: Record<string, string> = {
  Reach: cn(TIER_VISUAL.reach.border, TIER_VISUAL.reach.bg, TIER_VISUAL.reach.text),
  Match: cn(TIER_VISUAL.match.border, TIER_VISUAL.match.bg, TIER_VISUAL.match.text),
  Safe: cn(TIER_VISUAL.safety.border, TIER_VISUAL.safety.bg, TIER_VISUAL.safety.text)
};

const formatDeadline = (days: number | null): string => {
  if (days === null) return 'No deadline yet';
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days <= 30) return `${days} days to deadline`;
  return `${Math.round(days / 7)}w to deadline`;
};

export function ApplicationList({ rows }: Props) {
  const [helpApp, setHelpApp] = useState<HelpRequestModalApp | null>(null);

  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const sa = STATUS_ORDER[a.status] ?? 99;
        const sb = STATUS_ORDER[b.status] ?? 99;
        if (sa !== sb) return sa - sb;
        // Within the same status bucket, sort by urgency.
        const da = a.daysUntilDeadline ?? Number.POSITIVE_INFINITY;
        const db = b.daysUntilDeadline ?? Number.POSITIVE_INFINITY;
        return da - db;
      }),
    [rows]
  );

  if (sorted.length === 0) {
    return null;
  }

  return (
    <>
      <ul className="space-y-2">
        {sorted.map((row, index) => {
          const isClosed = row.status === 'submitted' || row.status === 'decision' || row.status === 'enrolled';
          const progress = row.tasksTotal > 0
            ? Math.round(((row.tasksTotal - row.tasksOpen) / row.tasksTotal) * 100)
            : isClosed
              ? 100
              : 0;
          const statusLabel = STATUS_LABEL[row.status] ?? row.status;

          return (
            <motion.li
              key={row.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: index * 0.03 }}
              className={cn(
                'rounded-2xl border bg-card px-4 py-3 transition',
                isClosed ? 'border-border opacity-80' : 'hover-lift border-border hover:border-primary/30'
              )}
            >
              <div className="flex items-center gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-foreground" title={row.university}>
                      {row.university}
                    </p>
                    {row.tier ? (
                      <span
                        className={cn(
                          'shrink-0 rounded-full border px-2 py-0.5 text-label font-semibold uppercase tracking-[0.15em]',
                          TIER_TONE[row.tier]
                        )}
                      >
                        {row.tier}
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground" title={row.program}>{row.program}</p>
                </div>

                <div className="hidden shrink-0 text-right sm:block">
                  <p className="text-xs font-semibold text-foreground">{statusLabel}</p>
                  <p className="text-label text-muted-foreground">
                    {isClosed ? 'Awaiting decision' : formatDeadline(row.daysUntilDeadline)}
                  </p>
                </div>

                {isClosed ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success-subtle px-2.5 py-1 text-label font-semibold text-success">
                    <CheckCircle2 className="h-3 w-3" aria-hidden />
                    {statusLabel}
                  </span>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setHelpApp({
                        id: row.id,
                        university: row.university,
                        program: row.program,
                        nextDeadline: row.daysUntilDeadline !== null ? formatDeadline(row.daysUntilDeadline) : undefined,
                        tasksRemaining: row.tasksOpen
                      })
                    }
                    className="shrink-0 border-primary/30 bg-primary/10 text-primary-ink transition hover:border-primary/60"
                  >
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    Need help
                  </Button>
                )}
              </div>

              {!isClosed && row.tasksTotal > 0 ? (
                <div className="mt-2.5 flex items-center gap-3">
                  {/* "N of M tasks open" is a QUANTITY, so the length is the encoding and the
                      fill is one brand colour at every value (brand.md §5, Data: "Progress bar
                      — level 5 — Brand").

                      Both this bar and the one in features/parent/ui/progress-board.tsx used to
                      carry a byte-identical copy-pasted ternary:

                        progress >= 75 ? 'bg-success-fill'
                          : progress >= 40 ? 'bg-muted-foreground'
                          : 'bg-warning-fill'

                      which was wrong three ways. It was non-monotone in chroma — coloured, then
                      grey, then coloured — so the bar went LESS colourful through the middle of
                      its own range and more at both ends. It banded on a scheme that skipped
                      `danger` entirely, so its bottom band was amber where classifyCompletion's
                      is rose: two vocabularies for one idea. And it read a count as a status,
                      where `warning` promises a deadline that a half-done task list does not have.

                      Both sites now import PROGRESS_FILL instead of restating it, so the two
                      cannot drift apart again. `transition-[background-color]` went with it —
                      there is no longer a colour to transition. */}
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn('h-full rounded-full transition-[width]', PROGRESS_FILL)}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="shrink-0 text-label font-medium text-muted-foreground tabular-nums">
                    {row.tasksOpen} of {row.tasksTotal} tasks open
                  </p>
                </div>
              ) : null}
            </motion.li>
          );
        })}
      </ul>

      <HelpRequestModal
        open={helpApp !== null}
        onOpenChange={(open) => !open && setHelpApp(null)}
        app={helpApp}
      />
    </>
  );
}
