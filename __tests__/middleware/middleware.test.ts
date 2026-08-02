/**
 * @jest-environment ./jest.environment-node.js
 *
 * `src/middleware.ts` — 236 lines that decide who reaches what, previously at
 * **0% coverage**.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Two facts about this module, both from this repo's own history:
 *
 *   1. It has already shipped an auth bypass to production once. Living at the
 *      repo root while the app dir is `src/app`, Next silently ignored it and
 *      every "protected" prefix was public (CLAUDE.md records this).
 *   2. A reviewer set `needsOnboarding = false` — an incomplete profile never
 *      redirected to the wizard again — and all 1,069 tests stayed green.
 *
 * It is also the only place `PROTECTED_PREFIXES` and `PUBLIC_API_PREFIXES` are
 * written down, and the only consumer of `COMPLETION_COLUMNS`.
 *
 * WHAT IS COVERED, AND WHAT IS DELIBERATELY NOT
 * ---------------------------------------------
 * Covered: the four decisions this file makes — the `/api/*` fail-closed fence,
 * the anonymous→`/login` bounce, the signed-in→`/role-select` bounce off the
 * auth route, and the onboarding redirect (including the `english_status` case
 * `COMPLETION_COLUMNS` exists for, and the cookie fast paths that decide
 * whether the four completion queries run at all).
 *
 * NOT covered here, on purpose: whether the `matcher` at the bottom of the file
 * actually routes a given URL into `middleware()`. That is Next's routing layer,
 * it is not observable from a unit test, and it is precisely the half that
 * failed in production. `e2e/harness-smoke.e2e.ts` is the check for that — it
 * drives a real browser at `/profile/wizard` as an anonymous visitor and asserts
 * the bounce. Do not let this file's green ticks stand in for that one.
 *
 * NOTHING HERE WEAKENS AUTH TO MAKE A TEST PASS. Every assertion is written
 * against the shipped behaviour; where the shipped behaviour is deliberately
 * weak — `hasSessionCookie` accepts a junk cookie value — the test pins the
 * weakness AND says so, so nobody mistakes it for authentication.
 */

import { NextRequest } from 'next/server';

/* ── the Supabase double ─────────────────────────────────────────────────────
 * Records table, select string, select options and `.eq()` filters, because the
 * column list is half the meaning of the completion queries (that is the whole
 * point of COMPLETION_COLUMNS) and the filter is the other half.
 */

interface DbCall {
  table: string;
  select: string;
  options: Record<string, unknown> | undefined;
  filters: Array<[column: string, value: unknown]>;
}

let dbCalls: DbCall[] = [];
let sessionUser: { id: string; email?: string } | null = null;
/** `maybeSingle()` payload per table. */
let rows: Record<string, unknown> = {};
/** `{ count }` payload per table, for the head query. */
let counts: Record<string, number> = {};
const createServerClient = jest.fn();

jest.mock('@supabase/ssr', () => ({
  createServerClient: (...args: unknown[]) => {
    createServerClient(...args);
    return {
      auth: { getUser: async () => ({ data: { user: sessionUser }, error: null }) },
      from(table: string) {
        const call: DbCall = { table, select: '', options: undefined, filters: [] };
        dbCalls.push(call);
        const builder: Record<string, unknown> = {
          select: (select: string, options?: Record<string, unknown>) => {
            call.select = select;
            call.options = options;
            return builder;
          },
          eq: (column: string, value: unknown) => {
            call.filters.push([column, value]);
            return builder;
          },
          maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
          then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
            Promise.resolve({ data: null, error: null, count: counts[table] ?? 0 }).then(resolve, reject)
        };
        return builder;
      }
    };
  }
}));

import { middleware, config } from '@/middleware';
import { COMPLETION_COLUMNS } from '@/lib/profile/completion';

/* ── request helpers ─────────────────────────────────────────────────────── */

const ORIGIN = 'https://ascenda.test';

const request = (path: string, cookies: Record<string, string> = {}, headers: Record<string, string> = {}) => {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
  return new NextRequest(new URL(path, ORIGIN), {
    headers: cookie ? { ...headers, cookie } : headers
  });
};

/** A cookie whose NAME matches the Supabase auth-token pattern. */
const SESSION_COOKIE = { 'sb-alpkbobbasxvubogkark-auth-token': 'anything-at-all' };

const USER = { id: 'user-under-test', email: 'ada@example.com' };

/** A profile that `isProfileComplete` accepts. */
const completeProfile = () => {
  rows = {
    student_personal_information: {
      first_name: 'Ada',
      last_name: 'Lovelace',
      email: 'ada@example.com',
      nationality: 'British',
      resident_country: 'United Kingdom'
    },
    student_academic_input: {
      programme_type: 'IB',
      school_name: 'Demo School',
      school_country: 'United Kingdom',
      graduation_year: 2027,
      intended_clusters: ['computer_science'],
      english_required: true,
      english_status: 'met'
    },
    student_lifestyle_preference: { extracurricular_interests: ['Sports/fitness'] }
  };
  counts = { student_subjects: 3 };
};

const location = (response: Response) => {
  const raw = response.headers.get('location');
  return raw === null ? null : new URL(raw).pathname + new URL(raw).search;
};

/** `NextResponse.next()` marks itself with this header; a redirect does not. */
const passedThrough = (response: Response) => response.headers.get('x-middleware-next') === '1';

beforeEach(() => {
  jest.clearAllMocks();
  dbCalls = [];
  sessionUser = null;
  rows = {};
  counts = {};
  process.env.NEXT_PUBLIC_SUPABASE_URL = `${ORIGIN}/supabase`;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. The /api fence. It runs before anything else and answers with JSON.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('/api/* fails closed', () => {
  it('401s an anonymous request with a JSON body, never a redirect', async () => {
    const response = await middleware(request('/api/applications'));

    expect(response.status).toBe(401);
    // An HTML redirect here is a bug of its own: an API client follows it and
    // parses the login page as its response payload.
    expect(location(response)).toBeNull();
    await expect(response.json()).resolves.toEqual({
      error: { code: 'unauthenticated', message: 'Authentication required.' }
    });
  });

  it('does not even construct a Supabase client for the rejected request', async () => {
    await middleware(request('/api/applications'));

    // The fence is deliberately cheaper than `getUser()`; if it starts paying
    // for an auth round trip, every anonymous drive-by does too.
    expect(createServerClient).not.toHaveBeenCalled();
    expect(dbCalls).toEqual([]);
  });

  it.each([
    ['/api/applications', 'a plain route'],
    ['/api/admin/catalog-health', 'a nested route'],
    ['/api/match/score', 'another nested route']
  ])('%s (%s) is not public', async (path) => {
    expect((await middleware(request(path))).status).toBe(401);
  });

  it('lets a request through once a Supabase auth-token cookie is present', async () => {
    const response = await middleware(request('/api/applications', SESSION_COOKIE));

    expect(response.status).toBe(200);
    expect(passedThrough(response)).toBe(true);
  });

  it.each([
    ['sb-project-auth-token', true],
    ['sb-project-auth-token.0', true],
    ['sb-project-auth-token.1', true],
    ['sb-project-refresh-token', false],
    ['sb-auth-token', false],
    ['supabase-auth-token', false],
    ['auth-token', false]
  ])('cookie %s ⇒ allowed: %s', async (name, allowed) => {
    const response = await middleware(request('/api/applications', { [name]: 'v' }));

    expect(response.status).toBe(allowed ? 200 : 401);
  });

  it('accepts a JUNK cookie value — this is a plausibility check, NOT authentication', async () => {
    // Pinning the documented weakness rather than pretending it away. The
    // module header says the handler is the authentication boundary; anyone who
    // reads this test learns the same thing instead of assuming the fence
    // authenticates.
    const response = await middleware(request('/api/applications', { 'sb-x-auth-token': 'not-a-jwt' }));

    expect(response.status).toBe(200);
  });

  it('lets a server-to-server caller through on the Authorization header alone', async () => {
    // Gating on the cookie alone 401'd the ADMIN_API_KEY bearer here, before the
    // route could check the key. The route still does the timingSafeEqual.
    const response = await middleware(request('/api/admin/catalog-health', {}, { authorization: 'Bearer k' }));

    expect(response.status).toBe(200);
    expect(passedThrough(response)).toBe(true);
  });

  it.each(['/api/calendar-feed', '/api/calendar-feed/abc123.ics'])(
    '%s is anonymous by design — external calendar clients cannot send a cookie',
    async (path) => {
      const response = await middleware(request(path));

      expect(response.status).toBe(200);
      expect(passedThrough(response)).toBe(true);
    }
  );

  it('the public allowlist matches on path SEGMENTS, not on string prefix', async () => {
    // `/api/calendar-feed-internal` starts with the allowlisted string. If the
    // check were a bare `startsWith`, a new route could be made public by
    // accident, by name.
    const response = await middleware(request('/api/calendar-feed-internal'));

    expect(response.status).toBe(401);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. The anonymous bounce.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('an anonymous visitor on a protected page', () => {
  // Every prefix the file lists. Adding one to PROTECTED_PREFIXES without a
  // matching entry here is fine; REMOVING one fails loudly, which is the
  // direction that matters.
  const PROTECTED = [
    '/dashboard',
    '/profile',
    '/matches',
    '/applications',
    '/admin',
    '/university-search',
    '/course',
    '/shortlist',
    '/scholarships',
    '/counsellor',
    '/parent',
    '/role-select',
    '/inbox',
    '/assistant'
  ];

  it.each(PROTECTED)('%s bounces to /login', async (prefix) => {
    const response = await middleware(request(prefix));

    expect(response.status).toBe(307);
    expect(location(response)).toBe(`/login?redirectedFrom=${encodeURIComponent(prefix)}`);
  });

  it.each(PROTECTED)('%s/nested/deep bounces too', async (prefix) => {
    const response = await middleware(request(`${prefix}/nested/deep`));

    expect(location(response)).toBe(`/login?redirectedFrom=${encodeURIComponent(`${prefix}/nested/deep`)}`);
  });

  it('records where they were going so login can send them back', async () => {
    const response = await middleware(request('/course/abc-123?tab=fees'));

    // The original query string rides along (the URL is cloned, only the
    // pathname is replaced) — pinned as shipped, not as imagined.
    expect(location(response)).toBe('/login?tab=fees&redirectedFrom=%2Fcourse%2Fabc-123');
  });

  it('leaves a page outside the protected set alone', async () => {
    const response = await middleware(request('/'));

    expect(passedThrough(response)).toBe(true);
    expect(location(response)).toBeNull();
  });

  it('every prefix in the matcher is also in PROTECTED_PREFIXES', () => {
    // The matcher decides what runs; PROTECTED_PREFIXES decides what is
    // guarded. A prefix in the first but not the second executes middleware and
    // is then waved through — the shape of a silently-public route.
    const matcherGroup = (config.matcher as string[]).find((entry) => entry.includes('|'))!;
    const fromMatcher = matcherGroup.slice(matcherGroup.indexOf('(') + 1, matcherGroup.indexOf(')')).split('|');

    expect(fromMatcher.map((segment) => `/${segment}`).sort()).toEqual([...PROTECTED].sort());
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. The auth route and the retired signup route.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('/login', () => {
  it('is reachable while signed out', async () => {
    const response = await middleware(request('/login'));

    expect(passedThrough(response)).toBe(true);
  });

  it('bounces a signed-in visitor to /role-select', async () => {
    sessionUser = USER;

    const response = await middleware(request('/login', SESSION_COOKIE));

    expect(response.status).toBe(307);
    expect(location(response)).toBe('/role-select');
  });

  it('drops the redirectedFrom parameter on the way — it is spent', async () => {
    sessionUser = USER;

    const response = await middleware(request('/login?redirectedFrom=%2Fdashboard', SESSION_COOKIE));

    expect(location(response)).toBe('/role-select');
  });
});

describe('/signup is retired', () => {
  it.each([null, USER])('redirects to /login whether signed in or out', async (user) => {
    sessionUser = user;

    const response = await middleware(request('/signup?plan=pro'));

    expect(response.status).toBe(307);
    // The query string is dropped: a stale signup link must not smuggle
    // parameters onto the login page.
    expect(location(response)).toBe('/login');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 4. The onboarding redirect — the mutation that survived.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('the onboarding redirect', () => {
  beforeEach(() => {
    sessionUser = USER;
  });

  it('sends an incomplete profile to the wizard', async () => {
    // Nothing seeded: every completion record is null.
    const response = await middleware(request('/dashboard', SESSION_COOKIE));

    expect(response.status).toBe(307);
    expect(location(response)).toBe('/profile/wizard?onboarding=true');
  });

  it('lets a complete profile through', async () => {
    completeProfile();

    const response = await middleware(request('/dashboard', SESSION_COOKIE));

    expect(passedThrough(response)).toBe(true);
    expect(location(response)).toBeNull();
  });

  it.each(['/dashboard', '/matches', '/applications', '/university-search', '/shortlist', '/scholarships'])(
    '%s is gated on it',
    async (path) => {
      const response = await middleware(request(path, SESSION_COOKIE));

      expect(location(response)).toBe('/profile/wizard?onboarding=true');
    }
  );

  it.each(['/profile', '/profile/wizard', '/counsellor', '/parent', '/role-select'])(
    '%s is exempt — gating it would be a redirect loop or the wrong portal',
    async (path) => {
      const response = await middleware(request(path, SESSION_COOKIE));

      expect(passedThrough(response)).toBe(true);
      expect(dbCalls).toEqual([]);
    }
  );

  it('is skipped for one request after the OAuth callback', async () => {
    // The session cookie has just been written and the completion reads can race
    // it. Let the page render; the next request checks normally.
    const response = await middleware(request('/dashboard?auth_fresh=1', SESSION_COOKIE));

    expect(passedThrough(response)).toBe(true);
    expect(dbCalls).toEqual([]);
  });

  /* ── the english_status case COMPLETION_COLUMNS exists for ───────────────── */

  describe('the "Not sure" English answer', () => {
    it('does NOT bounce a student who answered "Not sure"', async () => {
      // THE SHIPPED BUG. "Not sure" leaves english_required null, so
      // english_status is the only remaining evidence step 3 was completed.
      // A hand-written column list omitted it, and every such student was
      // bounced to the wizard from every protected route — cached in a cookie
      // for 12 hours — while their dashboard read 100% complete.
      completeProfile();
      (rows.student_academic_input as Record<string, unknown>).english_required = null;
      (rows.student_academic_input as Record<string, unknown>).english_status = 'not_sure';

      const response = await middleware(request('/dashboard', SESSION_COOKIE));

      expect(passedThrough(response)).toBe(true);
    });

    it('DOES bounce a student who answered neither', async () => {
      // The control. Without it the test above would pass on a completion rule
      // that had simply stopped checking step 3 at all.
      completeProfile();
      (rows.student_academic_input as Record<string, unknown>).english_required = null;
      (rows.student_academic_input as Record<string, unknown>).english_status = null;

      const response = await middleware(request('/dashboard', SESSION_COOKIE));

      expect(location(response)).toBe('/profile/wizard?onboarding=true');
    });

    it('selects english_status from the database in the first place', async () => {
      // Backstops the two tests above: they are driven from a fixture, and a
      // fixture cannot notice a column that was never fetched. Asserted as a
      // literal, not as `COMPLETION_COLUMNS.academicInput`, which would be a
      // tautology against the same constant the code interpolates.
      completeProfile();

      await middleware(request('/dashboard', SESSION_COOKIE));

      const academic = dbCalls.find((call) => call.table === 'student_academic_input')!;
      expect(academic.select).toContain('english_status');
      expect(academic.select).toContain('english_required');
      expect(academic.select).toBe(COMPLETION_COLUMNS.academicInput);
    });
  });

  /* ── which rows, and how many queries ────────────────────────────────────── */

  it('reads the four completion sources, each scoped to the caller', async () => {
    completeProfile();

    await middleware(request('/dashboard', SESSION_COOKIE));

    expect(dbCalls.map((call) => call.table).sort()).toEqual([
      'student_academic_input',
      'student_lifestyle_preference',
      'student_personal_information',
      'student_subjects'
    ]);
    for (const call of dbCalls) {
      expect(call.filters).toEqual([['profile_id', USER.id]]);
    }
  });

  it('sends the shared column lists, and counts subjects without fetching them', async () => {
    completeProfile();

    await middleware(request('/dashboard', SESSION_COOKIE));

    const byTable = new Map(dbCalls.map((call) => [call.table, call]));
    expect(byTable.get('student_personal_information')!.select).toBe(COMPLETION_COLUMNS.personal);
    expect(byTable.get('student_lifestyle_preference')!.select).toBe(COMPLETION_COLUMNS.lifestyle);
    expect(byTable.get('student_subjects')!.options).toEqual({ count: 'exact', head: true });
  });

  it('a student with no subjects is not complete, however full the rest is', async () => {
    completeProfile();
    counts = { student_subjects: 0 };

    const response = await middleware(request('/dashboard', SESSION_COOKIE));

    expect(location(response)).toBe('/profile/wizard?onboarding=true');
  });

  /* ── the cookie fast paths ───────────────────────────────────────────────── */

  it('writes both cookies once the profile is complete', async () => {
    completeProfile();

    const response = await middleware(request('/dashboard', SESSION_COOKIE));

    expect(response.cookies.get('onboarding_complete')?.value).toBe(USER.id);
    expect(response.cookies.get('onboarding_status')?.value).toMatch(new RegExp(`^${USER.id}:complete:\\d+$`));
  });

  it('writes a pending status cookie when it is not', async () => {
    const response = await middleware(request('/dashboard', SESSION_COOKIE));

    expect(response.cookies.get('onboarding_status')?.value).toMatch(new RegExp(`^${USER.id}:pending:\\d+$`));
    expect(response.cookies.get('onboarding_complete')).toBeUndefined();
  });

  it('the complete cookie short-circuits all four queries', async () => {
    const response = await middleware(
      request('/dashboard', { ...SESSION_COOKIE, onboarding_complete: USER.id })
    );

    expect(passedThrough(response)).toBe(true);
    expect(dbCalls).toEqual([]);
  });

  it("another user's complete cookie is worthless", async () => {
    // The cookie is keyed by user id precisely so a stale one from a previous
    // session on a shared machine cannot wave the next person through.
    const response = await middleware(
      request('/dashboard', { ...SESSION_COOKIE, onboarding_complete: 'somebody-else' })
    );

    expect(location(response)).toBe('/profile/wizard?onboarding=true');
    expect(dbCalls).toHaveLength(4);
  });

  it('a fresh pending status cookie redirects without querying', async () => {
    const response = await middleware(
      request('/dashboard', { ...SESSION_COOKIE, onboarding_status: `${USER.id}:pending:${Date.now()}` })
    );

    expect(location(response)).toBe('/profile/wizard?onboarding=true');
    expect(dbCalls).toEqual([]);
  });

  it('an hour-old pending status cookie is re-checked against the database', async () => {
    // Otherwise a student who has just finished the wizard stays bounced.
    completeProfile();
    const anHourAndOneMinuteAgo = Date.now() - 61 * 60 * 1000;

    const response = await middleware(
      request('/dashboard', {
        ...SESSION_COOKIE,
        onboarding_status: `${USER.id}:pending:${anHourAndOneMinuteAgo}`
      })
    );

    expect(dbCalls).toHaveLength(4);
    expect(passedThrough(response)).toBe(true);
  });

  it('a complete status cookie promotes itself to the long-lived cookie', async () => {
    const response = await middleware(
      request('/dashboard', { ...SESSION_COOKIE, onboarding_status: `${USER.id}:complete:${Date.now()}` })
    );

    expect(passedThrough(response)).toBe(true);
    expect(dbCalls).toEqual([]);
    expect(response.cookies.get('onboarding_complete')?.value).toBe(USER.id);
  });
});
