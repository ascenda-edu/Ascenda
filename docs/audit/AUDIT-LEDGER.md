# AUDIT LEDGER — the one source of truth

Protocol: `docs/audit/AUDIT-PROMPT.md`. Coordinator writes this file; lane agents write
`docs/audit/verify/<lane>.md` only.

**Branch:** `security/phase0-contain` · 21 commits ahead of `origin/main` · nothing pushed.

---

## Round 1 baseline — measured 2026-08-02, not inherited

| Gate | Result |
|---|---|
| `typecheck` | exit 0 |
| `lint` | exit 0 — 2 warnings, 0 errors |
| `lint:boundaries` | exit 0 — 4 dependency violations (warnings), 490 modules / 2,088 deps |
| `lint:tokens` | exit 0 |
| `lint:datalayer` | exit 0 — 198 direct `.from()` sites outside `src/lib/data`, 56 files (matches baseline) |
| `test` | **67 suites / 1,541 tests, all pass** (138 s) |
| `build` | exit 0 — 47 page routes, middleware 102 kB |
| `check:bundle` | exit 0 — all routes within budget; shared 100/110 kB; heaviest `/assistant` 323/345 kB |
| `ci-db-local.sh` | delegated to lane C |

Note: root route `/` first-load is **202 kB**, not the 197 kB claimed in
`docs/audit/13-remaining-work.md`. Within budget, but the doc is stale — lane J to confirm.

---

## Status

| Lane | Subject | State | Report |
|---|---|---|---|
| A | functionality preservation | **reported** | `verify/A-functionality.md` |
| B | auth / authz / tenancy | **reported** | `verify/B-auth.md` |
| C | database, migrations, RLS | **reported** | `verify/C-database.md` |
| D | scoring, tiers, matching | **reported** | `verify/D-domain.md` |
| E | data layer, error handling | **reported** | `verify/E-data-layer.md` |
| F | tests — mutation & vacuity | **reported** | `verify/F-tests.md` |
| G | React / Next 15 runtime | **reported** | `verify/G-runtime.md` |
| H | API routes | **reported** | `verify/H-api.md` |
| I | types & validation | **reported** | `verify/I-types.md` |
| J | performance & bundle | **reported** | `verify/J-perf.md` |
| K | design system & a11y | **reported** | `verify/K-design.md` |
| L | config, CI, gate layer | **reported** | `verify/L-gates.md` |

**Round 1 lane coverage: 12 of 12 complete.** 6,571 lines of evidence. Every report carries
a Summary, Findings, a "found clean" section and an explicit "Not verified" section.

### Round 1 totals

| | P0 | P1 | P2 | P3 |
|---|---|---|---|---|
| Count | **2** | **8** | **31** | **35** |

P0: C1 (destructive migration on replay) · F's 9 surviving authz mutations (treated as one
P0 against the test suite).
P1: C2, C3, H-08, I-1, G1, E-01, K-1/L1 (same defect, two lanes), L7 (owner-only key rotation).

**Regressions introduced by the refactor (`Regression?: YES`):** K-1/L1 (Tailwind glob),
A1 (parent chat 403), J-1 (four `/parent` routes +45 kB), J-4 (barrel into 4 API routes),
J-8 (middleware bundle +15 kB). Everything else is pre-existing or NEW-but-not-a-regression.

### Concurrency protocol (learned this round — keep it)

Lanes B, E and F all inject-and-revert mutations in one shared working tree. Run
concurrently without coordination, they corrupt each other: one agent's dirty file is
picked up by another's test run, and a broad `git checkout` destroys in-flight work.
Ownership was assigned mid-flight:

- **B** owns `src/lib/auth/**` and `src/middleware.ts`
- **E** owns `src/lib/data/**`
- **F** owns everything else
- Everyone: `git status --short` before each mutation; wait if a foreign file is dirty;
  revert with `git checkout -- <exact path>` only. Never `checkout -- .` / `stash` / `reset`.

**J and L must not run alongside them.** J needs uncontended builds to measure bundles;
L deliberately breaks each of the nine gates, which is indistinguishable from a real
failure to any other lane. Both run in wave 2, after the tree is quiet.

---

## Findings — reported, pending adversarial verification

### Lane H — API routes (23/23 audited) · 0 P0 · 0 P1 · 6 P2 · 7 P3

Headline: **no guard was lost in the rewrite.** API diff vs `origin/main` is 11 files
(+425/−86), zero routes added or removed, every hunk strengthens a check. No IDOR
introduced by this branch. Full evidence: `verify/H-api.md`.

| ID | Sev | Reg | Claim |
|---|---|---|---|
| H-01 | P2 | NO | `search/{filters,filter-options,suggestions}` have no handler-level authN; `search_filter_options()` is `security definer` + granted to `anon`, so it bypasses the RLS protecting the other two |
| H-02 | P2 | NO | `/api/search/filters` has no caller in `src/`, no auth, no rate limit, unbounded `universities` select; `programs.limit(1200)` samples a 119k catalogue |
| H-03 | P2 | **NEW** | the mode-escalation fix on `chat/actions/execute` is **untested** — all 13 tests use `mode:'student'`, which short-circuits `resolveChatMode`. Reverting the guard leaves the suite green |
| H-04 | P2 | NO | `decks/cards` POST+DELETE and `decks/assign` DELETE take a wire row id with no app-level ownership check (RLS-only, single layer); a zero-row delete answers `{ok:true}` |
| H-05 | P2 | NO | 10 write routes unthrottled; `decks/assign` fans out 200 SECURITY-DEFINER notification rows per request. All LLM routes *are* limited |
| H-06 | P2 | NO | `catalog-health`'s bearer path uses the cookie-scoped anon client → always reports `counts 0/0`. **Lane's least-verified claim; needs a DB to reproduce** |
| H-08 | P2 | **NEW** | error envelope **not** consolidated — the new middleware 401 is nested `{error:{code,message}}`, which breaks six `data.error ?? '…'` call sites (they now render the fallback string instead of the real message). Locked in by `middleware.test.ts:168`. **8 distinct envelope shapes remain** |
| H-13 | P2 | **NEW** | 19/23 routes untested, including both new authz primitives (`assertCounsellorMayActOnStudent`, `filterActionableStudentIds`) and all 110 lines of `admin-guard.ts` |
| H-07,09,10,11,12 | P3 | mixed | raw PostgREST `error.message` leaked in 5 deck branches; `essay-assist` `blocks[]` unbounded into the LLM prompt; 3 routes omit `Content-Type: application/json`; `template in templateTableMap` prototype-chain bug (the exact bug `essay-assist` fixed with `Object.hasOwn`); bare `req.json()` → 500 not 400 in 3 routes |

**Only 1 of 23 routes validates with zod** (`admin/import`, and it does so correctly).
The other 22 hand-roll checks after `parseJsonBody<T>()`, which is an `as T` cast.

Lane H executed/inferred ratio: **~1 executed / 12 inferred** (1 suite run, 13/13 pass;
~20 git/grep commands quoted). Every runtime/RLS claim is inferred from source +
`schema.sql`.

#### H-08 — CONFIRMED by the coordinator, and upgraded to **P1 / NEW**

Verified directly, not inferred:

- `src/middleware.ts:84` returns `{ error: { code, message } }` — the only nested envelope.
- Every API route emits flat `{ error: '<string>' }` (`grep 'NextResponse.json({ error:'`).
- `PUBLIC_API_PREFIXES = ['/api/calendar-feed']` (`middleware.ts:36`) — **every other
  `/api/*` path 401s through this envelope when the session cookie is absent or expired.**
- Six consumers do `data.error ?? '<fallback>'`. Because `data.error` is a truthy *object*,
  the `??` fallback never fires. They do not render the fallback — they render the object:
  - `essay-ai-panel.tsx:99` → `setError(err.error ?? …)` into `useState<string|null>`,
    rendered at `:248` as `<p className="text-xs text-danger">{error}</p>`.
    **React throws "Objects are not valid as a React child" and the panel unmounts.**
  - `_quests-client.tsx:53`, `_universities-client.tsx:252,308,425`,
    `import-panel.tsx:75` → `new Error(object)` → the user sees `[object Object]`.
- `res.json()` is untyped, so **TypeScript cannot catch any of this** — which is why the
  build is green.

Trigger is the most ordinary path there is: **session expires, user clicks the button.**
Fix is one of two lines — flatten the middleware envelope, or make the six consumers
tolerate both shapes. Flattening is smaller but `__tests__/middleware.test.ts:168` pins
the nested shape, so that test is part of the change and must be read, not re-baselined.

---

### Lane I — types & validation · 0 P0 · 1 P1 · 1 P2 · 3 P3 · (0 YES · 3 NO · 2 NEW)

Good news first, all executed: **tsconfig strictness was tightened, not relaxed** —
`strict` intact plus `noFallthroughCasesInSwitch`, `noImplicitReturns`,
`noImplicitOverride`, `verbatimModuleSyntax`, `moduleResolution: bundler`; the `ts-node`
override cannot reach `tsc --noEmit`. **`demo-tables.ts` still matches `schema.sql`** — all
18 tables compared column by column, no drift. **0 `@ts-expect-error`, 0 `@ts-ignore`, 0
real non-null assertions added.** Net `any` in `src/` went **165 → 163**. Of 79 substantive
escape hatches added, **2 judged defects**. 14/14 intake zod enums match their PG enums; no
`.passthrough()`/`.catchall()` anywhere.

| ID | Sev | Reg | Claim |
|---|---|---|---|
| I-1 | **P1** | NO | `intake-logic.ts:231` + `persist-intake.ts:142`: the form offers chip `capital_city`, which is **not a member of the `location_type` enum**, and comma-joins a multi-select into that single enum column. Executed against local PG16: `ERROR: invalid input value for enum location_type: "london,major_city"`. The intake save then fails **after `profiles`/`personal`/`academic` have already committed — there is no transaction.** Byte-identical on `origin/main`. **Fix needs a product decision — do not apply unilaterally** |
| I-2 | P2 | NO / NEW | admin-import zod: `deadline_date: z.string()` vs a `date` column → executed `ERROR: invalid input syntax for type date`; `z.coerce.number()` vs `int` → executed, silently rounds 3.7 → 4. The branch's **new** error redaction removed the only diagnostic that named the offending row |
| I-3 | P3 | NEW | `SupabaseClient<any,any,any>` ×5 in `api/guards.ts` / `chat/mode.ts` erases literal checking on `data.role === 'counsellor'` — **exactly the comparison behind the six-gates-green roster bug.** Logic is correct today and fails closed |
| I-4 | P3 | NEW | new zod restricts `student_activities.level`/`duration` to 4 values each while the DB column is unconstrained `text`; one legacy row would block the entire profile save. No known bad data |
| I-5 | P3 | NO | `validation.rows!` correlation not expressed in the return type |

Lane I executed/inferred: **22 of ~30 substantive claims executed.** `npm run typecheck`
deliberately **not** run — the lane detected a foreign dirty file
(`src/lib/chat/tools/student-read.ts`, another lane mid-mutation) and declined rather than
record a corrupt result. The concurrency protocol worked as intended.

Cross-lane note for A: deleted `src/lib/validation/profile.ts` had **zero importers** on
`main` — safe deletion.

---

### Lane D — scoring, tiers, matching · 0 P0 · 0 P1 · 2 P2 · 3 P3

**The three numbers the lane was required to produce:**

- **Strict inversions: 0** across **25,789** dominance-comparable ordered pairs (A-level
  3/4-grade, full-profile, IB HL, IB totals+core, ACT, A-level+ACT best-of, LNAT/UCAT/IELTS,
  rigour ×3) — *except* the 95 in the partial branch (D-01), a region the harness does not
  enumerate.
- **Score→tier implementations: 1.** Independent 3-line-window scan over 469 files; 2 hits,
  both false positives. The unification held.
- **Changed goldens that could not be explained: 0.** 28 of 56 signatures moved, all 28 out
  of the catch-all 8; 0 non-catch-all values moved; 0 moved twice; **exactly 19 of 56 change
  band, matching the recorded product decision.** 28 added rows all U-bearing; ACT goldens
  changed only `rigour_score`; all 3 IB goldens byte-identical.

Also verified: table is exactly 84 keys with no dupes or gaps; `mapBand` cuts pinned at
90/110/130/150/168 over 92,000 payloads with 0 ambiguous totals; every threshold correct at
±1; the colour and the tier pill now flip at the same two numbers; the `matching_engine`
rename is behaviour-neutral; the `?? 'Reach'` reasoning still holds. Suite 354/354.

| ID | Sev | Reg | Claim |
|---|---|---|---|
| D-01 | P2 | NO | **95 strict dominance inversions in the *partial* A-level branch** (`student_scoring.ts:585-600`): with 1–2 subjects entered an `E` is the only grade worth anything, so `A*A*` = 0 while `A*E` = 5. The comment there claims this is "not a dominance inversion" because it compares different shapes — **false**, those 90 pairs are same-shape. The golden harness enumerates only 3-grade signatures, so it structurally cannot see them — **the same blindness class as the U-grade miss.** Any fix moves student scores → **stop-and-ask** |
| D-02 | P2 | **NEW** | the `?? 0` at `:607` is still reachable: `subject_list[].grade_value` is `z.string().max(50)` over a bare `text` column, so `'A-'`, `'Pass'` or `'A* '` (trailing space) drives `academic_performance` to **0 — below `UUU`'s 5**. On `origin/main` the same input returned the catch-all 8. A dirty-data row now scores *worse than all-U* |
| D-03 | P3 | NEW | the tier-singularity gate misses the most idiomatic fifth implementation: a multi-line `if (score >= 80) { return 'Safe'; }` is **not** caught (the regex is same-line, ≤60 chars). Also missed: named-const thresholds, `switch(true)`, bucket tables, inferred return types, `Promise<MatchTier>` |
| D-04 | P3 | NEW | `match-tier.ts:70-97` claims stored tiers persist "FOREVER" because "nothing rebuilds it", **and proposes a production migration on that premise.** `service.ts` deletes and reinserts every `student_matches` row for the profile on a 24h TTL — and that is the table `loadTierByProgram` reads. The comment it replaced was right |
| D-05 | P3 | NEW | five golden headers (`_known_bugs`, `_columns`, `_source`, a row `note`) still describe pre-fix behaviour beside post-fix values — e.g. `"rigour 0"` on a row reading `"rigour_score":13` — and the test file tells readers to trust `_known_bugs` |

Lane D executed/inferred: **41 of 44 claims executed.** Strongest evidence ratio in round 1.

---

### Lane G — React / Next 15 runtime · 0 P0 · 1 P1 · 1 P2 · 5 P3 · (0 YES · 7 NO · 0 NEW)

**Item 1 is clean, and clean by construction** — all **74** factory call sites await, all
dynamic `params`/`searchParams` are awaited Promises, and the right factory is used in the
right place (no identity resolution from a Route Handler). A missed `await` *cannot* go
green here: TS rejects `.from`/`.id` on a Promise and no `as any` launders it. This was the
lane's biggest risk and it is a non-issue.

**Every finding is pre-existing.** The refactor introduced no runtime regression in this
dimension.

| ID | Sev | Reg | Claim |
|---|---|---|---|
| G1 | **P1** | NO | **A help-thread reply is silently destroyed and the student is toasted "Reply sent".** `useHelpThread.reply()` *returns* rather than throws when `currentProfileId` is null, so `handleReply` clears the composer and reports success. Trigger is the uncaught `auth.getUser()` at `use-help-thread.ts:59`. The refactor added exactly this `.catch()` to `use-is-demo-user.ts` **with a comment naming the hazard** — and missed the two hooks that still have it |
| G2 | P2 | NO | `SideSwitcher` hydration mismatch: `useIsDemoUser`'s lazy `useState` reads `sessionStorage` client-side and returns `false` on the server, so the server emits nothing and the client emits buttons. Fires on every demo page load |
| G3 | P3 | NO | `useNotifications` has the same uncaught `getUser()`; on rejection the bell is permanently empty — indistinguishable from a genuinely empty inbox |
| G4 | P3 | NO | `useRealtimePoll` dispatches handlers by array index frozen at channel creation; correct at all 5 call sites today, unenforced |
| G5 | P3 | NO | `useChatStream` never aborts in-flight streams on unmount; navigating away mid-turn leaks the stream **and the LLM spend** |
| G6 | P3 | NO | `realtimeOkRef` in `useNotifications` written twice, read never; knip cannot see it and runs `--no-exit-code` anyway |
| G7 | P3 | NO | `revalidate = 3600` on `/course/[id]` is inert — the page reads cookies via the session-bound factory. Overlaps lane J |

Lane G executed/inferred: **all source facts and every `Regression?` verdict executed**
(~30 `rg` sweeps, `git diff/show origin/main`, a brace-matching scan of all 163 effect
bodies, one `npx eslint` run over 8 dirs → exit 0). But **0 of 7 findings were reproduced
at runtime** — all are inferred by reading. Verification pass must treat them accordingly.

**G1 and G3 share one root cause with the H-08 mechanism**: an async failure that is
swallowed rather than surfaced, then reported to the user as success or emptiness.

---

### Lane C — database, migrations, RLS · **1 P0** · 2 P1 · 6 P2 · 6 P3

**`ci-db-local.sh`: PASS**, exit 0, *40 of 42 migrations replayed twice with no error*. The
lane **broke the gate twice and watched it go red both times** (exit 3 non-idempotent, exit
1 stale ledger) — so the gate itself is trustworthy. **Catalog diff `schema.sql` vs full
replay: 583 diff lines, 1,420 vs 1,565 entries — 33 A-only, 176 B-only.** All 176 B-only
trace to the ten unapplied migrations; 31 of 33 A-only are explained; **exactly 2
unexplained defects (C2, C6).** That is a genuinely good parity result.

| ID | Sev | Reg | Claim |
|---|---|---|---|
| **C1** | **P0** | NO | **`20250214120000_student_intake_profile.sql:7-21` is destructive on replay.** 14 × `drop type … cascade` deletes **17 columns** (58 → 41) across the five `student_*` tables *and all their data*; the `create table if not exists` below never restores them. **It raises zero errors, so the gate passes it.** 9 of the dropped columns are read by `src/`, including `english_status` — the onboarding gate. This is the same criterion that got `20250308120000` archived |
| C2 | P1 | **NEW** | `schema.sql:1365` was changed to `before insert or update`, but `schema.sql:1346`'s **function body was never transcribed** from `20260801110000`. On a schema.sql-built database a legitimate `insert into profiles (id, role) values (self,'student')` → `ERROR: changing profiles.role requires an administrator`. **Signup is broken.** Escalation is still blocked, so it fails closed |
| C3 | P1 | NEW | `policy-invariants.sql` uses bare string literals with `text[] ||` at 8 sites. Against a database in the **remote's** current state it dies: `ERROR: malformed array literal`. **Section B — including B4/F4 — can never run at all** |
| C4 | P2 | NEW | `rls-negative-cases.sql:135` seeds `student_matches` from `programs`, but §0 requires a near-empty catalogue → always aborts `[3.3] fixture problem`. Passes fully once one programme row is seeded |
| C5 | P2 | NEW | `_applied_archive` is out of the glob but **not out of `db:apply`'s reach** — `apply-sql.ts` has no path check — and `README.md:66` still instructs you to apply the destructive file |
| C6 | P2 | NO | `schema.sql` never enables RLS on `cities` — the only table without it |
| C7 | P2 | NEW | `20260802120000` is BREAKING; its mandatory `service.ts:912,919` edits **are absent from the branch** |
| C8 | P2 | NEW | `20260801120000` — a BREAKING security file — has no verification block, violating the repo's own §6 rule 3 |
| C9 | P2 | NEW | `20260802110000` installs a `before insert or update` gate on `notifications` with no pre-flight over existing rows; **bad rows become permanently un-updatable** |
| C10–C15 | P3 | mixed | `20260801122000` backfill can 23505 on the one-primary index; `20260802130000` claims "purely additive" while rewriting all of `notifications`, no lock class; `20260802100000`'s "reads unaffected" is false (cities `ACCESS EXCLUSIVE`); `20260801110000`'s verification checks trigger *timing*, not *body* — **it would pass against C2**; `MIGRATIONS.md` §5 stale |

**Double-replay idempotency holds only in the "raises no error" sense** — C1 destroys 17
columns silently on pass 1. That is precisely the failure mode this audit's rule 5 exists
for: the gate is green because the damage is silent.

Lane C executed/inferred: **38 of 42 claims executed** against local PG16.

---

### Lane K — design system & a11y · 0 P0 · 1 P1 · 4 P2 · 8 P3 · (1 regression)

| ID | Sev | Reg | Claim |
|---|---|---|---|
| **K-1** | **P1** | **YES** | **`src/features/**` is in no Tailwind `content` glob.** The branch `git mv`'d 6 `.tsx` from `src/app/parent/` into `src/features/parent/ui/`; 5 utilities used only there are **provably absent from the compiled CSS** — verified against `.next/static/css/*.css` built from HEAD: `max-w-[75%]`, `focus:ring-ring`, `min-w-[180px]`, `sm:min-h-[560px]`, `text-primary-foreground/60`. Parent chat bubbles lose their width cap; the composer focus ring falls back to Tailwind default blue. **`lint:tokens` cannot see it — it walks `src/`, not the globs** |
| K-2 | P2 | NO | ChildSwitcher dropdown clipped by PageHero's `overflow-hidden` on all 5 parent routes; unusable with ≥2 linked children |
| K-3 | P2 | NO | command palette: arrow-key cursor with no `role="combobox"`/`listbox`/`option`/`aria-activedescendant` |
| K-4 | P2 | NO | `hover-lift` on non-interactive PageHero stat tiles → false affordance on every student page |
| K-10 | P2 | NO | 4 unlabelled form controls in the profile intake wizard (2 in the same subject row whose sibling `SelectTrigger`s *are* labelled) |
| K-5 | P3 | NEW | the **retracted** "Radix forbids empty `SelectItem`" claim survives in 5 source + 2 test files — including one test's *name* — after `select.tsx` explicitly refuted it |
| K-7 | P3 | NO | the token gate's `hex` rule misses `rgb()`/`rgba()`; 7 uncaught raw colours, un-ratcheted |
| K-8,9,11,12,13 | P3 | NO | `hover-lift` on a static `<article>`; `.nav-pill-active` has 0 call sites while `tabs.tsx`'s docblock says tabs use it; 4 dialogs lack `DialogDescription`; h1→h3 jumps app-wide and `ErrorState` emits a second `<h1>` inside `<main>`; 3 unlabelled `<nav>` landmarks |

**K-1 is the third instance of one lesson**: `13-remaining-work.md` §3 already recorded that
moving out of `src/lib/` silently dropped the type-aware ESLint rules, and that the ESLint
globs were then fixed. **The Tailwind `content` globs were not.** `tailwind.config.ts`,
`globals.css` and `lib/utils.ts` are all byte-identical to `origin/main`, so K-1 is purely a
consequence of the file move.

**Correction to a count this audit inherited:** the `<Select>` figure is **10 importing
files / 17 `<Select>` JSX roots**. Both the code comment and this audit's own prompt say
"10 call sites" — that counts *files*, not Selects. The recorded decision's premise still
holds (no `<SelectItem value="">` exists; all use sentinels `'__clear'`, `'all'`, `'any'`),
but **nothing would fail loudly if one were added**: no lint/depcruise/knip/token rule
mentions `SelectItem`, and the only test guard loops over 3 option tables in one lib file —
it cannot see the other 14 roots. Residual risk: `scholarship-explorer.tsx:203,220` lack the
`.filter(Boolean)` their two sibling call sites have.

The lane also **refuted one of its own sub-agent's claims** ("no skip link") and recorded it
as clean so it does not get re-filed. Good practice; keep it.

---

### Lane E — data layer & error handling · 0 P0 · 1 P1 · 4 P2 · 3 P3

**The ratchet count, independently reproduced: 198 exactly.** But 198 includes **2
JSDoc-comment examples + 4 Supabase *Storage* `.from(bucket)` calls** — the true figure is
**192 PostgREST sites across 54 files**, so the baseline carries **6 units of exploitable
slack**. The ratchet *did* go red when broken (198→199, exit 1) and `--update-baseline`
correctly refused to raise — but **three bypasses stayed green**: deleting a doc-comment
`.from()` to "pay" for a real new call site; `.from(TABLES.x)` (member expression, invisible
to the regex); and `.rpc()` (uncounted — 1 real site already exists).

| ID | Sev | Reg | Claim |
|---|---|---|---|
| E-01 | **P1** | NO | `src/middleware.ts:174-188` **discards all four completion-query errors**. One transient DB failure redirects a complete student to `/profile/wizard`, and the `onboarding_status=pending` cookie **caches that for 60 minutes** |
| E-02 | P2 | **NEW** | shared column lists have **no string↔type gate**. Demonstrated: dropped `country` from `UNIVERSITY_FIELDS` → `tsc --noEmit` **exit 0**, `jest __tests__/data` **99/99 green**. Only 7 of ~24 columns are pinned by any test; `castRows` is an unchecked `as T[]` |
| E-03 | P2 | NO | `COMPLETION_COLUMNS` is bypassed by **3 of 6** completion consumers — dashboard, chat context, and `auth-form.tsx` (the login redirect) |
| E-04 | P2 | NO | `matching/service.ts:922` — the **only write in `src/` that discards its error**; a failed rollback leaves a truncated match cache served as authoritative for 24 h |
| E-05 | P2 | NO | `matching/service.ts:688` — discarded error flattens every recognition score to 3, **reordering the match list** (sort key at `:875`) and caching the wrong order |
| E-06,07,08 | P3 | mixed | ratchet over-counts (above); 95 `console.*` vs 13 `logger`, ~14 on PostgREST error paths unsanitised; `counsellor/data.ts:703` sorts date-only strings via `new Date()` (order-preserving, no live impact) |

**E-02 is the single most important methodological result of round 1.** It is the exact
failure mode §2 of the prompt describes, demonstrated on demand: a column silently removed
from a shared list is caught by **neither the compiler nor the data-layer test suite**. Any
claim that the shared data layer is safe rests on 7 pinned columns out of ~24.

Lane E executed/inferred: **18 of 22 substantive claims executed.** `git status` clean; the
ratchet proof used a scratch copy of `src/` and required **no repo edit at all**.

---

### Lane A — functionality preservation · 0 P0 · 1 P1 (process) · 2 P2 · 3 P3

**The core answer: functionality is very largely preserved, and this was checked properly.**
All verified, not asserted:

- **Route inventory identical** — 136 files, empty diff, 74 routes built.
- **All ten deletions were unreferenced dead code on `main`** — symbol-level grep, every
  symbol resolved only to its own definition.
- **No narrowed query anywhere** — every consolidated `.select()` is equal or wider, no
  `.limit()` added, ordering preserved. This was the lane's highest-risk hypothesis and it
  is clean.
- **No tenancy filter dropped** — 94 → 92, and **both** reductions traced to a loader that
  re-applies the filter.
- Parent slice complete; client/server boundaries clean.
- Verified **in an isolated git worktree at HEAD**: `build EXIT=0`, `67 suites / 1541 tests
  EXIT=0`.

| ID | Sev | Reg | Claim |
|---|---|---|---|
| A1 | P2 | **YES** | `resolveChatMode` now refuses `parent` mode without an active `guardian_link` (`chat/mode.ts:64`), but `PARENT_PORTAL_OPEN_TO_ALL = true` still renders all six `/parent/*` routes to everyone. **The Ascendi widget and `/parent/assistant` 403 on every message** for any user with no link. Worked on `main`. The counsellor half is **not** a regression — `origin/main` already gated it. Fix is a product decision |
| A2 | P2 | **NEW** | **the intake wizard accepts values its own save endpoint rejects**, and the whole six-table save fails with a message naming no findable field. Executed repro: SAT `1650` passes `validateStep1/2/3` (the exact three `handleFinalSubmit` runs), then `studentProfilePayloadSchema` rejects → user sees *"Some of your answers could not be saved: lifestyle preference."* Native `max={1600}` never fires — step 4 is unmounted at submit and every Next button is `type="button"`. Same for `career_aspiration` / `ambition_statement` / `work_experience_summary` (>4000 chars, no `maxLength`). **All saved fine on `main`. This passed 1,541 green tests** |
| A3 | P3 | NEW, intentional | `matchesTierFilter` excludes unscored programmes from a narrowed tier facet. Default unaffected. Recorded so nobody reverts it |
| A4 | P3 | NEW, intentional | counsellor `enrolled` no longer collapsed into `decision`; every stage count moves. All eight dependent tables verified updated |
| A6 | P3 | NO | `isActionableStudent` **fails open** (`if (error || !data) return true`) while its docstring claims it refuses unknown ids — **and its batch sibling fails closed.** Lane B owns |

Lane A executed/inferred: **6 executed / ~34 inferred.** Not verified: anything needing the
DB, `origin/main` was not built, nothing exercised in a browser (the demo walkthrough is
code-reading), `TZ=America/Los_Angeles`.

#### A5 — the concurrency challenge, adjudicated by the coordinator

Lane A raised the shared working tree as a **blocker**, on the grounds that "today's baseline
green may have been measured on a mutated tree." **Checked against timestamps — the baseline
stands, but the general warning is right and is now protocol.**

| Gate | Log time | Wave 1 dispatched | Verdict |
|---|---|---|---|
| static gates (typecheck, lint, boundaries, tokens, datalayer) | **11:50:19** | after | clean tree, trustworthy |
| `test` — 67 suites / 1,541 | **11:53:11** | after | clean tree, trustworthy |
| `build` | **11:58:28** | overlapped agent startup | window existed |

The build is the only baseline number with a concurrency window — and **Lane A independently
re-ran `build` and the full suite in an isolated worktree at HEAD and got EXIT=0 for both**,
which corroborates it. So no baseline figure needs to be discarded.

What *is* correct and adopted: **every mutating lane gets its own `git worktree` from now
on.** File-ownership was the right mitigation for a round already in flight; it is not the
right design. Lane A's own failed `npm run build` (`context.ts:118:7 Type error: ',' expected`)
was caused purely by another lane's in-flight edit and is **not a defect in HEAD** — exactly
the false positive worktrees prevent.

---

### Lane B — auth / authz / tenancy · 0 P0 · 0 P1 · 1 P2 · 2 P3

**The branch's core purpose is achieved.** No auth bypass, no cross-tenant read, no lost
guard. The rewrite is **equivalent-or-stronger than `origin/main` at every guard site**.
`canActAsCounsellor` was `Boolean(user)` on `main` — *any signed-in user* — and is now a real
role check. Item 4's `.eq('profile_id')` 84 → 79 drop is **fully accounted for** across all
five files as loader consolidation.

**Mutation score: 9 caught / 10 injected.** The three mutations that survived a *previous*
round are all caught now:

| # | Mutation | Result |
|---|---|---|
| M1 | `identity.ts` `.eq('id')` → `.eq('role')` | CAUGHT (3 tests) |
| M2 | React `cache()` → module-global memo | CAUGHT (6) |
| M3 | `can()` drops per-student subject check | CAUGHT (5) |
| M4 | `'counsellor'` → `'counsellor.student'` | CAUGHT (tsc + jest) |
| M5 | `COUNSELLOR_PORTAL_OPEN_TO_ALL` flip | CAUGHT (1) |
| M6 | `PUBLIC_API_PREFIXES += '/api'` | CAUGHT (9) |
| M7 | matcher loses `/api/:path*` | **SURVIVED** → B1 |
| M8 | `PROTECTED_PREFIXES` loses `/admin` | CAUGHT (2) |
| M9 | `requireRole` check deleted | CAUGHT (2) |
| M10 | student granted `portal:admin` | CAUGHT (2) |

| ID | Sev | Reg | Claim |
|---|---|---|---|
| B1 | P2 | NEW | `src/middleware.ts:253` — matcher entries **outside** the `(a|b|c)` group are unenforced. Deleting `/api/:path*` leaves **81/81 middleware tests + all static gates green**. The docblock delegates this to `e2e/harness-smoke.e2e.ts`, but that file has **no `/api` assertion** and `e2e` is not in `ci-ok`'s `needs` — **zero enforcement.** Bounded: all 23 handlers authenticate themselves, so this is defence-in-depth, not the boundary |
| B2 | P3 | NEW | `policy.ts:293` — `ROUTE_POLICY`/`actionForPath` have **zero production consumers** (tests only); `can()` has 2 call sites. The docstring "the ONLY place a URL prefix maps to a permission" is **false** — middleware keeps its own list, and the two disagree on `/toolbox` (harmless: same as `main`, and `toolbox/layout.tsx` guards it) |
| B3 | P3 | NEW | `middleware.test.ts:257` — the test named *"every prefix in the matcher is also in PROTECTED_PREFIXES"* reads a **hardcoded copy**; the real constant is not exported. Behavioural `it.each` tests do cover the behaviour, so the impact is naming |

Lane B executed/inferred: **~85% executed.** `git status` confirmed clean on its owned paths.

**Delegated to lane F** (outside B's mutation ownership): `src/lib/counsellor/data.ts`
`.eq('role','student')` → `'counsellor.student'`. M4 proved `tsc` catches the *typed*
comparison — but a string **argument** to `.eq()` is untyped, which is the exact form of the
historic roster bug.

---

## Operational notes raised mid-round

1. **A live `OPENAI_API_KEY=sk-proj-…` is in this machine's shell environment**, and is
   therefore inherited by every subprocess this audit spawns. It is **not in the repo**, so
   it is not lane L's tree-secret item — but it is exposed to anything run here. Owner
   decision; flagged, not touched.
2. `lint` runs with **no `--max-warnings`** and `lint:deadcode` runs **`--no-exit-code`** —
   neither gate can fail on warnings. That is why the 2 lint warnings and 4 dependency
   violations in the baseline are reported as exit 0. Lane L owns this; it also explains G6.
3. A `npm run dev` server was left running on port 3000 by a lane (pid 10464). Harmless but
   it slowed one ESLint invocation to 6+ minutes. **Kill it before the final regression run**
   so timings are clean.

---

## Refuted / withdrawn

_None yet._

---

## Deliberately left open

Carried from `docs/audit/HANDOFF.md` — do not "fix" without a decision from the owner:

- `src/components/ui/select.tsx` swallows `onValueChange('')` app-wide.
- `counsellor/data.ts` `?? 'Reach'` tier fallback.
- `course_scoring_v1` is `grant select … to anon` without `security_invoker`.
- Feature slices: do not repeat the `parent` pilot on `counsellor` (~40 kB/route barrel cost).
- `database` and `e2e` deliberately excluded from `ci-ok`'s `needs` until seen green on a runner.

## Owner-only — cannot be automated, must not be attempted by an agent

1. Rotate `SUPABASE_SERVICE_ROLE_KEY` (in git history, unrotated, byte-identical to the key in use).
2. Rotate `DEMO_USER_PASSWORD` / `SEED_STUDENT_PASSWORD` in Supabase Auth.
3. Enable GitHub secret scanning + push protection.
4. Apply migrations in order — `20260801110000_profiles_insert_guard` **first**.
5. Buy GitHub Team; require the single `ci-ok` check.
6. Run the Playwright wizard spec once against a throwaway account.

---

### Lane F — test strength · the round's most consequential result

**Mutations: 30 injected · 21 caught · 9 SURVIVED (70%). Every survivor is authz- or
tenancy-shaped. None is cosmetic.**

| # | Mutation | Green tests |
|---|---|---|
| M01 / M01b | `chat/tools/student-read.ts:152,262` — delete `.eq('profile_id', ctx.userId)` from `get_my_matches` + `get_my_shortlist` → **cross-tenant read** | **full suite 1541/1541** |
| M02 | `chat/context.ts:98,105,110,115,126` — all 5 scopes repointed at a foreign profile; **the assistant's entire prompt context becomes another student's record** | 35 |
| M06 | `api/guards.ts:143` — `filterActionableStudentIds` fails **open** on read error (bulk authz) | 65 |
| M20 | `api/parent/messages/route.ts:46` — drop the `guardian_links` check, **the only control the open parent portal rests on** | 40 |
| M22 | `api/admin/admin-guard.ts:81` — unauthenticated caller no longer 401s, reaches 3 admin routes **including catalogue upsert** | 27 |
| M24 | `chat/tools/student-write.ts:261` — task ownership check removed | 170 |
| M26 | `api/counsellor/notes/route.ts:41` — `assertCounsellorMayActOnStudent` bypassed (no handler test exists) | 247 |
| M27 | `api/counsellor/decks/assign/route.ts:57` — guard called, its filtered result **discarded** (bulk write) | 247 |
| M30 | `api/profile/export/route.ts:53–57` — **export another student's entire record** | 313 |

**All nine applied simultaneously — 17 lines, 9 files, three portals — and the full suite
still reports 67 suites / 1,541 tests / all pass.**

**Root cause, single and fixable:** commit `b4a1923` is **real but narrower than its message
claims.** It replaced the recording test-double in `__tests__/data/`, `__tests__/counsellor/`
and `__tests__/profile/` — M11–M19 are all caught, M16 by 59 tests. **The identical
`eq: jest.fn(() => builder)` blind spot survives verbatim in `__tests__/chat/`.** That one
cause explains M01, M01b and M02. The double records the *call* but not *which column* was
filtered, so a scoping filter can be deleted without any assertion noticing.

**Corrections to inherited claims — both in the codebase's favour:**

- **Vacuous tests: 1 confirmed, not 60–75.** A scan of all 994 `it`/`test` declarations found
  **0 bodies without an `expect()`**. The single tautology is `scoring_validation.test.ts:136`
  (`expect(true).toBe(true)`, honestly labelled). That population was genuinely cleaned up.
- **Flake: did not reproduce.** 5/5 passed under 20–32 concurrent jest processes
  (74.2s, 27.2s, 26.3s, 40.5s, 46.5s). Now 26 `waitFor` calls, not 22 — the structural risk
  stands, the flake did not manifest.

Also verified: the `persist-intake` rollback is **fully defended** (M11–M15 all caught); the
identity-cache test now discriminates a module-global memo — a scratch mutant fails **7/7**;
suite green in both `TZ=UTC` (224.7s) and `TZ=America/Los_Angeles` (144.7s).

`git status` clean; `git diff HEAD` empty. Three mutations aborted on a dirty `identity.ts`
and were correctly re-run after the tree cleared.

---

### Lane J — performance & bundle · 0 P0 · 0 P1 · 4 P2 · 4 P3

**202-vs-197 kB resolved: same route, two measures.** `next build` prints 202 kB;
`check-bundle-budget.mjs` prints 197 kB and its own header documents the ~2–3% offset,
noting budgets are set against *its* measure. `origin/main` = 255 kB by the same script, so
**the 58 kB landing-page cut is real and the doc is accurate.** No discrepancy.

| ID | Sev | Reg | Claim |
|---|---|---|---|
| J-1 | P2 | **YES** | `/parent` 154→201 kB, `/parent/messages` 153→198, `/parent/progress` 156→198, `/parent/deadlines` 157→198. All passed the gate with ~50 kB slack. Cause: the slice barrel re-exports `ui/` next to `api/`. **The pilot measured this** (`13-remaining-work.md` §3 quotes "154 → 201") **and shipped it anyway** |
| J-4 | P2 | **YES** | `import { ACTIVE_CHILD_COOKIE } from '@/features/parent'` — **one string constant** — drags the parent client tree into 4 API route handlers: 195 kB / 15 chunks vs 101 kB / 5 for a barrel-free route, 4-for-4. Traced deploy files for `/api/chat` went **15 → 73**. `check:bundle` skips non-page routes and `lib-not-to-components` only matches `^src/components/`, so both gates are blind; `feature-internals-are-private` forbids the cheap fix |
| J-3 | P2 | NEW | **`check:bundle` counts a missing chunk as 0 bytes and exits 0.** Proven: hid one 46 kB shared chunk, every route reported ~45 kB lighter, exit 0 |
| J-7 | P2 | NO | `images.remotePatterns: hostname '**'` makes `/_next/image` an open proxy. Pre-existing, unchanged |
| J-2 | P3 | NEW | budgets ratchet nothing on **32/47** routes (>25 kB headroom); 21/47 have >50 kB. `/` carries a 270 kB budget against 197 kB measured — Phase 4 cut 58 kB and never lowered the budget, against the script's own written instruction |
| J-5 | P3 | NO | the O(n·m) scan is still at `use-search-results.ts:671`. **Correction:** the thing 13 lines above is an **array** (`facetMatchedIds`), not a `Set` — so it is a two-line fix. Measured 2.75 ms/fetch worst case vs 0.36 with a Set (7.6×), but **under one frame**. `08-performance.md`'s "largest single runtime win in the app" is **not supported** |
| J-6 | P3 | NO | **Lane G confirmed.** `/course/[id]` builds as `ƒ (Dynamic)` because `createServerSupabaseClient()` unconditionally awaits `cookies()`; `revalidate = 3600` produces no ISR entry. **No route in this app is ISR.** It is the only `export const revalidate` in `src/app`, so nothing else has the same dead config |
| J-8 | P3 | YES | middleware edge bundle 86.4 → 101 kB, and `check:bundle` never looks at middleware. Runtime cost is fine (the `/api/` branch returns before the Supabase client is built) |

**Clean:** no n+1 from the data-layer consolidation (counsellor per-student fans are
byte-identical to `main` and deliberately justified); fonts, `public/` and the images config
unchanged; dynamic imports +2; six dependencies dropped; 47 page routes on both trees.

Lane J executed/inferred: **11 of 14 executed** (two full builds, both bundle reports, two
microbenchmarks, a gate-break probe).

---

### Lane L — config, CI, gate layer · 0 P0 · 2 P1 · 6 P2 · 4 P3

**Nine-gate verdict: 7 of 9 proven red.** typecheck (2 breakages), lint-error,
`lint:boundaries`, `lint:tokens`, `lint:datalayer`, `build`, `test`. **`lint:deadcode`
structurally cannot go red.** `check:bundle` not verified — a rebuild needs ~1.5 GB and the
machine fell to 482 MiB free under a concurrent lane's build.

**Config path lists omitting `src/features/**`: exactly one — Tailwind's `content`.** ESLint
(base + type-aware `.ts`), dependency-cruiser, knip, both ratchet scripts, tsconfig and CI's
coverage glob were **each proven to reach the slice by planting a violation inside it.**

| ID | Sev | Reg | Claim |
|---|---|---|---|
| **L1** | **P1** | YES | `tailwind.config.ts` `content` omits `./src/features/**`. Compiled the CSS **with and without** the glob and diffed selectors: exactly **5 missing** (`min-w-[180px]`, `max-w-[75%]`, `text-primary-foreground/60`, `focus:ring-ring:focus`, `sm:min-h-[560px]`). Independently confirms K-1 |
| **L7** | **P1** | NO | a **live `service_role` JWT for prod project `alpkbobbasxvubogkark`, exp 2035-11-13**, is in reachable git history (`823b0a7` on `main`, file `.env.local`, removed from tree in `9c310ff`). **Bypasses all RLS.** Rotation is owner-only |
| L2 | P2 | NO | `lint` has **no `--max-warnings`**: added a new warning → exit 0. The only warn-rule is `no-restricted-imports` (DB row types leaking into components) — **unenforceable as configured** |
| L3 | P2 | NO | `lint:deadcode --no-exit-code`: planted a new unreferenced file, knip listed it, **exit 0**. 217 findings ride unenforced (2 files / 3 devDeps / 1 unresolved / 102 exports / 107 types / 2 dup) |
| L4 | P2 | NO | `lint:datalayer` 198 = 192 PostgREST + 2 JSDoc + 4 Storage (confirmed independently). **Four** bypasses executed green: doc-comment deletion pays for a real call site; `.from(TABLES.x)`; `.from(String('programs'))`; `.rpc()` |
| **L5** | P2 | NEW | type-aware ESLint **does** cover `src/features/**/*.ts` (proven red) **but its globs name no `.tsx`** — all **303** `.tsx` files lack `no-floating-promises` et al. Proven green in `features/parent/ui/` and `lib/auth/role-context.tsx` |
| L6 | P2 | NO | `tsconfig` excludes `scripts/`: a type error in `scripts/apply-sql.ts` → `typecheck` **exit 0**. `e2e/` and `__tests__/` are covered (probed) |
| L8 | P2 | NO | `e2e/harness-smoke.e2e.ts` — the credential-free spec `middleware.test.ts` explicitly delegates the matcher guarantee to — **never runs**: every step after the secrets probe is `if: configured == 'true'`. Sharpens Lane B's B1 |
| L9 | P3 | NO | CI runs `TZ=America/Los_Angeles` only; the audit's own definition of done requires UTC too |
| L10 | P3 | NO | `check:bundle` greened off a manifest left by a **failed** build (observed, exit 0) |
| L11 | P3 | NO | `database`/`e2e` exclusions from `ci-ok` are deliberate and their reasons hold, but **both admission conditions are self-blocking**. No branch protection exists, so **`ci-ok` blocks nothing today** |
| L12 | P3 | NO | Actions pinned to mutable tags, no in-repo `dependabot.yml`, no `npm audit` gate despite 3 security `overrides`, no `.nvmrc` |

Lane L executed/inferred: **41 of 45 executed**; the 4 inferred are GitHub-runner-only (no
run triggered — rule 6 forbids pushing).

---

# ROUND 1 — FIXES APPLIED

Every fix below has a test that fails without it, and every new gate was broken
deliberately and observed red before being trusted.

| Commit | Findings closed |
|---|---|
| `1ec7052` | **H-08, E-01, G1, G3** — the swallowed-error family |
| `16790d3` | **A2** — wizard/schema validation disagreement |
| `9653bf1` | **D-04, E-04, E-05, J-5** — false comment, two discarded errors, O(n·m) scan |
| `e43ac24` (merged `e5b873b`) | **C1 (P0), C2, C3, C4, C5, C6, C8, C9, C10–C15** |
| `9fa450a` | **C7 part (a)** |

### The swallowed-error family — one shape, four instances

H-08, E-01, G1 and G3 were filed by four different lanes and are one defect
class: **an async failure swallowed, then reported to the user as a definite
state.** A reply destroyed and toasted "Reply sent"; a bell permanently empty and
indistinguishable from an empty inbox; a complete student bounced to the wizard
and cached there for an hour; a session expiry rendering `[object Object]` or
unmounting the panel outright. Fixed together for that reason.

One test-writing note worth keeping: the first draft of the G1 test **passed with
the defect reinstated**, because it asserted on `act()`'s own promise, which can
reject for unrelated reasons. It was rewritten to capture `reply()`'s outcome
directly. *This audit produced a vacuous test on its first attempt* — rule 5 is
not optional.

### The database cluster

Verified against throwaway local PostgreSQL 16.14; production never contacted.
**C1's class now has a gate**: `ci-db-check.sh` plants probe rows between the two
replay passes and asserts columns *and values* survive. Broken deliberately →
exit 3, `a migration DESTROYED columns that schema.sql declares, with no error`.

`./scripts/ci-db-local.sh` post-merge: **PASS** — 40 of 42 migrations replayed
twice with no error, plus the new probe assertion.

Scope corrections the fixing agent found: C5's offending line is in the **root**
`README.md`, not `_applied_archive/README.md:66` (that file is 47 lines, so the
audit's citation was wrong). C3 also required deferring Section A's raise to
end-of-file — under `ON_ERROR_STOP` it had been aborting before Section B ran,
which is *why* Section B had never executed.

### C7 — resolved as far as is safe, and deliberately not further

Part (a) (`.select('id')` on the clear) is done. **Part (b) — the upsert — is
deliberately absent.** `onConflict: 'profile_id,program_id'` infers its target
from a unique index that exists only after `20260802120000` applies: ship the
upsert first and every cache rebuild fails at **42P10**, breaking `/matches` for
every student. The coupling is now written into the migration header so the two
land in one deploy. The audit filed C7 as "the mandatory app change is absent
from the branch" — it is absent on purpose.

Suite after these fixes: **68 suites / 1,554 tests, all pass.** `tsc --noEmit`
clean.

---

## The test-suite blind spot — closed and verified

Branch `fix/audit-tests`, merged. **All nine surviving mutations are now caught**, each
proved red-then-green individually, and — the inverted headline — **all nine re-applied
*simultaneously* now fail 9 suites / 19 tests.** Before: all 1,541 passed.

**Coordinator's independent verification** (not taken on the agent's word). Re-applied M01 +
M01b by hand — deleting both `.eq('profile_id', ctx.userId)` filters from
`chat/tools/student-read.ts:152,262`, the exact mutation that previously left the entire
suite green:

```
Test Suites: 1 failed, 15 passed, 16 total
Tests:       2 failed, 187 passed, 189 total
```

Reverted clean. **The suite can now see a cross-tenant read.**

Root cause fixed at source: `__tests__/helpers/supabase-recorder.ts` is now a shared
recording double, and `__tests__/meta/recording-doubles.test.ts` is a **shrinking ratchet
that fails any new double which discards `.eq()`/`.in()` arguments** — proved red by
reintroducing the old shape in `__tests__/chat/`. The blind spot cannot silently return.

Also closed: **H-03** (5 new escalation tests; reverting the guard → 3 red), **B3** (the
matcher test now parses the real `PROTECTED_PREFIXES` from source — proved red by editing
only the real constant, which the hardcoded copy could not see), the one vacuous test, and
**D-05** (stale golden prose corrected in the generator and regenerated — **no golden value
changed**, verified by diffing both revisions with every `_`-header and row `note` stripped:
identical, 7/7 files).

Suite: **73 suites / 1,634 tests**, green in both `TZ=UTC` and `TZ=America/Los_Angeles`.

### REFUTED — a finding withdrawn

**A6 / the `src/` half of M06 is stale and was correctly refused.** Lane A reported
`isActionableStudent` fails open (`if (error || !data) return true`) with a docstring
claiming otherwise, and the fix brief repeated it. At `1ec7052` **neither is true**: both
`filterActionableStudentIds` and `isActionableStudent` already `return []` / `return false`,
i.e. fail closed, and the docstring matches the code. **The defect was coverage only**, and
the agent made no `src/` change on that branch.

This is the refutation pass doing its job. Fixing an unconfirmed finding is how the previous
round introduced defects; an agent declining to "fix" working code on a coordinator's say-so
is the behaviour to keep.

### Deferred, deliberately

- The meta-test ships a **5-file allowlist** (`matching/score-programs`,
  `counsellor/application-status`, `chat/university-info-tool`, `hooks/use-help-thread`,
  `auth/identity-cache`), each annotated. It can only shrink.
- `PROTECTED_PREFIXES` should be **exported** from `src/middleware.ts` rather than parsed
  out of the source text. Cleaner, and worth doing.

---

# ROUND 1 — FINAL STATE

## Every gate, measured after the last merge

| Gate | Result |
|---|---|
| `typecheck` (now incl. `scripts/`) | exit 0 |
| `lint` (`--max-warnings 2`) | exit 0 — 0 errors, exactly the 2 known `no-restricted-imports` warnings |
| `lint:boundaries` | exit 0 |
| `lint:tokens` (+ new `tailwind-content-coverage`) | exit 0 |
| `lint:datalayer` | exit 0 — **183** real PostgREST sites, 50 files |
| `lint:deadcode` (now enforceable) | exit 0 — 217, at baseline |
| `build` | exit 0 |
| `check:bundle` (now fails on missing chunk / stale manifest) | exit 0 — all 47 routes within budget, 15–19 kB headroom |
| `test` — `TZ=UTC` | **73 suites / 1,634 tests** |
| `test` — `TZ=America/Los_Angeles` | **73 suites / 1,634 tests** |
| `./scripts/ci-db-local.sh` | **PASS** |

Start of round: 67 suites / 1,541 tests, five gates that could not fail.

## The 61 lint violations were not lint noise

Widening the type-aware rules to `.tsx` — 303 files that had none — surfaced 61 violations,
every one an unreported failure. The debt block is **deleted**; all `src/**/*.tsx` are at
`error` with no exemption list. What was behind them:

- **`_universities-client.tsx`** — a rejected deck delete left `isDeletingDeck` true forever,
  and `closeDelete` refuses to close while that flag is set. **The counsellor was trapped in
  a modal that Escape, the scrim and the X all refused to dismiss**, with no explanation.
- **`notes-panel.tsx` / `parent-thread.tsx`** — cleared the composer, inserted an optimistic
  row, then on failure deleted it **with no message**. A failed save destroyed both the note
  and the typed text, and read as a UI glitch.
- **`essay-workshop.tsx` / `essay-ai-panel.tsx`** — flipped to "Copied" without awaiting
  `clipboard.writeText`, which rejects on denied permission, an unfocused document or a
  non-secure context. **Students were told their essay was on the clipboard when it wasn't.**
- **`counsellor-inbox.tsx` / `inbox-list.tsx`** — a failed *first* load fell through to "No
  open conversations": an empty state asserted over a query that never returned.
- **`auth-form.tsx`** — the `getSession()` probe **whose entire job is detecting "auth
  unreachable"** had no `.catch`, so the offline case never showed its banner.

Every one is the same family as H-08/E-01/G1/G3. That family — *an async failure swallowed,
then reported as a definite state* — is the defining defect of this codebase, and it now has
a compiler-adjacent rule enforcing it across all 303 `.tsx` files.

## Regressions introduced by the refactor — status

| ID | Regression | Status |
|---|---|---|
| K-1 / L1 | Tailwind glob missed `src/features/**`; 5 utilities absent from compiled CSS | **fixed** + new coverage gate |
| A1 | parent chat 403s for unlinked users while the portal is open to all | **OPEN — product decision** |
| J-1 | four `/parent` routes +45 kB from the slice barrel | open — structural, `13-remaining-work.md` §3 |
| J-4 | barrel drags the parent client tree into 4 API routes | open — `feature-internals-are-private` forbids the cheap fix |
| J-8 | middleware edge bundle 86.4 → 101 kB | open — runtime cost is fine |

## Still open — owner decisions, not engineering

1. **A1 — parent portal.** `resolveChatMode` requires an active `guardian_link`;
   `PARENT_PORTAL_OPEN_TO_ALL` still renders all six `/parent/*` routes to everyone. Relax
   the chat gate (restores `main`'s behaviour) or close the portal (blocked on migration
   step 5: `'parent'` is not yet a `profiles.role` value).
2. **D-01 — 95 inversions in the *partial* A-level branch.** `A*A*` = 0, `A*E` = 5 with 1–2
   subjects. Pre-existing; the golden harness enumerates only 3-grade signatures so it
   cannot see the region. Fixing moves real student scores.
3. **I-1 — `capital_city`.** Offered by the form, not a member of the `location_type` enum,
   and multi-selects are comma-joined into that single enum column. Reproduced on PG16. The
   save fails **after** `profiles`/`personal`/`academic` have committed — there is no
   transaction.

Plus the six owner-only items at the top of this file (key rotation first — **L7 confirms a
live `service_role` JWT, exp 2035-11-13, in reachable git history**).

## Round 2 — what it should target

Nothing in round 1 is unresolved-and-unrecorded, so round 2 is not a re-run:

- The five `.tsx` files still on the recording-double allowlist.
- Export `PROTECTED_PREFIXES` from `src/middleware.ts` instead of parsing it from source.
- **L8** — `harness-smoke.e2e.ts` still never runs in CI; it is the only check on the
  middleware matcher, which B1 showed is otherwise unenforced.
- H-01/H-02/H-04/H-05 (pre-existing API-surface findings) and the remaining P3s.
- The lanes' own "Not verified" sections — nothing was exercised in a browser, and
  `origin/main` was never built for a behavioural A/B.

---

# THE THREE OWNER DECISIONS — resolved

## A1 — parent portal · DECIDED: portals stay open during development

Owner: the parent and counsellor portals are intentionally open while the app is
being built; they will be separated later. So the assistant was fixed to match the
portal rather than the portal being closed to match the assistant.

`resolveChatMode`'s guardian-link requirement now keys off `PARENT_PORTAL_OPEN_TO_ALL`,
so the two cannot drift and the check returns automatically when the flag flips.

**Established before changing it, not assumed:** this grants no additional access.
`buildParentContext` scopes on `loadLinkedChildren(userId)` and returns the "no linked
children — general guidance only" prompt with no child data; the one parent tool is gated
on `hasParentContact` from that same context; and `toolsForMode('parent')` is **empty** in
the real registry. The boundary is `loadLinkedChildren`, untouched.

Two tests asserted the 403 and were changed deliberately. One was also **strengthened**:
it asserted a refusal from `resolveChatMode`, but `getWriteTool` is mocked in that file and
answered regardless of mode, so it never exercised the layer that actually protects users.
It now asserts against the real registry, plus a guard that fails if a parent-mode tool is
ever added.

## D-01 — partial A-level branch · FIXED, harness first

**The harness went first and was watched failing before any scoring changed** — 37
inversions at one grade, 632 ordered pairs at two. `scoring-golden.test.ts` now enumerates
1- and 2-grade signatures and checks dominance within each arity.

The fix pads missing entries with `U` and reads the **same** signature table as a complete
profile. Every U-bearing signature already exists in it, so no new numbers are invented and
the partial rule cannot drift from the calibrated set — the alternative was a fourth
parallel table, the failure mode this codebase keeps reproducing.

**Impact, measured across all 35 partial signatures: 31 improved, 4 unchanged, 0 lowered.**
No student's score goes down. `A*A*` 0 → 52, `A*E` 5 → 16, so the ordering is now correct.
**No golden file changed** — every 3-grade signature scores exactly as before, which is what
confines the change to the partial branch.

## I-1 — `capital_city` · FIXED form-side, transaction deliberately deferred

`toLocationTypeEnum` maps `capital_city` → `london` and collapses a multi-select to
`no_preference` — the semantics the scorer already documents, so nothing downstream moves.
An exhaustive test asserts no combination of chips can produce a non-member, so a newly
added illegal chip fails the build.

Three fixtures asserted `'capital_city,major_city'` / `'london,major_city'` — values the
enum could never have held, so no row loaded *from* the database could look like that. The
fixtures encoded the bug; changed deliberately.

**The transaction was deliberately NOT attempted.** Making the six-table save atomic needs a
Postgres function, i.e. a migration, which cannot be applied from here — it would ship
unapplied and give false assurance. The A2 fix already narrowed the window substantially by
validating the payload client-side against the server's own schema. Recorded as
migration-gated follow-up work.

---

## Final state after the owner decisions

| Gate | Result |
|---|---|
| `typecheck` (incl. `scripts/`) | exit 0 |
| `lint` | exit 0 — 0 errors, the 2 known warnings |
| `lint:boundaries` · `lint:tokens` · `lint:datalayer` · `lint:deadcode` | exit 0 |
| `build` · `check:bundle` | exit 0 — all 47 routes within budget |
| `test` — `TZ=UTC` | **74 suites / 1,654 tests** |
| `test` — `TZ=America/Los_Angeles` | **74 suites / 1,654 tests** |
| `./scripts/ci-db-local.sh` | PASS |

Round 1 opened at 67 suites / 1,541 tests with five gates that could not fail.

## Still owner-only — nothing here is automatable

1. **Rotate `SUPABASE_SERVICE_ROLE_KEY`** — L7 confirms a live `service_role` JWT for
   project `alpkbobbasxvubogkark`, **exp 2035-11-13**, in reachable git history (`823b0a7`,
   file `.env.local`, untracked later by `9c310ff`). It bypasses all RLS.
   **Purging history does not close this** — clones and forks already hold the blob, and
   GitHub serves unreachable objects by SHA for a while after a rewrite. Order: rotate →
   update Vercel + `.env.local` → enable secret scanning + push protection → *then* rewrite
   if desired (`git filter-repo --path .env.local --invert-paths`), which rewrites every SHA
   from that commit forward, needs a force-push, and should wait until this branch has
   landed so its commits are not orphaned.
2. Rotate `DEMO_USER_PASSWORD` / `SEED_STUDENT_PASSWORD`.
3. Apply the migrations in order — `20260801110000_profiles_insert_guard` **first**, and
   ship `20260802120000` together with C7 part (b) in one deploy.
4. Buy GitHub Team; require the single `ci-ok` check.
5. Run the Playwright wizard spec once against a throwaway account.

---

# PUSHED, AND WHAT THE RUNNER FOUND

Branch pushed 2026-08-02. **Not merged — owner asked that `main` stay untouched.**

## Final CI, on a real GitHub runner

| Job | Result |
|---|---|
| `quality` | success |
| `test (TZ=UTC)` | success |
| `test (TZ=America/Los_Angeles)` | success |
| `build` | success |
| `database` | success |
| `e2e` | success — **and it now actually executes** |
| **`ci-ok`** | **success** |

`needs: [quality, test, build, database, e2e]` — **`database` and `e2e` both admitted.**
Each was admitted only after being *observed* green on a runner, per the workflow's own
admission conditions, and each in its own commit.

## Three defects the runner found that local runs did not

All three were **staleness or environment** failures, not analysis-depth failures. No amount
of extra auditing reaches them; only running the gates against the final artifact does.

1. **`lint:deadcode` — 218 vs baseline 217.** `toLocationTypeEnum` was exported but consumed
   only inside its own module. The local ratchet sat at baseline because its last run
   predated the A1/D-01/I-1 commits. **Caught by a gate this audit installed** — before this
   work `lint:deadcode` ran `--no-exit-code` and could not fail at all.
2. **The meta recording-double ratchet.** Its sibling check "the allowlist only names files
   that still exist and still offend" failed: **all five** exemptions had since been
   converted. The allowlist is now **empty**. A stale exemption is how a converted file
   quietly regresses later.
3. **`e2e` failed its first runner outing.** Playwright's `webServer` runs `npm run dev`, and
   `instrumentation.ts` asserts the env on boot; with no `.env.local` the server exited
   before the first navigation. Fixed with the same placeholders `build` uses — sufficient
   because the bounce is decided by cookie PRESENCE (`hasSessionCookie`), never by asking
   Supabase. **This is why the rule is "observe, then admit".**

## L8 closed — the e2e delegation is finally true

`harness-smoke.e2e.ts` had **never executed**. It sat in the `chromium` project, whose
`dependencies: ['setup']` binds it to a real login, and every CI step was gated on a secrets
probe this repo fails — so the job reported success having run nothing.

It is now a `smoke` project with no dependencies and an explicitly empty `storageState`, run
unconditionally. Two specs pass in a real Chromium, credential-free. One of them is the
anonymous `/profile/wizard` bounce that `__tests__/middleware/middleware.test.ts` explicitly
delegates the `matcher` question to — **the half that shipped dead to production once.** That
delegation comment is now true for the first time.

## Verified against a running server, not a test double

The largest "Not verified" gap in round 1 was that nothing had been exercised in a browser.
Against a production build served locally:

- **All 11 protected routes 307 to `/login`** — `/dashboard`, `/matches`, `/applications`,
  `/profile`, `/profile/wizard`, `/shortlist`, `/scholarships`, `/toolbox`, `/counsellor`,
  `/parent`, `/admin`. The matcher works in a real Next server.
- **Every `/api/*` fails closed with 401 `application/json`**, never an HTML redirect;
  `/api/calendar-feed` correctly 200.
- **H-08 fixed in reality:** `{"error":"Authentication required.","code":"unauthenticated"}`
  — `data.error ?? fallback` yields real text, not `[object Object]`.
- **K-1's five utilities are present in the compiled CSS**, `sm:` variant included.
  (Coordinator's first reading said "missing" — that was a grep-escaping error, corrected.)
- Landing page renders 135 kB of real content, correct `<title>`, no error shell.

## Still owner-only — I could not do these, and did not fake them

| Item | Why not |
|---|---|
| **Rotate `SUPABASE_SERVICE_ROLE_KEY`** | Needs Supabase dashboard access. **Most urgent item in the repo** — live JWT, exp 2035-11-13, in reachable history. Purging history does NOT close it: clones and forks hold the blob. Rotate → update Vercel + `.env.local` → enable secret scanning + push protection → *then* rewrite if desired, after this branch lands so its 46 commits are not orphaned. |
| Rotate the two demo passwords | Same. |
| **Apply the migrations** | Requires production DB access, which ground rule 1 forbids and which would be **wrong ordering anyway**: the app is not deployed, `20260802120000` must ship with C7 part (b) or `/matches` breaks at 42P10, and `20260801120000` expects the portal flags set to `false` — which contradicts the decision to keep the portals open. Apply after deploy, in order, `20260801110000` first. |
| **Playwright wizard spec (e2e part 2)** | Needs `E2E_EMAIL` / `E2E_PASSWORD` for a THROWAWAY account on a non-production project. The spec completes the wizard and saves, overwriting that account's `student_*` rows. |
| Buy GitHub Team + branch protection | Paid plan. Until then `ci-ok` is green but **blocks nothing**. |
