# HANDOFF — read this first

**Branch:** `security/phase0-contain` · **19 commits** ahead of `origin/main` · **nothing pushed** · working tree clean.
**Green:** typecheck · lint · lint:boundaries · lint:tokens · lint:deadcode · lint:datalayer · build · check:bundle · **67 suites / 1,541 tests** (pass in both `TZ=UTC` and `TZ=America/Los_Angeles`) · **`./scripts/ci-db-local.sh` → database gate PASS**.

**Where everything is:**
- `docs/audit/SYNTHESIS.md` — the original 12-dimension audit of the codebase
- `docs/audit/review/01..06` — an adversarial review **of the fix work**, which found real defects in it
- `docs/audit/12-database-design.md` — the DB redesign + 15-step migration plan
- `supabase/MIGRATIONS.md` — the ledger: what is applied, what is not, and the apply order

---

## Ground rules (each of these has already been violated once, at cost)

1. **Never connect to the production Supabase database.** No `db:apply`, no Supabase MCP. Use a throwaway local Postgres — `brew install postgresql@16` works, Docker does not.
2. **Never weaken auth to make a test pass.** Stop and report instead.
3. **Never re-baseline a golden/characterization test to make a change pass.** Read the diff; if the old behaviour was right, stop and report.
4. **Verify before claiming.** Every unverified confident claim made in this work turned out to contain an error.
5. Commit locally. **Do not push.**

## The lesson, because it generalises

Every serious defect here — including every one introduced *while fixing* it — **reported success**:

- The A-level scoring hole passed 13/13 golden tests.
- A find-and-replace clobbered a role literal (`'counsellor.student'`), emptying the counsellor roster: **six static gates green**.
- The `U`-grade regression passed the very harness written to catch that bug class.
- A ratchet reported 166 when the true count was 198.
- Deleting `.eq('profile_id', …)` from five loaders — a cross-tenant read — left 1,069 tests green.

**When you add a check, break it and watch it go red before believing it.**

---

## STATUS

### Done and committed

| | |
|---|---|
| Phases 0–4 | security containment, gate layer, correctness fixes, shared auth/data, UI primitives, cleanup |
| Six adversarial reviews | + fixes for what they found |
| **database CI gate** | now genuinely passes — `./scripts/ci-db-local.sh`, proven twice on real Postgres |
| **3 migration defects** | incl. the one that broke help requests for every real student |
| **Tier unification** | **four** implementations found, not two; percentile reassignment deleted |
| **F0 backport** | privilege escalation closed in `schema.sql`, not just the migration |
| **Portal flag test** | mutation-proven; see below |

### IN FLIGHT — may not have landed

**TASK 3** was dispatched to an agent and had not reported when context ran out. **Check first:** `git log --oneline -5` and `git status`. If its work is absent, redo it from the spec below.

---

## TASK 3 — the only outstanding engineering work

From `docs/audit/review/05-tests.md` (has full reproductions + raw output in Appendix A).

Context: 15 of 20 injected bugs were caught, but **all four survivors are authz-, scoping- or persistence-shaped**, on a branch named `security/phase0-contain`. The tests are real; they defend the wrong things.

**Four surviving mutations — each must fail after your work. Re-inject, watch it fail, revert, report the output.**

1. **`src/lib/auth/identity.ts`: `.eq('id', user.id)` → `.eq('role', user.id)` survives.** Same find-and-replace class that already shipped here once. **Copy the pattern from `__tests__/data/applications.test.ts`** (commit `b4a1923`): the Supabase double records `.eq()`/`.in()` as `[method, column, value]` and asserts *which column* is filtered.
2. **`src/lib/profile/persist-intake.ts`'s failure rollback is 0% covered** — the Phase 2 "could destroy a student's subject list" fix. Cover: snapshot → delete lands → insert fails → rows restored; and the restore itself failing.
3. **`src/middleware.ts` — 236 lines, 0% coverage.** Cover the access decisions: `/api/*` fail-closed, the public allowlist, the `Authorization` pass-through, the onboarding redirect (incl. the `english_status` case), the auth-route redirect.
4. **`__tests__/auth/identity-cache.test.ts` passes when `cache()` is swapped for a global memo** — a cross-request identity leak. Its "new request" is `jest.resetModules()`, which resets both. Make it discriminate.

**Also:** ~60–75 vacuous tests (~6%) — six `it.each` cases in `__tests__/data/call-sites.test.ts` whose bodies never execute; four tautologies in `columns.test.ts`; `__tests__/counsellor/application-status.test.ts:266` is *named* for a bug and stays green when that bug returns. And one flake: `__tests__/hooks/use-search-results.test.ts` (22 `waitFor` at RTL's 1000 ms default, no fake timers) failed 1 run in 4 under load; CI is `--runInBand` on 2 cores with no retry.

**Do not modify `src/`** for this task — report anything that needs it.

---

## Known-open — do NOT "fix" without a decision

- **`src/components/ui/select.tsx`** swallows `onValueChange('')` app-wide. Safe at all 10 current call sites but **NOT "by construction"** — Radix 2.3.7 permits empty `SelectItem` values (proven). A new `<SelectItem value="">` will silently do nothing.
- **`counsellor/data.ts` `?? 'Reach'`** — a reviewer called it the most harmful null-handling site; I disagreed and wrote the argument into the code. `'Reach'` overstates difficulty, which is the safe direction. Changing it means a nullable tier across 23 consumers and is a product decision.
- **StudentIntakeForm react-hook-form rewrite** — deferred until the Playwright wizard spec has actually run. It never has.
- **Feature slices: do not repeat on `counsellor`.** The `parent` pilot measured a ~40 kB/route barrel cost that is structural; `/counsellor` has 22 kB headroom.
- **`course_scoring_v1` is `grant select … to anon`** without `security_invoker`. Revoking `anon` is a product call.
- **`database` and `e2e` are deliberately NOT in `ci-ok`'s `needs`** — green locally, never yet on a GitHub runner. Add each the first time it passes there.

---

## OWNER-ONLY — cannot be automated

1. **Rotate `SUPABASE_SERVICE_ROLE_KEY`.** In git history (`823b0a7`, `e1382bf`, both ancestors of `origin/main`), unrotated, byte-identical to the key in use. **All 19 commits are downstream of this.**
2. Rotate `DEMO_USER_PASSWORD` / `SEED_STUDENT_PASSWORD` in Supabase Auth (removed from the repo, still live).
3. Enable GitHub secret scanning + push protection.
4. **Apply migrations in order — `20260801110000_profiles_insert_guard` FIRST.** Until it lands, any user can self-promote to admin, which defeats every other policy. See `supabase/MIGRATIONS.md`.
   ⚠️ **Never `db:apply` `20250308120000_normalize_course_catalog.sql`** — replaying it renames the live `programs`/`universities` to `archive_raw_*` and promotes empty `*_v2` tables. It is destructive, not merely non-idempotent.
   ⚠️ **When you apply `20260801120000`, set `COUNSELLOR_PORTAL_OPEN_TO_ALL` and `PARENT_PORTAL_OPEN_TO_ALL` to `false` in the same commit.** `__tests__/db/portal-flag-agreement.test.ts` enforces this — otherwise both portals silently render empty.
5. Buy GitHub Team; require the single `ci-ok` check (branch protection currently 403s).
6. Run the Playwright wizard spec once against a **throwaway** account: `E2E_EMAIL=… E2E_PASSWORD=… npm run test:e2e`.

---

## TWO PRODUCT DECISIONS — yours, not an engineer's

1. **Tier reassignment was deleted.** The code used to *manufacture* a 35/30/35 tier spread when results collapsed into one band, and persist it — which is how a 41%-chance programme carried a "Safe" badge. Students with weak result sets will now honestly see **"everything is Reach."** Correct, but it will read as a regression to anyone who liked the spread.
2. **Scoring moved.** 19 of 56 A-level signatures change band. The numbers are internally consistent and monotone — but I was wrong once about my own justification for them, and **nobody with admissions knowledge has reviewed them**. A green build is not sign-off.

---

## MERGE STRATEGY — do not merge 235 files as one PR

| PR | Contents | Risk |
|---|---|---|
| **A** | audit docs, the nine gates, dead code, unused deps, perf | zero behaviour change — merge first, makes `main` self-defending |
| **B** | security containment + `20260801*` applied in order | medium — `20260801110000` must be first |
| **C** | scoring, tiers, ACT rigour | **changes real student scores** — needs a human with domain knowledge |
