# Ascenda — Full Application Audit

**Date:** 2026-08-01 · **Branch:** `fix/ui-phase0-bugs` · **Scope:** 441 TS/TSX files, 69,899 LOC, 46 pages, 23 API routes
**Method:** 11 parallel specialist audits (~7,900 lines of findings), every headline claim independently re-verified by the coordinator.

---

## 1. Verdict

The codebase is **better built than it is governed**. The layering is genuinely clean — all 1,350 import edges were measured and `lib → components`, `lib → app`, `components → app` are **all zero**. The token system is well-designed (46 CSS custom properties, zero unreferenced, radius ladder 100% compliant). The chat/agentic subsystem is properly tested at 79%. The service-role client is well contained. Someone has been thinking carefully here, and the inline comments prove it — many document real past regressions.

The problem is that **none of that is enforced by anything**, and the codebase has now reached the size where unenforced convention decays faster than it can be maintained by hand.

Two facts define this audit:

> **1. The tree is green on every gate it has.** `tsc --noEmit` clean. 265 tests pass. `npm audit` clean. All 61 Dependabot alerts fixed.
>
> **2. Every serious defect found lives in the blind spot of those gates.** 13.1% coverage, 2 lint rules, no branch protection, no boundary check, no style check, no migration check, no secret scanning, no error monitoring.

The refactor this codebase needs is **not primarily a code refactor**. It is the installation of a gate layer, followed by targeted code changes that the gates then hold in place.

---

## 2. The unifying thesis: 14 seams where one concept is declared twice

Nearly every user-visible defect in this audit has the same shape — **a concept declared in more than one place, whose copies have drifted apart.** Not 14 bugs; one structural problem with 14 symptoms.

| # | Concept | Declarations | Drift consequence |
|---|---|---|---|
| 1 | Score→tier thresholds | 3 live (+2 more) | Score 75 = "Match" on search, **"Safe"** on counsellor dashboard & `/matches` |
| 2 | Profile completion rule | 8 copies | "Not sure" on English ⇒ **permanently locked out of the app**, 12h cookie-cached |
| 3 | Application status | 5 DB values vs 4 domain | **Enrolled students invisible** — coerced to "decision" forever |
| 4 | A-level grade table | 1 table, 54% incomplete | **34 strict inversions**: `A*A*D` scores 8, `DDD` scores 10 |
| 5 | Application stage colours | 2 tables, 3/5 keys differ | "In progress" blue on dashboard, amber on applications board |
| 6 | Help-request status colours | 2 tables | Same record: blue to student, violet to counsellor |
| 7 | Date formatting | 2 identical fns, different locales | Same deadline: **"Sep 5" to student, "5 Sep" to parent** |
| 8 | Relative time | 5 copies | `floor` vs `round` → 90min = "1h ago" or "2h ago"; two never fall back to a date ("450d ago") |
| 9 | Status label tables | ~40 local + 9 app-status | 3 spellings of `decision`, 2 casings of `in_progress` |
| 10 | Search tokenisers | 4 implementations | Each independently rediscovered the PostgREST `.or()` crash |
| 11 | `unwrap()` error helper | 3 byte-identical | — |
| 12 | HTTP 401 envelope | 5 shapes across 18 routes | One returns a 200-shaped body |
| 13 | Card system | 3 (`surface-card` 102, `<Card>` 7, 75 hand-rolled) | 28 byte-exact hand-rolls |
| 14 | Status tone vocabulary | 2 (`rose\|amber\|emerald` vs `danger\|warning\|success`) | Same five tones, two names |

**Finding #1 is the emblem of the whole audit.** [`university-search/types.ts:36`](src/components/university-search/types.ts#L36) carries the comment *"Single source of truth for score→tier thresholds… Delegate here so the results and shortlist surfaces can never drift apart"* — and delegates correctly. Two other modules hardcode different numbers and never look at it. **A single source of truth declared in prose is not a single source of truth.** Only a type, a lint rule, or a test makes it one.

---

## 3. P0 — Stop and fix before anything else

### 3.1 🔴 Live service-role key in git history, unrotated

Verified by SHA-256 comparison (values never printed). The `SUPABASE_SERVICE_ROLE_KEY` in commits `823b0a7` and `e1382bf` is **byte-identical to the key in use today** (`f8cad9cee9eda63b…`). Both commits are ancestors of `origin/main`; both blobs (`44a5b02…`, `593b44a…`) remain in the object store. `9c310ff` untracked the file going forward but left history intact.

Service role **bypasses RLS entirely** — unrestricted read/write on all student PII.
Mitigating: repo is **private**; `.env.local` is correctly gitignored today. GitHub secret scanning is **off**, so nothing ever flagged it.

**Action:** rotate the key today → update Vercel + `.env.local` → enable secret scanning + push protection → *then* consider `git filter-repo`. Rotation first; history rewriting while the key is still live is the wrong order.

### 3.2 🔴 Production passwords in 9 tracked files

`«SEED_STUDENT_PASSWORD»` / `«DEMO_USER_PASSWORD»` in `scripts/seed-students.ts`, `scripts/seed-demo-user.ts`, 6 `docs/` files, `.claude/skills/verify/SKILL.md` — all tracked. Combined with 3.3, either password reaches every student's records.

**Action:** rotate; move to env vars with **no fallback default**.

### 3.3 🔴 `can_act_as_counsellor()` = `auth.uid() is not null`

[`20260712130000:15-23`](supabase/migrations/20260712130000_open_counsellor_access.sql#L15-L23) — referenced **48× in `schema.sql`**. ~48 policy clauses across `help_*`, `notifications`, `counsellor_notes`, `parent_*`, `student_documents` and the counsellor read policies on every `student_*` table collapse to *"any signed-in user."*

`for all` **includes DELETE**: [`schema.sql:1615`](supabase/schema.sql#L1615), [`:1635`](supabase/schema.sql#L1635), [`:1681`](supabase/schema.sql#L1681) let any authenticated user **delete all parent↔counsellor correspondence and all student document records platform-wide**, direct from the browser via PostgREST.

The service-role client has zero `src/` importers — good containment, but it means **RLS is the entire security model**. There is no second layer.

> ⚠️ **Do not remove the `inDemoCohort()` email-suffix filter at [`counsellor/data.ts:59`](src/lib/counsellor/data.ts#L59) before fixing this.** It looks like demo scaffolding a refactor would clean up. It is currently the only thing keeping this a demo-data exposure rather than a real-PII breach involving minors.

### 3.4 🔴 Application-layer authorisation holes

| Finding | Location | Consequence |
|---|---|---|
| `canActAsCounsellor` is `Boolean(user)` | [`lib/api/guards.ts:24`](src/lib/api/guards.ts#L24) | The in-app "defence in depth" is a no-op |
| `/api/counsellor/notes` trusts body `studentId` | [`notes/route.ts:20-33`](src/app/api/counsellor/notes/route.ts#L20-L33) | Any user writes permanent uncapped `flag` notes about **any** student; all users can read them |
| Chat `mode` is client-supplied; `loadCohort()` takes no scope | [`chat/route.ts:87`](src/app/api/chat/route.ts#L87), [`chat/context.ts:255`](src/lib/chat/context.ts#L255) | Any student pulls whole-cohort PII into the prompt and writes notes on arbitrary students |
| `/api/chat/actions/execute` re-reads from client-writable `chat_messages` | [`execute/route.ts:91-116`](src/app/api/chat/actions/execute/route.ts#L91-L116) | Forge an assistant message → execute arbitrary action |
| Deck assign never checks the student | [`decks/assign/route.ts:14-26`](src/app/api/counsellor/decks/assign/route.ts#L14-L26) | Re-opens cross-user notification injection via SECURITY DEFINER trigger |
| Open redirect post-auth | [`auth/callback/route.ts:10`](src/app/auth/callback/route.ts#L10) | `new URL(next, req.url)` — absolute `next` wins; guard already exists in SQL |
| 2 orphaned but live server actions | [`profile/actions.ts:54,77`](src/app/profile/actions.ts#L54) | Zero importers, still registered POST endpoints, unvalidated |
| `saveStudentIntake` has no runtime validation | [`profile/actions.ts:38`](src/app/profile/actions.ts#L38) | Writes client payload across 6 tables; `lib/validation/profile.ts` has the right zod schemas and **is imported by nobody** |

**The structural cause:** [`middleware.ts:182`](src/middleware.ts#L182) matches only page prefixes — **middleware never runs for `/api/*`**. Every route administers its own auth, so a handler that forgets `getUser()` is silently public.

---

## 4. P1 — Correctness bugs users can feel today

### 4.1 A-level scoring: 54% of the domain is unreachable

[`student_scoring.ts:480-540`](src/lib/scoring/student_scoring.ts#L480-L540). I enumerated all 56 three-grade signatures: **30 fall through to `return 8`**, producing **34 strict-dominance inversions**.

| Student has | Scores | vs. | Scores |
|---|---|---|---|
| **A\*A\*D** | 8 | DDD | 10 |
| **A\*A\*D** | 8 | ABD | 40 |
| **AAD** | 8 | DDD | 10 |
| **ACC** | 8 | CCC | 24 |
| **BBD** | 8 | BCD | 20 |

`AAD`, `ACC`, `ACD`, `BBD` are among the commonest real A-level results — any student with one weak subject alongside strong ones. `academic_performance` is worth **80 points**, and the wrong band is **persisted to `student_scores`**.

**No test exercises this table.** `lib/scoring` reports 70.9% statement coverage — the `if` lines were counted as covered without the combinations ever being run. A cautionary tale about coverage as a metric.

### 4.2 Other live correctness bugs

- **Profile lockout** — [`middleware.ts:103`](src/middleware.ts#L103) omits `english_status`, which [`completion.ts:48-52`](src/lib/profile/completion.ts#L48-L52) requires. Answering "Not sure" ⇒ redirected to the wizard from every route, cached 12h, while the dashboard shows 100% complete. The canonical function's own comment documents exactly this trap.
- **Enrolment invisible** — [`counsellor/data.ts:392`](src/lib/counsellor/data.ts#L392) coerces `enrolled → decision`. The terminal success state the product exists to produce cannot be displayed or counted.
- **Unscored programmes look great** — [`matching/service.ts:1012-1019`](src/lib/matching/service.ts#L1012-L1019): all-null inputs ⇒ `effectiveMin = 25` ⇒ median student sees **90–95%, tiered "Safe."** Failed batches swallowed at `:982` (`if (error) continue`), turning a DB timeout into a page of confident Safes.
- **Engine tier overwritten** — [`service.ts:839-853`](src/lib/matching/service.ts#L839-L853) a percentile split fires whenever one tier exceeds 75% (the comment concedes this is common), discarding the per-tier cap immediately above it, then persisting the result everything else reads.
- **ACT students always score rigour 0** — [`student_scoring.ts:389`](src/lib/scoring/student_scoring.ts#L389) filters `level === 'AP'`; the form only ever offers `A_LEVEL`. `RigourTable.ACT` is dead config.
- **`breakdown` is 3/4 placeholder** — [`service.ts:826-832`](src/lib/matching/service.ts#L826-L832): `eligibility` always 100, `academicFit` identical for every match, `preferenceFit` literally 0. Lifestyle data is loaded and discarded.
- **Missing data becomes a confident median** — `?? 33`, `?? 4` (a grade of C), `?? 40`, `?? 3`. The domain cannot express "unknown."
- **Default "fit" sort doesn't sort by fit** — [`use-search-results.ts:816`](src/hooks/use-search-results.ts#L816) falls through to `default: break`.
- **Untransacted destructive write** — [`persist-intake.ts:104-130`](src/lib/profile/persist-intake.ts#L104-L130): three delete-then-insert pairs, 9 dependent writes, no transaction. A mid-sequence failure **permanently destroys the student's subject list**.
- **UTC date bug** — `rec-letter-workflow.tsx:76` does `new Date(iso)` on a date-only string: one day early for every user west of Greenwich. The exact gotcha CLAUDE.md documents.

### 4.3 Two tables exist in production and in no schema file

`student_activities` and `simulation_results` appear in generated [`database.ts:1400`](src/lib/types/database.ts#L1400)/[`:1187`](src/lib/types/database.ts#L1187) and **zero times** across `schema.sql` and all 33 migrations. `student_activities` is delete-then-inserted on every profile save and throws on error — **any environment provisioned from this repo cannot save a profile.**

---

## 5. What's already right — protect these, don't "refactor" them

An audit that only lists problems produces bad decisions. These are assets:

- **Layering is clean.** 1,350 edges; zero `lib→components`, `lib→app`, `components→app` violations.
- **Token layer is well-designed.** 46 custom properties, zero unreferenced; radius ladder and opacity scale 100% compliant; the `.panel` class is now fully dead (0 uses).
- **Boundary coverage is good.** 40 `loading.tsx`, 13 `error.tsx` + root + global. Only 5 of 46 pages are client components; zero client layouts.
- **Build is healthy.** Exit 0, 13.3s, 103 kB shared First Load JS. `next/font` with `adjustFontFallback`. **Zero raw `<img>`.** tiptap/lenis correctly async-only. Devtools verified tree-shaken.
- **Perf fundamentals done right.** 33 `Promise.all` sites, all 8 context values memoised, scroll listeners passive + rAF, realtime poll backoff with `document.hidden` pause.
- **Service-role containment.** Zero `src/` importers, browser-throw guard, no user-reachable path.
- **Supply chain clean.** All 61 Dependabot alerts fixed, `npm audit` clean, transcripts never committed, no tracked `.DS_Store`/`tsbuildinfo`.
- **`schema.sql` is in better shape than CLAUDE.md claims** — all 20 migration functions and every app table present, ~1 migration behind.
- **Boolean-prop proliferation is *not* a problem** (max 6; the codebase correctly prefers `variant`/`tone` unions).
- **`PageHero` cannot become a server component** — it's `motion.div` throughout. Looks like the highest-leverage boundary fix (71 importers); isn't.
- **`src/types/papaparse.d.ts` is an ambient declaration**, not dead code — a naive tool will tell you to delete it and typecheck will then fail.
- **`components/landing-preview/` is live**, not orphaned — `app/page.tsx` imports 9 modules from it. The name is stale; the code runs.

---

## 6. Target architecture

### 6.1 Structure

```
src/
  app/                      # routing ONLY — route groups per portal, thin pages
  features/<slice>/         # counsellor · parent · student · search · matching
    api/                    # server-only data access ('server-only' import)
    model/                  # pure domain logic + zod schemas — no I/O, fully testable
    ui/                     # components private to the slice
    hooks/
    index.ts                # the ONLY public entry point
  shared/
    ui/                     # primitives (Button, Badge, Card, Dialog, Combobox…)
    design/                 # tokens, cva variants
    auth/                   # getIdentity() + can() — ONE implementation
    data/                   # repos + columns.ts + DataError
    observability/          # logger, Sentry init
    lib/ types/
```

**One dependency direction: `app → features (via index.ts) → shared`. Never backwards.**

### 6.2 The five consolidations that kill §2's drift

1. **`shared/auth/identity.ts`** — one `getIdentity()` returning `{userId, role}`, replacing **9** independent implementations (`auth.getUser()` appears in 56 files, `redirect('/login')` in 20). Then a declarative `can(identity, action, resource)` with a route→action map.
2. **`shared/data/`** — the only place `.from(` may appear (ESLint-enforced). `columns.ts` exports select-string constants so a column list **physically cannot diverge** across call sites — this alone kills findings #2 and the 4-way applications query split. One `DataError` with three explicit dispositions, replacing 4 conventions and the **27 sites that discard `error` entirely**.
3. **`features/matching/model/`** — one canonical domain model where `admitProbability` and `ibEquivalent` are `number | null` (making §4.2's confident-median class *unrepresentable*), one `classifyTier`, and all weights/thresholds in a versioned typed `RuleConfig` stamped onto every persisted row.
4. **`shared/ui/`** — adopt the primitives that already exist. `Badge` is 79 lines of well-built `cva` with **2 usages** against 44 hand-rolled pills; `Tooltip` has **0 usages** vs 138 native `title=`; `@radix-ui/react-popover` is installed and never imported. Five hand-rolled `role="dialog"` modals lack focus traps while Radix Dialog sits unused.
5. **zod-first everywhere** — types derived via `z.infer`, never written in parallel. Today: **1 of 23** routes validates a body, **0** validate URL params, **0** validate env, **0 of 28** `await res.json()`, **0 of 21** localStorage reads.

### 6.3 The critical relationship gap

**The counsellor↔student relationship does not exist as data.** There is no assignment table (only `guardian_links` for parents), so "cohort" is an *email-suffix string filter*. RLS has nothing to scope on — which is *why* `can_act_as_counsellor()` degenerated to a boolean. **Creating that table is the prerequisite for fixing §3.3 properly**, not a follow-up.

---

## 7. The gate layer — the actual devops deliverable

Every finding above reduces to *"nothing prevents this."* Install the gates first; they hold the refactor in place and stop regression.

| Gate | Today | Target | Catches |
|---|---|---|---|
| Branch protection | **none** — 20/20 recent PRs merged with `reviewDecision = NONE` | GitHub Team ($4/user/mo), 1 required `ci-ok` check | everything below |
| Secret scanning | **off** | on + push protection | §3.1, §3.2 |
| Env validation | 10 `process.env.X!` | `shared/env.ts` (zod, fail-fast at boot) | 500s from missing config |
| Error monitoring | **none** — 91 `console.*` | `instrumentation.ts` + Sentry | silent prod failures |
| Boundary check | **none** | dependency-cruiser, 14 rules | keeps the clean layering clean |
| Lint | **2 rules** | typescript-eslint v8 + type-aware on `lib/**`,`api/**` | `no-floating-promises`, `no-explicit-any` |
| tsconfig | `strict` only | `+bundler`, `noFallthroughCases`, `noImplicitReturns/Override`, `verbatimModuleSyntax` = **13 errors, one PR** | then stage `noUncheckedIndexedAccess` (174) |
| Style check | **none** | `eslint-plugin-tailwindcss` + `scripts/check-design-tokens.mjs`, ratcheting baseline | 370+ violations |
| Coverage | 13.1%, **no threshold** | ratchet, floor on `features/*/model/**` | §4.1 |
| Bundle budget | **none** | `scripts/check-bundle-budget.mjs` | 260 kB `/` |
| Migration check | **none, no ledger** | throwaway PG from `schema.sql` + replay 33 migrations **twice** (idempotency) | §4.3 |
| Dead code | **none** | `knip` | 6 of 10 dead files were restyled on 2026-07-26 by token passes |
| Environments | **one Supabase project for dev + every preview + prod** | separate preview/prod projects | — |

**CI today** is one serial job (lint→typecheck→test→build) with no caching, no parallelism, no coverage, no gates. The `overlap-guard` job is a clever free workaround for missing branch protection — buying GitHub Team retires it.

**Dockerfile is dead and broken:** `output: 'standalone'` is absent from `next.config.mjs`, so `COPY .next/standalone` (line 26) always fails; no `.dockerignore` + `COPY . .` bakes `.env.local` and `Interview Transcripts/` into the builder layer *before* the failure. Referenced by nothing. **Delete it** or fix it properly.

---

## 8. Quick wins — high value, low risk, do this week

| Fix | Location | Payoff |
|---|---|---|
| Delete 5 unused deps (`openai`, `date-fns`, `@dnd-kit`×3) | `package.json` | 33 MB, 0 imports verified |
| Dynamic-import Supabase in the CTA hook | [`use-launch-href.ts:5`](src/hooks/use-launch-href.ts#L5) | **−57 kB gz on `/`** (260→~202) |
| Use the `Set` already built 13 lines above | [`use-search-results.ts:647`](src/hooks/use-search-results.ts#L647) | −292,600 comparisons/search |
| Add `cache()` around identity | 48 inlined `auth.getUser()` | 4 identity fetches → 1 per render |
| `abortSignal` on essay-assist | [`essay-assist/route.ts:205`](src/app/api/essay-assist/route.ts#L205) | stops billing for disconnected clients |
| Delete 1,088 LOC of verified-dead code | 10 files + 332 dead symbols | — |
| `--card-border` token | 51× `dark:border-white/10` | best value/effort in the design audit |
| Server-`redirect()` the results page | `university-search/results/page.tsx` | deletes a client component + spinner |
| Add `optimizePackageImports` + `staleTimes` | `next.config.mjs` | no `experimental` block exists at all |
| Decide react-query: **adopt or delete** | [`providers.tsx:21`](src/app/providers.tsx#L21) | **0** `useQuery` in the repo; 500 lines hand-roll it |

---

## 9. Sequenced roadmap

**Phase 0 — Contain (days).** Rotate service-role key + demo passwords. Enable secret scanning. Fix `can_act_as_counsellor()` + the `for all` DELETE policies. Patch the 8 authz holes in §3.4. Extend the middleware matcher to `/api/*`. **Ship nothing else until this is done.**

**Phase 1 — Install the gates (1–2 weeks).** Branch protection. `env.ts` + Sentry + `instrumentation.ts` in one pass. dependency-cruiser at *today's* shape (no moves). tsconfig 13-error PR. typescript-eslint. Design-token check in ratcheting mode. Migration-replay CI. `knip`. *Nothing moves yet — the fence goes up first.*

**Phase 2 — Fix correctness behind the new gates (2–3 weeks).** Golden-file the scoring output **first**, then: A-level table, tier unification, `enrolled` status, profile-completion consolidation, transaction around `persist-intake`, the null-vs-confident-median model change. Every step a reviewable score diff, never a blind edit.

**Phase 3 — Consolidate the seams (3–4 weeks).** `shared/auth`, `shared/data` + `columns.ts`, `shared/ui` adoption, zod at every boundary. This is where §2's 14 drift seams close permanently.

**Phase 4 — Restructure (ongoing).** Feature slices, piloting `counsellor` end-to-end before repeating. Create the counsellor↔student assignment table. `StudentIntakeForm` (2,553 lines → ~12 files, none over 250) is **XL/high-risk and goes last** — every inline comment in it documents a past regression; it needs the test harness from Phase 1–2 first.

**If only two things happen:** the P0 security block, and the dependency-cruiser + lint fence. Both are cheap, and the second is what stops this audit from being needed again in six months.

---

## 10. Report index

| # | Report | Focus |
|---|---|---|
| 00 | `00-baseline.md` | measured health, coverage by directory |
| 01 | `01-architecture.md` | 1,350-edge import graph, target structure |
| 02 | `02-data-layer.md` | Supabase call sites, query duplication |
| 03 | `03-api-layer.md` | 23-route auth/validation matrix |
| 04 | `04-react-components.md` | mega-component decomposition plans |
| 05 | `05-domain-logic.md` | scoring/matching/tiering correctness |
| 06 | `06-types-validation.md` | escape hatches, strictness costs |
| 07 | `07-devops.md` | CI/CD, secrets, migrations, observability |
| 08 | `08-performance.md` | measured bundle baseline, budgets |
| 09 | `09-design-system.md` | token compliance, enforcement script |
| 10 | `10-dead-code-duplication.md` | delete list, drift disagreements |
| 11 | `11-security-authz.md` | RLS matrix, authorisation architecture |
