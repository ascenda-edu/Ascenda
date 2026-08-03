# Lane F — tests: do they defend anything?

## 1. Summary

**Executed vs inferred: 100% of the claims below were executed.** Every mutation was
injected into the working tree, run against a real `jest` invocation, and reverted; every
number quoted is copied from that run's output. Nothing in the mutation table is inferred
from reading. The only inferred content is the *severity* assigned to each finding.

**Baseline (executed):** `TZ=UTC npx jest --silent` -> 67 suites, 1541 tests, all pass,
224.7 s (under concurrent load from lanes B and E). `TZ=America/Los_Angeles npx jest
--silent` -> 67 suites, **1541 tests, all pass**, 144.7 s. Item 6 is green in both zones.

**Mutations: 30 injected · 21 caught · 9 survived · mutation score 70%.**

The nine survivors are not a scattered tail. **Every single one is an authorization or
tenancy-scoping check**, and they cluster in exactly the places the previous round did not
look: `src/lib/chat/tools/`, `src/lib/chat/context.ts`, and the API route handlers under
`src/app/api/`. Not one survivor is a formatting or presentation defect.

**The headline result.** All nine survivors were then applied *simultaneously* — 17 changed
lines across 9 files, spanning the student assistant, the parent portal, the counsellor
routes and the admin guard — and the full suite still reported **67 suites, 1541 tests, all
pass**. A branch carrying a cross-tenant read in the assistant, an unauthenticated admin
bypass, and three unscoped counsellor/parent writes is indistinguishable from a clean one
by this test suite.

**Commit `b4a1923` was verified independently and it is real, but it is narrower than its
message claims.** Its message says "the double now records `.eq()`/`.in()` … and scope is
stated as its own per-loader property". That is true — and it fixed the problem *only
inside* `__tests__/data/`, `__tests__/counsellor/` and `__tests__/profile/`. Mutations
M11–M19 (persist-intake and the counsellor cohort loader) were all caught, several by
dozens of tests, which is the fix working. But the identical `Call = { table, select }`
blind spot still exists verbatim in `__tests__/chat/student-read-tools.test.ts`
(`thenable()` at line 29 builds `eq: jest.fn(() => builder)` — the arguments are discarded),
which is why M01/M01b/M02 survive. The test-double fix was applied per-directory, not
per-pattern.

**Item 3 (persist-intake rollback) is fully defended.** Five mutations against the
snapshot, the delete scope, the restore branch, the error rethrow and the match-cache wipe
were all caught (M11–M15). This is the best-tested module in the repo.

**Item 4 (identity caching) is genuinely fixed, and I verified it without touching lane B's
files.** I built a module-global-memo mutant of `identity.ts` in a scratch copy and ran the
real `__tests__/auth/identity-cache.test.ts` against it via a `moduleNameMapper` override:
**7 of 7 tests fail.** The `inRequest()` scope stand-in really does discriminate React
`cache()` from a module-global memo. This is the one previously-reported hole that is
properly closed.

**Item 2 (vacuous tests): I confirmed 1, not the 60–75 previously reported.** A scripted
sweep of all 994 `it`/`test` declarations found **zero** bodies with no `expect()`, and
exactly one tautology: `scoring_validation.test.ts:136` `expect(true).toBe(true)`, which is
honestly labelled as a console-report harness. An `it.each` over an empty array throws in
jest rather than passing silently, so that class cannot hide here. The previously-reported
vacuous population appears to have been genuinely cleaned up. **The suite's problem is not
vacuous tests — it is tests that assert the cosmetic half of a security-relevant call.**

**Item 5 (flakes): 5/5 passed.** No flake reproduced.

---

## 2. Mutation table

`git status` was checked before every mutation and confirmed free of foreign (lane B / lane
E) changes; three attempts aborted on a dirty `src/lib/auth/identity.ts` and were re-run
after the tree cleared. Every mutation was reverted with `git checkout -- <path>` and the
revert verified.

Commands are `npx jest` invocations run from the repo root. "Foreign-clean" = the
pre-mutation `git status --short -- src supabase __tests__` showed no other lane's work.

| # | File:line | Change | Command (test selection) | Foreign-clean | Result | Caught by |
|---|---|---|---|---|---|---|
| M01 | `src/lib/chat/tools/student-read.ts:152` | delete `.eq('profile_id', ctx.userId)` from `get_my_matches` | `--silent __tests__/chat/` | YES | **SURVIVED** (16 suites, 170 pass) | — |
| M01b | `src/lib/chat/tools/student-read.ts:152,262` | delete the scope filter from **both** `get_my_matches` and `get_my_shortlist` | `--silent` (full suite) | YES | **SURVIVED** (67 suites, **1541 pass**) | — |
| M02 | `src/lib/chat/context.ts:98,105,110,115,126` | all five `.eq('profile_id', userId)` -> `.eq('profile_id', 'someone-else')` | `--silent __tests__/chat/context.test.ts __tests__/chat/route.test.ts` | YES | **SURVIVED** (35 pass) | — |
| M03 | `src/lib/api/guards.ts:75` | `isActionableStudent`: `data.role === 'student'` -> `'counsellor'` | `--silent __tests__/auth/policy.test.ts __tests__/chat/route.test.ts __tests__/chat/counsellor-tools.test.ts` | YES | CAUGHT (4 failed / 65) | `auth/policy.test.ts:208` |
| M04 | `src/lib/api/guards.ts:48` | `canActAsCounsellor`: `role==='counsellor' \|\| 'admin'` -> `role==='student'` | same as M03 | YES | CAUGHT (4 failed / 65) | `auth/policy.test.ts:93` |
| M05 | `src/lib/api/guards.ts:74` | `isActionableStudent` fail-open: `if (error \|\| !data) return false` -> `return true` | `--silent __tests__/auth/policy.test.ts __tests__/chat/route.test.ts` | YES | CAUGHT (1 failed / 50) | `auth/policy.test.ts:183` |
| M06 | `src/lib/api/guards.ts:143` | `filterActionableStudentIds` fail-open: `if (error \|\| !data) return []` -> `return unique` | `--silent __tests__/auth/policy.test.ts __tests__/chat/counsellor-tools.test.ts __tests__/chat/route.test.ts` | YES | **SURVIVED** (3 suites, 65 pass) | — |
| M07 | `src/lib/api/guards.ts:146` | `.filter(row => row.role === 'student')` -> `!== 'student'` | same as M06 | YES | CAUGHT (2 failed / 65) | `auth/policy.test.ts:122` |
| M08 | `src/lib/matching/match-tier.ts:105` | `safe: 80` -> `safe: 79` | `--silent __tests__/tiering/ __tests__/matching/` | YES | CAUGHT (1 failed / 336) | `tiering/tier-rule-singularity.test.ts:69` |
| M09 | `src/lib/matching/match-tier.ts:121` | `score >= TIER_THRESHOLDS.safe` -> `score >` (off-by-one at the exact boundary) | same as M08 | YES | CAUGHT (2 failed / 336) | `tier-rule-singularity.test.ts:121` |
| M10 | `src/lib/matching/match-tier.ts:120` | unknown score `return null` -> `return 'Reach'` | same as M08 | YES | CAUGHT (3 failed / 336) | `tier-rule-singularity.test.ts:80` |
| M11 | `src/lib/profile/persist-intake.ts:45` | delete `.eq('profile_id', userId)` from the **snapshot** read | `--silent __tests__/profile/persist-intake.test.ts` | YES | CAUGHT (3 failed / 22) | `persist-intake.test.ts:404` |
| M12 | `src/lib/profile/persist-intake.ts:51` | delete `.eq('profile_id', userId)` from the **DELETE** (would erase every student's subjects) | same as M11 | YES | CAUGHT (3 failed / 22) | `persist-intake.test.ts:404` |
| M13 | `src/lib/profile/persist-intake.ts:61` | disable the restore branch (`if (previous && …)` -> `if (false && …)`) | same as M11 | YES | CAUGHT (7 failed / 22) | `persist-intake.test.ts:386` |
| M14 | `src/lib/profile/persist-intake.ts:70` | swallow the insert error: `throw new Error(insertError.message)` -> `return;` | same as M11 | YES | CAUGHT (6 failed / 22) | `persist-intake.test.ts:326` |
| M15 | `src/lib/profile/persist-intake.ts:218` | match-cache wipe `.eq('profile_id', userId)` -> `'nobody'` | same as M11 | YES | CAUGHT (1 failed / 22) | `persist-intake.test.ts:416` |
| M16 | `src/lib/counsellor/data.ts:279` | `.eq('role','student')` -> `.eq('role','counsellor')` (the historical `'counsellor.student'` bug class) | `--silent __tests__/counsellor/ __tests__/chat/counsellor-tools.test.ts` | YES | CAUGHT (**59** failed / 237) | `counsellor/cohort-loader.test.ts:802` |
| M17 | `src/lib/counsellor/data.ts:338` | `.eq('profile_id', id)` -> `'someone-else'` (per-student match read) | same as M16 | YES | CAUGHT (7 failed / 237) | `counsellor/cohort-loader.test.ts` |
| M18 | `src/lib/counsellor/data.ts:868` | `.eq('profile_id', pid)` -> `'someone-else'` | same as M16 | YES | CAUGHT (1 failed / 237) | `counsellor/cohort-loader.test.ts` |
| M19 | `src/lib/counsellor/data.ts:950` | `.eq('student_profile_id', studentId)` -> `'someone-else'` (notes read) | same as M16 | YES | CAUGHT (2 failed / 237) | `counsellor/cohort-loader.test.ts` |
| M20 | `src/app/api/parent/messages/route.ts:46` | drop the linked-child check: `if (!contact \|\| !linkedChildIds.includes(...))` -> `if (!contact)` | `--silent __tests__/parent/ __tests__/auth/policy.test.ts` | YES | **SURVIVED** (2 suites, 40 pass) | — |
| M21 | `src/app/api/checklist/route.ts:116` | drop the DELETE owner check: `if (checklistRow.applications?.profile_id !== user.id)` -> `if (false)` | `--silent __tests__/checklist/` | YES | CAUGHT (1 failed / 34) | `checklist/route.test.ts:178` |
| M22 | `src/app/api/admin/admin-guard.ts:81` | unauthenticated caller no longer 401s: `return { user: null, response: 401 }` -> `return { user: {id:'anon'}, response: null }` | `--silent __tests__/admin-import-validation.test.ts __tests__/auth/policy.test.ts` | YES | **SURVIVED** (2 suites, 27 pass) | — |
| M23 | `src/lib/profile/completion.ts:51` | drop `english_status` from `COMPLETION_COLUMNS.academicInput` (the permanent-lockout bug) | `--silent __tests__/profile/ __tests__/middleware/ __tests__/counsellor/` | YES | CAUGHT (2 failed / 614) | `middleware/middleware.test.ts:449` |
| M24 | `src/lib/chat/tools/student-write.ts:261` | drop the task ownership check: `if (owner?.profile_id !== ctx.userId) return null` -> `if (false)` | `--silent __tests__/chat/` | YES | **SURVIVED** (16 suites, 170 pass) | — |
| M25 | `src/lib/auth/identity.ts` (scratch copy — tree untouched) | React `cache()` -> module-global memo (cross-request identity leak) | `--config <scratch>/jest.idmut.js __tests__/auth/identity-cache.test.ts` | YES | CAUGHT (**7 failed / 7**) | `auth/identity-cache.test.ts` — both dedup tests + all five scope tests |
| M26 | `src/app/api/counsellor/notes/route.ts:41` | bypass `assertCounsellorMayActOnStudent`: `if (!scope.ok)` -> `if (false)` | `--silent __tests__/counsellor/ __tests__/auth/policy.test.ts` | YES | **SURVIVED** (247 pass) | — |
| M27 | `src/app/api/counsellor/decks/assign/route.ts:57` | pass the **unfiltered** `studentIds` to `assignDeck` instead of `allowedStudentIds` | same as M26 | YES | **SURVIVED** (247 pass) | — |
| M28 | `src/lib/counsellor/data.ts:68` | cohort membership -> `return true` (every profile is in every counsellor's cohort) | `--silent __tests__/counsellor/ __tests__/chat/counsellor-tools.test.ts` | YES | CAUGHT (6 failed / 237) | `__tests__/counsellor/` |
| M29 | `src/lib/matching/service.ts:820` | `matchTierFromScore(match.chance_percent)` -> `matchTierFromScore(100 - match.chance_percent)` (tier inverted) | `--silent __tests__/matching/ __tests__/tiering/` | YES | CAUGHT (1 failed / 336) | `tiering/tier-rule-singularity.test.ts` |
| M30 | `src/app/api/profile/export/route.ts:53–57` | all five `.eq('profile_id', user.id)` -> `'someone-else'` (export another student's whole record) | `--silent __tests__/profile-export.test.ts __tests__/profile/` | YES | **SURVIVED** (7 suites, 313 pass) | — |
| **ALL-9** | 9 files, 17 lines (M01b + M02 + M06 + M20 + M22 + M24 + M26 + M27 + M30 together) | every survivor at once | `--silent` (full suite) | YES | **SURVIVED** (67 suites, **1541 pass**, 151.6 s) | — |

Post-run verification: `git status --short` -> only `docs/audit/AUDIT-LEDGER.md`,
`docs/audit/AUDIT-PROMPT.md`, `docs/audit/verify/` (untracked docs, not mine to revert).
No `src/`, `supabase/` or `__tests__/` path is modified.

---

## 3. Findings

All findings are against the **tests**, not the code. In every case the shipped source is
correct; the finding is that nothing would tell you if it stopped being correct.
`Regression?: NEW` is used where the *code* is new in this refactor and arrived without a
scope-asserting test; `NO` where both the code and the gap predate the branch.

### F-T1 — The assistant's student tools can be made to read every student's data with all 1,541 tests green
Severity: **P0**
Location: `src/lib/chat/tools/student-read.ts:152`, `:262`; test double at `__tests__/chat/student-read-tools.test.ts:29–35`
Regression?: NO (the gap predates the branch; `b4a1923` fixed this exact pattern in `__tests__/data/` but not here)
Evidence:
```
$ npx jest --silent            # with lines 152 and 262 deleted
Test Suites: 67 passed, 67 total
Tests:       1541 passed, 1541 total
```
The cause is the test double — the *same* defect `b4a1923` diagnosed:
```js
// __tests__/chat/student-read-tools.test.ts:29
const thenable = (result: unknown) => {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit']) builder[m] = jest.fn(() => builder);
  ...
```
`eq` is a `jest.fn` whose arguments are never read by any assertion. The string
`profile_id` does not appear anywhere in `__tests__/chat/`.
Repro: delete `.eq('profile_id', ctx.userId)` from `get_my_matches`. Any signed-in student
asking the assistant "what are my matches?" receives the highest-scoring `student_matches`
rows **across the whole table** — other students' programme matches — rendered into a chat
widget.
Fix: give `__tests__/chat/`'s double the recording shape `b4a1923` gave `__tests__/data/`'s
— record `.eq()`/`.in()` as `[method, column, value]` — and add one per-tool assertion that
the recorded filters include `['profile_id', ctx.userId]`.
Test: for each of `get_my_matches` and `get_my_shortlist`,
`expect(filtersOf(call)).toContainEqual(['profile_id', 'stu-1'])`. Fails with the line
deleted, passes with it present.

### F-T2 — The assistant's whole prompt context can be repointed at another student, undetected
Severity: **P0**
Location: `src/lib/chat/context.ts:98, 105, 110, 115, 126`
Regression?: NO
Evidence:
```
$ npx jest --silent __tests__/chat/context.test.ts __tests__/chat/route.test.ts
   # all five .eq('profile_id', userId) rewritten to .eq('profile_id', 'someone-else')
Test Suites: 2 passed, 2 total
Tests:       35 passed, 35 total
```
Repro: the five reads are personal information, academic input, lifestyle preference,
subject count and cached matches — the entire student record serialised into the model's
system context. Repointing them puts another student's name, nationality, school and grades
into the prompt.
Fix: as F-T1 — `__tests__/chat/context.test.ts` must assert the filter, not just the table
and the column list.
Test: `expect(filtersOf(personalCall)).toEqual([['profile_id', USER]])` for each of the five
reads.

### F-T3 — `requireAdminUser` can be made to admit unauthenticated callers with no test failing
Severity: **P0**
Location: `src/app/api/admin/admin-guard.ts:81`
Regression?: NEW (the guard is new in this refactor and shipped without a handler test)
Evidence:
```
$ npx jest --silent __tests__/admin-import-validation.test.ts __tests__/auth/policy.test.ts
   # 401 branch replaced with `return { user: { id: 'anon' } as any, response: null }`
Test Suites: 2 passed, 2 total
Tests:       27 passed, 27 total
```
Repro: three routes consume this guard — `/api/admin/import`,
`/api/admin/catalog-health`, `/api/admin/update-deadlines`. With the 401 branch gone, an
anonymous POST to `/api/admin/import` reaches the catalogue upsert.
`__tests__/admin-import-validation.test.ts` tests the *payload validator*, never the guard.
Fix: a test for `requireAdminUser` itself, covering all four dispositions (no user -> 401;
role read error -> 503; non-admin -> 403; admin -> pass).
Test: `expect((await requireAdminUser(stubWithNoUser, '/x')).response?.status).toBe(401)`.

### F-T4 — `/api/counsellor/notes` and `/api/counsellor/decks/assign` have no handler test at all
Severity: **P1**
Location: `src/app/api/counsellor/notes/route.ts:41`; `src/app/api/counsellor/decks/assign/route.ts:57`
Regression?: NO
Evidence:
```
$ npx jest --silent __tests__/counsellor/ __tests__/auth/policy.test.ts
   # M26: `if (!scope.ok) {` -> `if (false) {`
Tests: 247 passed, 247 total
   # M27: assignDeck(..., studentIds, ...) instead of allowedStudentIds
Tests: 247 passed, 247 total
```
`grep -rl "counsellor/notes\|decks/assign" __tests__/` returns no `.test.ts` file — the only
hit is `__tests__/db/rls-negative-cases.sql`.
Repro: M26 lets any caller who clears the counsellor check write a `counsellor_notes` row
against **any** profile id. M27 is worse because it is a bulk path:
`filterActionableStudentIds` is still called (so the 403-on-null branch still works and
looks correct in review) but its result is discarded, so a deck is assigned to every id in
the request body, and the `outOfScope` skipped-count arithmetic below it silently reports
success.
Fix: two route-handler tests, in the style of `__tests__/checklist/route.test.ts` — which
does exactly this correctly, and caught M21.
Test: for notes, `expect(res.status).toBe(403)` when `assertCounsellorMayActOnStudent`
returns `{ok:false,reason:'forbidden'}`. For decks, assert `assignDeck` was called with
**only** the allowed subset when the guard filters one of two ids.

### F-T5 — `/api/parent/messages` guardian scoping is untested
Severity: **P1**
Location: `src/app/api/parent/messages/route.ts:46`
Regression?: NO
Evidence:
```
$ npx jest --silent __tests__/parent/ __tests__/auth/policy.test.ts
   # `if (!contact || !linkedChildIds.includes(contact.student_profile_id))` -> `if (!contact)`
Test Suites: 2 passed, 2 total
Tests:       40 passed, 40 total
```
Repro: `guardian_links` is the *only* thing scoping the parent portal. `policy.ts:147–162`
says so explicitly — `PARENT_PORTAL_OPEN_TO_ALL = true`, justified on the grounds that
"its DATA is genuinely scoped". With this check gone, any signed-in user who knows a
`parent_contacts.id` can post into that family's counsellor thread. The one control the
open-portal posture rests on has no test.
Fix: a route-handler test.
Test: POST with a `contactId` whose `student_profile_id` is not in `resolveLinkedChildIds`
-> `expect(res.status).toBe(403)` and `expect(insertCalls).toHaveLength(0)`.

### F-T6 — `filterActionableStudentIds` fails **open** on a read error, and no test covers the error branch
Severity: **P1**
Location: `src/lib/api/guards.ts:143`
Regression?: NEW
Evidence:
```
$ npx jest --silent __tests__/auth/policy.test.ts __tests__/chat/counsellor-tools.test.ts __tests__/chat/route.test.ts
   # `if (error || !data) return [];`  ->  `if (error || !data) return unique;`
Test Suites: 3 passed, 3 total
Tests:       65 passed, 65 total
```
Note the asymmetry this exposes: the *singular* fail-closed branch at line 74 IS covered —
M05 (`return false` -> `return true`) was caught by `policy.test.ts:183`. The **bulk** one is
not. The bulk path is the more expensive of the two, and the code comment above it says so:
*"Bulk endpoints are where scoping bugs are most expensive: one request that names N
students writes N rows and, where a notification trigger is attached, fires N notifications
into N different people's feeds."* The comment is right, and nothing enforces it.
Repro: with a `profiles` read error, a deck-assign request naming 50 arbitrary profile ids
is authorised for all 50.
Fix: extend `__tests__/auth/policy.test.ts` to exercise `filterActionableStudentIds` with a
stub client that returns `{ data: null, error: {...} }`.
Test: `expect(await filterActionableStudentIds(erroringClient, counsellor, ['a','b'])).toEqual([])`.

### F-T7 — `/api/profile/export` can be repointed at another student's entire record
Severity: **P1**
Location: `src/app/api/profile/export/route.ts:53–57`
Regression?: NO
Evidence:
```
$ npx jest --silent __tests__/profile-export.test.ts __tests__/profile/
   # all five .eq('profile_id', user.id) -> .eq('profile_id', 'someone-else')
Test Suites: 7 passed, 7 total
Tests:       313 passed, 313 total
```
Repro: the route assembles and returns personal information, academic input, lifestyle
preference, subjects and admissions tests. `__tests__/profile-export.test.ts` asserts the
*shape and formatting* of the exported document and never which profile it was read for.
Fix / Test: assert the recorded filters on each of the five reads equal
`[['profile_id', user.id]]`.

### F-T8 — The assistant's `update_task_status` confirm-card ownership check is untested
Severity: **P2**
Location: `src/lib/chat/tools/student-write.ts:261`
Regression?: NO
Evidence:
```
$ npx jest --silent __tests__/chat/
   # `if (owner?.profile_id !== ctx.userId) return null;` -> `if (false) return null;`
Test Suites: 16 passed, 16 total
Tests:       170 passed, 170 total
```
Severity is P2 rather than P1 because the code comment states — and I did not disprove —
that "the execute path re-checks ownership server-side regardless"; this lookup only drafts
the card's summary text. The leak is therefore the *task name* of another student's
checklist row, not the ability to mutate it. It is still an untested ownership check on a
model-supplied id.
Fix / Test: call the card builder with a task whose `applications.profile_id` differs from
`ctx.userId` and `expect(card).toBeNull()`.

### F-T9 — The per-directory shape of the `b4a1923` test-double fix is not enforced anywhere
Severity: **P2**
Location: `__tests__/chat/student-read-tools.test.ts:29`; `__tests__/chat/context.test.ts`; contrast `__tests__/data/`, `__tests__/counsellor/cohort-loader.test.ts`, `__tests__/profile/persist-intake.test.ts`
Regression?: NEW (the fix landed in `b4a1923` without a gate that keeps it applied)
Evidence: `b4a1923`'s message asserts the double "now records `.eq()`/`.in()` as
`[method, column, value]`". Three directories do; `__tests__/chat/` does not, and there is
no test, lint rule or type that would notice. This is the same failure mode
`tier-rule-singularity.test.ts` was written to solve for tiers — a prose claim about the
tree, checked by reading the tree. The technique exists in this repo and was not applied to
the thing it was invented for.
Repro: M01, M01b and M02 all survive for this one reason.
Fix: one meta-test that reads `__tests__/**` for Supabase builder doubles and fails any
whose `eq`/`in` stub discards its arguments. Rule 6 of §1 ("no new unenforced convention")
applies directly.
Test: a source-scan test in the shape of `tier-rule-singularity.test.ts` §4.

### F-T10 — One confirmed vacuous test
Severity: **P3**
Location: `__tests__/scoring_validation/scoring_validation.test.ts:136`
Regression?: NO
Evidence: `expect(true).toBe(true); // always passes — inspect console output`
Repro: the test cannot fail. It exists to print a batch report for visual inspection, and
says so.
Fix: this is honest and low-harm, but it inflates the test count by one, and a "1541 tests
pass" headline should not include a test that cannot fail. Either assert something about
`runBatch`'s return value or move it behind the existing `VERBOSE_SCORING` gate.
Test: `expect(runBatch(PHASE1_PROFILES, ...)).toHaveLength(PHASE1_PROFILES.length)`.

---

## 4. What I checked and found clean

Do not redo these.

- **Baseline, both timezones.** `TZ=UTC` -> 67 suites / 1541 tests / pass / 224.7 s.
  `TZ=America/Los_Angeles` -> 67 suites / 1541 tests / pass / 144.7 s. Item 6 done.
- **Item 3 — the `persist-intake` rollback path is comprehensively defended.** Five
  mutations (M11–M15) against the snapshot scope, the delete scope, the restore branch, the
  insert-error rethrow and the match-cache wipe were all caught, by
  `__tests__/profile/persist-intake.test.ts` lines 326, 386, 404 and 416. Both required
  cases are covered by name: *"a failed insert restores the previous rows"* (line 263) and
  *"when the restore ALSO fails"* (line 349). The `for (const op of opsFor(ops, table))`
  loop at line 402 is not vacuous — M11 and M12 both fail through it.
- **Item 4 — identity caching is correctly discriminated.** Verified by running the real
  test against a module-global-memo mutant built in the scratchpad: **7/7 fail.** The file
  contains no `jest.resetModules()`, and the `inRequest()` stand-in models request scope
  rather than module lifetime, which is exactly what makes it work.
- **Item 5 — flakes.** `__tests__/hooks/use-search-results.test.ts`, 5 sequential runs with
  `--runInBand`, under real load (two other lane agents running jest concurrently, 20–32
  jest processes): **5/5 passed, 48/48 tests each.** Times 74.2 s, 27.2 s, 26.3 s, 40.5 s,
  46.5 s. The suite now has **26** `waitFor` calls (the brief said 22), still at RTL's
  1000 ms default with no fake timers, so the structural risk stands — but it did not
  reproduce in 5 runs under the heaviest load this machine saw all session.
- **The score->tier rule is genuinely singular and boundary-tested.** M08 (threshold
  constant), M09 (`>=` -> `>` at the exact boundary) and M10 (null -> `'Reach'`) were all
  caught, and M29 (inverting the tier on the freshly-computed `/matches` path) was caught
  too. `tier-rule-singularity.test.ts` reads the source tree rather than a hardcoded list,
  and it has a self-check (`expect(SOURCE_FILES.length).toBeGreaterThan(200)`) against the
  scan silently finding nothing — the guard whose absence makes this class of test vacuous.
- **The counsellor cohort loader pins scope, not just shape.** M16 (role literal
  `'student'` -> `'counsellor'`, the historical `'counsellor.student'` bug) failed **59**
  tests. M17/M18/M19 (three different scoping filters) and M28 (cohort membership -> `true`)
  were all caught. `b4a1923`'s fix is real and working here.
- **`__tests__/checklist/route.test.ts` is the model to copy.** It caught M21 (the DELETE
  owner check) via a named test, *"404 when the row exists but is owned by someone else"*.
  It is the only API route handler in the repo whose authorization is tested this way.
- **The `english_status` completion column is pinned.** M23 was caught by
  `middleware/middleware.test.ts:449`, which asserts the select string
  `toContain('english_status')` **and** `toBe(COMPLETION_COLUMNS.academicInput)`. The
  permanent-lockout regression cannot return silently.
- **`guards.ts` singular-path role logic is well covered.** M03, M04, M05 and M07 were all
  caught by `__tests__/auth/policy.test.ts`, which runs the real `canActAsCounsellor`
  against a stub and cross-checks it against `can()` — the agreement test its header
  promises actually works.
- **Vacuous-test sweep (item 2).** Scripted scan of all 994 `it`/`test` declarations across
  66 test files: **0** bodies containing no `expect()`; **1** tautology (F-T10). A second
  scan for assertions inside potentially-empty loops produced 89 candidates, all manually
  triaged: all are either fixed-count loops, `.map()` inside an `expect()`, or guarded by a
  preceding length assertion. `__tests__/parent/slice.test.ts:112` iterates
  `src/features/parent/model/`, which contains 4 files (checked). An `it.each` over an empty
  array throws in jest, so that sub-class cannot hide here.
- **Tree hygiene.** `git status --short` at completion shows only untracked
  `docs/audit/AUDIT-LEDGER.md`, `docs/audit/AUDIT-PROMPT.md` and `docs/audit/verify/`. No
  `src/`, `supabase/` or `__tests__/` file is modified. The scratch mutant
  `/Users/gregfranck/Ascenda/.mutant-identity.ts` used for M25 was deleted and its absence
  verified.

---

## 5. Not verified

- **`src/lib/auth/**` and `src/middleware.ts` were not mutated** — lane B owns them for this
  round, and mutating them concurrently would have invalidated both lanes' results. The one
  item my brief required there (item 4, identity caching) I verified by other means
  (scratch-copy mutant + `moduleNameMapper` override), so item 4 is *not* in this list.
  What is not covered: the `.eq('id', user.id)` -> `.eq('role', user.id)` mutation in
  `identity.ts`, the middleware `/api/*` fail-closed path, and the `policy.ts` route map.
  **Lane B must report those.**
- **`src/lib/data/**` was not mutated** — lane E owns it. `b4a1923`'s central claim is about
  `__tests__/data/`, and I could not re-run its "re-injecting the exact cross-tenant change
  now fails 8 tests" verification directly. I verified the same claim *indirectly* and it
  held: the equivalent scoping mutations in the three neighbouring directories the same
  commit touched (M11, M12, M15 in `persist-intake`; M17, M18, M19 in `counsellor/data`)
  were all caught with the recorded-filter assertions the commit describes. **Lane E should
  confirm the `__tests__/data/` half directly.**
- **Mutation score is a floor, not a measurement.** 30 mutations against a 1,541-test suite
  is a sample, deliberately weighted toward authz / tenancy / persistence per the brief. A
  70% score on a biased sample says nothing about the suite's score overall — but because
  the bias was *toward the classes that matter*, the 9 survivors are more meaningful than
  the ratio.
- **Survivors were not confirmed against `lint`, `typecheck` or `build`.** Every survivor is
  type-valid by construction (that is the point of the mutation class), but I did not run
  the static gates on them. Lane L owns the gates.
- **`--runInBand` on 2 cores was not reproduced.** The flake runs used `--runInBand` but on
  this machine's core count under ~25 concurrent jest workers, which is a different load
  shape from CI's 2-core runner. Five clean runs here do not prove CI is clean.
- **No E2E / Playwright.** Out of scope per §1.
- **The `?? 'Reach'` fallback at `counsellor/data.ts` was deliberately left alone**, per §4
  lane D item 6 and HANDOFF's Known-open. M29 targeted the `service.ts` tier derivation, not
  that fallback.
