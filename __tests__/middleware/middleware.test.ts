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

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
/** `error` payload per table — a transient DB failure on a completion query. */
let queryErrors: Record<string, unknown> = {};
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
          maybeSingle: async () => ({
            data: queryErrors[table] ? null : rows[table] ?? null,
            error: queryErrors[table] ?? null
          }),
          then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
            Promise.resolve({
              data: null,
              error: queryErrors[table] ?? null,
              count: queryErrors[table] ? null : counts[table] ?? 0
            }).then(resolve, reject)
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
  queryErrors = {};
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
    // Changed deliberately (H-08), not re-baselined: this used to assert the
    // nested `{ error: { code, message } }`, which was the defect itself. `code`
    // is retained as a sibling so machine callers that read it still work.
    await expect(response.json()).resolves.toEqual({
      error: 'Authentication required.',
      code: 'unauthenticated'
    });
  });

  // Regression: H-08. The fence used to answer `{ error: { code, message } }`.
  // Every one of the 23 route handlers answers `{ error: '<string>' }`, and six
  // client call sites are written `data.error ?? 'fallback'`. A nested object is
  // truthy, so `??` never fires and the object itself is what reaches the UI:
  // `essay-ai-panel.tsx` pushed it into a `useState<string | null>` rendered as a
  // React child, which throws "Objects are not valid as a React child" and
  // unmounts the panel; the other five render `[object Object]`.
  //
  // `res.json()` is untyped, so nothing in the type system can catch this. The
  // shape is the contract, and this test is the only thing holding it.
  it('answers with the same flat {error: string} envelope every route handler uses', async () => {
    const response = await middleware(request('/api/applications'));
    const body = await response.json();

    expect(typeof body.error).toBe('string');
    // The exact consumer expression, executed against the real payload.
    expect(body.error ?? 'Something went wrong').toBe('Authentication required.');
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
  // The behavioural expectation, written out by hand. Adding a prefix to
  // PROTECTED_PREFIXES without a matching entry here is fine; REMOVING one fails
  // loudly, which is the direction that matters. The three-way agreement test at
  // the bottom of this block cross-checks it against the real constant.
  const PROTECTED = [
    '/dashboard',
    '/profile',
    // The onboarding welcome screen. Guarded like any other signed-in surface:
    // it greets the user by name and reads their profile, so an anonymous
    // visitor must be bounced to /login rather than shown an empty greeting.
    '/welcome',
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
    '/assistant',
    // Added after an unauthenticated GET against production returned 200 and
    // the full signed-in shell for /appointment. /toolbox only ever 307'd
    // because its layout guards itself — middleware never ran for either.
    '/toolbox',
    '/appointment'
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
    // The matcher decides what RUNS; PROTECTED_PREFIXES decides what is GUARDED.
    // A prefix in the first but not the second executes middleware and is then
    // waved through — the shape of a silently-public route.
    //
    // This used to compare the matcher against `PROTECTED` — the hand-written
    // copy above — which is not the constant the shipped code branches on. Both
    // lists could be edited together and the real one left behind, and the test
    // would still be green. `PROTECTED_PREFIXES` is module-private (exporting it
    // is a change to `src/middleware.ts`, which this branch does not own), so
    // the real value is read off the source text instead.
    const source = readFileSync(join(__dirname, '../../src/middleware.ts'), 'utf8');
    const literal = source.match(/const PROTECTED_PREFIXES = \[([\s\S]*?)\];/);
    // Self-check: a scan that silently finds nothing is the failure mode that
    // makes source-reading tests vacuous.
    expect(literal).not.toBeNull();
    const realPrefixes = [...literal![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(realPrefixes.length).toBeGreaterThan(10);

    const matcherGroup = (config.matcher as string[]).find((entry) => entry.includes('|'))!;
    const fromMatcher = matcherGroup
      .slice(matcherGroup.indexOf('(') + 1, matcherGroup.indexOf(')'))
      .split('|')
      .map((segment) => `/${segment}`);

    // Three-way agreement: matcher == the real constant == what this file
    // asserts the behaviour to be. Any two drifting apart fails here.
    expect([...fromMatcher].sort()).toEqual([...realPrefixes].sort());
    expect([...realPrefixes].sort()).toEqual([...PROTECTED].sort());
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
  /**
   * Where an incomplete student is sent, and what they were reaching for.
   *
   * The destination changed from `/profile/wizard?onboarding=true` to
   * `/welcome?from=…` when onboarding grew a welcome screen. Middleware
   * deliberately does NOT decide whether this user has already seen that screen
   * — that answer lives in `profiles.onboarding`, and reading it here would add
   * a fifth query to every protected navigation. `/welcome` forwards a
   * returning user straight on to the wizard.
   *
   * `from` is what makes the flow return people to the page they actually
   * wanted instead of dumping everyone on /dashboard.
   *
   * EVERY CASE BELOW DRIVES `/matches`, AND THAT IS THE POINT.
   * The gate used to run on every protected route, so these cases were written
   * against `/dashboard`. It is now an allowlist of one — `/matches`, the only page
   * that cannot compute anything without grades and subjects — so `/dashboard` is
   * no longer a gated path and asserting redirects on it would test nothing. See
   * `lib/onboarding/destination.ts` for why the shape changed, and
   * `__tests__/onboarding/destination.test.ts` for the scope test that pins which
   * routes stayed open.
   */
  const welcomeFrom = (path: string) => `/welcome?from=${encodeURIComponent(path)}`;
  const WELCOME = welcomeFrom('/matches');

  beforeEach(() => {
    sessionUser = USER;
  });

  it('sends an incomplete profile to the welcome flow', async () => {
    // Nothing seeded: every completion record is null.
    const response = await middleware(request('/matches', SESSION_COOKIE));

    expect(response.status).toBe(307);
    expect(location(response)).toBe(WELCOME);
  });

  it('lets a complete profile through', async () => {
    completeProfile();

    const response = await middleware(request('/matches', SESSION_COOKIE));

    expect(passedThrough(response)).toBe(true);
    expect(location(response)).toBeNull();
  });

  // `/matches` is the whole allowlist — it ranks 119k programmes against grades
  // the student has not entered yet, so it is the one page with nothing to show.
  // Everything else is reachable; see lib/onboarding/destination.ts.
  it.each(['/matches', '/matches/tiers'])('%s is gated on it', async (path) => {
    const response = await middleware(request(path, SESSION_COOKIE));

    // Each carries its OWN `from`, not a hardcoded /matches — that is what returns
    // the student to the page they were actually reaching for.
    expect(location(response)).toBe(welcomeFrom(path));
  });

  /**
   * The routes the gate was taken OFF, and the reason this list is long.
   *
   * All of these were unreachable for a student with an incomplete profile: signing
   * in dropped them into a five-screen intake form before they had seen a single
   * university, on pages that work perfectly well empty and already have empty
   * states. `dbCalls` being empty is the load-bearing half of the assertion — it
   * proves the four completion queries are not merely tolerated on these routes but
   * never issued, so the cost went away with the redirect.
   */
  it.each([
    '/dashboard',
    '/university-search',
    '/shortlist',
    '/scholarships',
    '/applications',
    '/toolbox',
    '/inbox',
    '/course/123',
    '/profile',
    '/profile/wizard',
    '/counsellor',
    '/parent',
    '/role-select'
  ])('%s is not gated — it works without a profile', async (path) => {
    const response = await middleware(request(path, SESSION_COOKIE));

    expect(passedThrough(response)).toBe(true);
    expect(dbCalls).toEqual([]);
  });

  // The browse escape hatch. `/university-search` moved OUT of the gated list
  // above when the wall proved to be the thing the tiering was meant to fix: three
  // screens before you may see a university is still all of it. These two work
  // without a profile (fit scores just come back empty), so they are exempt and
  // the welcome screen offers "Browse universities first" as a way in.
  it.each(['/university-search', '/university-search/search', '/course/abc-123'])(
    '%s is exempt — it works without a profile, so the wall does not apply',
    async (path) => {
      const response = await middleware(request(path, SESSION_COOKIE));

      expect(passedThrough(response)).toBe(true);
      // Exempt means the four completion queries never run at all, so browsing
      // costs nothing on the hot path.
      expect(dbCalls).toEqual([]);
    }
  );

  it('carries the query string in `from`, not just the pathname', async () => {
    // A student deep-linked into a tab was returned to the bare route, silently
    // dropping the thing they had actually clicked.
    //
    // Uses a GATED route deliberately. An earlier version of this assertion used
    // `/course/123?tab=fees`, and stopped exercising anything the moment `/course`
    // stopped being gated — the redirect it was checking no longer happens there.
    // `/matches` is the only route that still triggers it, so it is the only route
    // this can be written against.
    const response = await middleware(request('/matches?tier=reach', SESSION_COOKIE));

    expect(location(response)).toBe(welcomeFrom('/matches?tier=reach'));
  });

  it('does not let the incoming query leak into /welcome as its own params', async () => {
    // `search` is cleared before `from` is set, so an inbound `?from=` cannot
    // survive into the redirect and pre-empt the real one.
    const response = await middleware(request('/matches?from=/evil', SESSION_COOKIE));

    const url = new URL(location(response)!, ORIGIN);
    expect(url.pathname).toBe('/welcome');
    expect(url.searchParams.getAll('from')).toEqual(['/matches?from=/evil']);
  });

  it('is skipped for one request after the OAuth callback', async () => {
    // The session cookie has just been written and the completion reads can race
    // it. Let the page render; the next request checks normally.
    const response = await middleware(request('/matches?auth_fresh=1', SESSION_COOKIE));

    expect(passedThrough(response)).toBe(true);
    expect(dbCalls).toEqual([]);
  });

  /* ── a failed completion query is not an incomplete profile (E-01) ───────── */

  describe('when a completion query fails', () => {
    // The four reads discarded their `error`. A failed query yields `data: null`,
    // which `isProfileComplete` cannot distinguish from "the student never filled
    // this in" — so one transient DB blip bounced a *complete* student to the
    // wizard and wrote `onboarding_status=pending`, which the fast path at the top
    // of this function then honours for the next 60 minutes without re-querying.
    //
    // Failing open is the correct direction here: the wizard redirect is a
    // completeness nudge, not an authorization boundary. Nothing is exposed by
    // letting a request through; a complete student locked out of the whole app
    // for an hour is real harm.
    const eachTable = [
      'student_personal_information',
      'student_academic_input',
      'student_lifestyle_preference',
      'student_subjects'
    ];

    it.each(eachTable)('does not bounce a complete student when %s errors', async (table) => {
      completeProfile();
      queryErrors = { [table]: { message: 'timeout', code: '57014' } };

      const response = await middleware(request('/matches', SESSION_COOKIE));

      expect(location(response)).toBeNull();
      expect(passedThrough(response)).toBe(true);
    });

    it('does not cache a pending verdict it could not actually establish', async () => {
      completeProfile();
      queryErrors = { student_academic_input: { message: 'timeout', code: '57014' } };

      const response = await middleware(request('/matches', SESSION_COOKIE));

      // Neither cookie may be written: `pending` would lock the student out for an
      // hour, and `complete` would assert something this request never verified.
      const written = response.cookies.getAll().map((c) => c.name);
      expect(written).not.toContain('onboarding_status');
      expect(written).not.toContain('onboarding_complete');
    });

    it('still bounces a genuinely incomplete profile when every query succeeds', async () => {
      // The guard must not become a blanket "never redirect".
      const response = await middleware(request('/matches', SESSION_COOKIE));

      expect(location(response)).toBe(WELCOME);
    });
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

      const response = await middleware(request('/matches', SESSION_COOKIE));

      expect(passedThrough(response)).toBe(true);
    });

    it('DOES bounce a student who answered neither', async () => {
      // The control. Without it the test above would pass on a completion rule
      // that had simply stopped checking step 3 at all.
      completeProfile();
      (rows.student_academic_input as Record<string, unknown>).english_required = null;
      (rows.student_academic_input as Record<string, unknown>).english_status = null;

      const response = await middleware(request('/matches', SESSION_COOKIE));

      expect(location(response)).toBe(WELCOME);
    });

    it('selects english_status from the database in the first place', async () => {
      // Backstops the two tests above: they are driven from a fixture, and a
      // fixture cannot notice a column that was never fetched. Asserted as a
      // literal, not as `COMPLETION_COLUMNS.academicInput`, which would be a
      // tautology against the same constant the code interpolates.
      completeProfile();

      await middleware(request('/matches', SESSION_COOKIE));

      const academic = dbCalls.find((call) => call.table === 'student_academic_input')!;
      expect(academic.select).toContain('english_status');
      expect(academic.select).toContain('english_required');
      expect(academic.select).toBe(COMPLETION_COLUMNS.academicInput);
    });
  });

  /* ── which rows, and how many queries ────────────────────────────────────── */

  it('reads the four completion sources, each scoped to the caller', async () => {
    completeProfile();

    await middleware(request('/matches', SESSION_COOKIE));

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

    await middleware(request('/matches', SESSION_COOKIE));

    const byTable = new Map(dbCalls.map((call) => [call.table, call]));
    expect(byTable.get('student_personal_information')!.select).toBe(COMPLETION_COLUMNS.personal);
    expect(byTable.get('student_lifestyle_preference')!.select).toBe(COMPLETION_COLUMNS.lifestyle);
    expect(byTable.get('student_subjects')!.options).toEqual({ count: 'exact', head: true });
  });

  it('a student with no subjects is not complete, however full the rest is', async () => {
    completeProfile();
    counts = { student_subjects: 0 };

    const response = await middleware(request('/matches', SESSION_COOKIE));

    expect(location(response)).toBe(WELCOME);
  });

  /* ── the cookie fast paths ───────────────────────────────────────────────── */

  it('writes both cookies once the profile is complete', async () => {
    completeProfile();

    const response = await middleware(request('/matches', SESSION_COOKIE));

    expect(response.cookies.get('onboarding_complete')?.value).toBe(USER.id);
    expect(response.cookies.get('onboarding_status_v2')?.value).toMatch(new RegExp(`^${USER.id}:complete:\\d+$`));
  });

  it('writes a pending status cookie when it is not', async () => {
    const response = await middleware(request('/matches', SESSION_COOKIE));

    expect(response.cookies.get('onboarding_status_v2')?.value).toMatch(new RegExp(`^${USER.id}:pending:\\d+$`));
    expect(response.cookies.get('onboarding_complete')).toBeUndefined();
  });

  it('the complete cookie short-circuits all four queries', async () => {
    const response = await middleware(
      request('/matches', { ...SESSION_COOKIE, onboarding_complete: USER.id })
    );

    expect(passedThrough(response)).toBe(true);
    expect(dbCalls).toEqual([]);
  });

  it("another user's complete cookie is worthless", async () => {
    // The cookie is keyed by user id precisely so a stale one from a previous
    // session on a shared machine cannot wave the next person through.
    const response = await middleware(
      request('/matches', { ...SESSION_COOKIE, onboarding_complete: 'somebody-else' })
    );

    expect(location(response)).toBe(WELCOME);
    expect(dbCalls).toHaveLength(4);
  });

  it('a fresh pending status cookie redirects without querying', async () => {
    const response = await middleware(
      request('/matches', { ...SESSION_COOKIE, onboarding_status_v2: `${USER.id}:pending:${Date.now()}` })
    );

    expect(location(response)).toBe(WELCOME);
    expect(dbCalls).toEqual([]);
  });

  it('ignores a pending cookie written under the previous rule set', async () => {
    // The regression this pins is an INESCAPABLE REDIRECT LOOP, not a stale screen.
    //
    // The completeness threshold moved from all five wizard steps to the three
    // essentials. A cookie written in the hour before that deploy can therefore say
    // `pending` about a student the new rule considers complete — and the fast path
    // above redirects on it without re-querying. The target is now `/welcome`, which
    // reads the database fresh, sees a complete profile, and forwards them straight
    // back to where middleware will bounce them again. The browser gives up.
    //
    // The old target `/profile/wizard` is exempt from the gate, so the same wrong
    // verdict used to terminate. That is why this could not have been caught before
    // the redirect target moved.
    //
    // The cookie NAME carries the rule-set version, so a pre-deploy cookie is simply
    // not found: four queries, the right answer, no loop.
    completeProfile();

    const response = await middleware(
      request('/matches', {
        ...SESSION_COOKIE,
        onboarding_status: `${USER.id}:pending:${Date.now()}`
      })
    );

    expect(dbCalls).toHaveLength(4);
    expect(passedThrough(response)).toBe(true);
  });

  it('an hour-old pending status cookie is re-checked against the database', async () => {
    // Otherwise a student who has just finished the wizard stays bounced.
    completeProfile();
    const anHourAndOneMinuteAgo = Date.now() - 61 * 60 * 1000;

    const response = await middleware(
      request('/matches', {
        ...SESSION_COOKIE,
        onboarding_status_v2: `${USER.id}:pending:${anHourAndOneMinuteAgo}`
      })
    );

    expect(dbCalls).toHaveLength(4);
    expect(passedThrough(response)).toBe(true);
  });

  it('a complete status cookie promotes itself to the long-lived cookie', async () => {
    const response = await middleware(
      request('/matches', { ...SESSION_COOKIE, onboarding_status_v2: `${USER.id}:complete:${Date.now()}` })
    );

    expect(passedThrough(response)).toBe(true);
    expect(dbCalls).toEqual([]);
    expect(response.cookies.get('onboarding_complete')?.value).toBe(USER.id);
  });
});
