# Ascenda Audit — 10. Dead Code, Duplication & Repo Sprawl

**Scope:** what can we delete, and what is duplicated. Read-only analysis; nothing was modified.
**Corpus:** 442 `.ts`/`.tsx` files under `src/` (70,967 LOC), plus `__tests__/` (31 files) and `scripts/` (17 files).
**Date:** 2026-08-01 · branch `fix/ui-phase0-bugs`

## Method & confidence

`knip`/`ts-prune`/`depcheck`/`madge` are **not installed** in `node_modules` and this analysis was run offline, so no
third-party tool was used. Instead:

1. **Reachability graph** built by a purpose-written Node script
   (`scratchpad/reach.mjs`, retained). It walks `src/`, resolves every `import`/`export … from`/`import()`/`require()`
   specifier against the `@/* → src/*` alias and node resolution (incl. `index.*` and extensionless), and does a DFS
   from **138 real entry points**: every `src/app/**/{page,layout,route,error,loading,not-found,template,default,global-error,sitemap,robots,manifest,icon,apple-icon,opengraph-image}.tsx?`, `src/middleware.ts`, plus all of
   `__tests__/**` and `scripts/**` and the root configs.
2. **Dynamic/string references checked manually** with ripgrep for every candidate before it was called dead
   (this is what rescued `src/types/papaparse.d.ts` from a false positive — see below).
3. **Export-level analysis** (`scratchpad/exports.mjs`): every named export cross-referenced by word-boundary
   match against every other file in `src/`, `__tests__/`, `scripts/`.
4. **Near-duplicate detection**: normalised-token shingling (Jaccard + containment) plus line-level LCS on
   trimmed non-blank lines, then every candidate pair was read before being reported.

The graph is **complete**: 442 src files = 431 reachable + 11 unreachable. Only one unresolved specifier exists in
the whole repo (`__tests__/scoring_validation/batch_runner.ts → ./dist/…`, a comment-adjacent build-output path).

---

## Headline

| | LOC |
|---|---|
| **Whole files, provably unreachable (HIGH confidence)** | **756** |
| **Dead exported symbols inside live files (HIGH confidence)** | **~332** |
| **Total safe deletion** | **~1,088** |
| Duplication removable by consolidation (MEDIUM effort) | ~1,400 |
| **Combined reduction potential** | **~2,500 LOC (≈3.5% of `src/`)** |
| Unused npm packages | **8** |

The codebase is **unusually disciplined** on the classic rot metrics — **1** TODO in 70k LOC, **0** `console.log`,
**0** `@ts-ignore` in `src/`, **0** commented-out code blocks, **0** tracked `.DS_Store`. The problems are not
neglect; they are **three copies of the same rule that no longer agree**. That is the substance of this report.

---

## Delete list

### Recommended now — HIGH confidence

Every entry below has **zero** references anywhere in `src/`, `__tests__/`, `scripts/`, or any config, by import
specifier *and* by bare identifier search. None is referenced dynamically or by string.

| Path | LOC | Proof of non-reachability | Conf |
|---|---:|---|---|
| `src/components/dashboard/deadline-nudges.tsx` | 151 | Not in reachability graph. `rg "deadline-nudges\|DeadlineNudges"` → only a stale mention in a comment at `src/lib/data/student-demo-data.ts:5` | HIGH |
| `src/components/dashboard/outcome-tracker.tsx` | 97 | Not in graph. `rg "outcome-tracker\|OutcomeTracker"` → only a comment at `student-demo-data.ts:4`. Superseded by the live `src/app/counsellor/_components/outcome-dashboard.tsx` | HIGH |
| `src/lib/validation/profile.ts` | 82 | Not in graph. All **15** of its exports (`profilePersonalSchema`, `DESTINATION_COUNTRIES`, …) have zero external references. Only mentions are in `docs/planning/*.md` | HIGH |
| `src/components/inputs/subject-grade-table.tsx` | 81 | Not in graph. Zero refs to `SubjectGradeTable`. **Deleting it empties `src/components/inputs/`** | HIGH |
| `src/components/dashboard/stats-card.tsx` | 74 | Not in graph. Zero refs to `StatsCard` | HIGH |
| `src/components/dashboard/pulse-cards.tsx` | 73 | Not in graph. Zero refs to `PulseCards` / `PulseCardIcon` | HIGH |
| `src/app/profile/_components/StepRoadmap.tsx` | 58 | Not in graph. Zero refs to `StepRoadmap` anywhere | HIGH |
| `src/components/match/share-match-button.tsx` | 55 | Not in graph. Zero refs to `ShareMatchButton` | HIGH |
| `src/lib/demo/help-request-drafts.ts` | 49 | Not in graph. Zero refs to `draftMessageForApplication` | HIGH |
| `src/hooks/use-typing-effect.ts` | 36 | Not in graph. Zero refs to `useTypingEffect`. Last touched 2026-04-16 | HIGH |
| **Subtotal** | **756** | | |

### Dead exported symbols inside otherwise-live files — HIGH confidence

| Location | Symbols | LOC | Proof | Conf |
|---|---|---:|---|---|
| `src/lib/data/student-demo-data.ts` | `DEMO_EVOLUTION` (86–170), `DEMO_CONVERSATIONS` (205–232), `DEMO_SANDBOX_APPS` (280–340), `DEMO_OUTCOMES` (361–370), `DEMO_NUDGES` (385–437), `DEMO_COUNSELLOR_DOCS` (452–468) | **254** | 0 files outside the module reference any of the six. `DEMO_NUDGES`/`DEMO_OUTCOMES`/`DEMO_COUNSELLOR_DOCS` fed exactly the dead components above. Their supporting types (`BlockSource`, `ChatConversation`, `SandboxPlatform`, `SandboxStatus`, `RequirementCell`) go too | HIGH |
| `src/app/profile/actions.ts:54-84` | `recalculateStudentScore`, `resubmitStudentProfile` | 31 | `'use server'` file; both exported, **zero** importers. See finding [HIGH-1] — these are live network endpoints | HIGH |
| `src/lib/analytics.ts:6,49-52` | `subscribeToAnalytics`, the `Listener` type and the `listeners` Set it feeds | ~15 | `subscribeToAnalytics` has zero external refs, so `listeners` is always empty and the `forEach` in `trackEvent` is a no-op. The 4 importers of `lib/analytics` all use `trackEvent` only | HIGH |
| `src/components/dashboard/dashboard-skeletons.tsx:4-17` | `StatsCardSkeleton` | 15 | Only importer (`src/app/dashboard/loading.tsx:4`) pulls `DeadlinesSkeleton, RecommendedProgramsSkeleton, TaskListSkeleton`. It skeletons the dead `stats-card.tsx` | HIGH |
| `src/lib/theme/categories.ts:208-212, 350-360` | `PRIORITY_LABEL`, `SIGNAL_VISUAL` (+ `SignalType`) | 12 | Zero external refs | HIGH |
| `src/lib/validation/auth.ts:9,12` | `authSchema`, `AuthFormValues` | 4 | Self-described "kept for backwards-compatibility with existing imports" — there are none. `auth-form.tsx` imports `loginSchema`/`LoginFormValues` | HIGH |
| `src/lib/constants.ts:2` | `SUPPORT_EMAIL` | 1 | Zero refs | HIGH |
| **Subtotal** | | **~332** | | |

### Verify first — MEDIUM / LOW confidence (do **not** bulk-delete)

| Path / symbol | LOC | Why it is suspicious | Why not HIGH | Conf |
|---|---:|---|---|---|
| `src/lib/supabase/service.ts` | 25 | Only reachable from `scripts/seed-students.ts`; **never** reachable from any app entry point | It is correct and load-bearing for seeding. **Move**, don't delete — it advertises a service-role client from inside `src/lib`, next to the browser client | MEDIUM |
| `src/app/(university-info)/university-search/university/[id]/**` | 197 | The entire route group has exactly **one** inbound link, from `src/components/assistant/widgets/university-widget.tsx:87` | Genuinely reachable, and it's also the only `error.tsx` in the app that doesn't use `ErrorState` | LOW (keep) |
| shadcn surface area: `TableFooter`, `TableCaption`, `SelectGroup`, `SelectLabel`, `SelectSeparator`, `SelectScrollUp/DownButton`, `DialogClose`, `CardDescription`, `TooltipTrigger` | ~90 | Exported, zero external refs | Deliberate shadcn primitive completeness; deleting invites re-adding on the next `npx shadcn add`. **Leave** | LOW |
| ~130 exported `*Props` / union types with zero external refs | — | Structural noise | Almost all are the props interface of their own component — legitimate documentation. Not worth touching | LOW |

### Explicit false positive — do NOT delete

`src/types/papaparse.d.ts` (2 LOC) appears unreachable to any import-graph tool because ambient `declare module`
files are never imported. It is **required**: `src/app/admin/_components/import-panel.tsx:4` does
`import Papa from 'papaparse'`, and `papaparse@5.4.1` ships no types. Flagged here because a naive
knip/ts-prune run *will* recommend removing it and `npm run typecheck` will then fail.
(The correct fix is to add `@types/papaparse` — see Unused dependencies.)

**Exported-but-unused totals: 224 symbols across 94 files.** Top offenders by count:
`lib/types/demo-tables.ts` (20 — all hand-written row types kept deliberately for the `any`-cast wrapper pattern),
`lib/validation/profile.ts` (15 — whole file dead),
`lib/data/student-demo-data.ts` (11),
`lib/theme/categories.ts` (10),
`app/course/[id]/_components/course-data.ts` (7),
`lib/scoring/student_scoring.ts` (7),
`lib/tiering/course_tiering.ts` (7).
The last two are dominated by types that exist for their own module's signatures — genuinely dead among them are
only the `PRIORITY_LABEL`/`SIGNAL_VISUAL` pair listed above.

---

## Findings

### [HIGH] Two orphaned Server Actions are still live, unauthenticated-adjacent network endpoints

`src/app/profile/actions.ts` is a `'use server'` module. Next.js assigns every exported async function in such a
file a stable Action ID and **registers it as a POST endpoint**, whether or not any component imports it.

```
src/app/profile/actions.ts:54   export const recalculateStudentScore = async () => { … }   // 0 importers
src/app/profile/actions.ts:77   export const resubmitStudentProfile  = async () => { … }   // 0 importers
```

Both call `ensureUser()` first, so they are not an auth bypass — but they are **two writable production endpoints
that no reviewer is looking at**, and `recalculateStudentScore` performs an unrate-limited
`buildStudentProfilePayload` → `scoreStudentProfile` → `student_scores.upsert` on every invocation. This is dead
code that still runs. `/api/profile/recalculate-score/route.ts` already covers the same job through a reviewed,
guarded route. Delete both exports.

### [HIGH] The score→tier rule exists three times with two different threshold sets — and they disagree

`src/components/university-search/types.ts:36-38` carries this comment:

> `// Single source of truth for score→tier thresholds lives in classifyFitTier`
> `// (lib/theme/categories.ts): safety ≥ 80, match ≥ 60, else reach.`
> `// Delegate here so the results and shortlist surfaces can never drift apart.`

It has already drifted apart.

| Site | Rule | Surfaces it drives |
|---|---|---|
| `src/lib/theme/categories.ts:236` `classifyFitTier` **(declared canonical)** | `≥80 safety · ≥60 match · else reach` | `/university-search/search`, `/university-search/shortlist` (via `components/university-search/types.ts:46`) |
| `src/lib/counsellor/data.ts:104-105` `tierFromScore` | **`≥70 Safe · ≥50 Match · else Reach`** | the whole `/counsellor` section — roster, cohort stats, match distribution, portfolio balance |
| `src/lib/matching/service.ts:390-391` (inline `fallbackTier`) | **`≥70 Safe · ≥50 Match · else Reach`** | `/matches`, `/dashboard` matches peek, `/api/match`, `/api/match/score` |
| `src/lib/matching/service.ts:850` (rebalance path) | **percentile-based: `pct<0.35 Safe · <0.65 Match · else Reach`** — not score-based at all | `/matches` when one tier dominates >75% |

Concrete consequence with a fit score of **75**: the search results page labels the programme **"Match"**; the
counsellor dashboard and the student's own `/matches` page label the *same programme* **"Safe"**. At **55**:
**"Reach"** on search, **"Match"** everywhere else. A counsellor and a student looking at the same list see
different tiers.

**Single home:** `classifyFitTier` in `src/lib/theme/categories.ts`. Make `counsellor/data.ts` and
`matching/service.ts` import `tierFromScore` from `src/components/university-search/types.ts` (or better, move
`tierFromScore` down into `lib/theme/` so a `lib/` module isn't importing from `components/`). Decide 70/50 vs
80/60 deliberately — this is a product decision, not a refactor.
Also collapse the **two** declarations of `type MatchTier` (`lib/matching/match-tier.ts:1`, `lib/counsellor/types.ts:8`)
and the inline third at `lib/chat/widgets.ts:52`.

### [HIGH] Application-stage colours contradict the token system on the student dashboard

`src/lib/counsellor/stage-colors.ts:1-20` carries a header comment explaining that hand-rolled stage palettes
caused "a different colour depending on which screen you're on" and that this file exists to end it. It fixed the
counsellor side. The student dashboard was missed.

`src/components/dashboard/hub/pipeline-card.tsx:13-19` vs canonical `APPLICATION_STATUS_VISUAL`
(`src/lib/theme/categories.ts:215-220`, where `sky→bg-info-fill`, `amber→bg-warning-fill`, `emerald→bg-success-fill`, `violet→bg-feature-fill`):

| status | pipeline-card | canonical | |
|---|---|---|---|
| `planning` | `bg-muted-foreground/50` | `bg-info-fill` | **DISAGREE** |
| `in_progress` | `bg-info-fill` | `bg-warning-fill` | **DISAGREE** |
| `submitted` | `bg-success-fill` | `bg-success-fill` | agree |
| `decision` | `bg-warning-fill` | `bg-feature-fill` | **DISAGREE** |
| `enrolled` | `bg-primary` | *(no canonical key)* | extra |

So "in progress" is **blue** on the dashboard pipeline and **amber** on the applications board; "decision" is
**amber** on the dashboard and **violet** on the counsellor funnel. Three of five keys wrong.

### [HIGH] The same help request is a different colour for the student and the counsellor

`src/app/inbox/_components/inbox-list.tsx:25-29` and
`src/app/counsellor/inbox/_components/counsellor-inbox.tsx:28-32` are otherwise identical `STATUS_PILL` tables:

```
student   open: 'border-info/25 bg-info-subtle text-info'          ← blue
counsellor open: 'border-feature/25 bg-feature-subtle text-feature' ← violet
```

`accepted` and `resolved` agree exactly. Neither derives from `categories.ts` — there is **no** canonical
help-request status entry, which is why they drifted. Add `HELP_STATUS_VISUAL` to `lib/theme/categories.ts`.

### [HIGH] Date formatting has fragmented into 30+ local helpers, one of which reintroduces the exact UTC bug CLAUDE.md warns about

`CLAUDE.md` says: *"Date-only strings (`deadline_date`, `due_date`) must be parsed as LOCAL dates … use
`parseLocalDate`."* `src/lib/utils/dates.ts` provides it. **69 `toLocaleDateString`/`Intl.DateTimeFormat` call
sites** exist across `src/`, roughly half of which route through `parseLocalDate` and half of which do not.

The live regression:

```
src/components/applications/rec-letter-workflow.tsx:76
  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
```

Called at `:126` and `:263` with `letter.requestedDate`, which is produced by
`src/lib/data/student-demo-data.ts:12-16`:

```
function relDate(n: number): string { … return d.toISOString().slice(0, 10); }   // 'YYYY-MM-DD'
```

A date-only string through `new Date()` is **UTC midnight**, so for every user west of Greenwich the displayed
"Requested" date is **one day early**. `parseLocalDate` is already imported elsewhere in the same feature area.

Locale drift on top of it — three conventions coexist:

| Site | Locale | Renders |
|---|---|---|
| `src/app/dashboard/page.tsx:40` `shortDateFormatter` | `en-US`, `{month, day}` | **"Sep 5"** |
| `src/app/parent/page.tsx:27` `shortDateFormatter` | `en-GB`, `{day, month}` | **"5 Sep"** |
| `src/app/parent/deadlines/page.tsx:14` `shortDateFormatter` | `en-GB`, `{day, month}` | "5 Sep" |
| `src/components/dashboard/deadline-timeline.tsx:18` | `en-US` | "Sep 5" |
| 12 counsellor `formatDate` helpers | `undefined` (browser locale) | varies per user |

`formatDateOnly` at `src/app/dashboard/page.tsx:44` and `src/app/parent/page.tsx:30` is **byte-identical**, yet
produces different output because each closes over a different `shortDateFormatter`. **The same deadline reads
"Sep 5" to the student and "5 Sep" to their parent.**

### [MEDIUM] Relative-time formatting: five hand-rolled copies, two byte-identical pairs, three disagreements

`src/lib/utils/dates.ts:56` `formatRelativeTime` is canonical and has 6 correct consumers. Five reimplementations:

| Site | Under 1 min | Rounding | > 7 days |
|---|---|---|---|
| **`lib/utils/dates.ts:56` (canonical)** | `'Just now'` | `Math.round` | falls back to `'D Mon'` |
| `src/components/notifications/notification-bell.tsx:34` | `'Ns ago'` | `Math.round` | **never falls back — `'450d ago'`** |
| `src/app/counsellor/_components/student-card.tsx:52` | `'just now'` (lowercase) | **`Math.floor`** | `'D Mon'` |
| `src/app/counsellor/_components/activity-feed.tsx:32` | — | — | — · **byte-identical to student-card.tsx** (`diff` returns empty) |
| `src/components/applications/rec-letter-workflow.tsx:14` `formatReminderAge` | `'Ns ago'` | `Math.round` | **never falls back** |
| `src/app/counsellor/_components/counsellor-document-board.tsx:39` `formatNudgeAge` | — | — | — · **byte-identical to rec-letter-workflow.tsx** |

`Math.floor` vs `Math.round` alone shifts the boundary by 30 minutes: 90 minutes reads **"1h ago"** on the
counsellor student card and **"2h ago"** in the notification bell.

**Single home:** `formatRelativeTime` in `src/lib/utils/dates.ts`, extended with an `{ epochMs }` overload for the
two `(at: number)` variants. **~55 LOC saved.**

### [MEDIUM] Four labels for one application status, three for one student flag

Nine independent status→label tables. `decision` is spelled three ways and `in_progress` two:

| File:line | `in_progress` | `decision` |
|---|---|---|
| `src/lib/counsellor/stage-colors.ts:36` | `'In Progress'` | `'Decision'` |
| `src/app/counsellor/_components/student-roster.tsx:25` | `'In Progress'` | `'Decision'` |
| `src/app/counsellor/_components/student-detail-tabs.tsx:56` | `'In Progress'` | `'Decision'` |
| `src/app/counsellor/_components/application-funnel.tsx:22` | `'In Progress'` | `'Decision'` |
| `src/app/counsellor/_components/analytics-charts.tsx:211` | `'In Progress'` | **`'Decision Received'`** |
| `src/components/applications/application-list.tsx:26` | **`'In progress'`** | `'Decision'` |
| `src/app/parent/progress/_progress-board.tsx:33` | `'In progress'` | **`'Awaiting decision'`** |
| `src/app/dashboard/page.tsx:56` | `'In progress'` | `'Awaiting decision'` |
| `src/lib/parent/data.ts:212` | `'In progress'` | `'Awaiting decision'` |

`student-roster.tsx:25` additionally uses a **camelCase key** (`inProgress`), which is why
`src/app/counsellor/_analytics-client.tsx:62` `STAGE_TO_STATUS` exists purely to translate between key spellings.

Student flags, three label sets (`src/app/counsellor/_components/student-alerts.tsx:14`,
`src/app/counsellor/students/[id]/page.tsx:23`, `src/lib/counsellor/custom-widgets.ts:88`):
`deadline_urgent` → `'Deadline in ≤5 days'` / `'Deadline urgent'` / `'Urgent deadline'`.

**Root cause:** `lib/theme/categories.ts` has a `*_VISUAL` for application status but **no `*_LABEL`**, and no
flag entry at all. Add `APPLICATION_STATUS_LABEL` (incl. `enrolled`) and `FLAG_LABEL`/`FLAG_VISUAL`.

### [MEDIUM] Three incompatible deadline-urgency threshold schemes

| Source | Thresholds | 4th bucket |
|---|---|---|
| `src/lib/theme/categories.ts:286` `classifyDeadlineUrgency` **(canonical)** | `<0` / `≤7` / `≤30` | `'later'` |
| `src/app/counsellor/_components/deadline-monitor.tsx:43-48` `getUrgency` | `<0` / `≤7` / `≤30` — verbatim reimplementation | **`'future'`** (renamed key) |
| `src/app/counsellor/_components/deadline-monitor.tsx:63-69` `urgencyBadge` | `≤3` danger / `≤7` warning / else muted | — |
| `src/app/counsellor/_components/deadline-widget.tsx:33-37` `urgencyClass` | `≤3` danger / `≤7` warning / else **info** | — |

A deadline 20 days out is `this-month`/sky under the canonical classifier but plain `muted` in the monitor badge
and `info` in the widget — on **the same page**. Label casing also drifts (`'This Week'` vs `'This week'`).

### [MEDIUM] Currency: six formatters, three currency assumptions for the same DB column

| Site | Behaviour |
|---|---|
| `src/lib/parent/currency.ts:36-64` | `en-GB` + `GBP`, with home-currency conversion — the most correct |
| `src/app/university-search/search/page.tsx:84` `formatGbp` | hand-built `£24.5k` abbreviation — **a second function of the same name** |
| `src/app/course/[id]/_components/course-data.ts:14` `formatCurrencyString` | symbol lookup with **`'£'` as the default fallback** |
| `src/hooks/use-search-results.ts:386` `CURRENCY_SYMBOLS` | 6-entry symbol map, falls back to `"CODE "` |
| `src/components/university-search/university-information.tsx:73-81` `formatCurrency` | **hard-codes `en-US` + `USD`** |
| `src/components/university-search/ComparisonModal.tsx:50-64` `formatCurrencyRange` | `en-US`, **defaults to `USD`** when currency is null |

`universities.intl_tuition_low` (a GBP-scale column — cf. `src/lib/university-search/search-params.ts:14-16`:
*"a single GBP scale is correct across countries"*) is rendered:
**`$` in `university-information.tsx`** (via `annualTuition` at
`src/app/(university-info)/university-search/university/[id]/page.tsx:93`),
**`£` on the course page** (`course-data.ts:350` → `formatCurrencyString(…, 'GBP')`), and
**the programme's currency in `ComparisonModal`** (`uni.intlTuitionLow` formatted with `value.currency ?? 'USD'`,
where `currency` comes from `programs.currency`, not the university row).
Same number, three currency symbols, depending on which screen. **Single home:** one
`src/lib/utils/currency.ts` exporting `formatMoney(amount, currency, { abbreviate })`.

### [MEDIUM] API error envelopes: five shapes for HTTP 401

18 handlers return 401 in five different shapes:

| Shape | Count | Example |
|---|---|---|
| `{ error: 'Unauthorized' }` | 13 | `api/match/route.ts:12`, `api/checklist/route.ts:36,61,99` |
| `{ error: 'Not authenticated' }` | 1 | `api/profile/export/route.ts:46` |
| `{ ok: false, error: 'Unauthorized' }` | 1 | `api/admin/catalog-health/route.ts:13` |
| `{ ok: false, error: 'Not authenticated' }` | 1 | `api/chat/feedback/route.ts:25` |
| `{ suggestions: [] }` — a **200-shaped body with a 401 status** | 1 | `api/chat/suggestions/route.ts:27` |
| raw `new Response(JSON.stringify(...))`, bypassing `NextResponse` | 2 | `api/chat/route.ts:76`, `api/essay-assist/route.ts:127` |

A client can't write one error handler. `src/lib/api/guards.ts` already exists and already holds `parseJsonBody`
and `canActAsCounsellor` — it is the obvious home for `requireUser()` + `apiError()`/`apiOk()`.

### [LOW] Dead code was still being maintained

Six of the ten unreachable files were **edited on 2026-07-26** by the UI token-migration and Web-Interface-Guidelines
passes (`9ebfa89`, `0c7504e`, `1695a28`). Reviewer and agent time was spent restyling components that no route
renders. A `knip` step in CI would have caught this.

### [LOW] `landing-preview/` is the live landing page, not a leftover

Project memory suggested the `/landing-preview` **route** was deleted after the redesign merged, raising the
question of whether `src/components/landing-preview/` (16 files, ~228 KB) is now orphaned. **It is not.**
`src/app/page.tsx` imports 9 modules from it directly (`PreviewNav`, `PreviewHero`, `ProofScrub`,
`HowItWorksScrub`, `ComparisonSettle`, `AltitudeWash`, `SectionReveal`, `PreviewCta`, `SmoothScroll`) and the
remaining 7 are reached transitively. `src/components/landing/` is likewise fully live — `hero-app-tour.tsx`,
`mock-viz.tsx`, `product-widgets.tsx` and `scroll-reveal-heading.tsx` are all imported *by* `landing-preview/`.
**Nothing to delete; the directory name is simply misleading** and should be renamed to `landing/` (merging the
two) so the next auditor doesn't repeat this check.

### [LOW] `src/hooks/` vs `src/lib/hooks/`, and `src/types/` vs `src/lib/types/`

`src/lib/hooks/` holds exactly one file (`use-search-param-state.ts`) while `src/hooks/` holds 11.
`src/types/` holds exactly one file (`papaparse.d.ts`) while `src/lib/types/` holds 2. Two of each, no rule.
Consolidate to `src/hooks/` and `src/lib/types/`.

---

## Dedupe list

Ordered by LOC recovered. Every cluster below was read, not just scored.

### 1. Counsellor dashboard widget quartet — pin/hide/manage state machine, 4×

| File | LOC | non-blank |
|---|---:|---:|
| `src/app/counsellor/_components/activity-feed.tsx` | 233 | 214 |
| `src/app/counsellor/_components/deadline-widget.tsx` | 225 | 206 |
| `src/app/counsellor/_components/top-students.tsx` | 218 | 201 |
| `src/app/counsellor/_components/student-alerts.tsx` | 216 | 200 |

Measured shared **trimmed** lines: activity-feed↔deadline-widget **140**, top-students↔student-alerts **141**,
deadline-widget↔student-alerts **133**, activity-feed↔top-students **122**. That is **64–67% of each file**.

The shared ~95-line block: the "Manage" pill (identical `cn()` string, `Settings2`/`ChevronDown`), the
`AnimatePresence` + `motion.div` `{opacity:0,height:0}→{height:'auto'}` panel, the per-row pin/hide button pair
(identical `border-primary/40 bg-primary/10 text-primary-ink` / `border-success/25 bg-success-subtle text-success`),
"Reset all", `slice(0,5)` + `+N more` footer, and the pinned-first comparator.

**Differences:** only the row renderer and the sort key — rank medal + avg match score, flag icon + label,
urgency chip + date, activity icon + timestamp. `activity-feed` uses a block-bodied `togglePin`; the other three
use an expression body. Otherwise character-identical.

**Single home:** a `usePinAndHide(ids)` hook + a `<ManageableWidgetList>` compound component in
`src/app/counsellor/_components/`. Model it on `widget-grid-core.tsx`, which is *already* correctly factored
(measured Jaccard between its two adapters: 0.11 — that one needs no work).
**LOC saved: ~285.**

### 2. `error.tsx` boundaries — 12 files, two string literals apart

`src/app/error.tsx` (14 LOC) plus 11 at **exactly 13 LOC**: `admin/`, `matches/`, `dashboard/`, `counsellor/`,
`parent/`, `toolbox/`, `applications/`, `scholarships/`, `university-search/`, `profile/`, `course/[id]/`.

`diff src/app/matches/error.tsx src/app/dashboard/error.tsx` → **2 changed lines**: the function name and the
`scope=`/`title=` props. 9 of 11 non-blank lines byte-identical across every pair.

**Single home:** `createErrorBoundary({ scope, title })` exported from the existing
`src/components/ui/error-state.tsx`. Next requires a physical file per segment, so the files stay — the bodies go
(each becomes 3 lines). **LOC saved: ~110.**
*Outlier to fix while there:* `src/app/(university-info)/university-search/university/[id]/error.tsx` (29 LOC) is
the only boundary that doesn't use `ErrorState`; it hand-rolls `useEffect(console.error)` + a bare `Button`.

### 3. Parent role screens — same server-component scaffold 4×

`src/app/parent/{finances,messages,deadlines,progress}/page.tsx` — 75 / 71 / 69 / 63 LOC.
**35 identical non-blank lines per pair**, out of 56–68 → **53–60% overlap**. Shared: the 8-line import block,
`const { supabase, linkedChildren, activeChild } = await resolveParentContext();`, an ~18-line `if (!activeChild)`
early return, then the identical `PageHero tone="student" eyebrow="Parent" actions={<ChildSwitcher …/>}` +
`<AnimatedSection>` shell.

**Differences:** which `loadChild*()` is awaited, three derived stat tiles, one client board.
**Single home:** an async `<ParentScreen>` at `src/app/parent/_components/parent-screen.tsx` taking a render prop
of `{ supabase, activeChild }`. **LOC saved: ~105.**

### 4. Date & relative-time helpers — 30+ local reimplementations

Covered in detail under Findings. The concrete duplicate set:
`formatDate` declared **7×** (`applications/documents-manager.tsx:29`, `applications/rec-letter-workflow.tsx:76`,
`profile/evolution-timeline.tsx:44`, `counsellor/_components/{student-detail-tabs:63, deadline-monitor:59,
deadline-widget:39, notes-panel:40, counsellor-document-board:67}`), `formatRelative` **3×** (2 byte-identical),
`formatReminderAge`/`formatNudgeAge` byte-identical, `formatDateOnly` **2×** byte-identical,
`shortDateFormatter` **3×** (2 different locales), `safeDaysUntil` **2×** byte-identical
(`app/dashboard/page.tsx:50`, `lib/parent/data.ts:185`).
**Single home:** `src/lib/utils/dates.ts` — add `formatShortDate(value)`, `formatLongDate(value)`,
`formatDayMonthYear(value)` and one `Intl.DateTimeFormat` singleton with a **decided** locale.
**LOC saved: ~120**, and it closes the UTC bug and the "Sep 5"/"5 Sep" split.

### 5. API auth-guard + error envelope — 23 handlers

`createRouteHandlerSupabaseClient()` ×27, `await supabase.auth.getUser()` ×18, `status: 401` ×18,
`{ error: 'Invalid payload' }` ×13, `status: 400` ×40.
Closest pair: `api/counsellor/decks/route.ts` ↔ `api/counsellor/decks/assign/route.ts` (53 LOC each,
**24 of 42 non-blank lines identical**).
**Single home:** extend `src/lib/api/guards.ts` with `requireUser(supabase)` (same discriminated-union shape
`requireCounsellor` already returns) + `apiError(status, message)` / `apiOk(data)`, then a `withAuth(handler)`
wrapper. **LOC saved: ~100**, plus a single-valued wire contract.

### 6. Status→tone/label tables — ~40 local maps

Detailed under Findings ([HIGH] pipeline-card, [HIGH] help status, [MEDIUM] labels, [MEDIUM] urgency).
Beyond the disagreements: **14 files rebuild a slice of the private `TONE` bundle**
(`categories.ts:105-192`) — `dashboard/hub/next-up-card.tsx:21`, `app/appointment/page.tsx:25`,
`course/[id]/_components/tiles.tsx:82`, `counsellor/_components/portfolio-balance.tsx:75`,
`profile/pathway-status-pill.tsx:5`, `applications/rec-letter-workflow.tsx:42`,
`notifications/notification-bell.tsx:27`, `profile/evolution-timeline.tsx:28`,
`course/[id]/_components/costs-panel.tsx:11`, `toolbox/deadline-timeline-tool.tsx:13`,
`counsellor/_components/deadline-monitor.tsx:33`, `help/help-thread-drawer.tsx:40`, plus `ui/badge.tsx:31`
(deliberate, documented) and `lib/counsellor/deck-theme.ts:12` (ordinal, justified).
Plus **45 inline `border-X/25 bg-X-subtle text-X` triplets** across 20 files, every one of which is a `<Badge>`.
The tier key-map is duplicated **5×** with three different key casings
(`_cost-explorer.tsx:33` ≡ `_progress-board.tsx:22` ≡ `match-list.tsx:14`; inverted at
`university-search/types.ts:40`; lowercase `reach|match|safe` at `student-roster.tsx:32`).

**Single home:** `src/lib/theme/categories.ts` (already the canon) + `src/components/ui/badge.tsx` as the render
target. Three additions close most of it: `APPLICATION_STATUS_LABEL`, `HELP_STATUS_VISUAL` + `FLAG_VISUAL`/`FLAG_LABEL`,
and exporting `TONE` so `badgeVariants` consumes it instead of copying it.
**LOC saved: ~250–320.**

### 7. Hand-rolled empty states — 20 blocks, 4 markup shapes

`src/components/ui/empty-state.tsx:44` already exists with `size` and `tone` props and **21 correct call sites**.
Its own docblock says the fixed `min-h-[280px]` was *"the reason a dozen call sites kept hand-rolling their own"* —
`size="inline"` was added to fix that, and the dozen were never migrated.

- **Shape 1** dashed box + icon + heading + subtext (7): `counsellor-inbox.tsx:152`, `counsellor-document-board.tsx:328`, `student-detail-tabs.tsx:385` and `:425`, `deadline-monitor.tsx:135`, `deadline-timeline.tsx:45`, `task-list.tsx:85`
- **Shape 2** borderless `py-8 text-center` (4): `student-alerts.tsx:38`, `deadline-widget.tsx:63`, `analytics-drilldown.tsx:227`, `_parent-thread.tsx:118`
- **Shape 3** all-clear = exactly `tone="positive"` (2): `at-risk-panel.tsx:47`, `next-actions-list.tsx:53`
- **Shape 4** bare one-liner (7): `match-list.tsx:179` and `:272`, `notes-panel.tsx:155`, `custom-widget-chart.tsx:35`, `_universities-client.tsx:740`, `help-thread-drawer.tsx:744` and `:861`, `documents-manager.tsx:50`
- **Near-misses reproducing `EmptyState`'s markup element-for-element:** `ComparisonModal.tsx:269`, `matches-peek.tsx:36` and `:80`, `pipeline-card.tsx:38`, `student-roster.tsx:319`, `command-palette.tsx:322`, and three identical "unhide students" one-liners (`student-alerts.tsx:210`, `top-students.tsx:212`, `deadline-widget.tsx:219`)

None of the 20 matches `EmptyState`'s own `rounded-2xl border-border/60 bg-muted/10` — radius, wash opacity and
icon tint all vary. **LOC saved: ~110–140.**

### 8. Counsellor role screens — copy-pasted down to the indentation

`src/app/counsellor/{inbox,outcomes,documents,applications,deadlines,universities,students}/page.tsx` +
`counsellor/page.tsx` (23–53 LOC). Overlap is only 25–58% by containment because the data-loading genuinely
differs — but **12 files carry the identical stray four-space mis-indent**:

```
      <PageHero
          tone="counsellor"
        eyebrow="Counsellor"
```

Verified present in `counsellor/{documents,deadlines,outcomes,applications,students,students/[id]}/page.tsx`,
`counsellor/_analytics-client.tsx:501`, `counsellor/_dashboard-client.tsx:129` (and absent from
`admin/page.tsx:45` and `admin/simulation/page.tsx:115`, which were typed rather than pasted). Twelve files with
the same clipboard artefact is a copy trail, not convergent style.
**Single home:** a 12-line `<CounsellorScreen title description highlight stats>` wrapper.
**LOC saved: ~80** (and the indentation gets fixed once).

### 9. Assistant pages + their loading files — 6 files, one prop apart

`src/app/{assistant,counsellor/assistant,parent/assistant}/page.tsx` — 25/24/24 LOC, counsellor↔parent **85%
overlap** (17 of 20 non-blank lines identical), student↔either 73%. Differs by `metadata.title`, `mode=`, and
whether the wrapper is `<DashboardShell>` (student, no layout of its own) or a bare `<div className="space-y-6">`.
Their `loading.tsx` siblings are **29 LOC each and differ only in the exported function name** — the doc comment
is word-for-word identical. **LOC saved: ~73.**

### 10. `essay-workshop` skeleton — duplicated and already drifted

`src/app/toolbox/essay-workshop/loading.tsx` (59) vs `src/components/toolbox/essay-workshop-lazy.tsx` (58) —
**77% overlap, 38 of 56 non-blank lines identical**. `loading.tsx`'s own comment says it *"mirrors the same layout
that `essay-workshop-lazy.tsx` shows"*. They have **already diverged**: `z-50` vs `z-modal`, and `rounded-md` vs
`rounded-lg` on four `Skeleton` elements — so the route-loading → lazy-loading handoff visibly jumps, which is
precisely what the mirroring was meant to prevent. Export one `<EssayWorkshopSkeleton/>`.
**LOC saved: ~40.**

### 11. `localStorage` access — 18 hand-rolled sites vs a 26-line helper nobody uses

`src/lib/utils/local-storage.ts` provides `readJSON<T>(key, fallback, validate?)` / `writeJSON(key, value)` and
centralises the SSR guard, the parse guard and quota-error swallowing. It has **2 importers**
(`counsellor/_components/widget-grid-core.tsx`, `counsellor/_components/use-custom-widgets.ts`).
**18 other sites** re-implement the try/catch dance: `hooks/use-user-role.ts:12`, `hooks/use-launch-href.ts:22`,
`parent/finances/_cost-explorer.tsx:63`, `scholarships/scholarship-explorer.tsx:71`,
`applications/rec-letter-workflow.tsx:89`, `toolbox/requirements-checker.tsx:47`, `toolbox/essay-workshop.tsx:95`
(a one-line `try{…}catch{}`), `counsellor/_components/counsellor-document-board.tsx:85`,
`chat/chatbot-widget.tsx:109`, `theme/theme-provider.tsx:29-30`,
`university-search/{saved-search-store.ts:35, shortlist-store.ts:114-116, IntelligentSearchBar.tsx:68}`,
`profile/_components/StudentIntakeForm.tsx:852`, `layout/sidebar-context.tsx:30`.
Several omit the `typeof window` guard, several omit `validate`. **LOC saved: ~70.**

### 12. Smaller identical constants

| Duplicate | Sites | Note |
|---|---|---|
| `unwrap<T>(res, label)` | `lib/counsellor/data.ts:45`, `lib/parent/data.ts:41` | `diff` → **1 line** (the `counsellor data:` / `parent data:` prefix). Parameterise the prefix |
| A-level grade points | `lib/matching/matching_engine.ts:389` `A_LEVEL_GRADE_POINTS`, `lib/counsellor/data.ts:40` `GRADE_ORDER` | **Identical table** `{'A*':7,A:6,B:5,C:4,D:3,E:2,U:1}`, two names. **But** `matching_engine` uppercases the key before lookup (`:398`) and `counsellor/data.ts:125` does not — a lowercase grade silently scores 0 there. Distinct from `student_scoring.ts:316` `GRADE_POINTS_ALEVEL` (`A*:5`), which is a genuinely different rubric — leave that one |
| `URGENCY_ORDER` | `counsellor/_components/at-risk-panel.tsx:30`, `lib/counsellor/data.ts:737` | Byte-identical |
| Tier chip literals | `components/landing/product-widgets.tsx:116`, `components/landing-preview/step-shots.tsx:52` | **Byte-identical** raw-palette blocks; `step-shots.tsx:50` admits it's *"mirrored from product-widgets' TIER_STYLES (not exported there)"* |
| Outcome-result table | `counsellor/_components/outcome-dashboard.tsx:12`, `dashboard/outcome-tracker.tsx:8` | Same 5 keys/tones/labels, different icons. **The second file is on the delete list**, so this resolves itself |
| Skeleton grid loop | 41 copies across 20 `loading.tsx` files | `{Array.from({length:N}).map(…<Skeleton className="h-XX rounded-2xl"/>)}` → one `<SkeletonGrid>`. ~90 LOC, lowest value |

### Checked and cleared — do NOT refactor

- **`widget-grid.tsx` / `analytics-widget-grid.tsx` / `widget-grid-core.tsx`** — already correctly factored and
  the best code in the area. Measured Jaccard between the two adapters: **0.11**; each vs the core: **0.01**.
- **`src/components/university-search/filters/*`** (11 files, 992 LOC) — max pairwise Jaccard **0.11**. Genuinely
  distinct primitives already sharing `ShowMoreToggle`.
- **`inbox-list.tsx` ↔ `counsellor-inbox.tsx` ↔ `_parent-thread.tsx`** — Jaccard 0.21/0.05/0.05. Parallel routes,
  different data models. (Their *status tables* still need unifying — see Findings — but the components don't.)
- **`counsellor/documents` ↔ `applications/documents`**, **`counsellor/applications` ↔ `applications`** — no
  meaningful shared shingles.
- **`loading.tsx` family** — already ~90% factored via `PageHeroSkeleton` (37 of 40 use it), which its own
  docblock notes killed 29 hand-guessed hero blocks.

---

## Repo sprawl

`git ls-files` → **591 tracked files, 33 MB working-tree bytes**. The git *history* is healthy: **11.49 MiB
packed**. But `.git` on disk is **462 MB**, of which **`.git/lfs` is 438 MB**.

| Item | Tracked? | Size | Disposition |
|---|---|---|---|
| `supabase/imports/program_requirements.csv` | **TRACKED (Git LFS)** | 27.0 MB tree / 133 B in git / **~438 MB in `.git/lfs`** | **Move out of repo.** `.gitignore:20` already says `supabase/imports/**/*.csv` — a **dead letter**, since tracked files bypass gitignore, and it directly contradicts `.gitattributes`. The gitignore comment states they are *"recreated by scripts/all-countries-to-supabase.ts"*, i.e. regenerable, and `.vercelignore:3` already excludes them from deploys. `git rm --cached` + drop the LFS rule reclaims ~438 MB and removes LFS as a clone prerequisite |
| `supabase/imports/universities.csv` | **TRACKED (Git LFS)** | 724 KB / 131 B | same |
| `docs/demo-script-v1-one-per-page.docx`, `-v2-two-column.docx`, `guide-student-presentation.docx`, `guide-counsellor-presentation.docx` | **TRACKED** | 176 KB | **Move out.** Undiffable binaries, and they are *generated* by `docs/generate_demo_docs.py` / `generate_audience_guides.py`. Keep the generators, gitignore the output, publish to Drive |
| `docs/demo-script.docx.html` | **TRACKED** | 20 KB, 445 lines | **Delete.** A Word→HTML export sitting next to `docs/demo-script.md`, the real source |
| `docs/generate_*.py`, `scripts/import-rich-content.py` | **TRACKED** | 88 KB | **Keep**, but add a `requirements.txt` — they need `python-docx`, declared nowhere |
| `Ascenda-Data-Collection` | **TRACKED (gitlink `160000`, sha `00f6987`)** | ~1 KB of actual content (LICENSE + README) | **Remove the submodule.** `git submodule status` reports `-00f6987` = **not initialised**. Fresh clones get an empty dir; CI never checks it out. Pure clone friction |
| `Interview Transcripts/` | **NOT tracked** (`.gitignore:16`) | 136 KB on disk | ✅ correct, no action |
| `transcripts/` | **NOT tracked** (`.gitignore:17`) | 112 KB on disk | ✅ correct, no action |
| `tsconfig.tsbuildinfo` | **NOT tracked** (`.gitignore:8`) | 248 KB on disk | ✅ untracked by `9c310ff`, correct |
| `.DS_Store` | **NOT tracked** (`.gitignore:9`) | 14 KB at root | ✅ zero tracked anywhere |
| `.env.local` | **NOT tracked now** (`.gitignore:6`) | 2.1 KB | ⚠️ **It was committed at some point** — `git log -- .env.local` returns commits; untracked only as of `9c310ff`. **Verify with `git log -p -- .env.local` and rotate any Supabase/Gemini key that appears.** Highest-priority item here (belongs to the security audit, flagged for handoff) |
| `.next/` (552 MB), `node_modules/` (648 MB), `.vercel/` | **NOT tracked** | — | ✅ correct |
| `.agents/` + `.claude/` | **TRACKED** | 32 KB | Keep. Note `.claude/skills/*` are tracked **symlinks** into `.agents/` — these break on Windows checkouts without `core.symlinks` |
| `public/ascenda-banner.png`, `Gemini_Generated_Image_*.png` | **history only**, not in HEAD | ~3.3 MB of blobs | No action — 3 MB in an 11.5 MiB pack is fine |

`git status --porcelain` is **empty**. Ignore hygiene is genuinely good; the only real gaps are the LFS CSVs and
the `.env.local` history.

---

## Unused dependencies

### Remove — 8 packages, zero import sites (verified: `rg "from ['\"]<pkg>|require\(['\"]<pkg>"` across `src/`, `__tests__/`, `scripts/` and every root config → no matches)

| Package | Section | Evidence |
|---|---|---|
| **`openai`** | dependencies | **Zero** references to `from 'openai'`, `OpenAI`, or `OPENAI_API_KEY` anywhere including `.env.example` and CI. Every LLM call goes through `@google/genai` (12 import sites) + `GEMINI_API_KEY`. A dead ~10 MB SDK |
| **`date-fns`** | dependencies | Zero matches for `date-fns` / `date-fns/*`. The app uses native `toLocaleDateString`/`Intl` at 69 sites instead — which is *why* Finding [HIGH] on dates exists |
| **`@dnd-kit/core`** | dependencies | Zero matches; also zero for `DndContext`/`useDraggable`/`useDroppable` |
| **`@dnd-kit/sortable`** | dependencies | Zero matches; zero for `useSortable`/`SortableContext` |
| **`@dnd-kit/utilities`** | dependencies | Zero matches |
| **`@radix-ui/react-popover`** | dependencies | Zero matches. No `src/components/ui/popover.tsx` exists. `bg-popover` hits are Tailwind colour tokens; the two real popovers (`save-search-button.tsx:5`, `StudentIntakeForm.tsx:337`) are hand-rolled |
| **`@testing-library/user-event`** | devDependencies | Zero matches outside package.json/lock. Tests use `fireEvent` from RTL |
| **`baseline-browser-mapping`** | devDependencies | Zero references. Already pulled in transitively by `browserslist` — the explicit devDep is redundant |

### Reclassify / decide

| Package | Verdict | Evidence |
|---|---|---|
| `@tanstack/react-query` | **Provider with zero consumers** | Imported only at `src/app/providers.tsx:3`. **Zero** `useQuery`/`useMutation`/`useQueryClient`/`useInfiniteQuery` anywhere in `src/`. It wraps the whole app for nothing |
| `@tanstack/react-query-devtools` | **Miscategorised** | `src/app/providers.tsx:4`, but sits in `dependencies` — a devtool shipping to production |
| `react-hook-form` + `@hookform/resolvers` | USED, low leverage | Exactly one consumer: `src/components/forms/auth-form.tsx:5-6`. Legitimate, just worth knowing |
| `ts-node` | **KEEP despite no script using it** | `tsx` replaced it in `package.json:24-25`, but Jest 29 needs `ts-node` at runtime to load a **`.ts`** config file, and this repo has `jest.config.ts`. Removing it breaks `npm test`. The four *docs* referencing `npx ts-node` are stale — `README.md:72`, `docs/demo-flow.md:20` (which also names `scripts/reset-demo-state.ts`, **a file that does not exist**), `scripts/all-countries-to-supabase.ts:520`, `__tests__/scoring_validation/batch_runner.ts:7` |

**Verified USED (do not touch), including the non-obvious ones:** `@tiptap/pm` (hard peer of `@tiptap/react@3.22.5`),
`react-dom` (runtime peer of `next`), `@testing-library/dom` + `@types/react-dom` (declared peers of
`@testing-library/react@16`), `tailwindcss-animate` + `@tailwindcss/typography` (`tailwind.config.ts:293-294`),
`autoprefixer` (`postcss.config.js:4`), `identity-obj-proxy` (`jest.config.ts:7`), `@eslint/eslintrc`
(`eslint.config.mjs:4`), `eslint-config-next` (`eslint.config.mjs:33`), `pg` + `@types/pg` (`scripts/apply-sql.ts:13`),
`lenis` (`smooth-scroll.tsx:13` + dynamic `import('lenis')` at `:227`), `papaparse`
(`admin/_components/import-panel.tsx:4` + 6 scripts), `zod`, `tsx`, `typescript`, `jest*`, `ts-jest`.

### Imported but NOT declared — 2 packages resolving only transitively

| Module | Imported at | Risk |
|---|---|---|
| **`@typescript-eslint/eslint-plugin`** | `eslint.config.mjs:5` | Present only via `eslint-config-next`'s tree. `npm run lint` and CI (`ci.yml:64`) break the moment that transitive dep moves. **Declare it** |
| **`jest-environment-node`** | `jest.environment-node.js:17` (`require(…)`) | Present only via `jest`'s tree. **9 test files** route through this wrapper via `@jest-environment` docblocks (`__tests__/chat/route.test.ts`, `__tests__/checklist/route.test.ts`, `__tests__/profile-export.test.ts`, +6). Its sibling `jest-environment-jsdom` **is** declared — this one was missed. **Declare it** |

Also missing: **`@types/papaparse`**. Adding it lets you delete the 6 stale `@ts-ignore`s in `scripts/`
(`upload-all-countries.ts:3`, `update-program-entry-requirements.ts:3`, `upload-ucas.ts:3`,
`ucas-to-supabase.ts:3`, `upload-updated-programs.ts:3`, `all-countries-to-supabase.ts:3`) — though note
`tsconfig.json:48` excludes `scripts/`, so those suppressions are already no-ops.

---

## Stale scaffolding

This is the healthiest part of the audit. Exact counts:

| Signal | Count in `src/` | Detail |
|---|---:|---|
| `TODO` (exact case) | **1** | `src/lib/parent/currency.ts:6` — *"TODO: replace with a live FX feed (Phase 3)"*. Genuine, scheduled, hardcoded FX rates |
| `FIXME` / `HACK` / `XXX` | **0** | — |
| `console.log` / `console.debug` / `debugger` / `alert(` | **0** | — |
| `console.error` / `.warn` / `.info` | 91 | All deliberate catch-block / server logging |
| Commented-out code blocks (3+ lines) | **0** | 7 heuristic candidates read; all 7 are prose docblocks (`use-realtime-poll.ts:6-32`, `api/chat/route.ts:1-29`, …) |
| `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck` | **0** | All 6 `@ts-ignore` live in `scripts/`, which `tsconfig.json:48` excludes |
| `eslint-disable` | 6 | All `react-hooks/exhaustive-deps` on deliberate mount-once effects. `eslint.config.mjs:31` sets `reportUnusedDisableDirectives: 'error'`, so none is dead |

Case-insensitive `todo` rises to 74, but **all 73 extra hits are the `'todo'` value of the `checklist_status`
enum** (`lib/applications/checklist-status-queue.ts:12`, `lib/types/database.ts:2035`, `lib/chat/widgets.ts:64`)
plus the word "Hackathon" in seed fixtures. False positives.

---

## Effort

| # | Item | Risk | Effort | LOC | Order |
|---|---|---|---|---:|---|
| 1 | Delete 10 unreachable files | none — zero refs | 30 min | **−756** | **do first** |
| 2 | Delete 7 dead symbol groups (incl. the 2 Server Actions) | none | 1 h | **−332** | **do first** |
| 3 | Remove 8 unused npm packages; declare the 2 undeclared + `@types/papaparse` | low — verify `npm run build && npm test` | 30 min | — | **do first** |
| 4 | `error.tsx` → `createErrorBoundary` factory (12 files) | none — mechanical, zero behavioural surface | 1 h | −110 | **do first** |
| 5 | Unify score→tier thresholds ([HIGH] finding) | **product decision required** (70/50 vs 80/60) | 2 h + sign-off | −25 | **decide, then do** |
| 6 | Date/relative-time consolidation into `lib/utils/dates.ts` | medium — user-visible strings change; pick a locale | 4 h | −120 | high value |
| 7 | Status/tone/label tables → `categories.ts` (+3 new maps, export `TONE`) | medium — visual diff needs eyes | 6 h | −250…−320 | high value |
| 8 | Counsellor widget quartet → `usePinAndHide` + `<ManageableWidgetList>` | medium — live state machine | 6 h | **−285** | biggest single win |
| 9 | 20 hand-rolled empty states → `EmptyState` | low | 3 h | −120 | |
| 10 | API `requireUser` + error envelope in `lib/api/guards.ts` | medium — wire contract changes for 18 routes | 4 h | −100 | |
| 11 | `<ParentScreen>` + `<CounsellorScreen>` wrappers | low | 4 h | −185 | |
| 12 | Assistant page/loading factories | low | 1 h | −73 | |
| 13 | `localStorage` → `readJSON`/`writeJSON` (18 sites) | low | 2 h | −70 | |
| 14 | Shared `<EssayWorkshopSkeleton/>` | none — also fixes a visible jump | 30 min | −40 | |
| 15 | Small identical constants (`unwrap`, `GRADE_ORDER`, `URGENCY_ORDER`, tier chips) | low | 1 h | −40 | |
| 16 | `<SkeletonGrid>` primitive (41 loops) | low | 2 h | −90 | lowest value |
| 17 | Repo sprawl: untrack LFS CSVs, drop the submodule, delete `demo-script.docx.html` | low | 1 h | — (−438 MB `.git`) | |
| 18 | Rename `landing-preview/` → merge into `landing/`; merge `lib/hooks/`→`hooks/`, `types/`→`lib/types/` | none | 1 h | — | cosmetic |

### Totals

- **Immediate, zero-risk deletion (items 1–4): ~1,200 LOC + 8 packages.**
- **Full consolidation (items 5–16): a further ~1,400 LOC.**
- **Combined: ~2,500 LOC, ≈3.5% of `src/`** — plus ~438 MB off `.git`.

### One process recommendation

Six of the ten dead files were **restyled on 2026-07-26** by the token-migration passes. Adding
`npx knip` (or `ts-prune`) to `.github/workflows/ci.yml` as a non-blocking report would have caught every entry in
the delete list, and would stop the next redesign from paying to maintain components no route renders.
