'use client';

import { useRef, useState } from 'react';
import {
  createChecklistStatusQueue,
  type ChecklistStatus,
  type ChecklistStatusQueue
} from '@/lib/applications/checklist-status-queue';

// Shared wiring for the checklist status surfaces (applications board, dashboard
// task panel, assistant tasks widget). Each used to hand-roll the same three
// fragile pieces — a lazy queueRef, a render-time seed sentinel, and a prime
// loop — so a fix to the re-sync contract had to be applied in three places and
// drifted. This owns that contract once:
//   - lazy queue creation (mutable store, so a ref not useMemo);
//   - re-sync when a fresh `seed` prop arrives (router.refresh / poll tick):
//     reset local state via `onResync`, re-prime the queue to server truth, and
//     then re-overlay any status still in flight (queue.pending) so a re-sync
//     landing mid-PATCH doesn't flicker the row back to the stale seed;
//   - reconcile on settle (final server status) and on error (revert to last
//     confirmed status), both routed through the caller's `reconcile`.
// State shape is the caller's own (array of rows, a status map, …), so applying
// a status and resetting to the seed are delegated; only rows' `id`/`status`
// are needed here.

export interface StatusSeedRow {
  id: string;
  status: ChecklistStatus;
}

interface UseChecklistStatusQueueOptions<T extends StatusSeedRow> {
  /**
   * Server-truth rows. A new array *identity* triggers a re-sync, so this must
   * be a referentially-stable value — a prop straight from the server, not an
   * array constructed inline in render (e.g. `seed={items.map(...)}`), which
   * would change identity every render and spin the render-time re-sync into an
   * infinite loop. All callers today pass a prop directly.
   */
  seed: T[];
  /**
   * Apply a status to one row in the caller's local state. Called on settle, on
   * error (after the revert value is computed), and during a re-sync to overlay
   * an in-flight status. Should return prev unchanged when the row already holds
   * `status` so a server-confirms-current settle doesn't force a re-render.
   */
  reconcile: (id: string, status: ChecklistStatus) => void;
  /** Reset local state to the fresh seed. Runs on re-sync only, never on mount. */
  onResync: (seed: T[]) => void;
  /** A PATCH failed; `reconcile` has already reverted the row to server truth. */
  onError?: (id: string) => void;
}

export function useChecklistStatusQueue<T extends StatusSeedRow>({
  seed,
  reconcile,
  onResync,
  onError
}: UseChecklistStatusQueueOptions<T>): ChecklistStatusQueue {
  // Read callbacks through refs so the queue (created once) never fires a stale
  // closure — callers pass fresh closures every render.
  const reconcileRef = useRef(reconcile);
  const onErrorRef = useRef(onError);
  reconcileRef.current = reconcile;
  onErrorRef.current = onError;

  const queueRef = useRef<ChecklistStatusQueue | null>(null);
  if (queueRef.current === null) {
    queueRef.current = createChecklistStatusQueue({
      onSettled: (id, status) => reconcileRef.current(id, status),
      onError: (id, lastPersisted) => {
        reconcileRef.current(id, lastPersisted);
        onErrorRef.current?.(id);
      }
    });
    for (const row of seed) queueRef.current.prime(row.id, row.status);
  }
  const queue = queueRef.current;

  // Render-time re-sync (React's documented "adjust state on prop change"
  // pattern). Priming the queue here is safe — it's an external, non-React
  // store, not component state. The sentinel starts equal to `seed`, so this
  // runs only when a *new* seed array arrives, not on mount.
  const [prevSeed, setPrevSeed] = useState(seed);
  if (seed !== prevSeed) {
    setPrevSeed(seed);
    onResync(seed);
    for (const row of seed) queue.prime(row.id, row.status);
    // Re-overlay statuses still in flight: onResync just reset the row to the
    // (stale-or-fresh) seed value, but the queue is still driving it toward the
    // user's latest click — show that, not the seed, until the PATCH settles.
    for (const row of seed) {
      const inFlight = queue.pending(row.id);
      if (inFlight !== undefined && inFlight !== row.status) reconcile(row.id, inFlight);
    }
  }

  return queue;
}
