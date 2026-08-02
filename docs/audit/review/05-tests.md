# Review 05 — Test quality

**Scope.** `git diff origin/main...HEAD -- __tests__/ e2e/ jest.config.ts jest.environment-tz-west.js playwright.config.ts` — 55 files, +14,605 lines, across 11 commits on `security/phase0-contain`.

**Question asked.** The register (`docs/audit/13-remaining-work.md:14-15`) claims 265 → **1,069 tests** and 13.1% → **~25%+ coverage**, and those numbers are being used to argue the refactor is safe. How much of that is real?

**Method.** Read the suites; re-measured coverage; ran a **28-mutation experiment** in a scratch copy of the repo (`/private/tmp/.../scratchpad/repo`) — **no tracked file was modified, nothing was committed, no production DB was contacted**; audited golden-file provenance across the 11 commits; ran the full suite four times to test determinism, plus a three-timezone experiment; checked every skip; and read the CI wiring to see which of these tests actually gate anything.

---

## Verdict

**Most of the 1,069 is real, and this is better work than the "an agent wrote 800 tests overnight" prior predicts.** Of the realistic bugs I injected into production code, the large majority were caught, often by several tests across several suites. The scoring goldens were **not** laundered — they were updated with independent numeric justification and, on net, strengthened. There is exactly one skipped test in the entire suite and it is honestly labelled. No `.only`, no `it.todo`, no dead `it.failing`.

**But the confidence is not evenly distributed, and four claims do not survive contact:**

1. **Query scoping — the highest-severity property in this codebase — is untested in the data layer.** Deleting `.eq('profile_id', profileId)` from every loader in `src/lib/data/applications.ts` (a cross-tenant read of every student's applications) leaves **all 1,069 tests green**. The double at `__tests__/data/applications.test.ts:31-49` is structurally incapable of noticing: its `Call` type has no field for filter arguments.
2. **The date-only bug class — the one this repo keeps re-hitting, the one CLAUDE.md documents — is guarded in exactly one file, and is inert everywhere else in CI.** `parseLocalDate` is an *identity function* under `TZ=UTC`, which is what `ubuntu-latest` runs. 19 test files touch date logic; **one** uses `jest.environment-tz-west.js`. The branch built precisely the right tool and applied it once.
3. **The two production fixes with the largest blast radius have zero coverage.** `src/middleware.ts` (0%, 236 lines) and `src/lib/profile/persist-intake.ts` (0%, 220 lines — the Phase 2 "could destroy a student's data" fix). Both were changed on this branch.
4. **773 lines of RLS/authz tests under `__tests__/db/` have never run and nothing can run them.** Not in CI, not in `package.json`, not in any script. Honest headers, wrong location.

**Numbers I'd stand behind:** of 1,069 tests, roughly **60–75 are vacuous or non-discriminating** (~6%), concentrated in six files, plus **~30 more that are real but inert in CI** because of the timezone issue. The problem is not fake tests. It is a **coverage shape** in which the number rises while the highest-severity failure modes — scoping, middleware authz, persistence, timezone — stay outside the tested surface.

---

## 1. The numbers, honestly

Re-measured on this branch, clean tree:

```
Test Suites: 63 passed, 63 total
Tests:     1069 passed, 1069 total     (109 s)

All files    30.37 % statements | 25.86 % branches | 25.75 % functions | 30.24 % lines
```

**The 1,069 is real** — every one runs, every one passes, none skipped inside Jest. **The "~25%+" is understated, not inflated**: statements are 30.4%; the register took the conservative branches/functions reading. Credit for that — it is the opposite of the failure mode I was looking for.

### Where the coverage actually is

| Well covered (pure, deterministic) | | Not covered (I/O, effects, authz) | |
|---|---|---|---|
| `src/lib/counsellor` | 97.8% | **`src/middleware.ts`** | **0%** |
| `src/lib/auth` | 96.4% | **`src/lib/profile/persist-intake.ts`** | **0%** |
| `src/lib/university-search` | 96.2% | `src/lib/shortlist/shortlist-store.ts` | 0% |
| `src/lib/hooks` | 96.1% | `src/lib/tiering/course_tiering.ts` | 0% |
| `src/hooks/use-search-results.ts` | 93.0% | `src/lib/supabase` (`server.ts`/`client.ts`) | 7.3% |
| `src/lib/catalog` | 92.9% | `src/lib/demo` | 21.3% |
| `src/lib/scoring/student_scoring.ts` | 90.8% | `src/lib/matching/service.ts` | 25.8% |
| `src/lib/applications` | 87.6% | `src/components/**` | mostly 0% |
| `src/lib/data` | 78.0% | `src/app/**/page.tsx` | mostly 0% |

**The biggest gap between "looks covered" and "is actually verified" is `src/lib/data/` at 78%.** That directory is the entire point of the data-layer refactor — the "one place a query is written" beachhead — and its tests are the weakest in the branch (§2, §3). 78% of a module whose only interesting property is *which rows come back* measures the wrong thing: the loaders are three lines each, so line coverage is trivially high while the filter arguments they pass are asserted nowhere. That is the mutation that survived.

Runner-up: **`src/lib/matching/service.ts` at 25.8%** — lines 252–915, the whole `buildMatches` pipeline including the `student_matches` cache write and its partial-failure wipe, are uncovered. The two Phase 2 fixes in that file *are* covered (§4), but they are two functions in a 1,058-line module.

**CI does not gate on coverage.** `.github/workflows/ci.yml:129` prints the number into the step summary and moves on. The comment beside it still reads "Coverage is ~13% overall" — stale by 17 points.

---

## 2. Vacuous and non-discriminating tests

Roughly 60–75 tests. Six files carry almost all of them.

### 2.1 `__tests__/data/call-sites.test.ts` — six test cases with empty loop bodies

The file reads source text and regex-matches; nothing is imported, nothing executes. Defensible as a lint rule. The problem is that three of its `it.each` blocks iterate `matchAll` results and assert *inside the loop* — and for most files the regex matches zero times. I re-ran the file's own regexes against the real sources:

| migrated file | `.from('applications')…select(` matches | error-destructures checked |
|---|---|---|
| `src/app/applications/page.tsx` | **0** | **0** |
| `src/app/applications/tasks/page.tsx` | **0** | **0** |
| `src/app/applications/documents/page.tsx` | **0** | 1 |
| `src/features/parent/api/data.ts` | 1 | **0** |

So `:53-60` (`'%s builds no applications query of its own'`) runs assertions for **one** of four files, `:69-79` (`'%s binds every Supabase error it receives'`) for **one** of four, and the chat block at `:152-158` for **none** of three. Six green ticks; two assertions actually executed. A Jest case whose loop body never runs reports as a pass.

Its negative assertions are also keyed to a fixed identifier list (`ApplicationRecord|AppRecord|ApplicationJoin|…`), so `type AppRow2 = {…}` reintroduces the exact drift and passes.

### 2.2 `__tests__/data/columns.test.ts` — four outright tautologies

Each asserts that a constant contains a fragment the module under test *interpolates into it*:

```ts
expect(select).toContain(`program:programs(${PROGRAMME_FIELDS}`);   // columns.ts:79 builds it that way
expect(PROGRAMME_FIELDS).toContain(UNIVERSITY_FIELDS);              // columns.ts:56 interpolates it
expect(select).toContain(CHECKLIST_FIELDS);                         // columns.ts:79,86
```

True by construction. `:71-73` (`not.toContain('(')` on the literal `'id,status,program_id'`) and the balanced-parens check are near-vacuous. The falsifiable half of the file — `'name:course_name'`, `'level:study_level'`, `'application_id'`, `not.toContain('deadlines(')`, the no-whitespace check — is real and would catch the regressions the module header names.

### 2.3 `__tests__/counsellor/application-status.test.ts:266-275` — a test named for a bug it cannot detect

```ts
it('does not flag an enrolled application as an incomplete one', () => {
  const stale = studentWith('a', ['enrolled']);
  stale.lastActive = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const stats = deriveCohortStats([stale]);
  expect(stats.appFunnel.enrolled).toBe(1);
  expect(stale.flags).not.toContain('stalled');   // ← the fixture asserting itself
});
```

`stale.flags` comes from the `studentWith` helper (`:230 flags: []`); `deriveCohortStats` never computes flags. **Verified by mutation:** reverting `isOpenApplication` (`src/lib/counsellor/data.ts:90-91`) to the deny-list it warns about fails three tests in `cohort-loader.test.ts` and `derivations.test.ts` — and this one, the test *named* for the bug, stays green.

### 2.4 `__tests__/counsellor/custom-widgets.test.ts:423-451` — a closed loop

`CUSTOM_WIDGET_SOURCE_META`, `aggregateCustomWidget` and `isValidCustomWidgetDef` all read the same `SOURCES` map, so they are structurally incapable of disagreeing; `expect(result!.unitPlural).toBe(meta.unitPlural)` compares `SOURCES[x].unitPlural` to itself. **Verified:** replacing the `schoolCountry` dimension's `values` with `() => null` — a dimension that renders as a permanently empty widget, the exact failure the comment names — keeps the counsellor suites green.

Same file, `:185-191`: `expect(result!.total).toBe(result!.rowTotal)` — two outputs of the function under test compared to each other.

### 2.5 `__tests__/ui/badge.test.tsx` — tests the wrong thing, and says otherwise

The docstring claims the file is the contract for "the tailwind-merge hazard the primitive's own docstring records". It is not. With `size="sm" variant="neutral"`, removing the `'font-size': ['text-label','text-body-sm']` extension at `src/lib/utils.ts:26-32` silently drops `text-foreground` — and the test asserts `text-label`, which survives either way. Two further assertions cannot fail at all: `:20` `not.toHaveClass('text-xs')` (cva emits one size class, never `text-xs` for `sm`) and `:40-41` (`variant: { bare: '' }` emits the empty string, so neither excluded class is ever present).

The hazard *is* covered — by `__tests__/ui/notification-bell.test.tsx:146`. The badge file is decoration.

### 2.6 `__tests__/ui/dialog.test.tsx` — 178 lines, mostly Radix

Focus-on-open, `role`/`aria-labelledby`/`aria-describedby` wiring, the Tab and Shift+Tab traps, outside-page `aria-hidden` — all third-party invariants. `:89` `expect(dialog).not.toHaveAttribute('aria-modal')` asserts that *Radix* does not set an attribute.

Two assertions in the file are load-bearing (`:149`, `:163`, the hand-written `onCloseAutoFocus`/`openerRef` restore), and the mutation matrix shows they pull nine call-site assertions across six files with them. The other nine cases test a dependency.

### 2.7 Scattered, one or two per file

| Location | Problem |
|---|---|
| `__tests__/profile/intake-options.test.ts:103-105` | `expect(GRADUATION_YEARS).toBe(GRADUATION_YEARS)` — `x === x` on a `const` export |
| `__tests__/auth/role-context.test.tsx:85-88` | `'is ignored once cleared, falling back to the server role'` — never sets or clears `sessionStorage`. Byte-identical to `:42-49`, with a name promising a path it does not drive |
| `__tests__/profile/intake-validation.test.ts:342-348` | `expect(validateStep(1, x)).toEqual(validateStep1(x))` — both sides from the code under test |
| `__tests__/profile/intake-validation.test.ts:333-337` | `validateStep4` is literally `() => ({})` |
| `__tests__/profile/intake-logic.test.ts:537-540` | idempotence, strictly implied by the round-trip assertion 14 lines above |
| `__tests__/profile/…characterization.test.tsx:1058-1067` | `mock.calls[1][0]` `toEqual` `mock.calls[0][0]` — a wholly wrong payload passes provided it is wrong twice |
| `__tests__/profile/intake-schema.test.ts:346-348, 353-355` | `if (!result.success) throw …; expect(result.success).toBe(true)` — the assertion is dead code |
| `__tests__/counsellor/derivations.test.ts:598-601` | `'does not look up names when there are no documents'` — the double records no calls, so "does not look up" is unasserted. **Verified:** deleting the early return at `data.ts:900` keeps the suites green |
| `__tests__/counsellor/decks.test.ts:353-361` | quest order asserts fixture order. **Verified:** deleting both `.order()` calls at `decks.ts:130-131` keeps the suites green |
| `__tests__/counsellor/application-status.test.ts:61-66` | `stage-colors.ts:51-52` is literally `label: STAGE_LABEL[status], text: v.text` |
| `__tests__/parent/slice.test.ts:122` | `expect(ACTIVE_CHILD_COOKIE).toBe('ascenda-parent-child')` — both producer and consumer import the constant |
| `__tests__/auth/policy.test.ts:135, :140` | `expect(COUNSELLOR_PORTAL_OPEN_TO_ALL).toBe(true)` — pure change-detector (the paired `can()` assertion is real) |
| `__tests__/env.test.ts:115-119` | sole `not.toThrow()` — defensible as the CI-env invariant, but proves nothing about parsed values |
| `__tests__/ui/help-thread-drawer.test.tsx:101`, `assistant-mobile-rail.test.tsx:101` | `expect(dialog.getAttribute('aria-describedby')).toBeTruthy()` — presence, never resolved to content |

### 2.8 Three places where a docstring claims a guard the file does not exercise

- `__tests__/ui/universities-deck-dialogs.test.tsx:8-12`: "an in-flight delete must not be dismissable… this file pins it." No test ever sets `isDeletingDeck === true`. The guard at `_universities-client.tsx:392-395` is untested.
- `__tests__/auth/policy.test.ts:236-256` `'covers every prefix middleware protects'` hand-copies `PROTECTED_PREFIXES` from `src/middleware.ts:5-20` (a non-exported const). The two lists are currently identical — 14 entries, same order — but adding `/billing` to middleware without a `ROUTE_POLICY` entry passes this test, which is exactly the scenario its own comment says it prevents.
- `__tests__/counsellor/cohort-loader.test.ts:453` asserts `academic.select` equals a template built from the same `COMPLETION_COLUMNS` the code interpolates. It is a tautology — but line **454** backstops it with a literal `toContain('english_status')`, and that literal is what fires (M4). Good instinct; worth copying to the other two column-list assertions, which have no backstop.

### 2.9 Not found (credit where due)

No test in the branch is a bare "renders without crashing". No sole-`toBeDefined()` case. The `it.each` suites in `policy.test.ts`, `dialog.test.tsx`, `application-status.test.ts` and `derivations.test.ts` are real table-driven tests. Two tests I initially flagged as assertion-free (`use-search-results.test.ts:293`, `:429`) turn out to have real assertions earlier in the body; only the trailing `await act(…)` block — whose comment claims "must not throw or update anything" — is unasserted.

---

## 3. Do the Supabase doubles model PostgREST?

Seven hand-rolled doubles. **Their fidelity varies enormously, and the variance maps exactly onto which mutations were caught.**

### Faithful enough to catch real bugs

- **`__tests__/counsellor/cohort-loader.test.ts:38-92`** — its header says it "actually honours `eq` / `in` / `order` / `limit`, because a double that ignored `.eq()` would attribute every student's matches to every other student and hide the bug it exists to catch." It does. Best double in the branch. Its `loadRoster` tests assert *arguments* (`expect(argsOf(…, 'eq')[0]).toEqual(['role','student'])`), which is why they catch the `'counsellor.student'` find-and-replace bug that six other gates missed. Errors are objects with `code`, and `42501` correctly drives `DataError.kind === 'permission_denied'`. It even models PostgREST's embedded-relation ambiguity (object vs single-element array) and tests it.
- **`__tests__/hooks/use-search-results.test.ts:60-90`** — correctly thenable (`builder.then = …`), so awaiting after chaining triggers the response exactly as `PostgrestBuilder` does; `data: []` on empty select; `.maybeSingle()` → `data: null, error: null`; `head:true, count:'exact'` → `{ data: null, count }`. All correct. Filters are *recorded*, not applied — but the tests assert the recorded arguments, which is the right thing to assert against a recorder.
- **`__tests__/matching/score-programs.test.ts:57-119`** — models per-batch outcomes in call order, so total-failure and partial-failure are genuinely distinguishable, and uses real error shapes (`{ code: '57014', message: 'canceling statement due to statement timeout' }`).

### Not faithful — and this is where the bugs got through

- **`__tests__/data/applications.test.ts:31-49`** — `eq: () => query, in: () => query, order: () => query`. Arguments discarded, and the recorder's type is `type Call = { table: string; select: string }`, so there is nowhere to put them. **No assertion on `profile_id` exists anywhere in `__tests__/data/`.** No `limit`, no `maybeSingle`, so `loadApplicationBoard(…, {limit})`, `loadApplicationLabel` and `loadApplicationSummaries` are unexercised. This is the double that let M7 through.
- **`__tests__/auth/identity.test.ts:43-45`** — `select: () => ({ eq: () => ({ maybeSingle }) })`. The suite asserts `toHaveBeenCalledWith('profiles')` and nothing else, so `.eq('id', user.id) → .eq('role', user.id)` and `.select('role') → .select('id')` both survive. `__tests__/auth/role-context.test.tsx:35` has the same hole. Note that `__tests__/auth/policy.test.ts:37-51` *does* capture the id — the right pattern exists in the same directory.
- **`__tests__/counsellor/application-status.test.ts:111-124`** — ignores filters entirely, and admits it (`:108 "ignores the filters"`). **Verified:** re-introducing the live `'counsellor.student'` bug in the cohort path fails 59 tests in `cohort-loader.test.ts` and **0** here (31/31 green). Its three `loadCohort` tests test the double.

### Systematic gaps across all seven

- **`select(…)` column lists are ignored by every double.** They return the whole fixture row regardless. This nullifies the third property `cohort-loader.test.ts`'s own header declares load-bearing ("Column lists are part of a query's meaning"). **Verified:** shortening the outcomes select at `data.ts:825` — the outcomes page silently losing response dates, conditions and platform — passes 215/215 in the counsellor suites.
- **`.single()` never errors.** `decks.test.ts:61-64` returns `{ data: rows[0] ?? null, error: null }` — that is `maybeSingle` semantics. The real client returns `PGRST116` on 0 rows. `createDeck`/`upsertDeckCard` both end in `.single()`; the RLS-blocked-insert case is unmodelled, even though `errors.ts:106` maps that code.
- **No error object carries `details`/`hint`.** `errors.ts:128-139`'s handling of those fields is never exercised. `use-search-results.test.ts:946` feeds `{ message: '{"code":"57014","details":null}' }` — a shape PostgREST cannot emit; the real shape is used two tests earlier, so that one test guards a synthetic input.
- **No double parses `.or()`**, so the "never let a raw query reach `.or()`" tests are regexes over recorded arguments — they cannot prove PostgREST would accept the string. Embedded-filter semantics (`!inner` vs `!left`) are asserted as a *substring of the select string*, so the real bug class — an embedded filter that silently fails to constrain the parent under `!left` — is invisible.
- Builders are re-awaitable; the real one executes once. `.catch()`/`.finally()` do not exist.

**Verdict.** These are recorders, not simulators. That is a legitimate design *when the tests assert the recorded arguments* — `cohort-loader` and `use-search-results` do, and they catch real bugs. Where the recorder throws the arguments away (`applications`, `identity`, `role-context`, `application-status`), the tests are asserting the double. The bugs that got through are precisely the security-shaped ones.

---

## 4. The mutation experiment

Each mutation is a single realistic edit applied to a scratch copy of the repo, the **full 1,069-test suite** run, then reverted. `[NEG]` marks a mutation I expected to survive.

### 4.1 Results

<!--MUTATION_TABLE-->

### 4.2 What the results mean

<!--MUTATION_ANALYSIS-->

---

## 5. Golden files — were they laundered?

**No.** This is the finding I most expected to go the other way.

Provenance across the 11 commits: all 8 goldens were created in `c620957` (Phase 1, the gate layer). Five were updated in `155ee88` (Phase 2, the logic change) — the exact "updated in the same commit as the change that broke it" pattern. But:

- **The commit message carries independent numeric justification**, not a shrug: the 25 originally-tabulated values were checked for internal monotonicity *first* and preserved exactly; only the 30 missing signatures were filled, by a position-weighted fit (1.2 : 1 : 0.8) chosen because it reproduces the original table best (absolute fit error 22.0, versus 36.7 equal-weight and 55.0 for 3:2:1), each clamped into the range dominance permits.
- **`a-level-monotonicity.golden.json` is a computed acceptance criterion, not a recording.** The test enumerates all 1,120 ordered pairs at runtime and serialises the violations; the committed file moved from `violation_count: 34` to `0` with an empty array. Reintroducing an inversion changes the byte output and fails (verified — M6).
- **The assertions were strengthened, not weakened.** `scoring-golden.test.ts:1039-1054` replaced four `toBe(8)` assertions with four *exact* new values (`67`, `46`, `38`, `31`) **plus** five new dominance properties. `student_scoring.test.ts:201` moved `toBe(39) → toBe(44)` — still exact, with the reason inline.
- `assertGolden` refuses to auto-create a missing golden (`scoring-golden.test.ts:112-116`), so a *new* golden cannot silently self-certify. `UPDATE_GOLDEN=1` is a separate, documented, non-default script.
- I checked all other new test directories for softening: `git log -p origin/main..HEAD -- __tests__/auth/ __tests__/ui/ __tests__/matching/` shows **zero removed assertion lines**. In `__tests__/profile/`, the only three expectation changes (commit `b5119ae`) are all *strengthenings* (absence → presence, empty accessible name → a specific name).

### The one genuine weakening

`scoring-golden.test.ts:1161-1174`:

```diff
-    expect(asEmitted?.rigour_score).toBe(0);
+    expect(asEmitted?.rigour_score).toBeGreaterThan(0);
+    expect(asEmitted?.rigour_score).toBe(asIntended?.rigour_score);
```

`toBe → toBeGreaterThan` is the pattern to watch for, and the added line compares two outputs of the same function to each other (both could drift together). It is backstopped — the accompanying `assertGolden('act-rigour-paths.golden.json', …)` pins `rigour_score: 13` byte-for-byte — but the exactness now lives one indirection away from the test that reads as the check.

### Documentation rot inside the artefacts

Two goldens now contradict themselves. Neither affects a result; both will mislead the next reader.

- `act-rigour-paths.golden.json`: `"rigour_score":13` sits beside `"note":"F-04: what every real ACT student gets — rigour 0"`, its `_method` still says "Only the AP row reaches RigourTable.ACT", and its `_known_bugs` still calls the AP row "unreachable dead configuration".
- `a-level-signatures.golden.json`'s `_known_bugs` (emitted from `scoring-golden.test.ts:999-1001`) still declares F-01 live — "30 of the 56 signatures are absent … producing strict-dominance inversions" — next to a companion file asserting zero inversions.

### A calibration caveat (domain, not test quality)

30 of the 56 A-level values (54% of the table) are now asserted byte-exact but justified only by a curve fit. Dominance constrains only *comparable* pairs, so non-comparable placements are unconstrained by the property test — e.g. `A*A*D` at 67 outranks `AAB` at 60, which is a defensible fit output and a questionable admissions statement (a D fails most UK offers). The golden now pins it as fact. Worth a domain review before anyone treats these as calibrated.

Also: there is no direct `expect(violations).toHaveLength(0)`. The stated acceptance criterion is enforced only transitively, through the byte comparison. It works; it should still be an assertion.

---

## 6. Skipped, disabled, `.only`

Complete sweep for `it.skip` / `describe.skip` / `it.failing` / `it.todo` / `xit` / `xdescribe` / `fit` / `fdescribe` / `.only` across `__tests__/` and `e2e/`:

| Location | Kind | Justified? |
|---|---|---|
| `e2e/profile-wizard.e2e.ts:113` | `test.skip(!hasE2ECredentials(), E2E_SKIP_REASON)` | **Yes.** Conditional, with a reason string explaining that `/profile/wizard` is behind middleware and that weakening auth to make a test pass is not an option |
| `e2e/auth.setup.e2e.ts:29` | `setup.skip(!hasE2ECredentials(), …)` | **Yes**, and correctly ordered *after* the empty `storageState` file is written, so the dependent project can still start |
| `__tests__/counsellor/cohort-loader.test.ts:421` | comment only — "written as `it.failing` against a LIVE BUG, now FIXED" | **Not a skip.** Historical note; the tests are ordinary and they discriminate — reintroducing the bug fails 9 of them |

**No `.only` anywhere. No `it.todo`. No unconditional skip. No `xit`.** This is the cheapest way for a test-count claim to be fraudulent, and it is not being done here.

---

## 7. The Playwright suite

**The author's statement is accurate.** `docs/audit/13-remaining-work.md:31` says "The Playwright wizard spec has never executed", and the code does what that implies.

- `test.skip(!hasE2ECredentials(), …)` at `profile-wizard.e2e.ts:113` sits in the `describe` body — the conditional group-skip form. With `E2E_EMAIL`/`E2E_PASSWORD` unset the spec is reported **skipped**, not run and not silently passed.
- **It could not silently pass.** The spec has ~55 `expect()` calls across the fill and the round-trip verification, and there is no mid-body `test.skip()` hiding a selector. Run against a real account with a drifted selector, it fails.
- The skip *condition* is correct: `Boolean(process.env.E2E_EMAIL && process.env.E2E_PASSWORD)`. There is no test-only auth bypass in `src/middleware.ts` — I checked. The setup project drives the real `/login` form and reuses the resulting cookies.
- `harness-smoke.e2e.ts` is a real canary: it drops `storageState` to behave as an anonymous visitor and asserts middleware bounces `/profile/wizard` to `/login`. `npx playwright test --list` reports 4 tests in 3 files; `test-results/.last-run.json` records `{"status":"passed","failedTests":[]}` from a prior local run and `.playwright/storage-state.json` is `{"cookies":[],"origins":[]}` — consistent with 2 smoke passes and 2 skips. (I did not re-execute it: the dev server points at the production Supabase project, and this review is read-only against prod.)

**The finding is not the spec — it is the CI wiring.** `.github/workflows/ci.yml:298-321` gates *every* Playwright step on `secrets.E2E_EMAIL && secrets.E2E_PASSWORD && secrets.E2E_SUPABASE_URL`. Those secrets are not configured, so **the entire browser suite — including `harness-smoke`, which needs no credentials — never runs in CI**, and `e2e` is deliberately absent from `ci-ok`'s `needs`. The `database` job is likewise absent.

So of the nine gates the register counts, **two do not gate**, and the browser suite contributes zero tests and zero signal today. Both job headers disclose this. But "all nine gates green" reads differently once you know two of them are unreachable.

---

## 8. `__tests__/db/*.sql` — 773 lines that nothing runs

`__tests__/db/policy-invariants.sql` (387 lines) and `__tests__/db/rls-negative-cases.sql` (386 lines) are the RLS/authz assertion set. They are referenced by their own headers, each other, and two prose lines in `supabase/MIGRATIONS.md`. **Nothing executable references them** — not `ci.yml`, not `package.json`, not `scripts/`. Jest does not collect `.sql`.

`policy-invariants.sql:3-5` says so: "⚠️ NOT RUN. Written for review by the database audit … No database was contacted while writing it." Its own header then argues it *should* be the merge gate and *could* run in the CI `database` job (it reads `pg_policies`/`pg_class`/`pg_proc`/`pg_index`/`pg_constraint` and needs no `auth.uid()`, so unlike its companion it would not be vacuous under the job's `auth.uid() → null` stub). It simply is not wired up.

This is honest work in the wrong place. Sitting under `__tests__/`, 773 lines of never-executed SQL read as part of the safety story. They are not.

---

## 9. The timezone finding — the largest systemic gap

**`parseLocalDate` is an identity function under `TZ=UTC`.** By construction:

```ts
parseLocalDate('2026-03-01')  →  new Date(2026, 2, 1)   // local midnight
new Date('2026-03-01')                                   // UTC midnight
```

Under `TZ=UTC` these are the same instant. So **any test that would catch the removal of `parseLocalDate` must run in a non-UTC zone.** `.github/workflows/ci.yml` sets no `TZ`, and `ubuntu-latest` runs UTC.

The branch built exactly the right tool for this — `jest.environment-tz-west.js`, which pins `America/Los_Angeles` in the worker's real context (the header correctly explains why `process.env.TZ = …` inside a test file does nothing). **It is used by exactly one file.**

```
test files touching date logic:   19
test files using tz-west:          1   (__tests__/matching/date-only-render.test.tsx)
```

That one file is excellent — see M1/M2 below. Everything else that claims to guard the date-only bug class — `__tests__/counsellor/derivations.test.ts:189, 227-261`, `__tests__/counsellor/cohort-loader.test.ts:584-592`, `__tests__/checklist/due-label.test.ts`, `__tests__/ui/analytics-drilldown.test.tsx` and the rest — runs in the ambient zone, which in CI is UTC, where the assertions cannot discriminate.

<!--TZ_RESULT-->

This is the single highest-leverage fix in the review: adding `/** @jest-environment ./jest.environment-tz-west.js */` to the date-sensitive suites costs one line each and converts ~30 currently-inert tests into real guards.

---

## 10. Determinism

<!--DETERMINISM_RESULT-->

---

## 11. What I would do about it

Ranked by confidence bought back per unit of effort:

1. **Assert query scoping in `__tests__/data/`.** Widen the `applications.test.ts` recorder to capture `eq`/`in` arguments the way `cohort-loader.test.ts` already does, and assert `['profile_id', profileId]` on all six loaders. ~20 lines; closes the single largest hole in the branch (M7). `__tests__/counsellor/decks.test.ts:373` is the model.
2. **Same for `__tests__/auth/identity.test.ts` and `role-context.test.tsx`** — capture and assert the `.select()` column and the `.eq()` pair (M13). `policy.test.ts:37-51` already does it right.
3. **Add `@jest-environment ./jest.environment-tz-west.js` to every date-sensitive suite** (§9). One line each; converts ~30 inert tests into real guards.
4. **Test `persist-intake.ts` at all** (M5). The Phase 2 commit describes a data-loss fix and a compensating-transaction design; both are unverified. A double that fails the insert and asserts the restore fires is a dozen lines.
5. **Test `middleware.ts` at all** — 0% on the file this project has already shipped an auth bypass in once, and the one place `PROTECTED_PREFIXES` lives.
6. **Export `PROTECTED_PREFIXES`** so `policy.test.ts:236` imports it instead of hand-copying it.
7. **Make the doubles honour `select()` column lists**, or add a literal `toContain` backstop to every column-list assertion the way `cohort-loader.test.ts:454` does. Today a shortened select is undetectable.
8. **Wire `policy-invariants.sql` into the CI `database` job**, and add `database` to `ci-ok`'s `needs`.
9. **Fix the six empty-body `it.each` cases in `call-sites.test.ts`** — assert `matches.length > 0` before each loop, so a regex that stops matching fails loudly instead of passing silently. Delete the four tautologies in `columns.test.ts`.
10. **Extend the total-batch-failure test to more than one batch** — the current fixture passes 2 ids, so `batchResults.length === 1`; a multi-batch outage is untested.
11. **Refresh the stale annotations in the two goldens** (§5) so the artefacts stop contradicting themselves.
12. **Add a per-directory coverage floor on `src/lib/**`** so the number cannot regress quietly. The CI comment already proposes this and is still stale at "~13%".

---

## Appendix A — mutation matrix, raw output

<!--RAW_MUTATIONS-->
