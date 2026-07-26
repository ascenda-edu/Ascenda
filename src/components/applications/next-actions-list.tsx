'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, CheckCircle2, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { HelpRequestModal, type HelpRequestModalApp } from './help-request-modal';

export interface NextActionItem {
  taskId: string;
  applicationId: string;
  university: string;
  program: string;
  taskName: string;
  dueDate: string | null;
  daysUntilDue: number | null;
  tasksRemaining: number;
}

interface Props {
  items: NextActionItem[];
}

const urgencyTone = (days: number | null): { dot: string; label: string; labelTone: string } => {
  if (days === null) return { dot: 'bg-muted-foreground/40', label: 'No deadline', labelTone: 'text-muted-foreground' };
  if (days < 0) return { dot: 'bg-danger', label: `${Math.abs(days)}d overdue`, labelTone: 'text-danger' };
  if (days === 0) return { dot: 'bg-danger', label: 'Due today', labelTone: 'text-danger' };
  if (days === 1) return { dot: 'bg-danger', label: 'Due tomorrow', labelTone: 'text-danger' };
  if (days <= 3) return { dot: 'bg-danger', label: `Due in ${days} days`, labelTone: 'text-danger' };
  if (days <= 7) return { dot: 'bg-warning', label: `Due in ${days} days`, labelTone: 'text-warning' };
  return { dot: 'bg-info', label: `Due in ${days} days`, labelTone: 'text-info' };
};

export function NextActionsList({ items }: Props) {
  const [helpApp, setHelpApp] = useState<HelpRequestModalApp | null>(null);

  const ranked = useMemo(
    () =>
      [...items]
        .sort((a, b) => {
          // Earliest deadline first; null deadlines last.
          const aDays = a.daysUntilDue ?? Number.POSITIVE_INFINITY;
          const bDays = b.daysUntilDue ?? Number.POSITIVE_INFINITY;
          return aDays - bDays;
        })
        .slice(0, 3),
    [items]
  );

  if (ranked.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-success/25 bg-success-subtle p-6 text-center text-sm text-success">
        <CheckCircle2 className="mx-auto mb-2 h-5 w-5" aria-hidden />
        Nothing urgent right now. Everything tracked is on track.
      </div>
    );
  }

  return (
    <>
      <ul className="space-y-2">
        {ranked.map((item, index) => {
          const tone = urgencyTone(item.daysUntilDue);
          return (
            <motion.li
              key={item.taskId}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: index * 0.05 }}
              className="hover-lift group flex items-center gap-4 rounded-2xl border border-border/60 bg-card/60 px-4 py-3 hover:border-primary/40"
            >
              <span
                className={cn('h-2.5 w-2.5 shrink-0 rounded-full', tone.dot)}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground" title={item.taskName}>
                  {item.taskName}
                </p>
                <p className="truncate text-xs text-muted-foreground" title={`${item.university} · ${item.program}`}>
                  {item.university} · {item.program}
                </p>
              </div>
              <div className="hidden shrink-0 text-right sm:block">
                <p className={cn('text-xs font-semibold', tone.labelTone)}>{tone.label}</p>
                <p className="eyebrow">
                  {item.tasksRemaining} task{item.tasksRemaining === 1 ? '' : 's'} open
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setHelpApp({
                    id: item.applicationId,
                    university: item.university,
                    program: item.program,
                    nextDeadline: tone.label,
                    tasksRemaining: item.tasksRemaining
                  })
                }
                className="shrink-0 border-feature/25 bg-feature-subtle text-feature transition hover:bg-feature/15"
              >
                <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Need help
              </Button>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 opacity-0 transition group-hover:opacity-100" aria-hidden />
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
