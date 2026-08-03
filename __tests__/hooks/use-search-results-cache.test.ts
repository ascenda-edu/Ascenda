/**
 * The module-level universities cache inside `use-search-results.ts`.
 *
 * ~2,900 rows are fetched once per browser session and shared by every mount of
 * the hook, deliberately outside the per-request AbortController: "a single
 * component unmounting must not poison it for everyone else." That makes it the
 * one piece of state in the file with a lifetime longer than a component, and
 * three properties have to hold for it to be safe:
 *
 *   1. a FAILED load must not be cached — the in-flight promise is nulled so the
 *      next mount retries. Caching the rejection would leave the search page
 *      permanently broken for the rest of the session after one network blip,
 *      with no further request to reveal why;
 *   2. concurrent mounts must SHARE the one in-flight request rather than race
 *      (two mounts of the results grid is the normal case, not the exotic one);
 *   3. once resolved, no further network at all.
 *
 * Jest's module registry is per-file, so these three tests run in declaration
 * order against a single fresh copy of the module: fail → shared retry → reuse.
 * That ordering IS the fixture. It is why this lives in its own file rather than
 * beside the behavioural suite, where any unrelated test would warm the cache
 * first and quietly turn all three assertions into tautologies.
 */

import { renderHook, waitFor, act } from '@testing-library/react';

import { useSearchResults } from '@/hooks/use-search-results';
import { getBrowserSupabaseClient } from '@/lib/supabase/client';
import { DEFAULT_FILTERS } from '@/lib/university-search/search-params';

jest.mock('@/lib/supabase/client');

interface Call {
  table: string;
  select: string;
  options: Record<string, unknown> | undefined;
}

type QueryResult = { data: unknown; error: unknown; count?: number | null };
type Responder = (call: Call) => Promise<QueryResult>;

const CHAIN_OPS = ['not', 'eq', 'in', 'gte', 'lte', 'or', 'ilike', 'order', 'range', 'limit'];

let calls: Call[] = [];
let respond: Responder;

const makeClient = () => ({
  from(table: string) {
    const call: Call = { table, select: '', options: undefined };
    calls.push(call);
    const builder: Record<string, any> = {};
    for (const op of CHAIN_OPS) builder[op] = () => builder;
    builder.select = (select: string, options?: Record<string, unknown>) => {
      call.select = select;
      call.options = options;
      return builder;
    };
    builder.abortSignal = () => builder;
    builder.then = (resolve: (v: QueryResult) => unknown, reject?: (r: unknown) => unknown) =>
      respond(call).then(resolve, reject);
    builder.maybeSingle = () => respond(call).then((r) => ({ data: null, error: r.error }));
    return builder;
  },
  // Signed out: keeps the fixture to the one thing under test.
  auth: { getSession: async () => ({ data: { session: null } }) },
});

const UNIS = [
  { id: 'u-1', name: 'Alpha University', country: 'UK', recognition_score: 9, rank_overall: 1 },
  { id: 'u-2', name: 'Beta University', country: 'UK', recognition_score: 4, rank_overall: 2 },
];

const PROGRAM_ROW = { id: 'p-1', course_name: 'Anthropology', university_id: 'u-1', universities: null };

const uniCalls = () => calls.filter((c) => c.table === 'universities');
const dataCalls = () =>
  calls.filter((c) => c.table === 'programs' && c.options?.head !== true && c.select.includes('universities'));

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

const servingPrograms: Responder = async (call) =>
  call.table === 'programs' && !call.options?.head
    ? { data: [PROGRAM_ROW], error: null }
    : { data: [], error: null, count: null };

let consoleError: jest.SpyInstance;

beforeEach(() => {
  calls = [];
  (getBrowserSupabaseClient as jest.Mock).mockReturnValue(makeClient());
  (globalThis as any).fetch = jest.fn(async () => ({ ok: false, json: async () => ({}) }));
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => consoleError.mockRestore());

describe('the module-level universities cache', () => {
  it('does not cache a failure', async () => {
    respond = async (call) =>
      call.table === 'universities'
        ? { data: null, error: { message: 'universities read failed' } }
        : servingPrograms(call);

    const { result, unmount } = renderHook(() => useSearchResults({ ...DEFAULT_FILTERS }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe('universities read failed');
    expect(uniCalls()).toHaveLength(1);
    // The whole page is gated on this list, so nothing downstream was attempted.
    expect(calls.some((c) => c.table === 'programs')).toBe(false);
    unmount();
    // The next test proves the retry: it would see zero universities calls (and
    // a repeat of this failure) if the rejected promise had been cached.
  });

  it('retries after that failure, and concurrent mounts share the one in-flight load', async () => {
    const gate = deferred<QueryResult>();
    calls = [];
    respond = async (call) => (call.table === 'universities' ? gate.promise : servingPrograms(call));

    const a = renderHook(() => useSearchResults({ ...DEFAULT_FILTERS }));
    const b = renderHook(() => useSearchResults({ ...DEFAULT_FILTERS }));
    await waitFor(() => expect(uniCalls()).toHaveLength(1));

    // Two mounts, ONE request. Neither has issued a programme query yet — both
    // are parked on the same promise.
    expect(dataCalls()).toHaveLength(0);

    await act(async () => {
      gate.resolve({ data: UNIS, error: null });
      await Promise.resolve();
    });
    await waitFor(() => expect(a.result.current.isLoading).toBe(false));
    await waitFor(() => expect(b.result.current.isLoading).toBe(false));

    expect(uniCalls()).toHaveLength(1);
    expect(a.result.current.error).toBeNull();
    expect(b.result.current.error).toBeNull();
    // Both mounts got the full list, not just whichever one issued the request.
    expect(a.result.current.results[0].universityName).toBe('Alpha University');
    expect(b.result.current.results[0].universityName).toBe('Alpha University');
    // The sharing is of the LIST only — each mount still runs its own query.
    expect(dataCalls()).toHaveLength(2);
    a.unmount();
    b.unmount();
  });

  it('serves every later mount from memory, with no further network', async () => {
    calls = [];
    respond = async (call) =>
      call.table === 'universities'
        ? { data: null, error: { message: 'should never be asked again' } }
        : servingPrograms(call);

    const { result, unmount } = renderHook(() => useSearchResults({ ...DEFAULT_FILTERS }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(uniCalls()).toHaveLength(0);
    expect(result.current.error).toBeNull();
    expect(result.current.results).toHaveLength(1);
    unmount();
  });
});
