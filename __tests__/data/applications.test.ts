/**
 * The application loaders: the column list they send, and the disposition they
 * apply when the query fails.
 *
 * These two things used to be decided independently at four call sites, which
 * is how a parent and their child ended up reading different columns of the
 * same row, and how a failed board read became an empty-state screen.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import {
  loadApplicationBoard,
  loadApplicationLabels,
  loadApplicationsWithTasks,
  loadDocumentsForApplications,
  loadTierByProgram,
} from '@/lib/data/applications';
import {
  APPLICATION_BOARD_SELECT,
  APPLICATION_LABEL_SELECT,
  APPLICATION_TASKS_SELECT,
  DOCUMENT_SELECT,
  MATCH_TIER_SELECT,
} from '@/lib/data/columns';
import { DataError } from '@/lib/data/errors';
import { resetLogSink, setLogSink, type LogEntry } from '@/lib/observability/logger';

/**
 * `filters` is the security-critical field, and it was missing.
 *
 * This type used to be `{ table, select }` — so the suite asserted WHICH TABLE
 * and WHICH COLUMNS every loader reads, and never WHOSE DATA. A reviewer proved
 * the consequence by deleting `.eq('profile_id', profileId)` from all five
 * loaders — a cross-tenant read of every student's applications — and all 1,069
 * tests stayed green. There was nowhere in the recorder to put a filter, and
 * `profile_id` appeared nowhere in this directory.
 *
 * A test that pins the column list but not the scope defends the cosmetic half
 * of a data-access layer.
 */
type Filter = [method: 'eq' | 'in', column: string, value: unknown];
type Call = { table: string; select: string; filters: Filter[] };

const fakeClient = (result: { data: unknown; error: unknown }, calls: Call[]) => {
  const query = {
    select(select: string) {
      calls[calls.length - 1].select = select;
      return query;
    },
    eq: (column: string, value: unknown) => {
      calls[calls.length - 1].filters.push(['eq', column, value]);
      return query;
    },
    in: (column: string, value: unknown) => {
      calls[calls.length - 1].filters.push(['in', column, value]);
      return query;
    },
    order: () => query,
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return {
    from(table: string) {
      calls.push({ table, select: '', filters: [] });
      return query;
    },
  } as unknown as SupabaseClient<Database>;
};

const logs: LogEntry[] = [];
beforeEach(() => {
  logs.length = 0;
  setLogSink((entry) => logs.push(entry));
});
afterEach(() => resetLogSink());

const FAILURE = { data: null, error: { message: 'permission denied for table applications', code: '42501' } };

describe('the loaders send the shared column constants', () => {
  it.each([
    ['board', loadApplicationBoard, 'applications', APPLICATION_BOARD_SELECT],
    ['tasks', loadApplicationsWithTasks, 'applications', APPLICATION_TASKS_SELECT],
    ['labels', loadApplicationLabels, 'applications', APPLICATION_LABEL_SELECT],
  ])('%s', async (_name, load, table, expected) => {
    const calls: Call[] = [];
    await (load as (c: SupabaseClient<Database>, id: string) => Promise<unknown>)(
      fakeClient({ data: [], error: null }, calls),
      'profile-1'
    );
    expect(calls).toEqual([{ table, select: expected, filters: [['eq', 'profile_id', 'profile-1']] }]);
  });

  it('documents', async () => {
    const calls: Call[] = [];
    await loadDocumentsForApplications(fakeClient({ data: [], error: null }, calls), ['app-1']);
    expect(calls).toEqual([
      { table: 'documents', select: DOCUMENT_SELECT, filters: [['in', 'application_id', ['app-1']]] }
    ]);
  });

  it('tier lookup', async () => {
    const calls: Call[] = [];
    await loadTierByProgram(fakeClient({ data: [], error: null }, calls), 'profile-1', ['prog-1']);
    expect(calls).toEqual([
      {
        table: 'student_matches',
        select: MATCH_TIER_SELECT,
        filters: [['eq', 'profile_id', 'profile-1'], ['in', 'program_id', ['prog-1']]]
      }
    ]);
  });
});

describe('every loader scopes to the caller', () => {
  // Stated as its own property rather than left implicit in the shape
  // assertions above, because THIS is the one that fails if someone drops an
  // `.eq()` while refactoring. Asserted per loader so the failure names which.
  it.each([
    ['board', loadApplicationBoard],
    ['tasks', loadApplicationsWithTasks],
    ['labels', loadApplicationLabels]
  ])('%s filters on the caller profile_id', async (_name, load) => {
    const calls: Call[] = [];
    await (load as (c: SupabaseClient<Database>, id: string) => Promise<unknown>)(
      fakeClient({ data: [], error: null }, calls),
      'owner-under-test'
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].filters).toContainEqual(['eq', 'profile_id', 'owner-under-test']);
  });

  it('the tier lookup scopes to the caller AND the requested programmes', async () => {
    const calls: Call[] = [];
    await loadTierByProgram(fakeClient({ data: [], error: null }, calls), 'owner-under-test', ['p-1', 'p-2']);
    expect(calls[0].filters).toContainEqual(['eq', 'profile_id', 'owner-under-test']);
    expect(calls[0].filters).toContainEqual(['in', 'program_id', ['p-1', 'p-2']]);
  });
});

describe('dispositions', () => {
  it('the board THROWS on failure — an empty board is not an acceptable answer', async () => {
    await expect(loadApplicationBoard(fakeClient(FAILURE, []), 'profile-1')).rejects.toBeInstanceOf(DataError);
    expect(logs).toHaveLength(1);
  });

  it('the tasks and label reads throw too', async () => {
    await expect(loadApplicationsWithTasks(fakeClient(FAILURE, []), 'p')).rejects.toBeInstanceOf(DataError);
    await expect(loadApplicationLabels(fakeClient(FAILURE, []), 'p')).rejects.toBeInstanceOf(DataError);
    await expect(loadDocumentsForApplications(fakeClient(FAILURE, []), ['a'])).rejects.toBeInstanceOf(DataError);
  });

  it('the tier lookup DEGRADES on failure — a badge is not worth an error page', async () => {
    const tiers = await loadTierByProgram(fakeClient(FAILURE, []), 'profile-1', ['prog-1']);

    expect(tiers.size).toBe(0);
    // …but it is logged. Previously the student board discarded this error, so
    // every Reach/Match/Safe badge could vanish with no signal at all.
    expect(logs).toHaveLength(1);
    expect(logs[0].message).toContain('applications.tierByProgram');
  });
});

describe('tier extraction', () => {
  const rows = [
    { program_id: 'a', breakdown: { tier: 'Reach' } },
    { program_id: 'b', breakdown: { tier: 'Safe' } },
    { program_id: 'c', breakdown: { tier: 'Wishful' } }, // not a tier
    { program_id: 'd', breakdown: null },
    { program_id: 'e', breakdown: ['Safe'] }, // JSON array, not an object
  ];

  it('keeps only the three real tiers', async () => {
    const tiers = await loadTierByProgram(fakeClient({ data: rows, error: null }, []), 'p', ['a', 'b', 'c', 'd', 'e']);
    expect([...tiers]).toEqual([
      ['a', 'Reach'],
      ['b', 'Safe'],
    ]);
  });

  it('does not query at all for an empty programme list', async () => {
    const calls: Call[] = [];
    const tiers = await loadTierByProgram(fakeClient({ data: rows, error: null }, calls), 'p', []);
    expect(tiers.size).toBe(0);
    expect(calls).toHaveLength(0);
  });
});
