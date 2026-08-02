# Lane B — authentication, authorization, tenancy

Branch `security/phase0-contain`. All seven Lane B items attempted.

## Summary

**Severity counts: P0 = 0 · P1 = 0 · P2 = 1 · P3 = 2**

No auth bypass, no cross-tenant read, and no lost guard found. The identity/policy
rewrite is equivalent-or-stronger than `origin/main` at every guard site I could
enumerate. All three findings are about *enforcement of the tests*, not about
shipped behaviour.

| ID | Sev | Reg? | One line |
|---|---|---|---|
| B1 | P2 | NEW | `config.matcher` entries outside the `(a\|b\|c)` group are unenforced: deleting `/api/:path*` leaves 81/81 middleware tests and every static gate green, silently disabling the `/api` fail-closed fence. |
| B2 | P3 | NEW | The policy layer is largely unwired — `can()` has 2 production call sites; `ROUTE_POLICY`/`actionForPath` have **zero** production consumers (tests only), while middleware routes off its own separate list. |
| B3 | P3 | NEW | The test named "every prefix in the matcher is also in PROTECTED_PREFIXES" compares the matcher to a **hardcoded copy inside the test file**; `PROTECTED_PREFIXES` is not exported and never read by it. |

**Mutation survival: 9 caught / 10 injected.** The one survivor is B1.

| # | Mutation | Result |
|---|---|---|
| M1 | `identity.ts` `.eq('id', user.id)` → `.eq('role', user.id)` | **CAUGHT** (3 failed) |
| M2 | `identity.ts` React `cache()` → module-global memo | **CAUGHT** (6 failed) |
| M3 | `policy.ts` `can()` drops the per-student subject check | **CAUGHT** (5 failed) |
| M4 | `policy.ts` `'counsellor'` → `'counsellor.student'` | **CAUGHT** (typecheck + ts-jest) |
| M5 | `policy.ts` `COUNSELLOR_PORTAL_OPEN_TO_ALL` true→false | **CAUGHT** (1 failed) |
| M6 | `middleware.ts` `PUBLIC_API_PREFIXES += '/api'` | **CAUGHT** (9 failed) |
| M7 | `middleware.ts` matcher loses `'/api/:path*'` | **SURVIVED** → B1 |
| M8 | `middleware.ts` `PROTECTED_PREFIXES` loses `'/admin'` | **CAUGHT** (2 failed) |
| M9 | `identity.ts` `requireRole` role check deleted | **CAUGHT** (2 failed) |
| M10 | `policy.ts` student granted `portal:admin` | **CAUGHT** (2 failed) |

**Executed vs inferred: ~85% executed.** Every mutation result, every count and
every file list below is actual command output. Inferred by reading only:
(a) that the `/login` and `/signup` matcher entries are unpinned for the same
mechanical reason as `/api/:path*` (I executed the `/api` case only);
(b) that all 23 API handlers authenticate — established by reading each handler
and its guard helper, not by driving a server.

**Blocking other lanes:** nothing. Two notes: B1 overlaps **Lane L** (gate layer)
and **Lane F** (test strength) — Lane L should own the `config.matcher` gate.
One mutation I wanted lies outside my ownership and is **delegated to Lane F**:
`src/lib/counsellor/data.ts` `.eq('role', 'student')` → `.eq('role',
'counsellor.student')`. M4 proved the *typed* comparison is caught by tsc, but a
string **argument** to `.eq()` is not type-checked, and that is precisely the
form the historic `'counsellor.student'` bug took.

---

## Findings

### B1 — `config.matcher` entries outside the alternation group have no gate; deleting `/api/:path*` is invisible
Severity: **P2** latent risk
Location: `src/middleware.ts:253-265` (the `config.matcher` array); test gap at
`__tests__/middleware/middleware.test.ts:302-310`
Regression?: **NEW** — the `/api/:path*` entry was added by this refactor
(`origin/main`'s matcher had no `/api` entry at all), so its loss returns to
main's posture rather than dropping below it. What is new is a protection with
no test behind it.

Evidence — mutation M7, the entry removed from the matcher:

```
=== RUN M7 (matcher loses /api/:path*) ===
Test Suites: 1 passed, 1 total
Tests:       81 passed, 81 total
```

The `/api` fence itself is well covered — M6 (widening `PUBLIC_API_PREFIXES`)
failed 9 tests. But every one of those tests calls `middleware(request(...))`
**directly**, so none can observe whether Next routes `/api/*` into `middleware`
at all. The one test that inspects the matcher only reads the alternation entry:

```js
const matcherGroup = (config.matcher as string[]).find((entry) => entry.includes('|'))!;
```

`/api/:path*`, `/login` and `/signup` contain no `|` and are never examined.

The file's docblock delegates this to e2e, deliberately and explicitly:
> "NOT covered here, on purpose: whether the `matcher` … actually routes a given
> URL into `middleware()`. … `e2e/harness-smoke.e2e.ts` is the check for that."

That delegation does not hold. Executed:

```
=== /api assertions in e2e ===
(no output — grep -rn "api/" e2e/ matches nothing)
=== e2e in CI? ===
318:  # `database` and `e2e` are deliberately NOT in `needs` yet
334:    needs: [quality, test, build]
```

So the named backstop contains no `/api` assertion, and the job it lives in is
not in `ci-ok`'s `needs`. Net: zero enforcement.

Repro: delete `'/api/:path*'` from `config.matcher` → `npm run typecheck`, `lint`,
and `npx jest __tests__/middleware` all pass; anonymous requests to `/api/*` no
longer receive the middleware 401.

Consequence is bounded, which is why this is P2 not P1: I enumerated all 23 route
handlers and every one authenticates itself (`getUser()`, `requireCounsellor`,
`requireAdmin`/`timingSafeEqual`, or `getIdentity`), and the fence's own docblock
is honest that it "is not authentication". Losing it removes defence in depth and
the DoS-shaping cheap rejection, not the boundary.

Fix: pin the whole array — one assertion, no new machinery:
```js
expect(config.matcher).toEqual([
  '/(dashboard|profile|matches|applications|admin|university-search|course|shortlist|scholarships|counsellor|parent|role-select|inbox|assistant)(.*)',
  '/login',
  '/signup',
  '/api/:path*'
]);
```
Test: that assertion fails on M7 and passes on HEAD. (An e2e that fetches `/api/checklist`
anonymously and expects 401 would additionally close the "does Next honour it" half.)

---

### B2 — the declarative policy layer is mostly unwired; `ROUTE_POLICY` has no production consumer
Severity: **P3** quality
Location: `src/lib/auth/policy.ts:293-330`
Regression?: **NEW**

Evidence — every importer of the module, executed:

```
=== all importers of auth/policy ===
src/app/counsellor/layout.tsx:7:import { can } from '@/lib/auth/policy';
src/app/parent/layout.tsx:7:import { can } from '@/lib/auth/policy';
```

and every reference to the route map (grep over `src` and `__tests__`, excluding
policy.ts itself) resolves to `__tests__/auth/policy.test.ts` — `ROUTE_POLICY`
and `actionForPath` are **never called by production code**.

The docstring above `ROUTE_POLICY` says it is:
> "The ONLY place a URL prefix maps to a permission."

It is not: `src/middleware.ts:6-21` maps prefixes to protection with its own
independent `PROTECTED_PREFIXES` array, and the two disagree today —
`/toolbox` is in `ROUTE_POLICY` (→ `portal:student`) but absent from
`PROTECTED_PREFIXES` and from the matcher.

That specific disagreement is **not** a hole: `/toolbox` was equally absent from
`origin/main`'s `PROTECTED_PREFIXES` (verified against `git show
origin/main:src/middleware.ts`), and `src/app/toolbox/layout.tsx:8-9` guards it
with `getUser()` + `redirect('/login')`. So no access changed. The finding is
that an authoritative-sounding map is decorative, and the next person to add a
route may reasonably believe editing it accomplishes something.

Fix: either consult `actionForPath()` from middleware (making the map real), or
demote the docstring and mark the exports as the test-only fixtures they
currently are. Do not silently keep both lists.
Test: if wired — an assertion that every `PROTECTED_PREFIXES` entry resolves to a
non-null `actionForPath()`, driven from the exported constant rather than a copy.

---

### B3 — the matcher/PROTECTED_PREFIXES drift test reads a hardcoded copy, not the real constant
Severity: **P3** quality
Location: `__tests__/middleware/middleware.test.ts:257` (the local `PROTECTED`
array) and `:302-310` (the assertion)
Regression?: **NEW**

Evidence: `src/middleware.ts` exports only `middleware` and `config` —

```
=== is PROTECTED_PREFIXES exported from middleware? ===
71:export async function middleware(req: NextRequest) {
253:export const config = {
```

so the test's `PROTECTED` at line 257 is a hand-maintained mirror. The assertion
`expect(fromMatcher…).toEqual([...PROTECTED].sort())` therefore compares the
matcher against the *test's* list, never against `PROTECTED_PREFIXES`, despite
being named "every prefix in the matcher is also in PROTECTED_PREFIXES".

Observed directly during M8: removing `'/admin'` from the real
`PROTECTED_PREFIXES` did **not** fail this test — only the two behavioural
`it.each` cases fired:

```
✕ /admin bounces to /login
✕ /admin/nested/deep bounces too
Tests: 2 failed, 79 passed, 81 total
```

Impact is limited because those behavioural tests do cover removals, and an
addition to the matcher fails line 309. So the pair is defended in practice — by
different tests than the one whose name claims it. This is the same
hardcoded-mirror shape as `__tests__/auth/policy.test.ts:227-247`
(`MIDDLEWARE_PROTECTED`), which duplicates the same 14 strings a third time.

Fix: `export const PROTECTED_PREFIXES` from `src/middleware.ts` and import it in
both tests, deleting both copies.
Test: with the constant imported, M8 makes the drift assertion fail — it does not today.

---

## What I checked and found clean

1. **Item 1 — `src/lib/auth/identity.ts`.** Every `.eq()` filters the column it
   claims: the sole query is `profiles.select('role').eq('id', user.id).maybeSingle()`.
   The named mutation `.eq('id')`→`.eq('role')` **goes red** (M1), as does the
   `cache()`→global-memo swap (M2) and deleting the `requireRole` check (M9).
   `parseRole` fails closed to `'student'` for null/unknown/non-string/unreadable.
   The `typeof window` server-only throw is present.
2. **Item 2 — guards, both directions.** Enumerated 48 guarded files on
   `origin/main` under `src/app` vs 50 on HEAD. Exactly one file appears lost —
   `src/app/parent/_lib/context.ts` — and it was `git mv`'d to
   `src/features/parent/api/context.ts`; `diff` against the main version shows
   **only import-path changes**. No guard lost. Predicate diffs on all five
   portal/admin guards are equivalent-or-stronger: `admin/page.tsx` and
   `admin/simulation/page.tsx` `profile?.role !== 'admin'` → `requireRole('admin')`
   (both fail closed); `counsellor/layout.tsx` and `parent/layout.tsx`
   `if (!user) redirect('/login')` → `requireIdentity()` + `can(...)` (identical
   today under the open flags, strictly stronger once flipped). `admin/layout.tsx`
   adds `getIdentity()` for the role prop only, with the real check still in the
   pages. Separately, `canActAsCounsellor` went from `Boolean(user)` — literally
   any signed-in user — to a real role check plus the demo limb: a substantial
   strengthening.
3. **Item 3 — `src/middleware.ts`.** File is at `src/middleware.ts`; no
   `middleware.ts` at the repo root (`ls` confirmed). `/api/*` fails closed with a
   JSON 401 before the Supabase client is constructed (M6 red). Public allowlist is
   exactly `['/api/calendar-feed']`; `/auth/callback` sits outside the matcher so
   login is unaffected. The `Authorization` pass-through cannot bypass a session
   check: it only declines to answer on the route's behalf, and
   `/api/admin/catalog-health` still does its own `timingSafeEqual`; the middleware
   test pins this pass-through explicitly at line 220. The onboarding path uses
   `COMPLETION_COLUMNS` rather than a hand-written list, and three tests cover the
   `english_status` "Not sure" case that once locked users out. Auth-route redirect
   (`/login` → `/role-select` when signed in) and the `/signup` → `/login` retirement
   are both covered. `PROTECTED_PREFIXES` is **byte-identical** to `origin/main`;
   the matcher only *gained* `/api/:path*`.
4. **Item 4 — cross-tenant reads.** `.eq('profile_id', …)` counts 84 (main) → 79
   (committed HEAD). I accounted for **all five** deltas per file and every one is
   consolidation into a shared loader that still scopes, called with the caller's
   own id: the 4 `applications/*` page filters → `src/lib/data/applications.ts`
   (5 filters, all `.eq('profile_id', profileId)`); `dashboard/page.tsx` 5→4 and
   `chat/context.ts` 6→5 and `chat/tools/student-read.ts` 3→2 → `loadApplicationBoard`
   /`loadApplicationSummaries`; `parent/data.ts` 7 → `features/parent/api/data.ts` 5
   → the two moved into the shared loaders; `persist-intake.ts` 4→3 → three
   hand-copied delete/insert blocks collapsed into one parameterised helper.
   `dashboard/page.tsx` also swaps `user.id` → `identity.userId` throughout. The two
   unscoped reads in the shared loader (`loadApplicationLabel` by `id`,
   `loadDocumentsForApplications` by `application_id`) are RLS-scoped and documented,
   and the id list they receive is itself derived from a scoped query. Guardian
   scoping in `resolveLinkedChildIds` retains
   `.eq('parent_profile_id', parentUserId).eq('status', 'active')`. **No cross-tenant
   read introduced.**
5. **Item 5 — role literals.** Every string compared against `profiles.role` is in
   `{'student','counsellor','admin'}`. The two `'counsellor.student'` occurrences in
   the tree are **comments in `src/lib/counsellor/data.ts:577,823` documenting the
   historic bug**, immediately above correct `.eq('role', 'student')` calls. The
   other `'student'|'counsellor'|'parent'` hits are table names, log namespaces
   (`counsellor.programs`, `parent.guardian_links`), chat message roles
   (`'user'|'assistant'|'model'`) and activity job titles. `'parent'` never reaches
   a `profiles.role` comparison, consistent with it not existing in the enum.
6. **Item 6 — service-role client.** `createServiceRoleSupabaseClient` has exactly
   one caller in the whole repo: `scripts/seed-students.ts` (a `tsx` script). It is
   imported by **no** file under `src/`. It carries a `typeof window` throw, and
   `SUPABASE_SERVICE_ROLE_KEY` appears only in `env.ts` and `service.ts`, never under
   a `NEXT_PUBLIC_` name. I also checked every `'use client'` file that references an
   auth module: `src/hooks/use-user-role.ts` and `src/lib/auth/role-context.tsx` both
   resolve to `role-context`, which imports only `react` and the **browser** Supabase
   client — neither pulls `identity.ts`, `policy.ts` or `service.ts` into a client
   bundle.
7. **Item 7 — app ↔ DB policy agreement.** `__tests__/db/portal-flag-agreement.test.ts`
   parses `can_act_as_counsellor()` out of `supabase/schema.sql` and compares it to
   the flags; it throws rather than passing if the function is missing or matches
   neither posture, and it asserts the closing migration still exists so the pair
   cannot pass by file deletion. **Verified it fails when they disagree** (M5): setting
   `COUNSELLOR_PORTAL_OPEN_TO_ALL = false` while `schema.sql` still holds the open form
   produced `expect(COUNSELLOR_PORTAL_OPEN_TO_ALL).toBe(sqlIsOpenToAll())` → 1 failed.
   The flags agree with `schema.sql` on HEAD.

Baseline for the lane (before any mutation):
`npx jest __tests__/auth __tests__/middleware __tests__/db/portal-flag-agreement.test.ts`
→ **6 suites / 154 tests passed**.

`git status --short -- src/lib/auth src/middleware.ts` is **empty** — every
mutation reverted, nothing of mine left in the tree.

## Not verified

- **Runtime matcher behaviour.** Whether Next actually routes `/api/*` into
  `middleware()` on HEAD is not observable from a unit test and I did not run
  Playwright or a dev server (e2e against a real account is out of scope per §1).
  B1 asserts the *absence of a test*, which I did verify by mutation; it does not
  assert the fence is currently broken — M6 shows the fence works when reached.
- **`/login` and `/signup` matcher entries.** Inferred to be as unpinned as
  `/api/:path*` (same `find(entry => entry.includes('|'))` filter). I executed the
  `/api` case only.
- **RLS behaviour.** Whether the database actually refuses a cross-tenant read is
  Lane C's; I verified only the application-side filters. Several loaders lean on
  RLS by design (`loadApplicationLabel`, the counsellor cohort reads), so the
  app-side "clean" in item 4 is conditional on Lane C confirming those policies.
- **All 23 handlers authenticate.** Established by reading each handler plus its
  guard helper (`requireCounsellor` → `getUser()` + `canActAsCounsellor`), not by
  issuing unauthenticated requests. Full per-route authorization depth is Lane H.
- **`src/lib/counsellor/data.ts` role-literal mutation** — outside my mutation
  ownership; delegated to Lane F (see Summary).
- **Full-suite timezone runs** — Lane F item 6.
