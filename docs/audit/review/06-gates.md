# Review 06 — The CI / gate layer

**Branch:** `security/phase0-contain` (`c8ed16e`)
**Scope:** `.github/workflows/ci.yml`, `eslint.config.mjs`, `tsconfig.json`, `.dependency-cruiser.cjs`, `knip.json`, `scripts/`, `package.json`, `jest.config.ts`
**Method:** every gate was broken in a scratch APFS clone of the repo and observed. Nothing in the real working tree was modified. The `database` job was replayed against a real local PostgreSQL 16.14 cluster, step for step.

---

## 1. Verdict table

Legend: **CAUGHT** = I introduced the violation the gate exists to catch and it went red. **VACUOUS** = it stayed green, or it structurally cannot go red.

| # | Gate | Violation introduced | Result |
|---|---|---|---|
| 1 | `typecheck` — `noFallthroughCasesInSwitch` | `case 'a': console.log(); case 'b': return 2;` in `src/lib/` | **CAUGHT** — `TS7029: Fallthrough case in switch` |
| 2 | `typecheck` — `noImplicitReturns` | function with inferred return type, one path falls off the end | **CAUGHT** — `TS7030: Not all code paths return a value`. Control run with `--noImplicitReturns false` produced no error, proving the *new* flag is what catches it |
| 3 | `typecheck` — `noImplicitOverride` | subclass method redeclared without `override` | **CAUGHT** — `TS4114` |
| 4 | `typecheck` — `verbatimModuleSyntax` | `import { Database } from '@/lib/types/database'` used only as a type | **CAUGHT** — `TS1484` |
| 5 | `typecheck` — coverage of `scripts/**` | `const n: number = "definitely a string"` in `scripts/__gatecheck-bogus.ts` | **VACUOUS** — `tsconfig.json` `exclude` lists `scripts`. Not one error. See §5 |
| 6 | `lint` — `no-floating-promises` in `src/lib/**` | un-awaited `Promise<void>` call | **CAUGHT** |
| 7 | `lint` — `switch-exhaustiveness-check` | switch over a 3-member union handling 2 | **CAUGHT** — `Cases not matched: "accepted"` |
| 8 | `lint` — `await-thenable` | `await 41` | **CAUGHT** |
| 9 | `lint` — **do the type-aware rules reach `src/features/**`?** | identical probe copied into `src/features/parent/api/` | **CAUGHT** — all three fired. The newly-added glob works |
| 10 | `lint` — type-aware rules on **`.tsx`** | identical probe as `src/features/parent/ui/probe.tsx`, `src/lib/__gc/probe.tsx`, `src/components/probe.tsx` | **VACUOUS** — eslint reported *zero* problems on all three. See §6 |
| 11 | `lint` — `reportUnusedDisableDirectives` | a stale `// eslint-disable-next-line` | **CAUGHT** |
| 12 | `lint:boundaries` — `lib-not-to-components` | `src/lib/x.ts` → `@/components/layout/page-hero` | **CAUGHT** |
| 13 | `lint:boundaries` — `no-circular` | two new mutually-importing modules in `src/lib/` | **CAUGHT** |
| 14 | `lint:boundaries` — new cycle *through* an exempted file | new module ↔ `src/app/counsellor/_dashboard-client.tsx` | **CAUGHT** — the narrow `pathNot` carve-out does not shelter it, exactly as its comment claims |
| 15 | `lint:boundaries` — `feature-internals-are-private` | `src/components/x.ts` → `@/features/parent/api/data` | **CAUGHT** |
| 16 | `lint:boundaries` — `feature-crosses-slice-via-index` | new `src/features/billing/api/x.ts` → `@/features/parent/api/data` | **CAUGHT** |
| 17 | `lint:boundaries` — `feature-model-is-pure` | `features/parent/model/x.ts` → `../api/data` | **CAUGHT** |
| 18 | `lint:boundaries` — `feature-model-imports-no-framework` | `features/parent/model/x.ts` → `react` | **CAUGHT** |
| 19 | `lint:boundaries` — `not-to-dev-dep` (the rule the author found vacuous) | `src/lib/x.ts` → `@playwright/test` | **CAUGHT** — the `doNotFollow`-instead-of-`exclude` fix is real. Exit code = error count (6, then 2) |
| 20 | `lint:tokens` — all 10 rules | one `.tsx` with `text-red-500 bg-slate-200 dark:bg-slate-800 z-50 rounded-[13px] p-[7px] shadow-lg text-[10px] text-[0.6875rem] bg-black/37 #ff00aa`, plus a second file with `className={\`` | **CAUGHT** — 10/10 rules went red, exit 1 |
| 21 | `lint:tokens` — `--update-baseline` raising | added one palette literal, ran `--update-baseline` | **CAUGHT** — `refusing to raise baseline for [palette-literal]: 245 -> 246`, exit 1, baseline file unchanged |
| 22 | `lint:tokens` — `.jsx` file | same five violations in `src/components/x.jsx` | **VACUOUS** — `walk()` only collects `.ts/.tsx`. Green |
| 23 | `lint:datalayer` | `sb.from('profiles')` in `src/components/` | **CAUGHT** — exit 1 |
| 24 | `lint:datalayer` — evasion | `.from("profiles")`, `` .from(`profiles`) ``, `.from(TABLE_NAME)` — 3 real call sites in one file | **VACUOUS** — all three evade. Green at baseline. See §4 |
| 25 | `lint:datalayer` — `--update-baseline` raising | added one `.from('…')`, ran `--update-baseline` | **VACUOUS** — baseline silently went `166 → 167`, exit 0, next verify run green. See §4 |
| 26 | `lint:deadcode` (knip) | new unreferenced exported file in `src/lib/` | **VACUOUS BY CONSTRUCTION** — `knip --no-exit-code`. Raw `npx knip` exits 1; the npm script always exits 0. See §7 |
| 27 | `check:bundle` | appended 60 kB of incompressible data to `/matches`'s unique chunk | **CAUGHT** — `/matches: 311 kB > 275 kB (+36 kB)`, exit 1 |
| 28 | `check:bundle` — missing chunks | deleted the 5 largest chunks from `.next` | **VACUOUS (fail-open)** — missing chunks are counted as 0 bytes behind a stderr `warning:`; every route "shrank" and the gate passed. See §8 |
| 29 | `test` — jest collection | audited `jest --listTests` against every `*.test.*` / `*.spec.*` on disk | **SOUND** — 63 collected, 62 test/spec files on disk plus `__tests__/matching_demo.ts`; **zero** on-disk test files uncollected. See §9 |
| 30 | Typecheck coverage of `__tests__/` and `e2e/` | type errors planted in both | **CAUGHT** in both. `scripts/` is the only excluded directory |

**19 CAUGHT, 6 VACUOUS, 1 sound-by-inspection.** The four gates that do the most work — the strict typecheck flags, the type-aware lint rules, the dependency-cruiser fence, and the bundle budget — are all real. The vacuous six are documented below.

---

## 2. `ci-ok` — does it fail on a skipped dependency?

**Yes.** I extracted the shell verbatim and ran it over every `needs.*.result` combination:

```
results=[success success success  ] -> exit 0
results=[failure success success  ] -> exit 1
results=[success skipped success  ] -> exit 1   ← the case that matters
results=[cancelled success success] -> exit 1
results=[success success failure  ] -> exit 1
results=[                         ] -> exit 0   ← latent fail-open
```

`if: always()` plus the explicit per-result test is correct and load-bearing; the comment claiming so is accurate. A skipped dependency reads as failure, which is the specific trap this pattern exists to avoid.

The one fail-open: **an empty `needs` list yields an empty `$results`, the `for` loop iterates zero times, and the job prints "All required jobs succeeded" and exits 0.** That cannot happen today (`needs: [quality, test, build]`), but a future edit that empties or comments out `needs` turns the single required check permanently green with no other symptom. A `[ -z "$results" ] && exit 1` guard would close it.

### Exclusions — documented honestly?

Partly.

- `database` and `e2e` **are** correctly excluded from `needs` and each carries an honest job-level explanation of what must be true before it is added.
- **`overlap-guard` is a third excluded job that the `ci-ok` header does not mention.** The header enumerates the exclusions as "`database` and `e2e`", which reads as exhaustive. `overlap-guard` — the guard whose entire justification is that PRs #33 and #34 both went green and then landed untested — therefore cannot fail anything either. Its own header does say "Advisory only", so the fact is recorded, just not where a reader checking the aggregate gate would look.
- **`ci-ok`'s claim to be "ONE check to require in branch protection" is currently unenforceable.** `gh api repos/Ascenda123/Ascenda/branches/main/protection` returns `403 Upgrade to GitHub Pro or make this repository public`. There is no branch protection and none can be configured on this plan, so *no* check — `ci-ok` included — blocks a merge today. The `overlap-guard` header states this; the `ci-ok` header does not.
- **One factual error.** The `ci-ok` header says of `database`: *"its one known blocker (the missing universities.recognition_score column) is fixed … add it here the first time it passes, which should be this PR."* Both halves are false — see §3.

---

## 3. Would the `database` job pass today?

**No.** I replayed it against real PostgreSQL 16.14 using the exact stub SQL, `schema.sql`, and migration loop from `ci.yml`.

### Job definition — mechanically sound

- `actions/checkout@v5`, `postgres:16` service with `pg_isready` health-check and `ports: ['5432:5432']` — correct for a non-container job.
- `psql -h localhost -U postgres` with `PGPASSWORD` — correct; defaults to the `postgres` database, which the image creates.
- `-v ON_ERROR_STOP=1` is present on **all three** steps. Verified: without it psql exits 0 after an error.
- Exit-code propagation through the `for pass in 1 2 / for f in …` loop is correct. GitHub's default shell is `bash -e`, and a non-zero `psql` in a loop body (not a condition context) aborts the script.
- Glob order `supabase/migrations/*.sql` is lexicographic = timestamp order. Correct.

The *mechanics* are fine. The job is well-built. It just cannot go green.

### The stub is insufficient

```
psql:supabase/migrations/20260512120000_help_requests_and_notifications.sql:52:
ERROR:  publication "supabase_realtime" does not exist
```

The late stub additions (`auth.users.email`, the `storage` schema) were both necessary — `schema.sql` completes cleanly with them and aborts without them. But the repo's SQL also does `alter publication supabase_realtime add table …`, and the stub never creates that publication. **The job dies on the very first migration.** One missing line: `create publication supabase_realtime;`.

### With the publication stubbed in, four more failures

```
pass 1  20260512120000_…  ERROR: relation "help_requests" is already member of publication "supabase_realtime"
pass 1  20260513120000_…  ERROR: relation "help_messages"  is already member of publication "supabase_realtime"
pass 1  20260723120000_search_facet_indexes.sql:21  ERROR: column "recognition_score" does not exist
pass 2  20250308120000_normalize_course_catalog.sql:429  ERROR: relation "programs" already exists
```

The pass-2 failure means the **idempotency assertion the job was built to make does not hold**.

### The `recognition_score` "fix" is applied to the wrong table

This is worth spelling out because `ci.yml` asserts it is fixed. I proved otherwise, step by step, on a clean database:

```
after schema.sql:          universities.recognition_score -> [recognition_score]   ✓ present
after 20250308120000:      universities.recognition_score -> []                    ✗ gone
                           to_regclass('archive_raw_universities') -> [archive_raw_universities]
```

`supabase/schema.sql:244` does add `recognition_score` to `universities`. But `20250308120000_normalize_course_catalog.sql:423-428` then renames that table to `archive_raw_universities` and promotes `universities_v2` — which has no `recognition_score` column — into its place. The column added by the fix is carried off to the archive table, and `20260723120000_search_facet_indexes.sql` still fails with the identical error the fix was meant to eliminate.

**Assessment: the `database` job is the most valuable thing in this PR and the only one whose claim is contradicted by running it.** It is honest about being unproven ("there is no Postgres in the authoring environment, so the full replay has never actually been observed green") and then, two lines later, asserts a specific blocker is fixed and predicts it will pass on this PR. Neither is true. The five failures it surfaces are exactly the class of rot it was built to find, which is an argument *for* the job — but the comment must be corrected before anyone reads a green tick into it.

---

## 4. The ratcheting baselines

### `check-design-tokens.baseline.json` — honest, and the ratchet holds

Independently reproduced: every one of the 10 recorded counts matches the current tree exactly (445 files scanned, 0 drift). All 10 rules go red on a violation. `--update-baseline` **refuses** to raise a number and exits 1 without writing the file. Verified.

Known weaknesses, two of which are documented in the script and one of which is not:

- *(documented)* per-rule **total**, not per-file — deleting five violations in `landing/` and adding five in a new component nets zero and passes.
- *(documented)* per-file `ALLOW` exemptions are whole-file — any *new* hex in `rocket-art.tsx` or `layout.tsx` is free.
- **(not documented)** the walk collects only `.ts`/`.tsx`. A `.jsx` component with `text-red-500 bg-slate-200 z-50 rounded-[13px]` scores zero. Latent only — there are currently 0 `.js`/`.jsx` files under `src/`.

The line-oriented comment skip (`//`, `*`, `/*`) is not meaningfully exploitable; multi-line `className` attributes still match per line, and I confirmed 87 existing multi-line `.from('` call sites are counted.

### `check-data-layer.baseline.json` — the number is honest, the ratchet is not

The recorded `total: 166` reproduces exactly under an independent `grep -ro "\.from('"` with the same exclusions. **But the metric under-measures, and the mechanism can be defeated in one command.**

**(a) `--update-baseline` silently RAISES the baseline.**

```
$ echo "sb.from('profiles')…" > src/components/x.ts
$ node scripts/check-data-layer.mjs --update-baseline
baseline updated: 167 call sites across 46 files      ← exit 0
$ node scripts/check-data-layer.mjs
✓ 167 direct .from() call sites outside src/lib/data (at baseline, 46 files).
```

The script's own docblock says *"it can never go back up"* and *"Same mechanism as `scripts/check-design-tokens.mjs`"*. It is **not** the same mechanism: the token script has an explicit refuse-to-raise guard (lines 205-215) and this one has none. The claim is false as written, and the ratchet is one `npm run lint:datalayer -- --update-baseline` away from being defeated with a one-line diff that reads like a routine improvement.

**(b) The `/\.from\('/` regex misses three common spellings.** I added a file containing `.from("profiles")`, `` .from(`profiles`) `` and `.from(TABLE_NAME)` — three genuine PostgREST call sites outside the data layer — and the gate stayed green at 166.

This is not hypothetical. **18 real PostgREST call sites across 8 files already evade the count today:**

```
src/app/api/admin/import/route.ts               .from(table)      ← table name from the request
src/components/university-search/saved-search-store.ts   .from(TABLE_NAME) ×5
src/components/university-search/shortlist-store.ts      .from(TABLE_NAME) ×3
src/lib/shortlist/server.ts                              .from(TABLE_NAME) ×2
src/lib/profile/persist-intake.ts
src/lib/chat/history.ts:22          const tbl = (supabase, name) => supabase.from(name)
src/lib/demo/help-request-client.ts:25   ← same helper
src/lib/counsellor/decks.ts:28           ← same helper
```

The true figure is ≈184, not 166. Worse, three files already define a `tbl(supabase, name)` indirection — **the evasion is an established idiom in this codebase**, so it will be copied, and every copy is invisible to the ratchet. `ci.yml` repeats the 166 figure as fact.

*Recommended minimum fix:* `/\.from\(\s*['"`]/` for the literal cases, plus an explicit acknowledgement of the dynamic-identifier blind spot in the baseline `_readme`; and port the refuse-to-raise guard from the token script.

---

## 5. `tsconfig.json` — the `verbatimModuleSyntax` split

The split is **safe**, but only because of a property that is not stated anywhere.

- App / `tsc --noEmit`: `verbatimModuleSyntax: true`.
- ts-node (`jest.config.ts` compilation only) and ts-jest (`{ verbatimModuleSyntax: false }`): off.

The dangerous asymmetry would be code that typechecks but breaks at runtime. It cannot arise here: `tsconfig.json`'s `include` is `**/*.ts` / `**/*.tsx`, so `tsc --noEmit` covers `__tests__/` **and** `e2e/` — verified by planting type errors in both. Any type-only-used value import is therefore rejected by the gate (`TS1484`) before ts-jest's import elision can paper over it. The only divergence runs in the safe direction: constructs that fail `tsc` and pass jest.

I also verified the ts-jest inline `tsconfig` object **merges** rather than replaces — a fallthrough switch in a test file failed the suite with `TS7029`, so the four new strict flags apply under jest too. The comment's claim is accurate.

**The real hole is not the split, it is the `exclude`.** `tsconfig.json` excludes `scripts`, so:

- `scripts/seed-demo-user.ts` and `scripts/seed-students.ts` — **both modified on this branch** — are typechecked by nothing.
- `scripts/apply-sql.ts` (the migration runner) likewise. It is executed via `tsx`, which strips types without checking them.
- A blatant `const n: number = "definitely a string"` in `scripts/` produced zero errors from `npm run typecheck`.

These scripts hold service-role credentials and write to the database. They are the one part of the repo with no type gate at all.

---

## 6. `.tsx` is outside the type-aware lint fence — everywhere

The type-aware block globs `src/lib/**/*.ts`, `src/features/**/*.ts`, `src/app/api/**/*.ts`, `src/middleware.ts`, `src/instrumentation.ts`, `src/app/**/actions.ts`. **Every one ends in `.ts`.** No `.tsx` file in the repository receives `no-floating-promises`, `no-misused-promises`, `switch-exhaustiveness-check`, or `await-thenable`. Confirmed: the identical probe that produced 3 errors as `.ts` produced **zero** as `.tsx` in `src/features/parent/ui/`, `src/lib/`, and `src/components/`.

Two consequences:

1. **`no-misused-promises` cannot do the job its own comment describes.** The comment justifies it with *"`onClick={async () => …}` where a void return is expected"*. JSX only exists in `.tsx`. The rule is enabled exclusively in files that cannot contain the construct it was added for.
2. **A real file is silently outside the fence: `src/lib/auth/role-context.tsx`.** It sits in the directory the block calls "the data layer", and it gets none of these rules. The block's own warning — *"moving a file OUT of one of these directories silently removes it from these rules"* — has a sibling failure mode it does not mention: *renaming a file to `.tsx` does the same thing*, and one file has already landed that way.

`src/features/parent/ui/*.tsx` (6 files) is the pilot slice's entire rendering layer, also uncovered.

Fix is one line per glob: add `src/lib/**/*.tsx`, `src/features/**/*.tsx`, and the `.tsx` peers. (Cost: `npm run lint` currently runs in ~18 s; the block would widen to a few hundred more files.)

---

## 7. `lint:deadcode` — a report wearing a gate's clothes

`"lint:deadcode": "knip --no-exit-code"` always exits 0. Raw `npx knip` exits 1 on the current tree. So the CI step **can never fail**, by construction.

This is stated plainly in three places (the npm script, `knip.json`'s header, and the CI step's own `(advisory)` label), so it is not a deception. But one claim in `ci.yml` is not supported:

> `# Kept visible so the list cannot quietly grow.`

Nothing compares knip's output against anything. There is no knip baseline. The list can grow by any amount and the only signal is a log a human has to read and remember the previous size of. "Cannot quietly grow" describes a ratchet; this is a printout. Either add a baseline (the token/data-layer pattern already exists twice in this repo) or reword the comment.

Also noted: `eslint-plugin-tailwindcss@4.2.0` was added as a devDependency by the Phase 1 commit and is **never referenced in `eslint.config.mjs`**. The `check-design-tokens.mjs` header says its `arbitrary-geometry` rule is *"Covered in part by eslint-plugin-tailwindcss no-arbitrary-value, kept here so the gate stands alone if that rule is not yet enabled"* — the rule is not enabled, and the plugin is dead weight.

---

## 8. `check:bundle` — real, with one fail-open

The gate works: inflating `/matches`'s unique chunk by 60 kB produced `‌/matches: 311 kB > 275 kB (+36 kB)` and exit 1. Budgets are sane (measured + ~15 kB headroom) and the shared-chunk budget is separately and more tightly enforced.

Fail-open: `gzKB()` catches a read failure, prints `warning: chunk missing from .next, treated as 0 bytes`, and returns 0. I deleted the 5 largest chunks; every route's number dropped (e.g. `/counsellor/assistant` 303 → 148 kB) and the gate reported **"All routes within budget"**, exit 0. In CI the build runs immediately before, so the realistic trigger is a partial or interrupted build rather than an attack — but a missing chunk should be a hard error, not a stderr line with no exit-code consequence.

---

## 9. `jest.config.ts` — collection is complete

No `testMatch` is set, so Jest's defaults apply: `**/__tests__/**/*.[jt]s?(x)` and `**/?(*.)+(spec|test).[jt]s?(x)`.

- 63 suites collected; 62 `*.test.*`/`*.spec.*` files exist on disk, plus `__tests__/matching_demo.ts` picked up by the directory pattern. **Set difference of on-disk vs collected is empty — nothing is silently excluded.**
- `testPathIgnorePatterns` excludes exactly three genuine fixture/helper modules (`__tests__/helpers/`, `phase1_profiles.ts`, `batch_runner.ts`) and correctly re-adds `/node_modules/`, which overriding the default would otherwise have dropped.
- Playwright specs are named `*.e2e.ts`, a suffix Jest does not claim, so the two runners are disjoint without config surgery. `playwright.config.ts` documents this deliberately.
- Full CI command reproduced: **63 suites, 1069 tests, all passing, exit 0** in 194 s.

**But the coverage number CI publishes is misleading.** There is no `collectCoverageFrom`, so Jest instruments only files a test imports. The run produced:

```
Statements : 72.94% ( 5960/8171 )
files in coverage report: 111   (108 under src/)
.ts/.tsx files under src/:  449
```

The `Coverage summary` step writes **72.94%** into `$GITHUB_STEP_SUMMARY` — a figure computed over 24% of the source tree. The comment directly above that step says *"Coverage is ~13% overall but ~79% in lib/chat"*, which is roughly the honest number and is contradicted by what the step actually prints. Anyone reading the PR summary sees 73%. Adding `collectCoverageFrom: ['src/**/*.{ts,tsx}']` would make the printed number mean what it appears to mean.

---

## 10. npm scripts — no clobbering

Walked `package.json` commit by commit across the branch. Four commits touched the `scripts` block (`c620957`, `da1f438`, `b5119ae`, and `f4f36c1` for dependencies). **Every script any commit added is still present at HEAD.** No edit overwrote another; `lint:datalayer` was appended after `supabase:types` in `b5119ae` (hence the odd placement outside the `lint:*` group) but nothing was lost.

Every script CI invokes exists and runs: `typecheck`, `lint`, `lint:boundaries`, `lint:tokens`, `lint:datalayer`, `lint:deadcode`, `test`, `build`, `check:bundle`, `test:e2e`, `test:e2e:install`. All five new devDependencies are present in `package-lock.json` at the pinned versions, so `npm ci` will resolve.

Confirmed all six runnable gates are green on an unmodified checkout:
`typecheck 0 · lint 0 · lint:boundaries 0 · lint:tokens 0 · lint:datalayer 0 · check:bundle 0`.

---

## 11. `e2e` — can it report success while doing nothing that matters?

**It reports success while doing nothing. It does not, however, gate anything, so nothing is falsely certified.**

With no secrets configured (today's state), the guard step writes `configured=false`, emits `::notice::E2E secrets are not set — skipping the browser suite`, and every subsequent step — `npm ci`, Chromium install, Playwright, artifact upload — is skipped by `if: steps.secrets.outputs.configured == 'true'`. The job then reports **success**.

- **Not silently green in the dangerous sense:** `e2e` is excluded from `ci-ok`'s `needs`, so its result is not folded into the required check. A no-op cannot make anything else pass.
- **But the skip is not very visible:** the PR checks list shows a green tick next to `e2e`. The `::notice::` annotation lives on the run summary page, one click away. A reader scanning the checks list sees "e2e ✓" and reasonably infers browser coverage. GitHub has no "neutral" conclusion available from a plain job; the honest alternatives are to name the job `e2e (skipped without secrets)` or to let the guard step `exit 1` behind `continue-on-error: true`, which renders as a visible amber annotation instead of a clean tick.
- **Partial guard:** the check tests `E2E_EMAIL`, `E2E_PASSWORD` and `E2E_SUPABASE_URL`, but the Playwright step also needs `E2E_SUPABASE_ANON_KEY`, which is not checked. Setting three of four secrets flips `configured=true` and the suite runs against an empty anon key — it would fail loudly rather than pass quietly, so this is a papercut, not a hole.
- `playwright.config.ts` sets `forbidOnly: !!process.env.CI` and Playwright exits non-zero when it matches no tests, so a silently-empty suite is not possible once it does run.
- Minor doc drift: the config says *"With the variables unset the wizard spec skips with an explanatory message, which is what CI does today"* — CI does not run Playwright at all when unset.

---

## 12. What this gate layer actually protects

**Substantially more than nothing, and less than it claims.**

What is genuinely new and genuinely enforced, verified by breaking it:

- Four strict TypeScript flags, all live, all catching classes of bug `strict: true` misses.
- Four type-aware ESLint rules, live on `src/lib`, `src/features`, `src/app/api`, `src/middleware.ts` and server actions — the newly-added `src/features` glob works.
- A 13-rule dependency-cruiser fence: layering, cycles, feature-slice privacy, model purity, devDependency leakage. **Every rule I tested fired**, including the `not-to-dev-dep` rule the author had already caught being vacuous once — the `doNotFollow`-instead-of-`exclude` fix is correct and confirmed (2083 edges cruised, npm edges present).
- A 10-rule design-token ratchet with an honest baseline and a working refuse-to-raise guard.
- A per-route bundle budget that trips on a 36 kB regression.
- `ci-ok`'s skipped-dependency logic, which is the trap most aggregate-gate implementations fall into, correctly handled.

What is counted as protection but is not:

1. **The `database` job cannot pass** — the stub is missing `create publication supabase_realtime`, and `ci.yml` asserts a `recognition_score` blocker is fixed when a rename migration still strips the column. Five distinct failures.
2. **`lint:datalayer`'s ratchet can be raised with `--update-baseline`**, contradicting its own docstring, and its regex already misses 18 real call sites including a `tbl(supabase, name)` idiom used in three files.
3. **No `.tsx` file anywhere gets a type-aware lint rule** — including `src/lib/auth/role-context.tsx` and the whole pilot slice's UI layer. `no-misused-promises` is enabled only in files that cannot contain the construct it exists to catch.
4. **`scripts/**` is typechecked by nothing** — including the two seed scripts this branch modified and the migration runner.
5. **`lint:deadcode` can never fail**, and "the list cannot quietly grow" describes a ratchet that does not exist.
6. **The published coverage figure (73%) overstates by roughly 4×** because `collectCoverageFrom` is unset.
7. **Nothing blocks a merge.** Branch protection is unavailable on this plan (403, GitHub Pro required). `ci-ok` is a check nobody is required to pass.

None of the seven is fatal, and five are single-line or single-config fixes. The failure mode the framing warns about — a gate counted as protection that cannot fail — is present in exactly three places (`lint:datalayer`'s ratchet, `lint:deadcode`, and `.tsx` exclusion from type-aware lint), and in one further place the gate *can* fail and the accompanying prose says it won't (`database`). The rest of the layer does what it says. **My recommendation is to fix items 1-4 before merge — they are the ones where a green tick actively misinforms — and to correct the four inaccurate comments (`recognition_score` is fixed / the data-layer ratchet is the same mechanism / the list cannot quietly grow / coverage is ~13%) in the same pass.** Comments are the interface to a gate layer, and four of them currently overstate it.

---

### Reproduction

All experiments ran in an APFS clone at
`/private/tmp/claude-501/-Users-gregfranck-Ascenda/…/scratchpad/work`
against a throwaway PostgreSQL 16.14 cluster on a Unix socket at `/tmp/pgs-audit:55432`.
The real working tree was never modified; the `database` replay script is at `…/scratchpad/dbjob.sh`.
