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
  if (days < 0) return { dot: 'bg-rose-500', label: `${Math.abs(days)}d overdue`, labelTone: 'text-rose-600 dark:text-rose-400' };
  if (days === 0) return { dot: 'bg-rose-500', label: 'Due today', labelTone: 'text-rose-600 dark:text-rose-400' };
  if (days === 1) return { dot: 'bg-rose-500', label: 'Due tomorrow', labelTone: 'text-rose-600 dark:text-rose-400' };
  if (days <= 3) return { dot: 'bg-rose-500', label: `Due in ${days} days`, labelTone: 'text-rose-600 dark:text-rose-400' };
  if (days <= 7) return { dot: 'bg-amber-500', label: `Due in ${days} days`, labelTone: 'text-amber-600 dark:text-amber-400' };
  return { dot: 'bg-sky-400', label: `Due in ${days} days`, labelTone: 'text-sky-600 dark:text-sky-400' };
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
      <div className="rounded-2xl border border-dashed border-emerald-200/60 bg-emerald-500/5 p-6 text-center text-sm text-emerald-700 dark:text-emerald-300">
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
              className="group flex items-center gap-4 rounded-2xl border border-border/60 bg-card/60 px-4 py-3 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"
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
                <p className="text-[0.625rem] uppercase tracking-[0.2em] text-muted-foreground">
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
                className="shrink-0 border-violet-300/60 bg-violet-500/5 text-violet-700 transition hover:bg-violet-500/10 dark:text-violet-300"
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
