'use client';

// Interactive task-checklist widget (get_my_applications tasks group).
//
// Tiered-autonomy note: confirm cards gate MODEL-initiated writes. This toggle
// is USER-initiated — the same gesture, endpoint, and optimistic-revert contract
// as /applications/tasks — so no confirm card. Persisted tool_results keep
// tool-run-time status; a reload shows stale status until the tool re-runs
// (accepted).
//
// Interactive in STUDENT mode only; counsellor renders static rows (no toggles,
// no writes out of that portal). All fields are plain JSX text.

import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { cardFade } from '@/lib/motion';
import { dueLabel } from '@/lib/applications/due-label';
import { type ChecklistStatus, toggleDoneStatus } from '@/lib/applications/checklist-status-queue';
import { useChecklistStatusQueue } from '@/lib/applications/use-checklist-status-queue';
import type { ChatMode } from '@/lib/chat/prompts';
import type { TaskHit } from '@/lib/chat/widgets';

function TaskMeta({ item }: { item: TaskHit }) {
  // Shared relative-due copy so the widget matches the /applications/tasks board.
  const due = dueLabel(item.dueDate);
  return (
    <p className="truncate text-label text-muted-foreground">
      {item.application}
      {due ? (
        <>
          {' · '}
          <span className={due.urgent ? 'font-semibold text-danger' : undefined}>
            {due.label}
          </span>
        </>
      ) : null}
    </p>
  );
}

export function TasksWidget({ items, mode }: { items: TaskHit[]; mode: ChatMode }) {
  // Local status mirror — the widget is optimistic and reverts on a failed PATCH.
  const [statuses, setStatuses] = useState<Record<string, TaskHit['status']>>(() =>
    Object.fromEntries(items.map((t) => [t.id, t.status]))
  );
  // Restore a 'doing' task's status on un-check (session-local); see toggleDoneStatus.
  const statusBeforeDone = useRef(new Map<string, ChecklistStatus>());

  // Serialises PATCHes per task; onError reverts to server truth. The hook
  // rebuilds the mirror when fresh `items` props arrive and re-overlays in-flight
  // toggles so an items re-sync mid-PATCH doesn't flicker the row to stale status.
  // Tool-run-time staleness stays accepted (see header) — fresh props still win.
  const queue = useChecklistStatusQueue({
    seed: items,
    reconcile: (id, status) =>
      setStatuses((prev) => (prev[id] === status ? prev : { ...prev, [id]: status })),
    onResync: (seed) => {
      setStatuses(Object.fromEntries(seed.map((t) => [t.id, t.status])));
      statusBeforeDone.current.clear();
    }
  });

  const toggle = (id: string) => {
    const current = statuses[id] ?? 'todo';
    const next = toggleDoneStatus(current, id, statusBeforeDone.current);
    setStatuses((prev) => ({ ...prev, [id]: next }));
    queue.set(id, next);
  };

  return (
    <motion.div
      variants={cardFade}
      initial="hidden"
      animate="show"
      className="rounded-xl border border-border bg-background p-2.5"
    >
      <div className="divide-y divide-border">
        {items.map((item) => {
          const status = statuses[item.id] ?? item.status;
          const done = status === 'done';
          return (
            <div key={item.id} className="flex items-center gap-2.5 py-1.5">
              {mode === 'student' ? (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={done}
                  aria-label={item.name}
                  onClick={() => toggle(item.id)}
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition',
                    done
                      ? 'border-success bg-success text-success-foreground'
                      : 'border-border bg-background hover:border-primary'
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : null}
                </button>
              ) : (
                <span
                  aria-hidden
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2',
                    done ? 'border-success bg-success text-success-foreground' : 'border-border'
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : null}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'truncate text-label font-medium text-foreground',
                    done && 'text-muted-foreground line-through'
                  )}
                >
                  {item.name}
                </p>
                <TaskMeta item={item} />
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
