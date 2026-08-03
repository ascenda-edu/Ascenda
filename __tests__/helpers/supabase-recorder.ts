/**
 * A Supabase query-builder double that records WHOSE DATA was asked for.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * The doubles this replaces were all built the same way:
 *
 *     for (const m of ['select', 'eq', 'order', 'limit']) builder[m] = jest.fn(() => builder);
 *
 * `eq` is a jest.fn whose ARGUMENTS ARE NEVER READ. A test written against that
 * shape pins the table and the column list and says nothing about the scope, so
 * deleting `.eq('profile_id', ctx.userId)` from a loader — a cross-tenant read —
 * leaves every assertion green. That was proved twice on this repo: once in
 * `src/lib/data` (1,069 tests green) and again in `src/lib/chat` (1,541 green,
 * with a cross-tenant read in the assistant, an unauthenticated admin bypass and
 * three unscoped writes applied simultaneously).
 *
 * `__tests__/data/applications.test.ts` fixed it locally by recording
 * `[method, column, value]`. The fix was applied per-directory, not per-pattern,
 * so `__tests__/chat/` kept the hole. This module is that recorder, extracted, so
 * the next directory that needs a Supabase double inherits the scope assertion
 * instead of re-inventing the blind spot.
 *
 * Distrust any assertion here that would still pass if the filter value were
 * wrong. `filtersFor()` is the one that fails when it is.
 */

export type Filter = [method: 'eq' | 'in' | 'neq' | 'gte' | 'lte', column: string, value: unknown];

export type RecordedCall = {
  table: string;
  /** The first argument to `.select()`, verbatim. `''` if select was never called. */
  select: string;
  /** Every scoping call, in the order the loader made them. */
  filters: Filter[];
};

/** What a table's query should resolve to. Anything omitted defaults sensibly. */
export type TableResult = { data?: unknown; error?: unknown; count?: number };

type Options = {
  /**
   * Called when the code under test queries a table with no configured result.
   * Defaults to throwing, so a loader that reads a table the test did not
   * anticipate fails loudly instead of silently receiving `null`.
   */
  onUnknownTable?: (table: string) => TableResult;
};

const FILTER_METHODS = ['eq', 'in', 'neq', 'gte', 'lte'] as const;
const PASSTHROUGH_METHODS = ['order', 'limit', 'range', 'not', 'is', 'ilike', 'contains'] as const;

/**
 * Build a recording client.
 *
 * @param results  table name -> the result its query resolves to
 * @param calls    the array every `.from()` appends to (asserted by the test)
 */
export const recordingClient = (
  results: Record<string, TableResult>,
  calls: RecordedCall[],
  options: Options = {}
) => {
  const onUnknownTable =
    options.onUnknownTable ??
    ((table: string) => {
      throw new Error(
        `recordingClient: no result configured for table "${table}". ` +
          'Add one, or pass onUnknownTable if the read is genuinely optional.'
      );
    });

  const from = (table: string) => {
    const call: RecordedCall = { table, select: '', filters: [] };
    calls.push(call);

    const settle = (): TableResult => (table in results ? results[table] : onUnknownTable(table));
    const resolved = () => {
      const r = settle();
      return { data: r.data ?? null, error: r.error ?? null, count: r.count ?? null };
    };

    const builder: Record<string, unknown> = {
      select: (select?: string) => {
        if (typeof select === 'string') call.select = select;
        return builder;
      },
      maybeSingle: async () => resolved(),
      single: async () => resolved(),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(resolved()).then(resolve, reject),
    };
    for (const method of FILTER_METHODS) {
      builder[method] = (column: string, value: unknown) => {
        call.filters.push([method, column, value]);
        return builder;
      };
    }
    for (const method of PASSTHROUGH_METHODS) {
      builder[method] = () => builder;
    }
    return builder;
  };

  return { from: jest.fn(from) };
};

/**
 * The filters recorded for a table, as `[method, column, value]` triples.
 *
 * Throws when the table was never read — an assertion against `[]` would
 * otherwise pass for "the read was deleted entirely", which is the failure this
 * whole module exists to catch.
 */
export const filtersFor = (calls: RecordedCall[], table: string): Filter[] => {
  const matching = calls.filter((call) => call.table === table);
  if (matching.length === 0) {
    throw new Error(
      `filtersFor: "${table}" was never queried. Tables read: ${
        calls.map((c) => c.table).join(', ') || '(none)'
      }`
    );
  }
  return matching.flatMap((call) => call.filters);
};
