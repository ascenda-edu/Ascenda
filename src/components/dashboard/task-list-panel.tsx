'use client';

import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { TaskList } from './task-list';
import { DURATION, EASE } from '@/lib/motion';
import { type ChecklistStatus, toggleDoneStatus } from '@/lib/applications/checklist-status-queue';
import { useChecklistStatusQueue } from '@/lib/applications/use-checklist-status-queue';

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
  const [celebration, setCelebration] = useState<{ id: number; message: string; taskId: string } | null>(null);
  // Monotonic id so a celebration's auto-dismiss timer only clears the toast it
  // opened — a newer completion (possibly with the same random message) replaces
  // it, and the older timer must not dismiss that newer toast early.
  const celebrationSeq = useRef(0);
  // Restore a 'doing' task's status on un-check (session-local); see toggleDoneStatus.
  const statusBeforeDone = useRef(new Map<string, ChecklistStatus>());

  // Serialises PATCHes per task; onError reverts to the last server-confirmed
  // status and dismisses a celebration for a flip that didn't stick. The hook
  // re-syncs to fresh `tasks` props and re-overlays in-flight toggles so a
  // re-sync landing mid-PATCH doesn't flicker the row to the stale seed.
  const queue = useChecklistStatusQueue({
    seed: tasks,
    reconcile: (id, status) =>
      setItems((prev) => {
        let changed = false;
        const next = prev.map((task) => {
          if (task.id === id && task.status !== status) {
            changed = true;
            return { ...task, status };
          }
          return task;
        });
        return changed ? next : prev;
      }),
    onResync: (seed) => {
      setItems(seed);
      statusBeforeDone.current.clear();
    },
    // Only dismiss the celebration if it belongs to the failed task.
    onError: (id) => setCelebration((prev) => (prev?.taskId === id ? null : prev))
  });

  const handleToggle = (id: string) => {
    const current = items.find((task) => task.id === id);
    if (!current) return;

    const nextStatus = toggleDoneStatus(current.status, id, statusBeforeDone.current);
    setItems((prev) =>
      prev.map((task) => (task.id === id ? { ...task, status: nextStatus } : task))
    );
    queue.set(id, nextStatus);

    if (nextStatus === 'done') {
      const celebrationId = (celebrationSeq.current += 1);
      const message = CHEERS[Math.floor(Math.random() * CHEERS.length)];
      setCelebration({ id: celebrationId, message, taskId: id });
      window.setTimeout(() => {
        setCelebration((prev) => (prev?.id === celebrationId ? null : prev));
      }, 1800);
    }
  };

  // Renders bare (no card chrome) — the dashboard hub wraps it in a HubCard.
  return (
    <div>
      <TaskList title={title} tasks={items} onToggle={handleToggle} />
      <AnimatePresence>
        {celebration ? (
          <motion.div
            key={celebration.id}
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: DURATION.fast, ease: EASE } }}
            exit={{ opacity: 0, y: 12, scale: 0.96, transition: { duration: DURATION.exit, ease: EASE } }}
            className="pointer-events-none fixed left-1/2 bottom-[calc(env(safe-area-inset-bottom,8px)+80px)] z-toast -translate-x-1/2 md:bottom-6"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center gap-2 rounded-full border border-success/30 bg-success-subtle px-4 py-2 text-sm font-semibold text-success shadow-e-3">
              <Sparkles className="h-4 w-4" aria-hidden />
              {celebration.message}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
