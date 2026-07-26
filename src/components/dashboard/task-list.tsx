'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { inferTaskType, TASK_VISUAL } from '@/lib/theme/categories';
import { parseLocalDate } from '@/lib/utils/dates';

interface TaskItem {
  id: string;
  name: string;
  status: 'todo' | 'doing' | 'done';
  dueDate?: string;
}

interface TaskListProps {
  title: string;
  tasks: TaskItem[];
  onToggle?: (id: string) => void;
}

const listStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } }
};

const taskVariant = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
  exit: { opacity: 0, x: 20, transition: { duration: 0.2 } }
};

function AnimatedProgress({ value }: { value: number }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setWidth(value));
    return () => cancelAnimationFrame(id);
  }, [value]);

  return (
    <div className="h-1.5 rounded-full bg-muted/60" aria-hidden>
      <motion.div
        className="h-1.5 rounded-full bg-primary"
        initial={{ width: 0 }}
        animate={{ width: `${width}%` }}
        transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] as const }}
      />
    </div>
  );
}

export const TaskList = ({ title, tasks, onToggle }: TaskListProps) => {
  const completed = tasks.filter((task) => task.status === 'done').length;
  const total = tasks.length;
  const progress = total ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="space-y-4 text-foreground">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground">Stay on track with your application milestones.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="eyebrow rounded-full bg-muted/60 px-3 py-1">
            {progress}% ready
          </div>
          <Button asChild size="sm" variant="ghost" className="rounded-full px-3 text-xs uppercase tracking-[0.3em] text-muted-foreground">
            <Link href="/applications/tasks">Add task</Link>
          </Button>
        </div>
      </div>
      <AnimatedProgress value={progress} />
      <motion.div
        className="space-y-3"
        variants={listStagger}
        initial="hidden"
        animate="show"
      >
        <AnimatePresence mode="popLayout">
          {tasks.length === 0 ? (
            <motion.div
              key="empty"
              className="rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-8 text-center"
              variants={taskVariant}
              initial="hidden"
              animate="show"
              exit="exit"
            >
              <ListChecks className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-semibold text-foreground">Quiet for now ✨</p>
              <p className="text-xs text-muted-foreground">Add a program and we&apos;ll build your checklist.</p>
            </motion.div>
          ) : (
            tasks.map((task) => {
              const visual = TASK_VISUAL[inferTaskType(task.name)];
              const Icon = visual.icon;
              const isDone = task.status === 'done';
              return (
                <motion.article
                  key={task.id}
                  className={cn(
                    'hover-lift relative flex items-start gap-3 rounded-2xl border border-l-4 bg-card/60 px-4 py-3 text-foreground',
                    isDone ? 'border-success/25 border-l-success opacity-80' : cn(visual.border, visual.accent)
                  )}
                  variants={taskVariant}
                  layout
                >
                  <div className={visual.swatch}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'text-sm font-semibold text-foreground transition-all',
                        isDone && 'line-through opacity-60'
                      )}
                    >
                      {task.name}
                    </p>
                    {task.dueDate ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Due · {parseLocalDate(task.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </p>
                    ) : null}
                  </div>
                  {onToggle ? (
                    <Button
                      type="button"
                      size="sm"
                      variant={isDone ? 'secondary' : 'outline'}
                      onClick={() => onToggle(task.id)}
                      className="shrink-0"
                    >
                      {isDone ? 'Undo' : 'Mark done'}
                    </Button>
                  ) : (
                    <span className="eyebrow shrink-0">{task.status}</span>
                  )}
                </motion.article>
              );
            })
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
