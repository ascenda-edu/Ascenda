/**
 * @jest-environment ./jest.environment-node.js
 *
 * REGRESSION GUARD: `getIdentity` must stay wrapped in React's `cache()` — and
 * the memo must be PER REQUEST, never global.
 *
 * Why this needs a mock at all. React's `cache()` only memoises inside a React
 * request scope — its implementation reads a store off the current dispatcher
 * and, when there isn't one (a plain unit test, a script), calls straight
 * through with no caching. So the real `cache()` cannot demonstrate dedup here,
 * and a test written against it would pass identically whether or not the
 * wrapper existed. That is worthless as a guard for the one property this
 * refactor is buying.
 *
 * WHY THE STAND-IN HAS SCOPES (this is the fix, read it before simplifying it)
 * ---------------------------------------------------------------------------
 * The first version of this file installed a memoise-FOREVER stand-in with no
 * scope semantics, and simulated "a new request" with `jest.resetModules()`.
 * A reviewer replaced `cache()` in `identity.ts` with a plain module-level memo
 * — a cross-request identity leak, user A's role served to user B on the same
 * warm server — and **this file, the file that exists to guard exactly that,
 * passed.** `jest.resetModules()` discards a module-level memo just as
 * thoroughly as it discards a cache wrapper, so the strongest-named test in the
 * file was asserting a property of `jest.resetModules()`.
 *
 * So the stand-in below models the thing that actually distinguishes them: a
 * store that belongs to a REQUEST, not to the module. `inRequest()` opens one.
 * Two requests now run against ONE module instance — no `resetModules()`
 * anywhere in this file, deliberately — so a global memo is visible as exactly
 * what it is: the second request being answered with the first request's user.
 *
 * What each behaviour catches:
 *   - delete the `cache()` wrapper  → the dedup tests see 4 round trips, not 1;
 *   - swap it for a global memo     → 'two requests…' and 'nothing survives…'
 *                                     fail with request A's identity leaking
 *                                     into request B.
 *
 * The real `cache()`'s scope semantics are React's contract, not ours. What is
 * ours, and what is tested here, is that identity resolution is routed through
 * a per-request memo and not through a longer-lived one.
 */

const getUser = jest.fn();
const profileMaybeSingle = jest.fn();
const from = jest.fn();

/**
 * Every `.eq()` the profile lookup made, as `[table, column, value]`.
 *
 * The stub this replaced was `eq: () => ({ maybeSingle })` — arguments
 * discarded — so `.eq('id', user.id)` could become `.eq('role', user.id)` (the
 * M1 mutation) or drop the user id entirely and this file would not notice. It
 * is a *cache* test, so its own subject is the memo; recording the filter costs
 * two lines and means the file can no longer be the reason a scope regression
 * ships. See `__tests__/meta/recording-doubles.test.ts`.
 */
const profileFilters: Array<[string, string, unknown]> = [];

jest.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: jest.fn(async () => ({ auth: { getUser }, from }))
}));

jest.mock('next/navigation', () => ({ redirect: jest.fn() }));

/**
 * The store belonging to the request currently being served, or `null` when no
 * request is being served. Must be named `mock*` — jest hoists `jest.mock()`
 * above the imports and only allows the factory to close over such names.
 */
let mockRequestScope: Map<unknown, unknown> | null = null;

jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T): T =>
      ((...args: never[]) => {
        // No request in progress ⇒ no store to memoise into ⇒ call through.
        // This mirrors React, and it is the second half of the discriminator:
        // a global memo would happily answer here from a previous request.
        if (!mockRequestScope) return fn(...args);
        if (!mockRequestScope.has(fn)) mockRequestScope.set(fn, fn(...args));
        return mockRequestScope.get(fn);
      }) as T
  };
});

import { getIdentity, requireIdentity, requireRole } from '@/lib/auth/identity';

/** Serve one request. Everything memoised inside dies with it. */
const inRequest = async <T>(handler: () => Promise<T>): Promise<T> => {
  const previous = mockRequestScope;
  mockRequestScope = new Map();
  try {
    return await handler();
  } finally {
    mockRequestScope = previous;
  }
};

/** Point the auth server and the profiles table at a given user. */
const servedUser = (id: string, role: string) => {
  getUser.mockResolvedValue({ data: { user: { id, email: `${id}@example.com` } }, error: null });
  profileMaybeSingle.mockResolvedValue({ data: { role }, error: null });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRequestScope = null;
  profileFilters.length = 0;
  from.mockImplementation((table: string) => ({
    select: () => ({
      eq: (column: string, value: unknown) => {
        profileFilters.push([table, column, value]);
        return { maybeSingle: profileMaybeSingle };
      }
    })
  }));
  servedUser('u-1', 'counsellor');
});

describe('getIdentity is memoised within one request', () => {
  it('four callers in one request cost one auth round trip and one profile query', async () => {
    // Stands in for the shell, the layout, the page and a nested server
    // component all asking independently — the pattern the audit measured 48
    // times under src/app.
    const results = await inRequest(() =>
      Promise.all([getIdentity(), getIdentity(), getIdentity(), getIdentity()])
    );

    expect(getUser).toHaveBeenCalledTimes(1);
    expect(profileMaybeSingle).toHaveBeenCalledTimes(1);
    expect(results.every((identity) => identity === results[0])).toBe(true);
    // The one query it did make asked for THIS user's row. Without this the
    // memo could be perfect and still be memoising somebody else's role.
    expect(profileFilters).toEqual([['profiles', 'id', 'u-1']]);
  });

  it('sequential callers share the resolved value too', async () => {
    await inRequest(async () => {
      await getIdentity();
      await getIdentity();
      await getIdentity();
    });

    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it('requireIdentity and requireRole reuse the same lookup as getIdentity', async () => {
    await inRequest(async () => {
      await getIdentity();
      await requireIdentity();
      await requireRole('counsellor');
    });

    expect(getUser).toHaveBeenCalledTimes(1);
    expect(profileMaybeSingle).toHaveBeenCalledTimes(1);
  });
});

describe('the memo does not outlive the request', () => {
  it('two requests on the same warm server resolve two different users', async () => {
    // THE test. One module instance, no `resetModules()`: the only thing that
    // separates these two calls is the request boundary itself. A memo that
    // lives on the module — the mutation that survived the whole suite — hands
    // the counsellor's identity to the student and reports one round trip.
    servedUser('u-counsellor', 'counsellor');
    const first = await inRequest(() => getIdentity());

    servedUser('u-student', 'student');
    const second = await inRequest(() => getIdentity());

    expect(first).toMatchObject({ userId: 'u-counsellor', role: 'counsellor' });
    expect(second).toMatchObject({ userId: 'u-student', role: 'student' });
    expect(second).not.toBe(first);
    expect(getUser).toHaveBeenCalledTimes(2);
    expect(profileMaybeSingle).toHaveBeenCalledTimes(2);
    // Two round trips is necessary but not sufficient: they must also have
    // asked for two DIFFERENT rows. A memo keyed on the wrong thing could
    // re-query and still hand back request A's user.
    expect(profileFilters).toEqual([
      ['profiles', 'id', 'u-counsellor'],
      ['profiles', 'id', 'u-student']
    ]);
  });

  it('a second request re-reads the role even for the SAME user', async () => {
    // A counsellor demoted to student mid-session must not keep their old role
    // because an earlier request in the same process resolved it.
    servedUser('u-1', 'admin');
    const before = await inRequest(() => getIdentity());

    servedUser('u-1', 'student');
    const after = await inRequest(() => getIdentity());

    expect(before).toMatchObject({ role: 'admin' });
    expect(after).toMatchObject({ role: 'student' });
  });

  it('nothing survives outside a request scope either', async () => {
    // Belt and braces: with no request in progress there is no store to memoise
    // into, so every call must reach the auth server. A module-level memo
    // answers the second call from the first one's value.
    servedUser('u-a', 'admin');
    const first = await getIdentity();

    servedUser('u-b', 'student');
    const second = await getIdentity();

    expect(first).toMatchObject({ userId: 'u-a' });
    expect(second).toMatchObject({ userId: 'u-b' });
    expect(getUser).toHaveBeenCalledTimes(2);
  });

  it('two concurrent requests do not share a memo', async () => {
    // Interleaved, not sequential: the realistic shape of a warm server under
    // load, and the shape in which a shared memo is a cross-tenant leak rather
    // than merely a staleness bug.
    const responses: unknown[] = [];

    await Promise.all([
      inRequest(async () => {
        servedUser('u-first', 'admin');
        responses.push(await getIdentity());
      }),
      inRequest(async () => {
        servedUser('u-second', 'student');
        responses.push(await getIdentity());
      })
    ]);

    // Whichever order they interleaved in, the two requests must not have been
    // answered with one and the same identity object.
    expect(responses).toHaveLength(2);
    expect(responses[0]).not.toBe(responses[1]);
    expect(getUser).toHaveBeenCalledTimes(2);
  });
});
