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

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { cardFade } from '@/lib/motion';
import { parseLocalDate, daysUntil } from '@/lib/utils/dates';
import type { ChatMode } from '@/lib/chat/prompts';
import type { TaskHit } from '@/lib/chat/widgets';

const formatDue = (date: string): string =>
  parseLocalDate(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

function TaskMeta({ item }: { item: TaskHit }) {
  const overdue = item.dueDate ? daysUntil(item.dueDate) < 0 : false;
  return (
    <p className="truncate text-[10px] text-muted-foreground">
      {item.application}
      {item.dueDate ? (
        <>
          {' · '}
          <span className={overdue ? 'font-semibold text-rose-600 dark:text-rose-400' : undefined}>
            {overdue ? 'overdue ' : 'due '}
            {formatDue(item.dueDate)}
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

  const toggle = async (id: string) => {
    const current = statuses[id];
    const next: TaskHit['status'] = current === 'done' ? 'todo' : 'done';
    setStatuses((prev) => ({ ...prev, [id]: next }));
    try {
      const res = await fetch('/api/checklist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: next }),
      });
      if (!res.ok) throw new Error('request failed');
    } catch {
      setStatuses((prev) => ({ ...prev, [id]: current }));
    }
  };

  return (
    <motion.div
      variants={cardFade}
      initial="hidden"
      animate="show"
      className="rounded-[14px] border border-border bg-background p-2.5"
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
                  onClick={() => toggle(item.id)}
                  aria-label={done ? 'Mark as not done' : 'Mark as done'}
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition',
                    done
                      ? 'border-emerald-500 bg-emerald-500 text-white'
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
                    done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-border'
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : null}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'truncate text-[11px] font-medium text-foreground',
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
