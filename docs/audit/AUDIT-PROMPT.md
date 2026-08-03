# AUDIT PROMPT — verify the Ascenda refactor

> **This file is the prompt.** Paste it (or `Read` it) at the start of any session that
> works on this audit. It is self-contained: it assumes no memory of prior sessions.
> Everything durable lives in files named below, not in a context window.

---

## 0. The job, in one paragraph

Branch `security/phase0-contain` is **21 commits and 264 files** ahead of `origin/main`
(+46,080 / −4,698). It rewrote authentication, the data layer, the scoring/tier domain
model, the database schema and 12 migrations, the UI primitives, the CI gate layer, and
deleted ten source files. It reports green on every gate it owns. **Your job is to prove
or disprove that claim** — that the refactor is correct, that it preserves **100% of the
functionality the app had before it**, and that what it leaves behind is built to best
practice. Then fix what isn't.

**The deliverable is not a report.** It is a branch where every defect found is either
fixed with a test that fails without the fix, or written down in
`docs/audit/AUDIT-LEDGER.md` with an explicit reason it was left.

---

## 1. Definition of done

All of these, simultaneously, verified by running them — not by reading that they passed:

| # | Criterion | How it is checked |
|---|---|---|
| 1 | Every gate green | `typecheck`, `lint`, `lint:boundaries`, `lint:tokens`, `lint:deadcode`, `lint:datalayer`, `build`, `check:bundle`, `test` — in `TZ=UTC` **and** `TZ=America/Los_Angeles` |
| 2 | Database gate green | `./scripts/ci-db-local.sh` against a throwaway local Postgres |
| 3 | No functionality lost | Every route, feature and user flow that worked on `origin/main` still works — §4 lane A is the systematic check |
| 4 | Every behaviour change is intentional | Each one is either covered by a golden/characterization test that was **deliberately** re-baselined with the diff read, or listed in the ledger as a product decision |
| 5 | Every finding resolved | Fixed with a failing-first test, or in the ledger with a reason |
| 6 | No new unenforced convention | Anything the audit asserts "must stay true" has a gate, a test, or a type behind it |

**Not in scope, and must not be attempted:** applying migrations to production, rotating
credentials, buying GitHub plans, running Playwright against a real account. Those are in
`docs/audit/13-remaining-work.md` §4 as owner-only. List them; don't do them.

---

## 2. Ground rules — each has already been violated once here, at cost

1. **Never connect to the production Supabase database.** No `npm run db:apply`, no
   Supabase MCP, no `SUPABASE_DB_URL` against the remote. Use a throwaway local Postgres
   (`brew install postgresql@16`; Docker does not work on this machine).
2. **Never weaken auth, a policy, or a scoping filter to make a test pass.** Stop and
   report instead.
3. **Never re-baseline a golden or characterization test to make a change pass.** Read the
   diff. If the old behaviour was right, the change is wrong. Re-baselining is a decision
   that gets written into the ledger with the diff quoted.
4. **Verify before claiming.** In the prior round of this work, *every* confident
   unverified claim turned out to contain an error. If you have not run it, say "not
   verified."
5. **When you add a check, break it and watch it go red before believing it.** A gate that
   has never failed is not known to work.
6. **Commit locally, on this branch. Do not push.** Do not merge. Do not open PRs.
7. **`main` is the reference for "what the app used to do."** When in doubt about intended
   behaviour, `git show origin/main:<path>` is the authority, not your reconstruction.

### Why rule 5 exists — read this before you trust anything green

Every serious defect in this codebase, **including every one introduced while fixing it**,
reported success:

- The A-level scoring hole passed 13/13 golden tests.
- A find-and-replace clobbered the role literal `'counsellor'` → `'counsellor.student'`,
  emptying the counsellor roster for every real user. **Six static gates stayed green.**
- The `U`-grade regression passed the very harness written to catch that bug class.
- A ratchet reported 166 direct call sites when the true count was 198.
- Deleting `.eq('profile_id', …)` from five loaders — a **cross-tenant read** — left 1,069
  tests green.

The shape is always the same: *both values are valid, so every type-level and lint-level
gate is satisfied.* Only a test that asserts **which** column is filtered, **which** role
is queried, **which** tier is returned, catches this class. Prefer those tests. Distrust
any assertion that would still pass if the value were wrong.

---

## 3. Session and context protocol

This audit is larger than one context window. It is structured so that no session needs to
have read the previous one.

**Durable state — the only things that survive a session:**

| File | Role | Who writes |
|---|---|---|
| `docs/audit/AUDIT-PROMPT.md` | this prompt | nobody, unless the protocol changes |
| `docs/audit/AUDIT-LEDGER.md` | **the one source of truth for findings and status** | coordinator only |
| `docs/audit/verify/<lane>.md` | one lane's full evidence | that lane's agent |
| `git log` | what was actually changed | whoever fixes |

**Rules:**

- **Coordinator holds no file contents.** Read the ledger, dispatch, read summaries, write
  the ledger. Never read a lane's full report into the coordinating context — read its
  **Summary** section only (each report puts it first, ≤40 lines).
- **One lane = one subagent = one file.** A lane agent writes
  `docs/audit/verify/<lane>.md` and returns **≤30 lines**: counts by severity, one line
  per finding, and anything that blocks other lanes. Not prose.
- **Findings go in the ledger the moment they are confirmed**, not at the end. A session
  that dies mid-lane must lose nothing but that lane.
- **Before starting any session**, run the resume check in §7. Before ending one, update
  the ledger's Status table.
- Long-running commands (`build`, `test`, `ci-db-local.sh`) go to a log file in the
  scratchpad; read the tail, not the whole thing.

---

## 4. The audit lanes

Each lane is independent and can run in parallel. Each produces
`docs/audit/verify/<lane>.md` with this structure: **Summary** (≤40 lines, first), then
**Findings** (full detail, one per §5 schema), then **What I checked and found clean**
(so the next session doesn't redo it), then **Not verified** (with the reason).

Every lane must read the ground rules in §2 first, and must state in its summary how many
of its claims it actually executed versus inferred by reading.

---

### Lane A — functionality preservation *(the highest-value lane; start here)*

**Question: does everything that worked before still work?**

This is the lane the existing audit documents do *not* cover — they audited the code, not
the delta. The refactor deleted 10 files and rewrote 150 under `src/`.

1. **The ten deletions.** For each, confirm the capability still exists somewhere, or that
   its removal was intentional and complete:
   `src/app/profile/_components/StepRoadmap.tsx`,
   `src/components/dashboard/{deadline-nudges,outcome-tracker,pulse-cards,stats-card}.tsx`,
   `src/components/inputs/subject-grade-table.tsx`,
   `src/components/match/share-match-button.tsx`, `src/hooks/use-typing-effect.ts`,
   `src/lib/demo/help-request-drafts.ts`, `src/lib/validation/profile.ts`.
   For each: `git show origin/main:<path>` to see what it did, then find its replacement or
   prove nothing rendered it. **A deleted component that was rendered on a page is a lost
   feature, and dead-code tools do not catch it if the page was deleted too.**
2. **Route inventory.** Enumerate every route on `origin/main` and every route on HEAD.
   Any route that disappeared, or whose page now renders less than it did, is a finding.
   Cross-check against the route table in `CLAUDE.md` — all 13 student/counsellor/admin
   route families plus the parent portal and API routes.
3. **Per-route render diff.** For the routes touched by the refactor (`git diff --name-only
   origin/main...HEAD -- src/app`), compare the old and new page: same data loaded, same
   props, same components mounted, same empty/loading/error states. Look specifically for
   **silently narrowed queries** — a `.select()` that lost a column, a `.limit()` that
   appeared, a filter that was added or dropped.
4. **The `parent` feature slice.** 12 files moved via `git mv` and 44 imports collapsed to
   25. Confirm nothing was dropped in the move and every import resolves to the same
   module it did before.
5. **Client/server boundary regressions.** Any `'use client'` added or removed; any
   `next/dynamic` + `ssr: false` reaching a Server Component (forbidden in Next 15); any
   Server Component newly calling a browser API.
6. **The demo path.** `docs/demo-flow.md` and `docs/demo-guide.md` describe the flows this
   app is demoed with. Walk each one against the code. A broken demo flow is a lost
   feature even if no test covers it.

---

### Lane B — authentication, authorization, and tenancy

The branch is literally named `security/phase0-contain`; this is where a mistake is worst.

1. **`src/lib/auth/identity.ts`** — the single identity resolution point. Verify every
   `.eq()` filters the column it claims to. Mutate `.eq('id', user.id)` →
   `.eq('role', user.id)`, run the suite, confirm **red** (this exact mutation survived a
   previous round). Revert.
2. **`src/lib/auth/policy.ts`** — the declarative policy layer. Every route/page/API
   handler that had a guard on `origin/main` must have an equivalent or stronger one now.
   Enumerate them both ways: guards lost, and guards whose predicate changed.
3. **`src/middleware.ts`** (~236 lines). Verify: `/api/*` fails closed; the public
   allowlist is exactly the set intended; the `Authorization` pass-through cannot be used
   to bypass a session check; the onboarding redirect (including the `english_status`
   case — this once locked users out permanently); the auth-route redirect. **Confirm the
   file is at `src/middleware.ts`** — at the repo root Next silently ignores it, and that
   exact bug shipped auth bypass to production once.
4. **Cross-tenant reads.** Every loader that reads student data must scope by the caller's
   identity. Diff each against `origin/main` for a dropped `.eq('profile_id', …)` /
   `.eq('student_id', …)` / guardian or assignment join. This is the mutation that left
   1,069 tests green.
5. **Role literals.** Grep every string compared against `profiles.role`. The legal set is
   `'student' | 'counsellor' | 'admin'` (+ `'parent'`, which does **not** exist in the DB
   yet). Any other literal is the `'counsellor.student'` bug again.
6. **Service-role client.** Confirm it is reachable only from server-side code that
   validates the caller first, and never from anything a client bundle can import.
7. **App ↔ DB policy agreement.** `COUNSELLOR_PORTAL_OPEN_TO_ALL` /
   `PARENT_PORTAL_OPEN_TO_ALL` in `policy.ts` must match what the applied migrations
   actually do. `__tests__/db/portal-flag-agreement.test.ts` enforces this — verify the
   test would fail if they disagreed.

---

### Lane C — database: schema, migrations, RLS

Reference: `docs/audit/12-database-design.md` and `supabase/MIGRATIONS.md`.

1. **Replay.** `./scripts/ci-db-local.sh` against throwaway local Postgres. Then replay
   the whole directory **twice** — every migration must be idempotent.
2. **`schema.sql` ↔ migrations parity.** `schema.sql` must build a database equivalent to
   replaying every migration. Build both, diff the catalogs (tables, columns, constraints,
   indexes, policies, functions, triggers, grants). Prior rounds found fixes that landed in
   a migration but not in `schema.sql`.
3. **The 12 new/changed migrations** (`20260801110000` … `20260802150000`). For each:
   idempotent? reversible or explicitly one-way? safe to apply to a database that already
   has data? does it lock a large table? Order dependencies correct — `20260801110000_profiles_insert_guard`
   **must be first** (until it lands, any user can self-promote to admin).
4. **RLS.** Every table with user data has RLS enabled and a policy per operation
   (select/insert/update/delete). Look for tables where RLS is on but no policy exists
   (invisible-table bug) and for `using (true)`.
5. **`_applied_archive/`.** Confirm the destructive catalogue-normalize migration is out of
   every glob, out of `db:apply`'s reach, and out of the CI replay path — and that no code
   or doc still points at its old location.
6. **App ↔ schema agreement.** Every column the app reads or writes exists with the type
   the app assumes. `src/lib/types/database.ts` is generated and **lags the schema** —
   check against `schema.sql`, not the generated types.

---

### Lane D — domain logic: scoring, tiers, matching

The refactor **deliberately changed student-visible scores**: 19 of 56 A-level signatures
change band, and tier reassignment was deleted. That is a product decision already
recorded. Your job is not to re-litigate it — it is to confirm the change is exactly what
was intended, internally consistent, and that nothing else moved with it.

1. **Monotonicity.** Prove there are zero strict inversions: no worse grade set scoring
   higher than a better one, across A-level, IB, and any other supported system. The
   original audit found 34.
2. **One tier rule.** The score→tier mapping must exist in exactly one place. Four
   implementations were found last time. Verify the test that enforces this reads the
   module tree rather than hardcoding a list it could drift from.
3. **Boundary values.** Every threshold, tested at exactly the boundary and ±1.
4. **Golden files.** Every re-baselined golden in `__tests__/scoring/golden` — read the
   diff and confirm the new value is the intended one. Any golden whose change is *not*
   explained by the documented scoring change is a finding.
5. **Null and edge inputs.** Empty subject list, `U` grades, missing predicted grades,
   mixed qualification systems, ACT/AP. The `U`-grade regression previously slipped through
   the harness built to catch it.
6. **The `?? 'Reach'` fallback** at `counsellor/data.ts` is knowingly open (see the HANDOFF
   §Known-open). Don't change it; confirm the reasoning written in the code still holds.

---

### Lane E — data layer and error handling

1. **`src/lib/data/columns.ts`** and the shared loaders: does every call site get the
   columns it needs? A missing column is `undefined` at runtime, which usually renders as
   blank rather than throwing.
2. **`unwrap`/error helpers.** Every consolidated call site must surface errors the way it
   did before. ~25 sites still discard `error` — confirm the count and that none of them is
   a write.
3. **The `lint:datalayer` ratchet** currently reports **198** direct `.from()` sites
   outside `src/lib/data` (56 files). The baseline file must equal the true count — a
   previous baseline claimed 166. Verify by counting independently, and confirm the ratchet
   goes red when a site is added.
4. **PostgREST gotchas** hold everywhere: no `.or()` built from values containing spaces
   (use `.in('id', [...])`); date-only strings parsed as **local** via
   `parseLocalDate`/`daysUntil`/`startOfToday`, never `new Date('YYYY-MM-DD')`.

---

### Lane F — tests: do they defend anything?

The suite grew 265 → 1,541. Size is not strength.

1. **Mutation testing.** Inject a defect, run the suite, confirm red, revert. Do at least
   20, weighted toward authz, tenancy scoping, persistence, and money-or-identity-shaped
   values. Report every survivor — a survivor is a finding against the *tests*, not the
   code.
2. **Vacuous tests.** ~60–75 were previously identified (~6%): `it.each` cases whose bodies
   never execute, tautologies, and a test *named* for a bug that stays green when the bug
   returns. Confirm they were fixed and sweep for more. A test that cannot fail is worse
   than no test — it is a false green.
3. **The rollback path** in `src/lib/profile/persist-intake.ts` — a failure here can destroy
   a student's subject list. Confirm coverage of: snapshot → delete lands → insert fails →
   rows restored; **and** the restore itself failing.
4. **Identity caching.** `__tests__/auth/identity-cache.test.ts` must distinguish React
   `cache()` (per-request) from a module-global memo (a **cross-request identity leak**).
   `jest.resetModules()` resets both, so a test built on it cannot tell them apart.
5. **Flakes.** `__tests__/hooks/use-search-results.test.ts` has 22 `waitFor` calls at RTL's
   1000 ms default with no fake timers; it failed 1 run in 4 under load. CI is
   `--runInBand` on 2 cores with no retry. Run the suite 5× under load and report.
6. **Timezone.** Full suite in `TZ=UTC` and `TZ=America/Los_Angeles`.

---

### Lane G — React, Next 15, and runtime correctness

1. Async factories: `createServerSupabaseClient` / `createRouteHandlerSupabaseClient` /
   `createServerActionSupabaseClient` all `await cookies()` — every call site must `await`.
   Same for `params` / `searchParams` on dynamic pages (Promises in Next 15).
2. Server/client boundaries; no secrets or server-only modules reachable from a client
   bundle; `ssr: false` only inside `'use client'` wrappers.
3. Hooks: dependency arrays, cleanup on unmount, no state updates after unmount, no
   effects that fire on every render. The five hooks at 0% coverage
   (`use-help-thread`, `use-notifications`, `use-realtime-poll`, `use-launch-href`,
   `use-animated-number`) get read carefully since nothing else checks them.
4. Realtime and polling: backoff present, subscriptions torn down, no duplicate channels.
5. Error boundaries and loading states on every route that fetches.
6. Hydration: no `Date`/`Math.random`/`localStorage` differences between server and client
   render.

---

### Lane H — API routes

For all 23 route handlers: authentication before any work; authorization for the specific
resource; input validated with zod (not cast); consistent error envelope (five shapes were
found across 18 routes, one returning a 200-shaped body); no PII or internal detail in
error responses; correct status codes; no unbounded queries; rate limiting where a route
writes or calls an LLM.

---

### Lane I — types and validation

`strict` on and honoured; count and justify every `any`, `as`, and `@ts-expect-error`
added by the refactor; zod schemas match the DB types they mirror; `demo-tables.ts` manual
types still match `schema.sql`; no type assertion papering over a real nullability.

---

### Lane J — performance and bundle

`check:bundle` green and the budgets meaningful; the landing page still ≤197 kB; no route
regressed against `origin/main`; no `n+1` query introduced by the data-layer
consolidation; the known O(n·m) scan at `use-search-results.ts:671` (the `Set` it needs is
built 13 lines above); images, fonts, and dynamic imports unchanged or better.

---

### Lane K — design system, accessibility, UX

Tokens only, no palette literals; the radius ladder (`rounded-lg`10 `xl`14 `2xl`18
`3xl`24 `4xl`28), never `rounded-[Npx]`; `surface-card` static unless `hover-lift`;
`text-primary-ink` for copy. Light **and** dark for anything touched. Keyboard navigation,
focus states, labels, contrast, `prefers-reduced-motion`. The eight silent-failure traps
in the UI-uplift notes (Tailwind opacity scale, class/colour name collisions,
tailwind-merge, layer specificity, overflow clipping, `space-y` siblings, Radix
controlled-ness, Tailwind `content` globs).

**Known-open, do not "fix" without a decision:** `src/components/ui/select.tsx` swallows
`onValueChange('')` app-wide. Safe at all 10 current call sites but not by construction.
Verify the call-site count is still 10 and that something fails loudly if an
`<SelectItem value="">` is added.

---

### Lane L — configuration, CI, and the gate layer

`eslint.config.mjs`, `tsconfig.json`, `next.config.mjs`, `knip.json`,
`.dependency-cruiser.cjs`, `jest.config.ts`, `playwright.config.ts`, and the GitHub
workflow. For **each of the nine gates: break it deliberately and confirm it goes red.**
A gate that has never failed is not a gate. Confirm the type-aware ESLint rules cover
`src/features/**` (moving out of `src/lib/` silently dropped them once). Confirm `database`
and `e2e` are deliberately excluded from `ci-ok`'s `needs` and that the reason still holds.
Confirm no secret, key, or password is in the tree or added anywhere in these 21 commits.

---

## 5. Finding schema

Every finding, in the lane report and the ledger:

```
### <ID> — <one-line claim>
Severity: P0 breaks prod / P1 wrong behaviour / P2 latent risk / P3 quality
Location: path/to/file.ts:LINE
Regression?: YES (worked on origin/main) | NO (pre-existing) | NEW (added by refactor)
Evidence:   the command run and its actual output, or the exact diff. Not a description.
Repro:      concrete inputs → observed wrong output
Fix:        smallest change that resolves it
Test:       the assertion that fails before the fix and passes after
```

**Severity is assigned by consequence to a user, not by how interesting it is.**
`Regression?: YES` outranks everything at the same severity — it is functionality lost.

---

## 6. The loop

Repeat until a full round produces zero new confirmed findings.

**Round N:**

1. **Baseline.** Run every gate. Record actual numbers in the ledger. Never inherit a
   previous round's "green."
2. **Dispatch.** Lanes not yet done this round, in parallel, one subagent each. Lane A
   first if this is round 1.
3. **Collect.** Read each summary. Write every finding into the ledger. Discard the rest.
4. **Verify — adversarially.** Every P0/P1 gets an independent agent whose instruction is
   *"try to refute this finding; default to refuted if uncertain."* A finding that survives
   refutation is confirmed. **Findings are frequently wrong; fixing an unconfirmed finding
   is how the last round introduced defects.**
5. **Fix.** Smallest change. Test that fails first. Verify it fails, apply the fix, verify
   it passes. One commit per coherent finding, message naming the finding ID.
6. **Regress.** Full gate run. Any gate that changed state gets explained before moving on.
7. **Update the ledger.** Status table, findings, and what round N+1 should target.

**Stop and ask the user** — do not decide alone — when a fix would: change
student-visible scores or tiers; weaken any auth or RLS policy; require touching the
production database; change a product behaviour rather than restore one; or contradict
something in HANDOFF.md's "Known-open" or "Product decisions" sections.

---

## 7. Resume check — run this first, every session

```bash
git status --short && git log --oneline -8
sed -n '1,60p' docs/audit/AUDIT-LEDGER.md     # status table + open findings
ls docs/audit/verify/                          # which lanes have reported
```

Then: finish the lane that is in flight, or dispatch the next unstarted one. If the ledger
and `git log` disagree, `git log` wins — the ledger was not updated before the session
died.

---

## 8. Reference material — read on demand, never wholesale

| File | What it holds |
|---|---|
| `docs/audit/HANDOFF.md` | current state, known-open items, product decisions, merge strategy |
| `docs/audit/SYNTHESIS.md` | the original 12-dimension audit — §2's "14 seams" is the thesis |
| `docs/audit/01..12-*.md` | per-dimension detail from that audit (40–120 kB each — grep, don't read) |
| `docs/audit/review/01..06` | the adversarial review **of the fix work**, which found real defects in it |
| `docs/audit/13-remaining-work.md` | what was deliberately left undone, and why |
| `supabase/MIGRATIONS.md` | the apply ledger and order |
| `CLAUDE.md` | commands, architecture, the gotcha list |

**These documents are claims, not facts.** They were written by the same process that
produced the defects. Where a document and the code disagree, the code is the fact — and
the disagreement is itself a finding.
