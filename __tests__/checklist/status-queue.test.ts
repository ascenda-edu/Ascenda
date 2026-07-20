/**
 * @jest-environment ./jest.environment-node.js
 */

import {
  createChecklistStatusQueue,
  toggleDoneStatus,
  type ChecklistStatus,
} from '@/lib/applications/checklist-status-queue';

// Flush pending microtasks (and one macrotask tick). The queue chains several
// awaits per PATCH, so a single Promise.resolve() isn't enough to drain a loop
// iteration; setImmediate runs after all queued microtasks.
const flush = () => new Promise((r) => setImmediate(r));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const bodyOf = (call: [string, RequestInit]) =>
  JSON.parse(call[1].body as string) as { id: string; status: ChecklistStatus };

let fetchMock: jest.Mock;
let onSettled: jest.Mock;
let onError: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
  onSettled = jest.fn();
  onError = jest.fn();
});

const makeQueue = () => createChecklistStatusQueue({ onSettled, onError });

describe('createChecklistStatusQueue', () => {
  it('sends one PATCH for a single set(), fires onSettled, and coalesces a repeat', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const q = makeQueue();

    q.set('a', 'done');
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/checklist');
    expect(init.method).toBe('PATCH');
    expect(bodyOf(fetchMock.mock.calls[0])).toEqual({ id: 'a', status: 'done' });
    expect(onSettled).toHaveBeenCalledWith('a', 'done');
    expect(onSettled).toHaveBeenCalledTimes(1);

    // lastPersisted now 'done' — setting the same value sends nothing and
    // doesn't re-fire onSettled (nothing was written).
    q.set('a', 'done');
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('coalesces mid-flight sets to the LAST desired status; onSettled fires ONCE, at the end', async () => {
    const first = deferred<{ ok: boolean }>();
    const rest = deferred<{ ok: boolean }>();
    let n = 0;
    fetchMock.mockImplementation(() => {
      n += 1;
      return n === 1 ? first.promise : rest.promise;
    });
    const q = makeQueue();

    q.set('a', 'doing'); // PATCH #1 (in flight)
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // While #1 is in flight, two more clicks arrive; last desired = 'todo'.
    q.set('a', 'done');
    q.set('a', 'todo');

    first.resolve({ ok: true });
    await flush();

    // Exactly one more PATCH, carrying the LAST desired status — and the burst
    // hasn't settled yet, so onSettled must not have fired mid-burst (that
    // would flash an intermediate status onto the UI).
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(fetchMock.mock.calls[1])).toEqual({ id: 'a', status: 'todo' });
    expect(onSettled).not.toHaveBeenCalled();

    rest.resolve({ ok: true });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledWith('a', 'todo');
  });

  it('on a failed PATCH fires onError with the last confirmed status and does not retry', async () => {
    fetchMock.mockResolvedValue({ ok: false });
    const q = makeQueue();

    q.set('a', 'done');
    await flush();

    expect(onError).toHaveBeenCalledWith('a', 'todo'); // no prior confirm → 'todo'
    expect(onSettled).not.toHaveBeenCalled();
    // desired dropped, no retry
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reverts to the last SUCCESSFUL status, not the primed seed, after a later failure', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true }); // 'doing' succeeds
    fetchMock.mockResolvedValueOnce({ ok: false }); // 'done' fails
    const q = makeQueue();

    q.set('a', 'doing');
    await flush();
    expect(onSettled).toHaveBeenCalledWith('a', 'doing');

    q.set('a', 'done');
    await flush();
    expect(onError).toHaveBeenCalledWith('a', 'doing');
    // The failed burst wrote nothing, so onSettled fired only for the first.
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('prime() seeds the confirmed status so set() to the same value sends nothing', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const q = makeQueue();

    q.prime('a', 'done');
    q.set('a', 'done');
    await flush();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(onSettled).not.toHaveBeenCalled();
  });

  it('does not serialise independent tasks against each other', async () => {
    const dA = deferred<{ ok: boolean }>();
    const dB = deferred<{ ok: boolean }>();
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      const { id } = JSON.parse(init.body as string);
      return id === 'a' ? dA.promise : dB.promise;
    });
    const q = makeQueue();

    q.set('a', 'done');
    q.set('b', 'doing');
    await flush();

    // Both PATCHes are in flight concurrently — neither has resolved yet.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const ids = fetchMock.mock.calls.map((c) => bodyOf(c as [string, RequestInit]).id).sort();
    expect(ids).toEqual(['a', 'b']);

    dA.resolve({ ok: true });
    dB.resolve({ ok: true });
    await flush();
    expect(onSettled).toHaveBeenCalledWith('a', 'done');
    expect(onSettled).toHaveBeenCalledWith('b', 'doing');
  });

  it('pending() reports the in-flight target and clears once settled', async () => {
    const d = deferred<{ ok: boolean }>();
    fetchMock.mockReturnValue(d.promise);
    const q = makeQueue();

    expect(q.pending('a')).toBeUndefined();
    q.set('a', 'done');
    // Desired is recorded synchronously, before the PATCH resolves — this is
    // what lets a seed re-sync re-overlay the optimistic status.
    expect(q.pending('a')).toBe('done');

    d.resolve({ ok: true });
    await flush();
    expect(q.pending('a')).toBeUndefined();
  });

  it('pending() tracks the LATEST coalesced target through a two-PATCH burst', async () => {
    const first = deferred<{ ok: boolean }>();
    const rest = deferred<{ ok: boolean }>();
    let n = 0;
    fetchMock.mockImplementation(() => (++n === 1 ? first.promise : rest.promise));
    const q = makeQueue();

    q.set('a', 'doing');
    await flush();
    q.set('a', 'done');
    q.set('a', 'todo');
    expect(q.pending('a')).toBe('todo');

    first.resolve({ ok: true });
    await flush();
    expect(q.pending('a')).toBe('todo'); // still driving toward the last target

    rest.resolve({ ok: true });
    await flush();
    expect(q.pending('a')).toBeUndefined();
  });
});

describe('toggleDoneStatus', () => {
  it('todo → done, storing no restore hint', () => {
    const hints = new Map<string, ChecklistStatus>();
    expect(toggleDoneStatus('todo', 'a', hints)).toBe('done');
    expect(hints.has('a')).toBe(false);
  });

  it("doing → done, remembering 'doing' to restore on un-check", () => {
    const hints = new Map<string, ChecklistStatus>();
    expect(toggleDoneStatus('doing', 'a', hints)).toBe('done');
    expect(hints.get('a')).toBe('doing');
  });

  it("done → restores the remembered 'doing' and clears the hint", () => {
    const hints = new Map<string, ChecklistStatus>([['a', 'doing']]);
    expect(toggleDoneStatus('done', 'a', hints)).toBe('doing');
    expect(hints.has('a')).toBe(false);
  });

  it("done → todo when nothing was remembered (e.g. after a reload / re-sync)", () => {
    const hints = new Map<string, ChecklistStatus>();
    expect(toggleDoneStatus('done', 'a', hints)).toBe('todo');
  });
});
