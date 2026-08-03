# Lane L — configuration, CI, and the gate layer

Worktree: `scratchpad/lane-l` @ `40cb781` (detached, `node_modules` symlinked to the main tree).
The main working tree was never modified; this file is the only thing written into it.

---

## Summary

**Executed vs inferred: 41 of 45 claims in this report were executed** (every gate break, every
bypass, every path-list probe, the Tailwind CSS compile-and-diff, the secret scans). **4 are
inferred by reading**, all in the GitHub-runner-only column: `ci-ok`'s aggregation logic, the
`e2e` job's skip behaviour, the `database` job's runner behaviour, and Actions tag pinning.
No GitHub run was triggered.

**Seven of the nine gates were deliberately broken and went red.** One
(`lint:deadcode`) is structurally incapable of going red and did not. One (`check:bundle`)
could not be broken — a rebuild needs ~1.5 GB and the machine went to 482 MiB free mid-lane
(a concurrent lane's build); it is recorded as **not verified**, with its baseline measured.

Headline findings:

- **L1 (P1)** `tailwind.config.ts` `content` omits `./src/features/**`. Compiled the CSS
  with and without the glob and diffed the selector sets: **exactly 5 selectors are missing
  from the shipped stylesheet** — `min-w-[180px]`, `max-w-[75%]`, `text-primary-foreground/60`,
  `focus:ring-ring:focus`, `sm:min-h-[560px]`. Third instance of "a file move silently dropped
  a gate", and the only one that reaches a user's screen. `NEW`.
- **L2 (P2)** `lint` runs with no `--max-warnings`; a newly-added warning-level violation
  leaves exit 0. Quantified below: the restricted-import rule (the one thing standing between
  generated DB row types and the component tree) is **unenforceable as configured**.
- **L3 (P2)** `lint:deadcode` runs `--no-exit-code`. Planted a brand-new unreferenced file;
  knip listed it and exited **0**. 217 findings ride the baseline unenforced.
- **L4 (P2)** `lint:datalayer`'s 198 = 192 PostgREST + 2 JSDoc examples + 4 Supabase *Storage*
  `.from(bucket)`. Confirmed independently. **Four** bypasses stay green, all executed:
  delete a doc-comment `.from()` to pay for a real call site; `.from(TABLES.x)`;
  `.from(String('programs'))`; `.rpc()`.
- **L5 (P2)** The type-aware ESLint block covers `src/features/**/*.ts` — **proven red** — but
  its glob list names no `.tsx` at all, so **none of the repo's 303 `.tsx` files** get
  `no-floating-promises` / `no-misused-promises` / `switch-exhaustiveness-check` /
  `await-thenable`. Proven green on `src/features/parent/ui/parent-thread.tsx` and
  `src/lib/auth/role-context.tsx`.
- **L6 (P2)** `tsconfig.json` excludes `scripts/`. Planted `const x: number = "nope"` in
  `scripts/apply-sql.ts` — `npm run typecheck` exit **0**. The script that applies SQL to the
  production database is not typechecked.
- **L7 (P1, pre-existing)** A **live `service_role` JWT for project `alpkbobbasxvubogkark`,
  exp 2035-11-13**, is committed in reachable git history (`823b0a7`, on `main`).
  `service_role` bypasses RLS entirely. Not in the tree at HEAD, not in these 21 commits —
  but anyone with repo read access has it. Rotation is owner-only (§1).
- **L8 (P2)** `e2e/harness-smoke.e2e.ts` — the check the middleware unit test explicitly
  delegates the `matcher` question to, and the one spec written to need no credentials —
  **never runs in CI**: every step after the secrets probe is gated on
  `configured == 'true'`. Confirms and sharpens Lane B.
- **L9 (P3)** CI runs the suite in `TZ=America/Los_Angeles` only. The audit's own definition
  of done requires `TZ=UTC` **and** `TZ=America/Los_Angeles`.
- **L10 (P3)** `check:bundle` cannot distinguish a fresh manifest from a stale or
  failed-build one. Observed directly: a build that exited 1 still left
  `app-build-manifest.json`, and `check:bundle` reported "All routes within budget", exit 0.

`database` and `e2e` are confirmed deliberately out of `ci-ok`'s `needs`, each with a written
reason that still holds — but see L8 and L11 for what the `e2e` reason now costs.

No secret, key or password is added anywhere in the 21 commits, and none is in the tree
beyond the *anon* (publishable-by-design) key in `.claude/settings.json`, which predates
this branch.

---

## The nine-gate break table

Every row was executed in the worktree; the breakage was reverted immediately after.

| # | Gate | Breakage injected | Command | Exit | Detected? |
|---|---|---|---|---|---|
| 1 | `typecheck` | `export const __auditTypeBreak: number = "not a number";` appended to `src/features/parent/model/currency.ts` | `npm run typecheck` | **2** | **YES** — `currency.ts(66,14): error TS2322` |
| 2a | `lint` (error) | `const auditUnusedVariable = 1;` appended to `src/lib/utils.ts` | `npm run lint` | **1** | **YES** — `@typescript-eslint/no-unused-vars`, "3 problems (1 error, 2 warnings)" |
| 2b | `lint` (warning) | `import type { Json as _AuditJson } from '@/lib/types/database';` added to `src/components/ui/button.tsx` | `npm run lint` | **0** | **NO** — "3 problems (0 errors, 3 warnings)", exit 0 |
| 3 | `lint:boundaries` | `export type { ParentChild as _AuditLeak } from '@/features/parent/model/types';` appended to `src/lib/utils.ts` | `npm run lint:boundaries` | **1** | **YES** — `error feature-internals-are-private: src/lib/utils.ts → src/features/parent/model/types.ts` |
| 4 | `lint:tokens` | `export const AUDIT_BREAK_CLASS = "text-emerald-500 bg-rose-400";` appended to `src/components/ui/badge.tsx` | `npm run lint:tokens` | **1** | **YES** — `FAIL palette-literal: 247 (baseline 245, +2)` |
| 5 | `lint:deadcode` | new file `src/lib/audit-dead-file.ts`, exporting a function nothing imports | `npm run lint:deadcode` | **0** | **NO** — listed under `Unused files (3)`, exit 0 |
| 6 | `lint:datalayer` | `export const auditBreak = (c: any) => c.from("programs").select("id");` appended to `src/lib/utils.ts` | `npm run lint:datalayer` | **1** | **YES** — `✗ … rose 198 → 199` |
| 7 | `build` | type error in `src/features/parent/model/currency.ts` (same as row 1) | `npm run build` | **1** | **YES** — `Failed to compile.` / `./src/features/parent/model/currency.ts:66:14` |
| 8 | `check:bundle` | *not injected* | `npm run check:bundle` (baseline only) | 0 | **NOT VERIFIED** — see Not verified |
| 9 | `test` | `parseLocalDate` reverted to the UTC-midnight bug: `if (m) return new Date(value);` in `src/lib/utils/dates.ts` | `TZ=America/Los_Angeles npm test` | **1** | **YES** — 5 suites / 8 tests failed of 1,541 |

**Verdict: 7 of 9 gates proven to go red. 1 proven structurally unable to (`lint:deadcode`).
1 unverified (`check:bundle`).**

### Baseline (worktree, HEAD, before any breakage)

| Gate | Exit | Output |
|---|---|---|
| `typecheck` | 0 | (silent) |
| `lint` | 0 | 2 problems, **0 errors, 2 warnings** |
| `lint:boundaries` | 0 | 4 violations, **0 errors, 4 warnings**; 490 modules / 2,088 deps |
| `lint:tokens` | 0 | 449 files; palette-literal 245, hex 5, dark-variant 116, raw-z 73, off-ladder-shadow 25, arbitrary-geometry 92, template-classname 25, subfloor-type 24, named-step-as-arbitrary 54, dead-opacity 0 |
| `lint:datalayer` | 0 | 198 sites / 56 files, at baseline |
| `lint:deadcode` | 0 | **217 findings**: 2 unused files, 3 unused devDeps, 1 unresolved import, 102 unused exports, 107 unused exported types, 2 duplicate exports (+3 config hints) |
| `build` | 0 | compiled successfully in 2.6 min |
| `check:bundle` | 0 | shared 101/110 kB; worst slack `/counsellor/universities` 261/270 (9 kB); `/assistant` 323/345 |
| `test` | 0 | 1,541 tests / 67 suites |

---

## Findings

### L1 — Tailwind's `content` globs omit `src/features/**`; five utility classes are absent from the shipped CSS
Severity: **P1**
Location: `tailwind.config.ts:65-77` (`content`)
Regression?: **NEW** — the `parent` slice moved from `src/app/parent/_components/` (covered by
`./src/app/**`) into `src/features/parent/ui/` (covered by nothing) in this branch.
Evidence:
```
$ npx tailwindcss -c tailwind.config.ts -i src/app/globals.css -o tw-baseline.css --minify
$ # add './src/features/**/*.{js,ts,jsx,tsx}' to content, recompile to tw-fixed.css
$ node -e '…diff the selector sets…'
selectors ONLY in the with-features build (5):
min-w-\[180px\]
max-w-\[75\%\]
text-primary-foreground\/60
focus\:ring-ring:focus
sm\:min-h-\[560px\]

selectors lost (0):
```
The `content` list is:
```
'./src/pages/**/*.{js,ts,jsx,tsx,mdx}'
'./src/components/**/*.{js,ts,jsx,tsx,mdx}'
'./src/app/**/*.{js,ts,jsx,tsx,mdx}'
'./src/lib/**/*.{js,ts}'
```
`src/features/**` and `src/hooks/**` appear nowhere, and `src/lib` is `.{js,ts}` only, so
`src/lib/auth/role-context.tsx` is also outside it.
Repro: open `/parent` → the child switcher has no minimum width, the cost-explorer panel has
no minimum height, the thread bubbles have no max width, and the focus ring on the switcher
never paints. Nothing errors; the utilities simply do not exist in the stylesheet.
Fix: add `'./src/features/**/*.{js,ts,jsx,tsx,mdx}'` and `'./src/hooks/**/*.{js,ts,jsx,tsx}'`
to `content`, and widen the `src/lib` entry to `.{js,ts,jsx,tsx}`. +227 bytes of CSS.
Test: a node script in `__tests__/` (or a step in `lint:tokens`) that walks every top-level
directory under `src/` and asserts each is matched by at least one `content` glob. That
assertion fails today and passes after the fix, and — unlike a hardcoded list of five class
names — it also catches the *next* directory somebody adds. This is the third time a file
move has silently dropped a gate (`lib/parent/data.ts` → `features/parent/api/data.ts` losing
`no-floating-promises` is documented in `eslint.config.mjs`); the durable fix is the
directory-coverage assertion, not another glob.

### L2 — `lint` cannot fail on a warning, so the restricted-import rule is decorative
Severity: **P2**
Location: `package.json:17` (`"lint": "eslint ."`), `eslint.config.mjs:129-146`
Regression?: **NO** (pre-existing: `origin/main` has the same `eslint .`), but the branch
**added** the `no-restricted-imports` rule at `'warn'`, so it added an unenforceable gate.
Evidence:
```
$ npm run lint                       # baseline
✖ 2 problems (0 errors, 2 warnings)  → exit 0
$ # add `import type { Json } from '@/lib/types/database'` to src/components/ui/button.tsx
$ npm run lint
✖ 3 problems (0 errors, 3 warnings)  → exit 0
```
Classes of defect currently reported and ignored — this is the whole set, because
`no-restricted-imports` is the only `warn`-severity rule configured:
- **Generated Supabase row types leaking into `src/components/**` and `src/hooks/**`.** Two
  live instances (`src/components/university-search/shortlist-store.ts:6`,
  `src/hooks/useSupabase.ts:6`). The rule's own comment says it is scoped as a warning "for
  now… promote to 'error' once the shared/data layer gives them somewhere to go" — but as
  written it also cannot stop instance number three, which is the thing the ratchet posture
  everywhere else in this repo exists to prevent.
- Every future `warn` rule anyone adds, silently.
Repro: the row above.
Fix: `"lint": "eslint . --max-warnings 2"` in the same commit, so the two known warnings are
frozen and a third is red — the identical ratchet shape as `lint:tokens` and `lint:datalayer`,
which this repo already trusts. Drop the number as the two are fixed.
Test: `__tests__/config/lint-ratchet.test.ts` asserting the `lint` script contains
`--max-warnings`; fails before, passes after.

### L3 — `lint:deadcode` runs `--no-exit-code`; 217 findings ride unenforced and a new one is invisible
Severity: **P2**
Location: `package.json:19`, `.github/workflows/ci.yml` "Dead code (advisory)"
Regression?: **NO** — documented as deliberate in `knip.json` and in the CI step comment.
Evidence:
```
$ printf 'export const auditNeverUsed = () => 42;\n' > src/lib/audit-dead-file.ts
$ npm run lint:deadcode
Unused files (3)
jest.environment-tz-west.js
src/hooks/use-user-role.ts
src/lib/audit-dead-file.ts        ← the new one, seen and reported
…
EXIT=0
```
What is reported and ignored, by category (baseline): 2 unused files, 3 unused
devDependencies, 1 unresolved import, **102 unused exports**, **107 unused exported types**,
2 duplicate exports. Of these, the two that matter operationally are the unused *files*
(`jest.environment-tz-west.js` is reported unused while
`__tests__/matching/date-only-render.test.tsx:1` references it through a docblock knip cannot
resolve — a false positive; `src/hooks/use-user-role.ts` looks like genuine dead code) and
the 3 unused devDependencies, which are install-time weight.
Fix: exactly what `knip.json`'s own header prescribes — the narrowed blocking script
`"lint:deadcode:files": "knip --include files"` (2 findings, both triageable today) added to
the `quality` job, leaving the 209 export findings advisory.
Test: the failing-first test is the row above — add an unreferenced file, expect exit 1.

### L4 — the `lint:datalayer` ratchet carries 6 units of slack and has four green bypasses
Severity: **P2**
Location: `scripts/check-data-layer.mjs:57-64` (`PATTERNS`)
Regression?: **NEW** (the ratchet is new on this branch).
Evidence — the count decomposition, verified independently of the script:
```
$ grep -rnE "\.from\(\s*['\"\`]|\.from\(\s*[A-Za-z_$][\w$]*\s*[),]" src \
    --include='*.ts' --include='*.tsx' | grep -vE '^src/(lib/data|lib/supabase)/' | wc -l
198                                  ← identical to the script's number
```
Of those 198: **2** are JSDoc examples (`src/app/api/admin/admin-guard.ts:11`,
`src/lib/auth/policy.ts:206`) and **4** are Supabase *Storage* `.from(bucket)` calls, which
are not PostgREST at all (`src/components/applications/document-uploader.tsx:84,101,106` and
`src/app/applications/documents/page.tsx:51`). **True PostgREST figure: 192.**
The four bypasses, each executed:
```
# 1. delete a doc-comment `.from()` example to pay for a real new call site
$ python3 -c "…delete src/lib/auth/policy.ts line 206…"
$ echo 'export const auditBypass1 = (c:any) => c.from("programs").select("id");' >> src/lib/utils.ts
$ npm run lint:datalayer
✓ 198 direct .from() call sites … (at baseline, 56 files).      EXIT=0

# 2. member expression — invisible to both regexes
$ echo 'const TABLES={programs:"programs"} as const;
        export const auditBypass2=(c:any)=>c.from(TABLES.programs).select("id");' >> src/lib/utils.ts
$ npm run lint:datalayer   → ✓ 198 …                            EXIT=0

# 3. any call expression as the table name
$ echo 'export const auditBypass4=(c:any)=>c.from(String("programs")).select("id");' >> src/lib/utils.ts
$ npm run lint:datalayer   → ✓ 198 …                            EXIT=0

# 4. .rpc() is not counted at all
$ echo 'export const auditBypass3=(c:any)=>c.rpc("some_function",{a:1});' >> src/lib/utils.ts
$ npm run lint:datalayer   → ✓ 198 …                            EXIT=0
```
Repro: any of the four lets a new direct database call land with the gate green.
Fix: (a) skip comment lines the way `check-design-tokens.mjs` already does — it strips lines
starting `//`, `*`, `/*`, and this script does not; (b) exclude `.storage.from(`; (c) re-baseline
to the resulting true number in the same commit, with the decomposition in the commit message;
(d) count `.rpc(` alongside `.from(` — it is the same "direct PostgREST access outside the
data layer" the script exists to ratchet. Bypass 2 and 3 are inherent to a regex and should be
written into the docstring as known holes rather than left implicit.
Test: fixture-based unit tests for the counter — a fixture containing a commented `.from()`, a
`storage.from()`, a `.rpc()` and a real `.from()` must count exactly 1 (plus 1 for the `.rpc`
once counted). Fails before, passes after.

### L5 — the type-aware ESLint rules reach `src/features/**/*.ts` but no `.tsx` file anywhere
Severity: **P2**
Location: `eslint.config.mjs:74-81`
Regression?: **NEW** — `origin/main` had no type-aware block at all, so nothing is lost; but a
gate shipped with a hole in it is the finding.
Evidence — the same floating promise appended to five files, `npx eslint <file>` each time:
```
src/features/parent/api/data.ts      → exit 1  no-floating-promises   ← COVERED
src/lib/utils.ts                     → exit 1  no-floating-promises   ← COVERED
src/features/parent/ui/parent-thread.tsx → exit 0                     ← NOT covered
src/lib/auth/role-context.tsx            → exit 0                     ← NOT covered
```
The glob list is `src/lib/**/*.ts`, `src/features/**/*.ts`, `src/app/api/**/*.ts`,
`src/middleware.ts`, `src/instrumentation.ts`, `src/app/**/actions.ts` — six entries, not one
of which can match a `.tsx` file. `src/` holds **303** `.tsx` files.
The block's own comment warns that "moving a file OUT of one of these directories silently
removes it from these rules"; the extension list has the same property and is not mentioned.
Repro: a client component that fires an un-awaited mutation — `void`-less
`saveDraft(payload);` in `src/features/parent/ui/*.tsx` — passes every gate.
Fix: the four rules are genuinely valuable in `ui/` too (`no-misused-promises` on
`onClick={async …}` is a component-only bug class). Add `src/features/**/*.tsx` at minimum,
and measure the lint-time cost before widening to `src/components/**`.
Test: an ESLint-config unit test that loads `eslint.config.mjs`, resolves the config for
`src/features/parent/ui/parent-thread.tsx`, and asserts `no-floating-promises` is `error`.

### L6 — `scripts/` is excluded from `tsconfig.json`, so the SQL-apply and seed scripts are never typechecked
Severity: **P2**
Location: `tsconfig.json` `exclude: ["node_modules", "supabase", "scripts", ".next"]`
Regression?: **NO** (pre-existing).
Evidence:
```
$ printf '\nconst __auditScriptTypeError: number = "nope";\nexport default __auditScriptTypeError;\n' >> scripts/apply-sql.ts
$ npm run typecheck
EXIT=0                                   ← no error reported

# control, same edit elsewhere:
$ …>> e2e/credentials.ts        → e2e/credentials.ts(16,7): error TS2322
$ …>> __tests__/env.test.ts     → __tests__/env.test.ts(258,7): error TS2322
```
So `e2e/` and `__tests__/` *are* covered; `scripts/` is the only excluded source directory.
The files behind that exclusion are `scripts/apply-sql.ts` (the one-off production migration
applier) and `scripts/seed-students.ts` (writes student rows through
`writeStudentIntake`) — both run through `tsx`, which strips types without checking them.
Repro: a type error in `apply-sql.ts` ships and surfaces only when someone runs a migration.
Fix: drop `"scripts"` from `exclude`, or add a second `tsconfig.scripts.json` and a
`typecheck:scripts` step. Note `allowJs: false` means the `.mjs` gate scripts stay unchecked
either way — that is fine, but `.ts` under `scripts/` should not be.
Test: the probe above, as `__tests__/config/tsconfig-coverage.test.ts` asserting `scripts` is
not in `exclude`.

### L7 — a live `service_role` JWT for the production Supabase project is in reachable git history
Severity: **P1** (a P0 by consequence; P1 because it is not reachable from the working tree
and remediation is owner-only under §1)
Location: commit `823b0a7` ("Update and rename .env.example to .env.local", 2025-11-12),
file `.env.local`, reachable from `main` and from `security/phase0-contain`
Regression?: **NO** — pre-existing, and explicitly *not* introduced by these 21 commits.
Evidence (claims decoded from the JWT payload; the key itself is not reproduced here):
```
$ git show 823b0a7:.env.local | node -e '…decode payload…'
NEXT_PUBLIC_SUPABASE_ANON_KEY -> role=anon         ref=alpkbobbasxvubogkark exp=2035-11-13 len=208
SUPABASE_SERVICE_ROLE_KEY     -> role=service_role ref=alpkbobbasxvubogkark exp=2035-11-13 len=219

$ git cat-file -e HEAD:.env.local  → absent at HEAD (removed in 9c310ff)
$ git grep -c '<service_role key>' HEAD   → 0 occurrences at HEAD
```
`ref=alpkbobbasxvubogkark` is the production project named in `CLAUDE.md`. A `service_role`
key bypasses every RLS policy this audit's Lane C is verifying, and the token does not expire
until 2035. Deleting the file in `9c310ff` removed it from the tree, not from history.
Repro: `git show 823b0a7:.env.local` from any clone.
Fix: **owner-only, do not attempt** (§1 forbids credential rotation). Rotate the service-role
key in the Supabase dashboard; treat the anon key as public (it is, by design). History
rewriting is not sufficient on its own and not worth doing before rotation.
Test: a `lint:secrets` gate — `gitleaks detect` (or a small in-repo scanner) over the working
tree in the `quality` job, plus `gitleaks detect --log-opts=origin/main..HEAD` on PRs. Add to
`docs/audit/13-remaining-work.md` §4 as owner-only.

### L8 — the one check designated to cover the middleware `matcher` never runs in CI
Severity: **P2**
Location: `.github/workflows/ci.yml` job `e2e`; `e2e/harness-smoke.e2e.ts`;
`__tests__/middleware/middleware.test.ts:28-34`
Regression?: **NEW** (the delegation comment and the harness spec are both new on this branch).
Evidence — the unit test explicitly hands the question off:
```
 * NOT covered here, on purpose: whether the `matcher` at the bottom of the file
 * actually routes a given URL into `middleware()`. … `e2e/harness-smoke.e2e.ts` is
 * the check for that … Do not let this file's green ticks stand in for that one.
```
`harness-smoke.e2e.ts` is written to need **no** credentials ("The only spec here that needs
NO credentials"). But in the `e2e` job every step after the secrets probe carries
`if: steps.secrets.outputs.configured == 'true'` — including `npm ci`, the Chromium install
and `npm run test:e2e`. With no secrets configured (the stated current state), the job runs
the probe, prints a `::notice::`, and succeeds having executed nothing. So the credential-free
spec that exists precisely to be runnable on a clean checkout is the one thing the skip logic
also skips.
Compounding it: the spec asserts one path, `/profile/wizard` → `/login`, which is inside the
`(dashboard|profile|…)` alternation. The three other matcher entries — `/login`, `/signup`,
`/api/:path*` — have no browser-level assertion anywhere, and `/api/:path*` is the fail-closed
fence. `__tests__/middleware/middleware.test.ts:302` does assert matcher↔`PROTECTED_PREFIXES`
agreement, but only for the alternation group, and it reads `config.matcher` as data rather
than exercising Next's routing.
Repro: push any PR; the `e2e` job is green and its log shows only the secrets notice.
Fix: split the job. Run `harness-smoke.e2e.ts` unconditionally (it needs only `npm ci`,
Chromium and `npm run dev` — no secrets, no Supabase account, since an anonymous bounce needs
no session), and keep only `profile-wizard.e2e.ts` behind the secrets gate. Then the
credential-free half can join `ci-ok`'s `needs`, which is what makes the delegation in the
unit test's docblock true.
Test: extend `harness-smoke.e2e.ts` with `/api/<any-authed-route>` → 401 and `/login` →
`/role-select`-when-signed-in; both fail if the matcher entry is deleted.

### L9 — CI runs the suite in one timezone; the definition of done requires two
Severity: **P3**
Location: `.github/workflows/ci.yml` job `test`, `TZ: America/Los_Angeles`
Regression?: **NEW**
Evidence: the job sets `TZ: America/Los_Angeles` and nothing else; `AUDIT-PROMPT.md` §1
criterion 1 requires every gate "in `TZ=UTC` **and** `TZ=America/Los_Angeles`". The step's own
comment argues correctly that a UTC runner cannot observe the `parseLocalDate` bug class —
which is a reason to *add* the west-coast run, not to *replace* the UTC one. A test that
depends on `TZ` being negative-offset (a positive-offset-only bug, or a helper that assumes
`getTimezoneOffset() > 0`) is now unobservable in CI.
Repro: not reproduced — inferred from the workflow file.
Fix: a two-entry matrix on the `test` job, `TZ: [UTC, America/Los_Angeles]`. Costs one extra
runner; `--runInBand` already makes this the slowest job, so run them in parallel.
Test: n/a (a workflow change). The lane-F flake work should land on top of the matrix, not
under it.

### L10 — `check:bundle` will report green off a stale or failed build
Severity: **P3**
Location: `scripts/check-bundle-budget.mjs:88-95`
Regression?: **NEW**
Evidence — observed accidentally and then confirmed in the logs: a `npm run build` that
exited **1** (`Failed to compile.` — a planted type error) still left
`.next/app-build-manifest.json` from its successful compile phase, and the immediately
following `npm run check:bundle` printed 47 routes and "All routes within budget", exit 0.
The script checks only `existsSync(MANIFEST)`.
Repro: `npm run build` (fail) `; npm run check:bundle` → exit 0.
Fix: in CI the step ordering saves it, so this is a local-workflow and future-refactor hazard
only. Cheapest durable fix: have the script compare the manifest's mtime against the newest
`src/**` mtime and refuse if the source is newer, or read `.next/BUILD_ID` and require it to
have been written after the last source change.
Test: touch a source file after a build, run `check:bundle`, expect a non-zero "stale build"
exit.

### L11 — `database` and `e2e` are correctly excluded from `ci-ok`, but nothing will ever move them in
Severity: **P3**
Location: `.github/workflows/ci.yml` `ci-ok.needs: [quality, test, build]`
Regression?: **NEW**
Evidence: both exclusions are deliberate and documented, and **both stated reasons still hold
as written**:
- `database` — "the full run has been observed green against Postgres 16.14, twice
  consecutively — but on a local cluster, never yet on a GitHub runner. Add it to `needs` the
  first time it goes green here." Accurate: Lane C's local run exists
  (`scratchpad/logs/ci-db-local.log`); no GitHub run has occurred on this branch.
- `e2e` — "Same 'runs but is not required yet' posture… Add it there the first time it goes
  green with real secrets." Accurate.
The `ci-ok` aggregation itself is written correctly — `if: always()`, an explicit
per-result check, and a guard that fails on an empty `needs` (the fail-open shape a skipped
required check would otherwise produce). That guard is good work and I found no hole in it by
reading; it was not executed.
The problem is that both admission conditions are self-blocking. `database` cannot "go green
here" until it runs on a runner, and it will not run on a runner until a PR is opened —
which the audit forbids (§2 rule 6). `e2e` cannot go green with real secrets until secrets
exist, and per L8 the credential-free half that *could* run today is skipped along with the
rest. So the practical effect is two jobs that will sit out of `needs` indefinitely.
Also worth stating plainly: **no branch protection exists** (it needs a paid GitHub plan on
this private repo, per `docs/audit/…/security-settings`), so `ci-ok` is not *required* by
anything and cannot block a merge today. It is a correctly-built gate with nothing wired to
it. That does not make it wrong to build, but it does mean "the gate layer" currently rests
on developers reading a red tick.
Fix: for `database`, add it to `needs` on the first push that produces a runner result —
this is a one-line change gated on a human observing one CI run, and should be in
`13-remaining-work.md` §4 with that trigger written down. For `e2e`, L8's split.
Test: n/a.

### L12 — supply-chain hygiene gaps in the workflow
Severity: **P3**
Location: `.github/workflows/ci.yml`; repo root
Regression?: **NO**
Evidence (read, not executed): Actions are pinned to mutable tags (`actions/checkout@v5`,
`actions/setup-node@v5`, `actions/upload-artifact@v4`) rather than commit SHAs; there is **no
`.github/dependabot.yml`** in the tree, so the Dependabot configuration recorded in project
memory lives only in GitHub UI settings and is neither reviewable nor portable; there is no
`npm audit` / advisory gate in CI at all, despite `package.json` carrying three security
`overrides` (`brace-expansion@5.0.8`, and `postcss`/`sharp` pinned inside `next`) whose whole
purpose is to clear advisories — nothing checks whether they are still needed or still
sufficient; and there is no `.nvmrc`, so `engines.node: >=20`, CI's `22`, and this machine's
`25.2.0` are three different answers with no single source.
Fix: pin Actions to SHAs; commit a `dependabot.yml`; add `npm audit --audit-level=high` to the
`quality` job (as a ratchet, if it is red today); add `.nvmrc` with `22`.
Test: n/a.

---

## What I checked and found clean

- **Every configured path list reaches `src/features/**` except Tailwind's `content`.** Each
  proven by planting a violation inside the slice and watching the gate react:
  - `eslint.config.mjs` base rules → `src/features/parent/ui/parent-thread.tsx` unused var,
    exit 1. **Covered.**
  - `eslint.config.mjs` type-aware rules → `src/features/parent/api/data.ts` floating promise,
    exit 1. **Covered for `.ts`** (see L5 for `.tsx`).
  - `.dependency-cruiser.cjs` → `feature-internals-are-private` fired, exit 1. **Covered**,
    and the four generic `src/features/<slice>/` rules are written over a wildcard slice name,
    so a second slice inherits them.
  - `scripts/check-design-tokens.mjs` (`SCAN_DIRS = ['src']`) → palette literal in
    `src/features/parent/ui/cost-explorer.tsx`, `FAIL palette-literal: 246 (baseline 245, +1)`.
    **Covered.**
  - `scripts/check-data-layer.mjs` → `.from()` in `src/features/parent/api/data.ts`,
    198 → 199, exit 1. **Covered.**
  - `knip.json` `project: src/**/*.{ts,tsx}` → unused export in
    `src/features/parent/model/currency.ts` reported by name. **Covered** (though see L3 —
    it cannot fail).
  - `tsconfig.json` → the L1 typecheck break was planted inside `src/features/` and caught.
    **Covered.**
  - CI's `--collectCoverageFrom='src/**/*.{ts,tsx}'` matches `src/features/**` by inspection.
- **`e2e/` and `__tests__/` are typechecked** — verified by planting a type error in each.
  Only `scripts/` is excluded (L6).
- **`src/hooks/**` and `src/lib/**/*.tsx` are outside Tailwind's `content` too, but harmlessly
  today** — `grep -rn className src/hooks` returns nothing and
  `src/lib/auth/role-context.tsx` contains no class strings. Latent, not live. (The
  directory-coverage test in L1's Fix would catch it before it becomes live.)
- **`.dependency-cruiser.cjs` `doNotFollow` vs `exclude`** — `node_modules` is in
  `doNotFollow`, not `exclude`, which is what keeps `not-to-dev-dep` non-vacuous. The config
  comment claims putting it in `exclude` "drops all 548 npm edges"; the baseline run cruises
  2,088 dependencies across 490 modules, consistent with npm edges being present. The
  distinction is correctly made.
- **`ci-ok`'s empty-`needs` guard and `if: always()` + explicit result loop** are correct by
  reading — this is the fail-open shape that makes a skipped required check count as a pass,
  and it is handled.
- **All nine gates are present in CI.** `quality` runs typecheck, lint, lint:boundaries,
  lint:tokens, lint:datalayer, lint:deadcode (all with `if: always()`, so one run reports every
  failure); `test` runs the suite; `build` runs build then check:bundle in the right order.
  Nothing is defined in `package.json` and then forgotten in the workflow.
- **No secret, key or password is added anywhere in `origin/main..HEAD` (21 commits).**
  ```
  $ git log -p origin/main..HEAD | grep '^+' | grep -EI \
      '(sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|ghp_|github_pat_|xox[baprs]-|AIza[0-9A-Za-z_-]{30,}|BEGIN [A-Z ]*PRIVATE KEY|eyJ…\.…\.)'
  (no output)
  ```
  A separate sweep for `password|secret|api_key|token|credential` assignments with a literal
  RHS returned exactly one hit, `scripts/seed-students.ts` — which reads
  `requireEnv('SEED_STUDENT_PASSWORD')` and whose comment says "no fallback default (never
  hardcode credentials)". Clean.
- **The tree at HEAD** contains one credential-shaped string: the **anon** JWT in
  `.claude/settings.json:19` (inside an allowlisted `curl` command). `role=anon`, which is
  published in every client bundle by design — not a secret. It was added in `d2b3410`, which
  is an ancestor of `origin/main`, so it is not this branch's doing. The `service_role` key is
  a different matter — L7.
- **`.gitignore` env hygiene is correct**: `.env`, `.env.*`, `!.env.example`. `.env.local`
  exists on disk and is untracked. `.env.example` holds names with placeholder/short values,
  no live keys.
- **`playwright.config.ts`** — `testMatch: /.*\.e2e\.ts$/` genuinely keeps Jest and Playwright
  disjoint (Jest's default `testMatch` claims `*.spec.ts`/`*.test.ts` only), `forbidOnly` is
  gated on `CI`, `retries: 1` in CI, `workers: 1`. No test-only auth bypass exists: the
  suite signs in through the real login form. Consistent with the file's own docblock.
- **`next.config.mjs`** — `poweredByHeader: false`, five security headers on `/(.*)`,
  `outputFileTracingRoot` pinned. The `optimizePackageImports` omission is backed by four
  measured builds in the comment. `images.remotePatterns` allows `hostname: '**'` over https,
  which is broad but is a Next image-proxy SSRF surface question for Lane H/J, not a gate.
- **`jest.config.ts`** — the two `ts-jest` overrides (`jsx: 'react-jsx'`,
  `verbatimModuleSyntax: false`) are each justified in-file and neither weakens
  `tsc --noEmit`, which still enforces both for the shipped bundle.

---

## Not verified

- **`check:bundle` was never broken.** Breaking it honestly requires a production build with
  a heavy import added to a low-slack route (`/counsellor/universities`, 9 kB slack). The
  machine dropped to **482 MiB free** mid-lane — a concurrent lane's `.next` — and a Next
  build here needs on the order of 1.5 GB. An earlier ENOSPC in this lane cost ~20 minutes of
  total tool unavailability (the harness could not create its own output file), so I did not
  retry. What *is* verified: the baseline is green with real measured numbers
  (shared 101/110 kB; `/counsellor/universities` 261/270; `/assistant` 323/345), the script
  reads the real manifest, and its failure branch (`process.exit(1)` on `kb > budget`) is
  three lines of unambiguous code. **The exit-code path has not been executed.**
  Re-run when the disk allows: add `import Papa from 'papaparse'` to a client component on
  `/counsellor/universities`, rebuild, `npm run check:bundle`, expect exit 1.
- **Nothing was run on a GitHub runner.** `ci-ok`'s aggregation, the `e2e` job's skip
  behaviour, the `overlap-guard` shell, and the `database` job are all read-only conclusions.
  §2 rule 6 forbids pushing, so this cannot be closed from inside the audit.
- **The `ssr: false`-in-a-Server-Component build failure** (the `CLAUDE.md` Next 15 gotcha)
  was not tested — same disk constraint. The `build` gate was proven red by a type error
  instead, which exercises the same exit path but not Next's own compile-time checks.
- **`lint` timing under `--max-warnings`** — the L2 fix is proposed, not applied or measured.
- **`npm audit`** was not run (network + time); L12's advisory claim is from reading
  `package.json`'s `overrides` block, not from a scan.
- **Whether the two `no-restricted-imports` warnings are genuinely unfixable today.** L2's
  proposed `--max-warnings 2` freezes them; whether they should instead be fixed outright is
  Lane I's call, not mine.
