'use client';

import { useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ListChecks, Plus, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { dueLabel } from '@/lib/applications/due-label';
import { type ChecklistStatus, toggleDoneStatus } from '@/lib/applications/checklist-status-queue';
import { useChecklistStatusQueue } from '@/lib/applications/use-checklist-status-queue';

export interface SeedTask {
  id: string;
  name: string;
  status: ChecklistStatus;
  dueDate?: string;
  group: string;
  /** Owning application — required so new tasks persist to application_checklist. */
  applicationId: string;
  /** Stable render key that survives the temp→real id swap after a POST —
   * keying by id would remount the row (exit+enter flash) on every add. */
  renderKey?: string;
}

export interface TaskApplicationOption {
  id: string;
  label: string;
}

type Filter = 'open' | 'done' | 'all';

const isTempId = (id: string) => id.startsWith('temp-');
const isDone = (task: SeedTask) => task.status === 'done';

// Stable in-group order: soonest due first (date-only strings compare
// lexicographically), undated after dated, then name. Sorting here (not by
// insertion) means a task restored after a failed delete lands back where it was.
const compareTasks = (a: SeedTask, b: SeedTask) => {
  if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
  if (Boolean(a.dueDate) !== Boolean(b.dueDate)) return a.dueDate ? -1 : 1;
  return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
};

interface CrossApplicationTasksProps {
  initialTasks: SeedTask[];
  applicationOptions: TaskApplicationOption[];
}

export function CrossApplicationTasks({ initialTasks, applicationOptions }: CrossApplicationTasksProps) {
  const { showToast } = useToast();
  const [tasks, setTasks] = useState<SeedTask[]>(initialTasks);
  const [filter, setFilter] = useState<Filter>('open');
  const [newName, setNewName] = useState('');
  const [newDue, setNewDue] = useState('');
  const [newAppId, setNewAppId] = useState(applicationOptions[0]?.id ?? '');
  const [adding, setAdding] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SeedTask | null>(null);
  // Interactions with a temp task while its POST is in flight, replayed once
  // the real id arrives — otherwise a toggle is silently lost on reload and a
  // delete resurrects as a ghost row created by the still-running POST.
  const pendingTempOps = useRef(new Map<string, { status?: ChecklistStatus; removed?: boolean }>());
  // When a 'doing' task is marked done, remember what to restore on un-check
  // (session-local; after a reload un-checking falls back to 'todo').
  const statusBeforeDone = useRef(new Map<string, ChecklistStatus>());
  // Date.now() alone can collide under key-repeat; the counter makes ids unique.
  const tempSeq = useRef(0);

  // Latest-ref so the queue handlers (created once) never see a stale toast.
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  // Serialises status PATCHes per task and coalesces rapid toggles; on failure
  // it reverts to the last server-confirmed status, so a slow failure can't
  // clobber a newer successful toggle. The hook also re-syncs to fresh server
  // data (router.refresh) and re-overlays in-flight toggles so a re-sync landing
  // mid-PATCH doesn't flicker the row back to the stale seed.
  const queue = useChecklistStatusQueue({
    seed: initialTasks,
    reconcile: (id, status) =>
      setTasks((prev) => {
        let changed = false;
        const next = prev.map((t) => {
          if (t.id === id && t.status !== status) {
            changed = true;
            return { ...t, status };
          }
          return t;
        });
        // Bail when nothing moved — a server-confirms-current settle must not
        // allocate a new array and force a regroup/resort.
        return changed ? next : prev;
      }),
    onResync: (seed) => {
      setTasks(seed);
      // Keep in-flight temp-task intents — add() still replays them once its
      // POST returns a real id, so clearing here would silently drop a toggle
      // made on a just-added row. Only the session-local 'doing' restore hints
      // are reload-scoped (un-check then falls back to 'todo', as documented).
      statusBeforeDone.current.clear();
    },
    onError: () => showToastRef.current({ title: "Couldn't update that task", variant: 'error' })
  });

  const filtered = useMemo(() => {
    if (filter === 'open') return tasks.filter((t) => !isDone(t));
    if (filter === 'done') return tasks.filter(isDone);
    return tasks;
  }, [tasks, filter]);

  const grouped = useMemo(() => {
    const map = new Map<string, SeedTask[]>();
    for (const task of filtered) {
      const list = map.get(task.group) ?? [];
      list.push(task);
      map.set(task.group, list);
    }
    for (const list of map.values()) list.sort(compareTasks);
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const totals = {
    open: tasks.filter((t) => !isDone(t)).length,
    done: tasks.filter(isDone).length,
    all: tasks.length
  };

  // Toggle done — persists the new status to application_checklist.
  const toggle = (id: string) => {
    const target = tasks.find((t) => t.id === id);
    if (!target) return;
    const next = toggleDoneStatus(target.status, id, statusBeforeDone.current);
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: next } : t)));
    if (isTempId(id)) {
      // Not yet persisted — record the desired state; add() replays it.
      const pending = pendingTempOps.current.get(id) ?? {};
      pendingTempOps.current.set(id, { ...pending, status: next });
      return;
    }
    queue.set(id, next);
  };

  const restoreTask = (task: SeedTask) => {
    setTasks((prev) => [...prev, task]);
    showToast({ title: "Couldn't remove that task", variant: 'error' });
  };

  // Synchronous `() => void` event-handler boundary around an async body. An
  // `async` function handed to `onClick`/`onDrop`/`onChange` returns a promise
  // the DOM discards, so a rejection is swallowed and the user is told nothing;
  // the terminal `.catch` below is the only exit for a failure.
  const remove = (id: string): void => {
    const target = tasks.find((t) => t.id === id);
    if (!target) return;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    if (isTempId(id)) {
      // The POST may still be in flight — mark for deletion; add() cleans up.
      const pending = pendingTempOps.current.get(id) ?? {};
      pendingTempOps.current.set(id, { ...pending, removed: true });
      return;
    }

    const run = async (): Promise<void> => {
      const res = await fetch('/api/checklist', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      if (!res.ok) throw new Error('request failed');
    };

    // The row popping back into the list was the only signal that a delete had
    // failed, and it reads as a UI glitch rather than an error. Say it plainly.
    run().catch(() => {
      restoreTask(target);
      showToast({ title: "Couldn't remove that task", variant: 'error' });
    });
  };

  // Synchronous `() => void` event-handler boundary around an async body. An
  // `async` function handed to `onClick`/`onDrop`/`onChange` returns a promise
  // the DOM discards, so a rejection is swallowed and the user is told nothing;
  // the terminal `.catch` below is the only exit for a failure.
  const add = (): void => {
    const name = newName.trim();
    if (!name || !newAppId || adding) return;
    const tempId = `temp-${Date.now()}-${++tempSeq.current}`;
    const groupLabel = applicationOptions.find((a) => a.id === newAppId)?.label ?? 'Application';
    const optimistic: SeedTask = {
      id: tempId,
      name,
      status: 'todo',
      dueDate: newDue || undefined,
      group: groupLabel,
      applicationId: newAppId,
      renderKey: tempId
    };
    setTasks((prev) => [...prev, optimistic]);
    // A task created under the 'done' filter would silently vanish — jump to
    // 'open' so the user sees it land.
    if (filter === 'done') setFilter('open');
    setNewName('');
    setNewDue('');
    setAdding(true);

    const run = async (): Promise<void> => {
      const res = await fetch('/api/checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application_id: newAppId, task_name: name, due_date: newDue || undefined })
      });
      if (!res.ok) throw new Error('request failed');
      const { item } = (await res.json()) as { item: { id: string } };
      queue.prime(item.id, 'todo');

      // Replay anything the user did to the temp task while the POST ran.
      const pending = pendingTempOps.current.get(tempId);
      pendingTempOps.current.delete(tempId);
      if (pending?.removed) {
        try {
          const del = await fetch('/api/checklist', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: item.id })
          });
          if (!del.ok) throw new Error('request failed');
        } catch {
          // The row exists on the server — resurface it instead of leaving a
          // ghost that reappears on reload.
          restoreTask({ ...optimistic, id: item.id });
        }
        return;
      }
      setTasks((prev) => {
        // A seed re-sync may have raced the POST: if it already includes the
        // new row keep it; if it dropped the temp row, re-append with the real
        // id rather than letting the created task silently vanish.
        if (prev.some((t) => t.id === item.id)) return prev;
        if (prev.some((t) => t.id === tempId)) {
          return prev.map((t) => (t.id === tempId ? { ...t, id: item.id } : t));
        }
        // Carry any in-flight toggle so the re-appended row doesn't flash 'todo'
        // before queue.set below round-trips the pending status.
        return [...prev, { ...optimistic, id: item.id, status: pending?.status ?? optimistic.status }];
      });
      if (pending?.status && pending.status !== 'todo') {
        // Through the queue so a failure reverts + toasts like any other toggle.
        queue.set(item.id, pending.status);
      }
    };

    run()
      .catch(() => {
        pendingTempOps.current.delete(tempId);
        setTasks((prev) => prev.filter((t) => t.id !== tempId));
        showToast({ title: "Couldn't add that task", variant: 'error' });
      })
      .finally(() => {
        setAdding(false);
      });
  };

  return (
    <div className="space-y-6">
      {/* ── Add task + filters ──────────────────────────────────────── */}
      <section className="surface-card space-y-4 rounded-4xl p-5">
        <div className="flex flex-wrap items-center gap-2">
          {(['open', 'done', 'all'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-semibold capitalize transition',
                filter === f
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground'
              )}
            >
              {f} <span className="opacity-60">· {totals[f]}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              // isComposing: Enter confirms an IME candidate, not the task.
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) add();
            }}
            aria-label="New task name"
            placeholder="Add a task — press Enter"
            className="flex-1 min-w-[200px] rounded-full border border-border bg-background px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <input
            type="date"
            value={newDue}
            onChange={(e) => setNewDue(e.target.value)}
            aria-label="Due date (optional)"
            className="rounded-full border border-border bg-background px-4 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <Select value={newAppId || ''} onValueChange={setNewAppId}>
            {/* w-auto: the trigger's base class is w-full, which in this wrap row
              * would claim a whole line. rounded-full/py-2 keep it the same pill
              * height as the two inputs beside it. */}
            <SelectTrigger aria-label="Attach task to application" className="w-auto rounded-full py-2">
              <SelectValue placeholder="Application" />
            </SelectTrigger>
            <SelectContent>
              {applicationOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={add} disabled={!newName.trim() || !newAppId || adding}>
            <Plus className="mr-1 h-3.5 w-3.5" /> {adding ? 'Adding…' : 'Add'}
          </Button>
        </div>
      </section>

      {/* ── Grouped tasks ───────────────────────────────────────────── */}
      {grouped.length === 0 ? (
        <EmptyState
          icon={<ListChecks />}
          className="min-h-[200px]"
          title={filter === 'done' ? 'Nothing finished yet' : filter === 'open' ? 'You’re all caught up' : 'No tasks tracked'}
          description={filter === 'open' ? 'Add a task above or check the done tab.' : 'Switch filter to see other tasks.'}
        />
      ) : (
        <div className="space-y-6">
          {grouped.map(([group, list]) => {
            const groupOpen = list.filter((t) => !isDone(t)).length;
            return (
              <section key={group} className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">{group}</h3>
                    <p className="text-xs text-muted-foreground">
                      {groupOpen} open · {list.length - groupOpen} done
                    </p>
                  </div>
                </div>
                <ul className="space-y-2">
                  <AnimatePresence>
                    {list.map((task) => {
                      const due = dueLabel(task.dueDate);
                      const done = isDone(task);
                      return (
                        <motion.li
                          key={task.renderKey ?? task.id}
                          layout
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: 12 }}
                          className={cn(
                            'group flex items-center gap-3 rounded-2xl border bg-card px-4 py-3 transition',
                            done ? 'border-success/30' : 'border-border'
                          )}
                        >
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={done}
                            aria-label={task.name}
                            onClick={() => toggle(task.id)}
                            className={cn(
                              'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition',
                              done
                                ? 'border-success bg-success-fill text-success-foreground'
                                : 'border-border bg-background hover:border-primary'
                            )}
                          >
                            {done ? <Check className="h-3.5 w-3.5" /> : null}
                          </button>
                          <p
                            className={cn(
                              'flex-1 text-sm text-foreground',
                              done && 'text-muted-foreground line-through'
                            )}
                          >
                            {task.name}
                          </p>
                          {task.status === 'doing' ? (
                            <span className="shrink-0 rounded-full border border-border bg-muted px-2.5 py-0.5 text-label font-semibold text-muted-foreground">
                              In progress
                            </span>
                          ) : null}
                          {due ? (
                            <span
                              className={cn(
                                'shrink-0 rounded-full border px-2.5 py-0.5 text-label font-semibold',
                                due.urgent
                                  ? 'border-danger/30 bg-danger-subtle text-danger'
                                  : 'border-border bg-muted text-foreground'
                              )}
                            >
                              {due.label}
                            </span>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => setPendingDelete(task)}
                            aria-label={`Remove task: ${task.name}`}
                            // Hidden-until-hover only where hover exists — touch
                            // devices get the button always visible.
                            className="rounded-full p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                          </button>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {/* Delete confirmation — replaces the OS window.confirm */}
      <Dialog open={pendingDelete !== null} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
        <DialogContent className="max-w-sm">
          <div className="space-y-4 p-5">
            <DialogHeader>
              <DialogTitle>Remove task?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Remove &ldquo;{pendingDelete?.name}&rdquo; from your tracker? This can&apos;t be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setPendingDelete(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (pendingDelete) remove(pendingDelete.id);
                  setPendingDelete(null);
                }}
              >
                Remove
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
