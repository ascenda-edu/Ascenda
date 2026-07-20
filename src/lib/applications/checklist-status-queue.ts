// Per-task write queue for checklist status PATCHes.
//
// Optimistic toggles fire one PATCH per click with no ordering guarantee, so
// two rapid clicks can arrive at the server out of order (DB ends up with the
// first click's value), and a slow failure can revert UI state that a *later*
// successful request legitimately established. This queue serialises requests
// per task and coalesces to the latest desired status: while a PATCH is in
// flight, newer clicks just overwrite the desired value; the loop keeps
// sending until server state matches it. On failure the desired value is
// dropped and the caller is told the last server-confirmed status to revert to.

export type ChecklistStatus = 'todo' | 'doing' | 'done';

// Next status for a done-checkbox toggle. Marking a 'doing' task done then
// un-checking must restore 'doing', not silently drop it to 'todo' — so stash
// the pre-done status in a caller-owned session map and read it back on uncheck.
// `restoreHints` is session-local: after a reload (or seed re-sync) it's empty
// and un-check falls back to 'todo'.
export function toggleDoneStatus(
  current: ChecklistStatus,
  id: string,
  restoreHints: Map<string, ChecklistStatus>
): ChecklistStatus {
  if (current === 'done') {
    const restore = restoreHints.get(id) ?? 'todo';
    restoreHints.delete(id);
    return restore;
  }
  if (current === 'doing') restoreHints.set(id, 'doing');
  return 'done';
}

interface QueueHandlers {
  /**
   * The burst settled: every coalesced write persisted and `status` is the
   * final server state. Fires once per burst (never mid-burst, so applying it
   * to UI state can't flash an intermediate status), and only when something
   * was actually written. Callers use it to reconcile state a concurrent seed
   * re-sync may have reverted while the PATCH was in flight.
   */
  onSettled?: (id: string, status: ChecklistStatus) => void;
  /** A PATCH failed; revert UI to `lastPersisted` (last server-confirmed status). */
  onError: (id: string, lastPersisted: ChecklistStatus) => void;
}

export interface ChecklistStatusQueue {
  /** Record the known server status for a task (seed rows, newly created rows). */
  prime: (id: string, status: ChecklistStatus) => void;
  /** Request that the task end up in `status`; coalesces while a PATCH is in flight. */
  set: (id: string, status: ChecklistStatus) => void;
  /**
   * The optimistic target for `id` while a write is queued/in flight, else
   * `undefined`. Lets a seed re-sync re-overlay in-flight statuses so the row
   * doesn't flicker back to (now-primed) server truth before the PATCH settles.
   */
  pending: (id: string) => ChecklistStatus | undefined;
}

export function createChecklistStatusQueue(handlers: QueueHandlers): ChecklistStatusQueue {
  const lastPersisted = new Map<string, ChecklistStatus>();
  const desired = new Map<string, ChecklistStatus>();
  const inFlight = new Set<string>();

  const run = async (id: string) => {
    inFlight.add(id);
    let didPersist = false;
    try {
      for (;;) {
        const target = desired.get(id);
        if (target === undefined || target === lastPersisted.get(id)) {
          desired.delete(id);
          const settled = lastPersisted.get(id);
          if (didPersist && settled !== undefined) handlers.onSettled?.(id, settled);
          return;
        }
        let ok = false;
        try {
          const res = await fetch('/api/checklist', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status: target })
          });
          ok = res.ok;
        } catch {
          ok = false;
        }
        if (!ok) {
          desired.delete(id);
          handlers.onError(id, lastPersisted.get(id) ?? 'todo');
          return;
        }
        lastPersisted.set(id, target);
        didPersist = true;
        // Loop: a newer desired status may have arrived while the PATCH ran.
      }
    } finally {
      inFlight.delete(id);
    }
  };

  return {
    prime(id, status) {
      lastPersisted.set(id, status);
    },
    set(id, status) {
      desired.set(id, status);
      if (!inFlight.has(id)) void run(id);
    },
    pending(id) {
      return desired.get(id);
    }
  };
}
