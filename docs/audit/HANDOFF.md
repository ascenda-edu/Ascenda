# HANDOFF — pick up here

**Branch:** `security/phase0-contain`, 13 commits ahead of `origin/main`, **nothing pushed**, working tree clean.
**Gates:** typecheck · lint · lint:boundaries · lint:tokens · lint:deadcode · lint:datalayer all PASS. 63 suites / 1,073 tests pass in both `TZ=UTC` and `TZ=America/Los_Angeles`. `build` and `check:bundle` pass.

Read `docs/audit/SYNTHESIS.md` for what the codebase looked like, and
`docs/audit/review/01..06` for what an adversarial review found in the fix work.
`docs/audit/13-remaining-work.md` is the register.

---

## Ground rules (violating these has already caused damage once)

1. **Never connect to the production Supabase database.** No `npm run db:apply`, no Supabase MCP. A local throwaway Postgres is the right tool — `brew install postgresql@16` works; Docker is unavailable in this environment.
2. **Never weaken auth to make a test pass.** If the only way through is editing `src/middleware.ts` or auth code, stop and report.
3. **Do not re-baseline a characterization or golden test to make a change pass.** Read the diff. If you believe the old behaviour was right, stop and report.
4. **Verify before claiming.** Every confident claim made in this session that went unverified turned out to contain an error. Run the thing.
5. Commit locally; do not push.

## The lesson that matters

Every serious defect in this codebase — and every one introduced while fixing it — **reported success**. The scoring hole passed 13/13 golden tests. The role-literal typo passed six static gates. The `U`-grade regression passed the very harness written to catch it. A vacuous ratchet reported a number that was 32 short.

So: when you add a check, **break it and watch it go red** before believing it.

---

## TASK 1 — Make the `database` CI job actually pass (highest value)

**Why first:** it is the gate that would have caught both schema defects, and it has never run green. Until it does, the database half of this branch is unverified.

A reviewer ran the real thing (Postgres 16.14, throwaway cluster) and found:

1. **The stub is missing `create publication supabase_realtime`.** The job dies on the FIRST migration (`20260512120000_help_requests_and_notifications.sql:52`), so the nine new migrations are never reached. Stub is at `.github/workflows/ci.yml`, step "Stub the Supabase-only objects".
2. **`recognition_score` was fixed in the wrong place.** `schema.sql` does add the column — then `supabase/migrations/20250308120000_normalize_course_catalog.sql` renames `universities` to `archive_raw_universities` and promotes `universities_v2`, which lacks it. `ci.yml` currently claims this blocker is fixed. It is not.
3. **Pass 2 fails** (`relation "programs" already exists`), so the idempotency assertion does not hold. Three PRE-EXISTING migrations are not idempotent — identify them, and either guard them or scope the idempotency assertion honestly to the files that claim it.

**Definition of done:** the exact CI steps run green locally against a throwaway Postgres, twice. If a pre-existing migration genuinely cannot be made idempotent, say so and narrow the job's claim rather than deleting the check.

---

## TASK 2 — Three migration defects (do NOT apply anything)

All in `supabase/migrations/`, all written-but-unapplied. Details and reproductions in `docs/audit/review/03-migrations.md`.

1. **CRITICAL — `20260802110000_notification_bounds.sql` breaks help requests for real students.** `counsellor_notification_targets()` (~:296) targets the demo account by email, but `notification_recipient_allowed()` (~:121) whitelists staff by `profiles.role` — and that account is `role='student'`. Any *unassigned* student's help request aborts with 42501. The `20260801122000` backfill only covers `+seed@ascenda.demo`, so **real students are exactly the affected population**.
2. **HIGH — `20260802100000:168` indexes `shortlisted_programs` unguarded**, while `CLAUDE.md`, `MIGRATIONS.md` and two source files all treat that table's existence as unknown. The same file correctly `to_regclass`-guards the archive tables — copy that.
3. **HIGH — `20260802130000`'s pre-check misses empty titles**, so one such row aborts at ~:425. Under `psql` it half-applies (audit triggers already installed).

Also confirm/repair: **the F0 fix was never backported into `schema.sql`** — `:932-933` still declares the `FOR ALL` `profiles_self_access` and `:1319` the update-only trigger. Three lesser items were backported; the critical one was not.

**Also worth acting on:** `20260802100000` takes ACCESS EXCLUSIVE on `programs` for its `drop index` statements and `db:apply` sends the file as one transaction — ~15 tables write-locked for 30–60s on Supabase. Split it.

---

## TASK 3 — Four surviving mutations + the vacuous tests

From `docs/audit/review/05-tests.md`. 15 of 20 injected bugs were caught; **all four survivors are authz-, scoping- or persistence-shaped.**

1. **`src/lib/auth/identity.ts`: `.eq('id', user.id)` → `.eq('role', user.id)` survives.** This is the *same find-and-replace class* that already shipped here once as `'counsellor.student'` (see commit `b5119ae`). It has now bitten twice. Add a test asserting WHICH COLUMN is filtered — the pattern to copy is the filter-recording double added to `__tests__/data/applications.test.ts` in commit `b4a1923`.
2. **`src/lib/profile/persist-intake.ts`'s failure rollback is 0% covered** — that is the Phase 2 "could destroy a student's subject list" fix, untested.
3. **`src/middleware.ts` is 236 lines at 0% coverage.**
4. **`__tests__/auth/identity-cache.test.ts` passes when `cache()` is swapped for a global memo** — a cross-request identity leak. Its "new request" simulation is `jest.resetModules()`, which resets both. Make it discriminate.

**Vacuous (~60–75 tests, ~6%):** six `it.each` cases in `__tests__/data/call-sites.test.ts` whose loop bodies never execute (2 assertions run out of 8 cases); four tautologies in `columns.test.ts`; `__tests__/counsellor/application-status.test.ts:266` is *named* for a bug and stays green when that bug is reintroduced.

**One flake:** `__tests__/hooks/use-search-results.test.ts` — 22 `waitFor` calls at RTL's 1000ms default with no fake timers; failed 1 run in 4 under load. CI is `--runInBand` on 2 cores with no retry, so it will surface.

---

## TASK 4 — Two tier implementations still exist

`src/lib/matching/match-tier.ts` claims "there are no others". False — `docs/audit/review/02-domain.md` found:

1. `matching_engine.classify` (IB-points gap) — **drives `/matches`**, so it can show "87% · Reach" while search shows Safe.
2. The percentile reassignment at `src/lib/matching/service.ts:846`.

Also: `loadTierByProgram` has **no recompute path**, so `/applications` vs search is a standing contradiction, not a rebuild window. Both seed scripts store tiers contradicting the 80/60 rule. And the colour bands sit at 75 while the tier boundary is 80 — a new mixed-signal 75–79 band.

---

## Known-open, deliberately not done (do not "fix" without deciding)

- **`src/components/ui/select.tsx`** swallows `onValueChange('')` app-wide. Safe at all 10 current call sites but **NOT "by construction"** — Radix 2.3.7 permits empty `SelectItem` values (proven). A new `<SelectItem value="">` will silently do nothing.
- **The StudentIntakeForm react-hook-form rewrite** is deferred until the Playwright wizard spec has actually run. It never has — no credentials. See §2 of `13-remaining-work.md`.
- **Feature slices: do not repeat on `counsellor`.** The `parent` pilot measured a ~40 kB/route barrel cost that is structural; `/counsellor` has 22 kB of headroom. Verdict and evidence in `docs/audit/review/`/the pilot's README.
- **`course_scoring_v1` is `grant select … to anon`** without `security_invoker`. Revoking `anon` is a product decision.

## OWNER-ONLY — cannot be automated, still outstanding

1. **Rotate `SUPABASE_SERVICE_ROLE_KEY`.** It is in git history (`823b0a7`, `e1382bf`, both ancestors of `origin/main`), unrotated, byte-identical to the key in use. **Everything else is downstream of this.**
2. Rotate `DEMO_USER_PASSWORD` / `SEED_STUDENT_PASSWORD` in Supabase Auth (removed from the repo, still live).
3. Enable GitHub secret scanning + push protection.
4. Apply migrations in order — `20260801110000_profiles_insert_guard` **FIRST**; until it lands any user can self-promote to admin, which defeats every other policy. See `supabase/MIGRATIONS.md`.
5. Buy GitHub Team; require the single `ci-ok` check (branch protection currently 403s).
6. Run the Playwright wizard spec once against a **throwaway** account.

## Suggested merge strategy

Do not merge 235 files as one PR.

| PR | Contents | Risk |
|---|---|---|
| **A** | audit docs, the nine gates, dead code, unused deps, perf | zero behaviour change — merge first |
| **B** | security containment + `20260801*` applied in order | medium |
| **C** | scoring, tiers, ACT rigour | **changes real student scores** — 19 of 56 A-level signatures change band. Needs someone with admissions knowledge to sign off, not just a green build |
