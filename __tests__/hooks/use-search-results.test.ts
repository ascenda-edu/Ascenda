/**
 * `useSearchResults` — the 1,000-line hand-rolled request machine behind the
 * live search page. Nine `useState`, six `useRef`, a `requestId` counter driving
 * two coupled effects, a manual `AbortController`, offset AND cohort pagination,
 * a module-level promise cache, and a fit sort applied after the page lands.
 *
 * These tests pin the behaviours that are expensive to get wrong and invisible
 * when they break:
 *
 *   1. abort-on-supersede — the newest query must win, and a slow stale response
 *      (or a stale *rejection*) must not overwrite it or raise an error banner;
 *   2. pagination — appended pages must not duplicate or skip rows, and the
 *      `.order('id')` unique tiebreaker must be on EVERY page of EVERY path;
 *   3. the PostgREST gotchas this file's own comments document: `.or()` must
 *      never carry user text, university names must never reach a filter string,
 *      the count query must describe the same set as the data query;
 *   4. what the hook exposes when a fetch fails.
 *
 * The universities cache is module-level and deliberately survives unmounts, so
 * its behaviour is pinned separately in use-search-results-cache.test.ts — a
 * file boundary is the only reliable module-registry boundary in Jest. Here the
 * cache simply warms on the first test and stays warm; every responder still
 * answers the `universities` query, so no test depends on that.
 *
 * `sortByFit` itself is covered in __tests__/matching/fit-sort.test.ts; what is
 * covered here is *whether the hook applies it*, which is a different question.
 */

import { renderHook, waitFor, act } from '@testing-library/react';

import { useSearchResults } from '@/hooks/use-search-results';
import { getBrowserSupabaseClient } from '@/lib/supabase/client';
import { DEFAULT_FILTERS, type SearchFilters } from '@/lib/university-search/search-params';

jest.mock('@/lib/supabase/client');

/* ── the Supabase double ─────────────────────────────────────────────────────
 * Records every call: table, select string, select options, the ordered list of
 * PostgREST operators applied, and the AbortSignal handed to `.abortSignal()`.
 * A test's `respond` decides what each call resolves to.
 */

interface Call {
  table: string;
  select: string;
  options: Record<string, unknown> | undefined;
  ops: Array<{ name: string; args: any[] }>;
  signal: AbortSignal | null;
}

type QueryResult = { data: unknown; error: unknown; count?: number | null };
type Responder = (call: Call) => Promise<QueryResult>;

const CHAIN_OPS = ['not', 'eq', 'in', 'gte', 'lte', 'or', 'ilike', 'order', 'range', 'limit'];

let calls: Call[] = [];
let respond: Responder;
let session: { user: { id: string } } | null;

const makeClient = () => ({
  from(table: string) {
    const call: Call = { table, select: '', options: undefined, ops: [], signal: null };
    calls.push(call);
    const builder: Record<string, any> = {};
    for (const op of CHAIN_OPS) {
      builder[op] = (...args: any[]) => {
        call.ops.push({ name: op, args });
        return builder;
      };
    }
    builder.select = (select: string, options?: Record<string, unknown>) => {
      call.select = select;
      call.options = options;
      return builder;
    };
    builder.abortSignal = (signal: AbortSignal) => {
      call.signal = signal;
      return builder;
    };
    builder.then = (resolve: (v: QueryResult) => unknown, reject?: (r: unknown) => unknown) =>
      respond(call).then(resolve, reject);
    builder.maybeSingle = () =>
      respond(call).then((r) => ({
        data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data,
        error: r.error,
      }));
    return builder;
  },
  auth: { getSession: async () => ({ data: { session } }) },
});

/* ── query introspection helpers ─────────────────────────────────────────── */

const programCalls = () => calls.filter((c) => c.table === 'programs');
/** The paged data query — not the head/count query, not the drill-down label lookup. */
const dataCalls = () =>
  programCalls().filter((c) => c.options?.head !== true && c.select.includes('universities'));
const countCalls = () => programCalls().filter((c) => c.options?.head === true);
const opsNamed = (call: Call, name: string): any[][] =>
  call.ops.filter((o) => o.name === name).map((o) => o.args);
const hasOp = (call: Call, name: string, ...args: any[]) =>
  opsNamed(call, name).some((a) => JSON.stringify(a) === JSON.stringify(args));
const uniIdsOf = (call: Call): string[] | undefined =>
  opsNamed(call, 'in').find((a) => a[0] === 'university_id')?.[1];

/* ── fixtures ────────────────────────────────────────────────────────────── */

type Uni = {
  id: string;
  name: string;
  country: string | null;
  recognition_score: number | null;
  rank_overall: number | null;
};

const NAMED_UNIS: Uni[] = [
  { id: 'u-oxford', name: 'University of Oxford', country: 'UK', recognition_score: 10, rank_overall: 1 },
  { id: 'u-imperial', name: 'Imperial College London', country: 'UK', recognition_score: 9, rank_overall: 6 },
  { id: 'u-nowhere', name: 'Nowhere State College', country: 'US', recognition_score: 2, rank_overall: null },
  // Three unranked Canadians, deliberately out of the expected order: they pin
  // the "unranked cohorts trail the ranked ones, recognition desc then name asc"
  // rule that stops a ranking sort silently dropping unranked universities.
  { id: 'u-ca-beta', name: 'Beta Institute', country: 'CA', recognition_score: null, rank_overall: null },
  { id: 'u-ca-alpha', name: 'Alpha Institute', country: 'CA', recognition_score: null, rank_overall: null },
  { id: 'u-ca-zeta', name: 'Zeta Institute', country: 'CA', recognition_score: 7, rank_overall: null },
];
// 250 German universities: enough to push the facet path past the 200-id
// threshold and onto the embedded !inner join.
const FILLER_UNIS: Uni[] = Array.from({ length: 250 }, (_, i) => ({
  id: `u-de-${String(i).padStart(3, '0')}`,
  name: `Technische Hochschule ${i}`,
  country: 'DE',
  recognition_score: 5,
  rank_overall: 100 + i,
}));
const UNIS: Uni[] = [...NAMED_UNIS, ...FILLER_UNIS];

const progRow = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  course_name: `Course ${id}`,
  university_id: 'u-imperial',
  universities: { id: 'u-imperial', name: 'Imperial College London', country: 'UK', city: 'London' },
  ...extra,
});

/** Rows p-000 … p-0NN. Zero-padded so id order and numeric order agree. */
const pageOf = (count: number, start = 0) =>
  Array.from({ length: count }, (_, i) => progRow(`p-${String(start + i).padStart(3, '0')}`));

const ids = (rows: Array<{ id: string }>) => rows.map((r) => r.id);

const F = (overrides: Partial<SearchFilters> = {}): SearchFilters => ({
  ...DEFAULT_FILTERS,
  ...overrides,
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

/** Serves `pages[n]` for the nth paged data query; empty for everything else. */
const servePages = (pages: unknown[][], count: number | null = 500): Responder => {
  let pageIndex = 0;
  return async (call) => {
    if (call.table === 'universities') return { data: UNIS, error: null };
    if (call.table === 'student_matches') return { data: [], error: null };
    if (call.table === 'programs') {
      if (call.options?.head) return { data: null, error: null, count };
      if (!call.select.includes('universities')) {
        return { data: [{ course_name: 'Drill Programme' }], error: null };
      }
      return { data: pages[pageIndex++] ?? [], error: null };
    }
    return { data: [], error: null };
  };
};

let fetchMock: jest.Mock;
let consoleError: jest.SpyInstance;

beforeEach(() => {
  calls = [];
  session = { user: { id: 'user-1' } };
  respond = servePages([[]]);
  (getBrowserSupabaseClient as jest.Mock).mockReturnValue(makeClient());
  // /api/match/score — scores every id it is asked for, so the hook's
  // session-level on-demand cache can be observed.
  fetchMock = jest.fn(async (_url: string, init: { body: string }) => {
    const { programIds } = JSON.parse(init.body) as { programIds: string[] };
    return {
      ok: true,
      json: async () => ({ scores: Object.fromEntries(programIds.map((id, i) => [id, 50 + (i % 40)])) }),
    };
  });
  (globalThis as any).fetch = fetchMock;
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

const settled = async (result: { current: { isLoading: boolean } }) => {
  await waitFor(() => expect(result.current.isLoading).toBe(false));
};

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. Abort on supersede — the single most valuable behaviour in this file.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('abort on supersede', () => {
  it('the newest query wins, and the slow stale response never overwrites it', async () => {
    const slow = deferred<QueryResult>();
    let dataQuery = 0;
    let headQuery = 0;
    respond = async (call) => {
      if (call.table === 'universities') return { data: UNIS, error: null };
      if (call.table === 'student_matches') return { data: [], error: null };
      if (call.table === 'programs' && call.options?.head) {
        headQuery += 1;
        return { data: null, error: null, count: headQuery === 1 ? 111 : 999 };
      }
      if (call.table === 'programs') {
        dataQuery += 1;
        if (dataQuery === 1) return slow.promise; // the request about to be superseded
        return { data: pageOf(3, 100), error: null }; // the winner
      }
      return { data: [], error: null };
    };

    const { result, rerender } = renderHook((filters: SearchFilters) => useSearchResults(filters), {
      initialProps: F({ subjects: ['Physics'], sort: 'name' }),
    });
    await waitFor(() => expect(dataQuery).toBe(1));
    expect(result.current.results).toHaveLength(0);

    // Supersede it before it lands.
    rerender(F({ subjects: ['Chemistry'], sort: 'name' }));
    await waitFor(() => expect(result.current.results).toHaveLength(3));
    expect(ids(result.current.results)).toEqual(['p-100', 'p-101', 'p-102']);

    // The abandoned request is signalled, and its late answer is discarded.
    expect(dataCalls()[0].signal?.aborted).toBe(true);
    await act(async () => {
      slow.resolve({ data: pageOf(5, 0), error: null });
      await Promise.resolve();
    });

    expect(ids(result.current.results)).toEqual(['p-100', 'p-101', 'p-102']);
    expect(result.current.totalCount).toBe(999);
    expect(result.current.isLoading).toBe(false);
  });

  it('a stale request that REJECTS after being superseded raises no error banner', async () => {
    // The catch block's `if (signal.aborted) return` is the only thing standing
    // between a cancelled request and a user-visible "Something went wrong".
    const slow = deferred<QueryResult>();
    let dataQuery = 0;
    respond = async (call) => {
      if (call.table === 'universities') return { data: UNIS, error: null };
      if (call.table === 'student_matches') return { data: [], error: null };
      if (call.table === 'programs' && call.options?.head) return { data: null, error: null, count: 1 };
      if (call.table === 'programs') {
        dataQuery += 1;
        return dataQuery === 1 ? slow.promise : { data: pageOf(2, 200), error: null };
      }
      return { data: [], error: null };
    };

    const { result, rerender } = renderHook((filters: SearchFilters) => useSearchResults(filters), {
      initialProps: F({ q: 'first' }),
    });
    await waitFor(() => expect(dataQuery).toBe(1));
    rerender(F({ q: 'second' }));
    await waitFor(() => expect(result.current.results).toHaveLength(2));

    await act(async () => {
      slow.reject(new Error('AbortError: signal is aborted without reason'));
      await Promise.resolve();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.results).toHaveLength(2);
    expect(result.current.isLoading).toBe(false);
  });

  it('unmounting aborts the in-flight request', async () => {
    const slow = deferred<QueryResult>();
    respond = async (call) => {
      if (call.table === 'universities') return { data: UNIS, error: null };
      if (call.table === 'programs' && call.options?.head) return { data: null, error: null, count: null };
      if (call.table === 'programs' && call.select.includes('universities')) return slow.promise;
      return { data: [], error: null };
    };

    const { unmount } = renderHook(() => useSearchResults(F()));
    await waitFor(() => expect(dataCalls()).toHaveLength(1));
    const call = dataCalls()[0];
    expect(call.signal?.aborted).toBe(false);

    unmount();
    expect(call.signal?.aborted).toBe(true);

    // Resolving after unmount must not throw or update anything.
    await act(async () => {
      slow.resolve({ data: pageOf(1), error: null });
      await Promise.resolve();
    });
  });

  it('every query in one request shares a single signal, so one abort cancels all of them', async () => {
    respond = servePages([pageOf(2)]);
    const { result } = renderHook(() => useSearchResults(F({ programId: 'prog-1' })));
    await settled(result);

    const scoped = calls.filter((c) => c.signal !== null);
    // drill-down label + data page + count + student_matches.
    expect(scoped.length).toBeGreaterThanOrEqual(3);
    expect(new Set(scoped.map((c) => c.signal)).size).toBe(1);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. Offset pagination.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('offset pagination', () => {
  it('walks 50-row range windows and appends without duplicating or skipping', async () => {
    respond = servePages([pageOf(50, 0), pageOf(50, 50), pageOf(20, 100)]);
    const { result } = renderHook(() => useSearchResults(F({ sort: 'name' })));
    await settled(result);
    expect(result.current.results).toHaveLength(50);
    expect(result.current.hasMore).toBe(true);

    await act(async () => result.current.loadMore());
    await waitFor(() => expect(result.current.results).toHaveLength(100));
    await act(async () => result.current.loadMore());
    await waitFor(() => expect(result.current.results).toHaveLength(120));

    const seen = ids(result.current.results);
    expect(new Set(seen).size).toBe(120);
    expect(seen).toEqual(ids(pageOf(120, 0))); // no gaps, no reordering
    expect(result.current.hasMore).toBe(false);
    expect(dataCalls().map((c) => opsNamed(c, 'range')[0])).toEqual([
      [0, 49],
      [50, 99],
      [100, 149],
    ]);
  });

  it('dedupes a row the server repeats across a page boundary', async () => {
    // Offset pagination over a non-unique order is exactly how a row shows up
    // twice; commitPage's seen-set is the backstop.
    respond = servePages([pageOf(50, 0), [progRow('p-049'), ...pageOf(20, 50)]]);
    const { result } = renderHook(() => useSearchResults(F({ sort: 'name' })));
    await settled(result);
    await act(async () => result.current.loadMore());
    await waitFor(() => expect(result.current.results).toHaveLength(70));

    const seen = ids(result.current.results);
    expect(seen.filter((id) => id === 'p-049')).toHaveLength(1);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toHaveLength(70);
  });

  it('puts the unique `id` tiebreaker last on every page of every sort', async () => {
    // Without a fully-unique order, Postgres OFFSET may skip or duplicate rows
    // between pages whenever the sort key ties.
    for (const sort of ['fit', 'name', 'tuition-asc', 'tuition-desc'] as const) {
      calls = [];
      respond = servePages([pageOf(50, 0), pageOf(10, 50)]);
      const { result, unmount } = renderHook(() => useSearchResults(F({ sort })));
      await settled(result);
      await act(async () => result.current.loadMore());
      await waitFor(() => expect(result.current.hasMore).toBe(false));

      expect(dataCalls()).toHaveLength(2);
      for (const call of dataCalls()) {
        const orders = opsNamed(call, 'order');
        expect(orders[orders.length - 1]).toEqual(['id', { ascending: true }]);
      }
      unmount();
    }
  });

  it('never reshuffles pages the user has already read', async () => {
    // Fit ordering is per-page by design. A globally re-sorted merge would move
    // rows out from under the reader on every "load more".
    respond = servePages([pageOf(50, 0), pageOf(50, 50)]);
    const { result } = renderHook(() => useSearchResults(F({ sort: 'fit' })));
    await settled(result);
    const firstPage = ids(result.current.results);

    await act(async () => result.current.loadMore());
    await waitFor(() => expect(result.current.results).toHaveLength(100));
    expect(ids(result.current.results).slice(0, 50)).toEqual(firstPage);
  });

  it('derives hasMore from the RAW page size, not from what survives visibility filtering', async () => {
    // A full page of 50 with one metadata-flagged row still means "there is
    // more"; deriving hasMore from the mapped length would end the list early.
    const page = pageOf(50, 0);
    page[0] = progRow('p-000', { metadata: { visibility: 'demo' } });
    respond = servePages([page]);
    const { result } = renderHook(() => useSearchResults(F()));
    await settled(result);

    expect(result.current.results).toHaveLength(49);
    expect(ids(result.current.results)).not.toContain('p-000');
    expect(result.current.hasMore).toBe(true);
  });

  it('loadMore is a no-op once the list is exhausted', async () => {
    respond = servePages([pageOf(10, 0)]);
    const { result } = renderHook(() => useSearchResults(F()));
    await settled(result);
    expect(result.current.hasMore).toBe(false);

    await act(async () => result.current.loadMore());
    expect(dataCalls()).toHaveLength(1);
  });

  it('loadMore is a no-op while a request is already in flight', async () => {
    const slow = deferred<QueryResult>();
    respond = async (call) => {
      if (call.table === 'universities') return { data: UNIS, error: null };
      if (call.table === 'programs' && call.options?.head) return { data: null, error: null, count: null };
      if (call.table === 'programs' && call.select.includes('universities')) return slow.promise;
      return { data: [], error: null };
    };
    const { result } = renderHook(() => useSearchResults(F()));
    await waitFor(() => expect(dataCalls()).toHaveLength(1));

    await act(async () => result.current.loadMore());
    expect(dataCalls()).toHaveLength(1);

    await act(async () => {
      slow.resolve({ data: pageOf(50), error: null });
      await Promise.resolve();
    });
  });

  it('restarts at page 0 and discards the previous rows when the filters change', async () => {
    respond = servePages([pageOf(50, 0), pageOf(50, 50), pageOf(3, 900)]);
    const { result, rerender } = renderHook((f: SearchFilters) => useSearchResults(f), {
      initialProps: F({ sort: 'name' }),
    });
    await settled(result);
    await act(async () => result.current.loadMore());
    await waitFor(() => expect(result.current.results).toHaveLength(100));

    rerender(F({ sort: 'name', q: 'oxford' }));
    await waitFor(() => expect(result.current.results).toHaveLength(3));
    expect(opsNamed(dataCalls()[2], 'range')[0]).toEqual([0, 49]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. Filters → query shape, and the PostgREST gotchas.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('filters map onto the query', () => {
  it('resolves a free-text university name to ids — it never reaches a filter string', async () => {
    // `.or()` with spaces in an ilike value crashes PostgREST's parser. The
    // regression is silent until someone searches a two-word university.
    respond = servePages([pageOf(2)]);
    const { result } = renderHook(() => useSearchResults(F({ q: 'Imperial College London' })));
    await settled(result);

    const call = dataCalls()[0];
    expect(uniIdsOf(call)).toEqual(['u-imperial']);
    for (const [value] of opsNamed(call, 'or')) {
      expect(String(value)).not.toMatch(/[\s"'()]/);
    }
    for (const [, pattern] of opsNamed(call, 'ilike')) {
      expect(String(pattern).toLowerCase()).not.toContain('imperial');
    }
  });

  it('narrows by the leftover course words that do not restate the university name', async () => {
    respond = servePages([pageOf(2)]);
    const { result } = renderHook(() => useSearchResults(F({ q: 'oxford economics' })));
    await settled(result);

    const call = dataCalls()[0];
    expect(uniIdsOf(call)).toEqual(['u-oxford']);
    expect(opsNamed(call, 'ilike')).toEqual([['course_name', '%economics%']]);
  });

  it('falls back to a course-name search when no university matches', async () => {
    respond = servePages([pageOf(2)]);
    const { result } = renderHook(() => useSearchResults(F({ q: 'marine biology' })));
    await settled(result);

    const call = dataCalls()[0];
    expect(opsNamed(call, 'ilike')).toEqual([
      ['course_name', '%marine%'],
      ['course_name', '%biology%'],
    ]);
    expect(uniIdsOf(call)).toBeUndefined();
  });

  it('never lets a raw query reach `.or()`, whatever the filter combination', async () => {
    const hostile = "St. Mary's (100%) College_of Art, Ltd";
    const combos: Array<Partial<SearchFilters>> = [
      { q: hostile },
      { q: hostile, testOptional: true },
      { q: hostile, countries: ['UK'], testOptional: true },
      { q: hostile, ranking: 'topTier', testOptional: true, sort: 'name' },
    ];
    for (const combo of combos) {
      calls = [];
      respond = servePages([pageOf(1)]);
      const { result, unmount } = renderHook(() => useSearchResults(F(combo)));
      await settled(result);
      for (const call of programCalls()) {
        for (const [value] of opsNamed(call, 'or')) {
          // Fixed literals only: identifiers, dots and commas. No spaces, no
          // quotes, no parentheses — nothing PostgREST's parser can choke on.
          expect(String(value)).toMatch(/^[a-zA-Z_.,]+$/);
        }
      }
      unmount();
    }
  });

  it('applies test-optional as a fixed program-side literal, not a university facet', async () => {
    respond = servePages([pageOf(1)]);
    const { result } = renderHook(() => useSearchResults(F({ testOptional: true })));
    await settled(result);

    expect(opsNamed(dataCalls()[0], 'or')).toEqual([
      ['admission_test.is.null,admission_test.neq.Required'],
    ]);
    // It must NOT narrow the university set: universities.requires_test is false
    // for every row, so the old uni-side filter was inert and hid the bug.
    expect(uniIdsOf(dataCalls()[0])).toBeUndefined();
  });

  it('takes the id list for a small facet set and the embedded !inner join for a broad one', async () => {
    respond = servePages([pageOf(1)]);
    const narrow = renderHook(() => useSearchResults(F({ countries: ['US'] })));
    await settled(narrow.result);
    expect(uniIdsOf(dataCalls()[0])).toEqual(['u-nowhere']);
    expect(dataCalls()[0].select).toContain('universities!left');
    narrow.unmount();

    calls = [];
    respond = servePages([pageOf(1)]);
    const broad = renderHook(() => useSearchResults(F({ countries: ['DE'] })));
    await settled(broad.result);
    const call = dataCalls()[0];
    expect(call.select).toContain('universities!inner');
    expect(hasOp(call, 'in', 'universities.country', ['DE'])).toBe(true);
    expect(uniIdsOf(call)).toBeUndefined();
    broad.unmount();
  });

  it('maps the ranking band onto recognition_score', async () => {
    respond = servePages([pageOf(1)]);
    const { result } = renderHook(() => useSearchResults(F({ ranking: 'topTier' })));
    await settled(result);
    // recognition_score >= 8: Oxford (10) and Imperial (9) only.
    expect(uniIdsOf(dataCalls()[0])).toEqual(['u-oxford', 'u-imperial']);
  });

  it('short-circuits to zero results without touching the database when nothing can match', async () => {
    respond = servePages([pageOf(50)]);
    const { result } = renderHook(() => useSearchResults(F({ countries: ['ZZ'] })));
    await settled(result);

    expect(programCalls()).toHaveLength(0);
    expect(result.current.results).toEqual([]);
    expect(result.current.totalCount).toBe(0);
    expect(result.current.hasMore).toBe(false);
  });

  it('passes the programme-side facets straight through', async () => {
    respond = servePages([pageOf(1)]);
    const { result } = renderHook(() =>
      useSearchResults(
        F({ subjects: ['Engineering'], levels: ['Bachelor'], tuitionMin: 5000, tuitionMax: 30000 })
      )
    );
    await settled(result);

    const call = dataCalls()[0];
    expect(hasOp(call, 'in', 'field', ['Engineering'])).toBe(true);
    expect(hasOp(call, 'in', 'study_level', ['Bachelor'])).toBe(true);
    expect(hasOp(call, 'gte', 'yearly_international_tuition_fee_gbp', 5000)).toBe(true);
    expect(hasOp(call, 'lte', 'yearly_international_tuition_fee_gbp', 30000)).toBe(true);
  });

  it('resolves the drill-down chips and constrains the query to them', async () => {
    respond = servePages([pageOf(1)]);
    const { result } = renderHook(() =>
      useSearchResults(F({ programId: 'prog-9', universityId: 'u-oxford' }))
    );
    await settled(result);

    expect(result.current.programLabel).toBe('Drill Programme');
    expect(result.current.universityLabel).toBe('University of Oxford');
    const call = dataCalls()[0];
    expect(hasOp(call, 'eq', 'id', 'prog-9')).toBe(true);
    expect(hasOp(call, 'eq', 'university_id', 'u-oxford')).toBe(true);
  });

  it('suppresses free-text resolution entirely while a drill-down is active', async () => {
    respond = servePages([pageOf(1)]);
    const { result } = renderHook(() =>
      useSearchResults(F({ q: 'oxford economics', universityId: 'u-imperial' }))
    );
    await settled(result);

    const call = dataCalls()[0];
    expect(opsNamed(call, 'ilike')).toEqual([]);
    expect(hasOp(call, 'eq', 'university_id', 'u-imperial')).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 4. Sorting.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('sorting', () => {
  it('the "fit" sort actually sorts by fit, not by primary key', async () => {
    // The bug this replaces: `case 'fit'` fell through to `default: break`, so
    // the only ordering ever applied was `.order('id')`.
    respond = async (call) => {
      if (call.table === 'universities') return { data: UNIS, error: null };
      if (call.table === 'student_matches') {
        return {
          data: [
            { program_id: 'p-000', score: 12 },
            { program_id: 'p-001', score: 91 },
            { program_id: 'p-002', score: 55 },
          ],
          error: null,
        };
      }
      if (call.table === 'programs' && call.options?.head) return { data: null, error: null, count: 3 };
      if (call.table === 'programs') return { data: pageOf(3, 0), error: null };
      return { data: [], error: null };
    };
    const { result } = renderHook(() => useSearchResults(F({ sort: 'fit' })));
    await settled(result);

    expect(ids(result.current.results)).toEqual(['p-001', 'p-002', 'p-000']);
    expect(result.current.results.map((r) => r.fitScore)).toEqual([91, 55, 12]);
    // …and no DB order beyond the id tiebreaker: fit has no column to order on.
    expect(opsNamed(dataCalls()[0], 'order')).toEqual([['id', { ascending: true }]]);
  });

  it('does NOT reorder the other sorts — there the server order is the answer', async () => {
    respond = async (call) => {
      if (call.table === 'universities') return { data: UNIS, error: null };
      if (call.table === 'student_matches') {
        return {
          data: [
            { program_id: 'p-000', score: 12 },
            { program_id: 'p-001', score: 91 },
          ],
          error: null,
        };
      }
      if (call.table === 'programs' && call.options?.head) return { data: null, error: null, count: 2 };
      if (call.table === 'programs') return { data: pageOf(2, 0), error: null };
      return { data: [], error: null };
    };
    const { result } = renderHook(() => useSearchResults(F({ sort: 'name' })));
    await settled(result);

    expect(ids(result.current.results)).toEqual(['p-000', 'p-001']);
    expect(opsNamed(dataCalls()[0], 'order')).toEqual([
      ['course_name', { ascending: true }],
      ['id', { ascending: true }],
    ]);
  });

  it('carries the tuition-desc not-null guard into BOTH the data and the count query', async () => {
    // Without the guard the backward index scan can't be used and the query
    // times out; applying it to only one of the pair makes the count describe a
    // different set from the rows.
    respond = servePages([pageOf(1)]);
    const { result } = renderHook(() => useSearchResults(F({ sort: 'tuition-desc' })));
    await settled(result);

    expect(hasOp(dataCalls()[0], 'not', 'yearly_international_tuition_fee_gbp', 'is', null)).toBe(true);
    expect(countCalls()).toHaveLength(1);
    expect(hasOp(countCalls()[0], 'not', 'yearly_international_tuition_fee_gbp', 'is', null)).toBe(true);
  });

  it('orders tuition-asc with nulls last', async () => {
    respond = servePages([pageOf(1)]);
    const { result } = renderHook(() => useSearchResults(F({ sort: 'tuition-asc' })));
    await settled(result);
    expect(opsNamed(dataCalls()[0], 'order')[0]).toEqual([
      'yearly_international_tuition_fee_gbp',
      { ascending: true, nullsFirst: false },
    ]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 5. Ranking — the cohort walk.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('ranking cohort pagination', () => {
  it('pages through universities in rank order, eight at a time', async () => {
    respond = servePages([pageOf(50, 0), pageOf(10, 50), pageOf(5, 60)]);
    const { result } = renderHook(() => useSearchResults(F({ sort: 'ranking' })));
    await settled(result);

    const first = dataCalls()[0];
    const batch = uniIdsOf(first)!;
    expect(batch).toHaveLength(8);
    // rank_overall ascending: Oxford (1), Imperial (6), then the fillers (100…).
    expect(batch.slice(0, 3)).toEqual(['u-oxford', 'u-imperial', 'u-de-000']);
    expect(opsNamed(first, 'order')).toEqual([
      ['course_name', { ascending: true }],
      ['id', { ascending: true }],
    ]);
    expect(opsNamed(first, 'range')[0]).toEqual([0, 49]);
    // Cohort pagination has no single filtered count.
    expect(result.current.totalCount).toBeNull();
    expect(countCalls()).toHaveLength(0);

    // A full page keeps walking WITHIN the same cohort…
    await act(async () => result.current.loadMore());
    await waitFor(() => expect(result.current.results).toHaveLength(60));
    expect(uniIdsOf(dataCalls()[1])).toEqual(batch);
    expect(opsNamed(dataCalls()[1], 'range')[0]).toEqual([50, 99]);

    // …and a short page advances to the NEXT cohort at offset 0.
    await act(async () => result.current.loadMore());
    await waitFor(() => expect(result.current.results).toHaveLength(65));
    const nextBatch = uniIdsOf(dataCalls()[2])!;
    expect(nextBatch).toHaveLength(8);
    expect(nextBatch).not.toEqual(batch);
    expect(opsNamed(dataCalls()[2], 'range')[0]).toEqual([0, 49]);
  });

  it('includes unranked universities, ordered recognition-desc then name-asc', async () => {
    // A ranking sort that only visited ranked universities would silently hide
    // every unranked one from the results.
    respond = servePages([pageOf(5)]);
    const { result } = renderHook(() => useSearchResults(F({ sort: 'ranking', countries: ['CA'] })));
    await settled(result);

    expect(uniIdsOf(dataCalls()[0])).toEqual(['u-ca-zeta', 'u-ca-alpha', 'u-ca-beta']);
  });

  it('scopes the cohort walk to the active facet', async () => {
    respond = servePages([pageOf(5)]);
    const { result } = renderHook(() => useSearchResults(F({ sort: 'ranking', ranking: 'topTier' })));
    await settled(result);
    expect(uniIdsOf(dataCalls()[0])).toEqual(['u-oxford', 'u-imperial']);
  });

  it('falls back to offset paging when free text is active', async () => {
    respond = servePages([pageOf(5)]);
    const { result } = renderHook(() => useSearchResults(F({ sort: 'ranking', q: 'oxford' })));
    await settled(result);

    const call = dataCalls()[0];
    expect(opsNamed(call, 'range')[0]).toEqual([0, 49]);
    expect(uniIdsOf(call)).toEqual(['u-oxford']);
    expect(opsNamed(call, 'order')).toEqual([['id', { ascending: true }]]);
    expect(countCalls()).toHaveLength(0); // the count is skipped for the fallback
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 6. The best-effort count.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('the best-effort count', () => {
  it('is a separate head query, fired only for the first page', async () => {
    respond = servePages([pageOf(50, 0), pageOf(50, 50)], 1234);
    const { result } = renderHook(() => useSearchResults(F()));
    await settled(result);
    expect(result.current.totalCount).toBe(1234);
    expect(countCalls()).toHaveLength(1);
    expect(countCalls()[0].select).toBe('id');
    expect(countCalls()[0].options).toEqual({ head: true, count: 'exact' });

    await act(async () => result.current.loadMore());
    await waitFor(() => expect(result.current.results).toHaveLength(100));
    expect(countCalls()).toHaveLength(1);
  });

  it('is skipped when free text is active — ilike counts time out', async () => {
    respond = servePages([pageOf(5)]);
    const { result } = renderHook(() => useSearchResults(F({ q: 'marine biology' })));
    await settled(result);
    expect(countCalls()).toHaveLength(0);
    expect(result.current.totalCount).toBeNull();
  });

  it('degrades to null rather than failing the page', async () => {
    respond = async (call) => {
      if (call.table === 'universities') return { data: UNIS, error: null };
      if (call.table === 'programs' && call.options?.head) {
        return { data: null, error: { message: 'statement timeout' }, count: null };
      }
      if (call.table === 'programs') return { data: pageOf(5), error: null };
      return { data: [], error: null };
    };
    const { result } = renderHook(() => useSearchResults(F()));
    await settled(result);

    expect(result.current.totalCount).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.results).toHaveLength(5);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 7. Fit scores.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('fit scores', () => {
  it('asks /api/match/score only for ids nothing else has scored yet', async () => {
    respond = async (call) => {
      if (call.table === 'universities') return { data: UNIS, error: null };
      if (call.table === 'student_matches') return { data: [{ program_id: 'p-000', score: 88 }], error: null };
      if (call.table === 'programs' && call.options?.head) return { data: null, error: null, count: 3 };
      if (call.table === 'programs') return { data: pageOf(50, 0), error: null };
      return { data: [], error: null };
    };
    const { result } = renderHook(() => useSearchResults(F()));
    await settled(result);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body) as { programIds: string[] };
    // p-000 is already cached in student_matches, so it is not re-scored.
    expect(firstBody.programIds).not.toContain('p-000');
    expect(firstBody.programIds).toHaveLength(49);

    // A later page that repeats an already-scored id must not re-ask for it —
    // this is the on-demand session cache, keyed by user.
    respond = async (call) => {
      if (call.table === 'student_matches') return { data: [], error: null };
      if (call.table === 'programs' && !call.options?.head) {
        return { data: [progRow('p-001'), progRow('p-900')], error: null };
      }
      return { data: [], error: null, count: null };
    };
    await act(async () => result.current.loadMore());
    await waitFor(() => expect(result.current.results).toHaveLength(51));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body) as { programIds: string[] };
    expect(secondBody.programIds).toEqual(['p-900']);
  });

  it('queries no matches and scores nothing for a signed-out visitor', async () => {
    session = null;
    respond = servePages([pageOf(3)]);
    const { result } = renderHook(() => useSearchResults(F()));
    await settled(result);

    expect(calls.some((c) => c.table === 'student_matches')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.results.map((r) => r.fitScore)).toEqual([null, null, null]);
    expect(result.current.results.map((r) => r.tier)).toEqual([null, null, null]);
  });

  it('leaves rows scoreless rather than failing the page when scoring is unavailable', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    respond = async (call) => {
      if (call.table === 'universities') return { data: UNIS, error: null };
      if (call.table === 'student_matches') return { data: null, error: { message: 'permission denied' } };
      if (call.table === 'programs' && call.options?.head) return { data: null, error: null, count: 2 };
      if (call.table === 'programs') return { data: pageOf(2), error: null };
      return { data: [], error: null };
    };
    const { result } = renderHook(() => useSearchResults(F()));
    await settled(result);

    expect(result.current.error).toBeNull();
    expect(result.current.results).toHaveLength(2);
    expect(result.current.results[0].fitScore).toBeNull();
  });

  it('coerces the numeric-as-string scores PostgREST returns for numeric columns', async () => {
    respond = async (call) => {
      if (call.table === 'universities') return { data: UNIS, error: null };
      if (call.table === 'student_matches') {
        return {
          data: [
            { program_id: 'p-000', score: '84.5' },
            { program_id: 'p-001', score: null },
            { program_id: 'p-002', score: 'not-a-number' },
          ],
          error: null,
        };
      }
      if (call.table === 'programs' && call.options?.head) return { data: null, error: null, count: 3 };
      if (call.table === 'programs') return { data: pageOf(3), error: null };
      return { data: [], error: null };
    };
    const { result } = renderHook(() => useSearchResults(F({ sort: 'name' })));
    await settled(result);

    const byId = new Map(result.current.results.map((r) => [r.id, r.fitScore]));
    expect(byId.get('p-000')).toBe(84.5);
    // Unusable values fall through to the on-demand scorer — never to NaN, which
    // would sort as "unknown" on some paths and as a number on others.
    expect(typeof byId.get('p-001')).toBe('number');
    expect(Number.isNaN(byId.get('p-001'))).toBe(false);
    expect(Number.isNaN(byId.get('p-002'))).toBe(false);
    // A score of 84.5 is a Safe under the canonical 80/60 thresholds.
    expect(result.current.results.find((r) => r.id === 'p-000')?.tier).toBe('Safe');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 8. Errors.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('error handling', () => {
  it('surfaces a readable message and clears the page', async () => {
    respond = async (call) => {
      if (call.table === 'universities') return { data: UNIS, error: null };
      if (call.table === 'programs') {
        return { data: null, error: { message: 'canceling statement due to statement timeout' } };
      }
      return { data: [], error: null };
    };
    const { result } = renderHook(() => useSearchResults(F()));
    await settled(result);

    expect(result.current.error).toBe('canceling statement due to statement timeout');
    expect(result.current.results).toEqual([]);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.totalCount).toBeNull();
  });

  it('never renders a raw Supabase JSON blob at the user', async () => {
    respond = async (call) => {
      if (call.table === 'universities') return { data: UNIS, error: null };
      if (call.table === 'programs') {
        return { data: null, error: { message: '{"code":"57014","details":null}' } };
      }
      return { data: [], error: null };
    };
    const { result } = renderHook(() => useSearchResults(F()));
    await settled(result);
    expect(result.current.error).toBe('Something went wrong loading results. Please try again.');
  });

  it('keeps the rows the user already has when a loadMore fails', async () => {
    let page = 0;
    respond = async (call) => {
      if (call.table === 'universities') return { data: UNIS, error: null };
      if (call.table === 'student_matches') return { data: [], error: null };
      if (call.table === 'programs' && call.options?.head) return { data: null, error: null, count: 100 };
      if (call.table === 'programs') {
        page += 1;
        return page === 1
          ? { data: pageOf(50, 0), error: null }
          : { data: null, error: { message: 'network error' } };
      }
      return { data: [], error: null };
    };
    const { result } = renderHook(() => useSearchResults(F()));
    await settled(result);
    expect(result.current.results).toHaveLength(50);

    await act(async () => result.current.loadMore());
    await waitFor(() => expect(result.current.error).toBe('network error'));

    expect(result.current.results).toHaveLength(50);
    expect(result.current.isLoadingMore).toBe(false);
    expect(result.current.totalCount).toBe(100);
  });

  it('clears a previous error when the filters change', async () => {
    let attempt = 0;
    respond = async (call) => {
      if (call.table === 'universities') return { data: UNIS, error: null };
      if (call.table === 'student_matches') return { data: [], error: null };
      if (call.table === 'programs' && call.options?.head) return { data: null, error: null, count: 1 };
      if (call.table === 'programs') {
        attempt += 1;
        return attempt === 1 ? { data: null, error: { message: 'boom' } } : { data: pageOf(1), error: null };
      }
      return { data: [], error: null };
    };
    const { result, rerender } = renderHook((f: SearchFilters) => useSearchResults(f), {
      initialProps: F(),
    });
    await waitFor(() => expect(result.current.error).toBe('boom'));

    rerender(F({ sort: 'name' }));
    await waitFor(() => expect(result.current.results).toHaveLength(1));
    expect(result.current.error).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 9. What must NOT trigger a refetch.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('refetch discipline', () => {
  it('does not refetch when the client-side tier filter changes', async () => {
    // `tiers` filters already-loaded rows. Refetching on it would throw away
    // every loaded page each time the user toggled a chip.
    respond = servePages([pageOf(50, 0), pageOf(50, 50)]);
    const { result, rerender } = renderHook((f: SearchFilters) => useSearchResults(f), {
      initialProps: F({ tiers: ['Reach', 'Match', 'Safe'] }),
    });
    await settled(result);
    await act(async () => result.current.loadMore());
    await waitFor(() => expect(result.current.results).toHaveLength(100));

    await act(async () => {
      rerender(F({ tiers: ['Safe'] }));
    });

    expect(dataCalls()).toHaveLength(2);
    expect(result.current.results).toHaveLength(100);
  });

  it('does not refetch for a new filters object with identical values', async () => {
    respond = servePages([pageOf(5)]);
    const { result, rerender } = renderHook((f: SearchFilters) => useSearchResults(f), {
      initialProps: F(),
    });
    await settled(result);

    await act(async () => {
      rerender(F());
      rerender(F());
    });
    expect(dataCalls()).toHaveLength(1);
  });

  it('does not refetch for a whitespace-only change to the query', async () => {
    respond = servePages([pageOf(5)]);
    const { result, rerender } = renderHook((f: SearchFilters) => useSearchResults(f), {
      initialProps: F({ q: 'oxford' }),
    });
    await settled(result);

    await act(async () => {
      rerender(F({ q: '  oxford  ' }));
    });
    expect(dataCalls()).toHaveLength(1);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 10. Row mapping.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('row mapping', () => {
  it('never renders raw duration garbage', async () => {
    respond = servePages([
      [
        progRow('p-000', { duration: '4F or 8P', duration_years: null }),
        progRow('p-001', { duration: '1 Years', duration_years: null }),
        progRow('p-002', { duration: null, duration_years: 3 }),
        progRow('p-003', { duration: '18 months', duration_years: null }),
        progRow('p-004', { duration: 'garbage', duration_years: 99 }),
      ],
    ]);
    const { result } = renderHook(() => useSearchResults(F({ sort: 'name' })));
    await settled(result);

    expect(result.current.results.map((r) => r.durationLabel)).toEqual([
      null,
      '1 year',
      '3 years',
      '18 months',
      null,
    ]);
    // `highlights` is built from the clean labels, so nothing leaks via it.
    expect(result.current.results.flatMap((r) => r.highlights)).not.toContain('4F or 8P');
  });

  it('falls back to the cached universities list when the embedded row is missing', async () => {
    respond = servePages([
      [{ id: 'p-000', course_name: 'Orphan Course', university_id: 'u-oxford', universities: null }],
    ]);
    const { result } = renderHook(() => useSearchResults(F()));
    await settled(result);

    const row = result.current.results[0];
    expect(row.universityName).toBe('University of Oxford'); // not the 'University' placeholder
    expect(row.location).toBe('Location unavailable');
  });

  it('formats tuition from the programme first, then the university band', async () => {
    respond = servePages([
      [
        progRow('p-000', { tuition: 24500, currency: 'GBP' }),
        progRow('p-001', {
          tuition: null,
          currency: null,
          universities: {
            id: 'u-imperial',
            name: 'Imperial College London',
            country: 'UK',
            currency: 'GBP',
            intl_tuition_low: 20000,
            intl_tuition_high: 35000,
          },
        }),
        progRow('p-002', { tuition: null, currency: null }),
      ],
    ]);
    const { result } = renderHook(() => useSearchResults(F({ sort: 'name' })));
    await settled(result);

    expect(result.current.results.map((r) => r.tuitionLabel)).toEqual([
      '£24,500/yr',
      '≈£20k–35k/yr',
      null,
    ]);
  });
});
