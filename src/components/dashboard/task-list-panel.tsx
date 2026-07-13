'use client';

import { useMemo, useState, useTransition } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { TaskList } from './task-list';

type TaskItem = {
  id: string;
  name: string;
  status: 'todo' | 'doing' | 'done';
  dueDate?: string;
};

interface TaskListPanelProps {
  title: string;
  tasks: TaskItem[];
}

const CHEERS = ['Nice work', 'Boom', 'One down', 'Love it', 'Keep going'];

export const TaskListPanel = ({ title, tasks }: TaskListPanelProps) => {
  const [items, setItems] = useState<TaskItem[]>(tasks);
  const [isPending, startTransition] = useTransition();
  const [celebration, setCelebration] = useState<{ id: number; message: string } | null>(null);

  const optimisticMap = useMemo(() => {
    const map = new Map<string, TaskItem>();
    items.forEach((task) => map.set(task.id, task));
    return map;
  }, [items]);

  const handleToggle = (id: string) => {
    const current = optimisticMap.get(id);
    if (!current) return;

    const nextStatus = current.status === 'done' ? 'todo' : 'done';
    setItems((prev) =>
      prev.map((task) => (task.id === id ? { ...task, status: nextStatus } : task))
    );

    if (nextStatus === 'done') {
      const message = CHEERS[Math.floor(Math.random() * CHEERS.length)];
      setCelebration({ id: Date.now(), message });
      window.setTimeout(() => {
        setCelebration((prev) => (prev && prev.message === message ? null : prev));
      }, 1800);
    }

    startTransition(async () => {
      try {
        const response = await fetch('/api/checklist', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, status: nextStatus })
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }
      } catch {
        setItems((prev) =>
          prev.map((task) => (task.id === id ? { ...task, status: current.status } : task))
        );
      }
    });
  };

  // Renders bare (no card chrome) — the dashboard hub wraps it in a HubCard.
  return (
    <div>
      <TaskList title={title} tasks={items} onToggle={handleToggle} disabled={isPending} />
      <AnimatePresence>
        {celebration ? (
          <motion.div
            key={celebration.id}
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-none fixed left-1/2 bottom-[calc(env(safe-area-inset-bottom,8px)+80px)] z-[55] -translate-x-1/2 md:bottom-6"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 shadow-lg dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-300">
              <Sparkles className="h-4 w-4" aria-hidden />
              {celebration.message}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
