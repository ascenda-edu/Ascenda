# Remaining work — state at end of the refactor

**Branch:** `security/phase0-contain` · 11 commits, **nothing pushed** · all nine gates green · 1,069 tests

This supersedes the earlier version of this file, which deferred two items that
have since been partly done.

---

## 1. What is genuinely finished

| | Before | After |
|---|---|---|
| Tests / suites | 265 / 28 | **1,069 / 63** |
| Coverage (statements) | 13.1% | **~25%+** |
| `lib/counsellor` | 35.3% | **91.4%** |
| `use-search-results.ts` | ~0% | **93.0%** |
| Gates in CI | 1 serial job | **9**, across 5 parallel jobs |
| Lint rules | 2 | type-aware set on `lib/`, `features/`, `api/`, middleware |
| Landing page | 255 kB | **197 kB** |
| Scoring inversions | 34 | **0** |
| `schema.sql` | aborted partway | builds a database |

Phases 0–4 of `SYNTHESIS.md` §9 are complete, plus the shared auth layer, the
shared data layer beachhead, the UI primitive adoption, the golden-file and
characterization harnesses, and 9 unapplied migrations.

---

## 2. The one thing blocking further work on the profile wizard

**The Playwright wizard spec has never executed.**

Everything around it is real: chromium installs, the config works, the login-form
selectors are verified against the live page, `storageState` comes from the app's
own `signInWithPassword` (no auth code was weakened, no `E2E_*` bypass exists),
and the harness smoke test passes and proves middleware bounces an anonymous
`/profile/wizard`. The wizard spec itself skips, and says so in its header.

It needs credentials for a **throwaway** account:
```
npx playwright install chromium
E2E_EMAIL=… E2E_PASSWORD=… npm run test:e2e
```
Expect selector drift on the first run. It may also surface fields that genuinely
do not survive the server round trip — which is the information the gate exists to
produce.

**Until it runs, the react-hook-form half of the StudentIntakeForm decomposition
should not be attempted.** The safe half is done: `toPayload`/`fromPayload`, the
five validators and the option tables are now pure modules (698 lines) with 115
unit tests, and the component is 475 lines lighter — with all 156 characterization
tests passing unchanged. What remains is the state-management rewrite, which
changes effect timing and Radix interaction, which is exactly what jsdom cannot
verify and exactly where F-A lived.

---

## 3. Feature slices — piloted, and the answer is "no, don't continue"

`parent` was migrated: 12 files via `git mv`, 44 imports collapsed to 25, five
dependency-cruiser rules verified to fire against deliberately-broken probes.
`src/features/parent/README.md` is the reference for anyone repeating it.

**Do not do `counsellor` next.** Two findings from the pilot, neither visible from
the audit:

1. **The barrel costs ~40 kB per route, structurally.** `/parent` went 154 → 201
   kB. The App Router emits a client chunk for every `'use client'` module
   reachable from a server entry, *before* webpack's `usedExports` runs — so no
   barrel configuration avoids it (`sideEffects` was tested and reverted). Parent
   had 55–95 kB of headroom. `/counsellor` has **22 kB**, against a slice of 31+
   components including charts.
2. **Moving out of `src/lib/` silently dropped the type-aware ESLint rules**,
   because they were scoped with path globs. Fixed (`src/features/**` added), but
   the lesson stands: *the migration traded a gate you have for a gate you're
   adding, with everything still green.*

The drift the slice was meant to fix is already closed by `shared/data/columns.ts`
and `shared/auth/identity.ts` — neither of which needed slicing. Revisit only
after someone decides how a large slice publishes client components without one
barrel.

---

## 4. Owner-only — nothing here is automatable

| Action | Why |
|---|---|
| **Rotate `SUPABASE_SERVICE_ROLE_KEY`** | In git history, unrotated, byte-identical to the key in use (`823b0a7`, `e1382bf`, both ancestors of `origin/main`). **Most urgent item in this repo.** |
| **Rotate both demo passwords** | Removed from all 9 files; still live in Supabase Auth. |
| **Enable secret scanning + push protection** | Repo settings. |
| **Apply the 9 migrations, in order** | See `supabase/MIGRATIONS.md`. `20260801110000_profiles_insert_guard` **first** — until it lands, any user can self-promote to admin, which defeats every other policy. |
| **Buy GitHub Team, require `ci-ok`** | Paid plan. |
| **Run the Playwright spec once** | §2. |
| **Promote `database` and `e2e` to required** | Both run and report; neither has been observed green. |

---

## 5. Known-open, in priority order

1. **`can_act_as_counsellor()` is still `auth.uid() is not null` in production.**
   The app mirrors it correctly and the fix is one constant
   (`COUNSELLOR_PORTAL_OPEN_TO_ALL` in `src/lib/auth/policy.ts`) plus migration
   `20260801120000`. **Do not remove `inDemoCohort()` at `counsellor/data.ts:59`
   before that lands** — it is the only thing keeping this a demo-data exposure
   rather than a real-PII one.
2. **`PARENT_PORTAL_OPEN_TO_ALL` cannot be flipped** until `'parent'` exists as a
   `profiles.role` value. Gated on migration step 5.
3. **The remaining migration steps**: 2, 5, 8, 9, 11, 13, 14, 15. Step 8
   (relationship-scoped RLS) is the substantive one and depends on the assignment
   table's backfill.
4. **F4 — `course_scoring_v1` is `grant select … to anon` without
   `security_invoker`.** Deliberately not fixed: revoking `anon` is a product
   decision. Asserted as a target-posture check so it cannot be forgotten.
5. **166 direct `.from()` call sites outside `src/lib/data`** (`lint:datalayer`
   holds the line). Densest: `counsellor/data.ts` 23, `matching/service.ts` 20,
   `parent/data.ts` 11.
6. **~25 sites still discard `error`** outside the files already migrated.
7. `use-search-results.ts:671` — an O(n·m) scan where the `Set` it needs is built
   13 lines above. Audit §8 quick win, still open.
8. `withStudent`/`buildStudents` compute day counts with `Math.ceil`, off by one
   across a DST transition; `daysUntil` in `dates.ts` uses `Math.round` and is
   safe.
9. `decision_at` can be set while `decision` is null — pinned by a test rather
   than papered over in the mapper. Wants a CHECK constraint (step 15).
10. Remaining hooks at 0%: `use-help-thread`, `use-notifications`,
    `use-realtime-poll`, `use-launch-href`, `use-animated-number`. The realtime
    ones need a timer harness that is its own piece of work.

---

## 6. One thing worth internalising before the audit

A regression was introduced **by this refactor** and caught only by a test:
`loadRoster()` and `loadOutcomes()` queried `.eq('role', 'counsellor.student')`,
a role that does not exist, so both returned `[]` for every input — an empty
counsellor roster and no outcomes, silently, on real data.

It came from an `unwrap`-label rename whose find-and-replace landed on the
neighbouring string literal. **All six static gates passed**, because both values
are valid strings. Only a test asserting *which role is actually queried* found it.

That is the same shape as every serious finding in the original audit, and it is
the argument for the direction this work took: the gates raise the floor, but
tests that assert *meaning* are what catch the class of bug this codebase actually
produces.
