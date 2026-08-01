/**
 * @jest-environment ./jest.environment-node.js
 *
 * REGRESSION GUARD: `getIdentity` must stay wrapped in React's `cache()`.
 *
 * Why this needs a mock at all. React's `cache()` only memoises inside a React
 * request scope — its implementation reads a dispatcher off React's internals
 * and, when there isn't one (a plain unit test, a script), calls straight
 * through with no caching. So the real `cache()` cannot demonstrate dedup here,
 * and a test written against it would pass identically whether or not the
 * wrapper existed. That is worthless as a guard for the one property this
 * refactor is buying.
 *
 * Instead this file installs a genuinely-memoising `cache` in place of React's
 * and asserts the effect flows through `getIdentity` — i.e. that the call
 * really is routed through `cache()`. Delete the wrapper in `identity.ts` and
 * these tests fail with 2 auth round trips instead of 1, which is exactly the
 * regression to catch. The scope semantics (per request, never across requests)
 * are React's contract, not ours.
 */

const getUser = jest.fn();
const profileMaybeSingle = jest.fn();
const from = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: jest.fn(async () => ({ auth: { getUser }, from }))
}));

jest.mock('next/navigation', () => ({ redirect: jest.fn() }));

// A stand-in for a single React request scope: memoise on first call, replay
// after. Each `jest.resetModules()` below yields a fresh wrapper, which is what
// makes one test file able to simulate several independent requests.
jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T): T => {
      let called = false;
      let value: unknown;
      return ((...args: never[]) => {
        if (!called) {
          called = true;
          value = fn(...args);
        }
        return value;
      }) as T;
    }
  };
});

const loadIdentityModule = () => {
  jest.resetModules();
  return require('@/lib/auth/identity') as typeof import('@/lib/auth/identity');
};

beforeEach(() => {
  jest.clearAllMocks();
  from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: profileMaybeSingle }) }) });
  getUser.mockResolvedValue({ data: { user: { id: 'u-1', email: 'a@example.com' } }, error: null });
  profileMaybeSingle.mockResolvedValue({ data: { role: 'counsellor' }, error: null });
});

describe('getIdentity is memoised per request', () => {
  it('four callers in one request cost one auth round trip and one profile query', async () => {
    const { getIdentity } = loadIdentityModule();

    // Stands in for the shell, the layout, the page and a nested server
    // component all asking independently — the pattern the audit measured 48
    // times under src/app.
    const results = await Promise.all([getIdentity(), getIdentity(), getIdentity(), getIdentity()]);

    expect(getUser).toHaveBeenCalledTimes(1);
    expect(profileMaybeSingle).toHaveBeenCalledTimes(1);
    expect(results.every((identity) => identity === results[0])).toBe(true);
  });

  it('sequential callers share the resolved value too', async () => {
    const { getIdentity } = loadIdentityModule();

    await getIdentity();
    await getIdentity();
    await getIdentity();

    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it('requireIdentity and requireRole reuse the same lookup as getIdentity', async () => {
    const { getIdentity, requireIdentity, requireRole } = loadIdentityModule();

    await getIdentity();
    await requireIdentity();
    await requireRole('counsellor');

    expect(getUser).toHaveBeenCalledTimes(1);
    expect(profileMaybeSingle).toHaveBeenCalledTimes(1);
  });

  it('a fresh request re-resolves — the memo is per request, not global', async () => {
    const first = loadIdentityModule();
    await first.getIdentity();
    expect(getUser).toHaveBeenCalledTimes(1);

    // New module registry === new cache wrapper === the next request.
    const second = loadIdentityModule();
    profileMaybeSingle.mockResolvedValue({ data: { role: 'admin' }, error: null });

    await expect(second.getIdentity()).resolves.toMatchObject({ role: 'admin' });
    expect(getUser).toHaveBeenCalledTimes(2);
  });
});
