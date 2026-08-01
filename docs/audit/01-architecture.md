# Ascenda — Architecture, module boundaries & layering audit

Scope: dependency graph, layering, feature structure, where logic lives, cycles/god-modules,
cross-cutting concerns, server/client boundary as an architectural rule, type homes.
Read-only. Every claim below is backed by `file:line` or a measured count.

Method: full static import graph built over all 441 `.ts`/`.tsx` files under `src/`
(alias `@/*` → `src/`, plus relative resolution), plus targeted `rg` sweeps.
Script used: `scratchpad/graph.mjs`.

---

## Current state

### 1. Census

| Layer | Files | Notes |
|---|---:|---|
| `src/app` | 209 | 46 pages, 23 `route.ts`, 14 `error.tsx`, 74 `'use client'` |
| `src/components` | 141 | 20 subdirs + 3 loose files at root, 116 `'use client'` |
| `src/lib` | 78 | 22 subdirs + 5 loose files at root, 3 `'use client'` |
| `src/hooks` | 11 | all `'use client'` |
| `src/types` | 1 | `papaparse.d.ts` — `declare module 'papaparse'`, **zero `@/types` imports anywhere** |
| **Total** | **441** | 69,899 LOC, 1,350 resolved import edges |

Only 2 barrel files exist (`src/components/assistant/widgets/index.tsx`,
`src/components/university-search/filters/index.ts`) — barrel-file bloat is **not** a problem here.

### 2. The real layer graph

Measured edge counts between top-level directories (1,350 edges total):

```
  313  app        -> lib
  312  app        -> components
  236  components -> lib
  178  components -> components
  128  app        -> app
  120  lib        -> lib
   26  components -> hooks
   17  hooks      -> lib
    9  app        -> hooks
    8  hooks      -> hooks
    2  (middleware.ts) -> lib
    1  hooks      -> components     <-- inversion
```

The coarse layering is **almost** clean, and that is genuinely good:

- `rg "from '@/components" src/lib` → **0 hits**
- `rg "from '@/app" src/lib` → **0 hits**
- `rg "from '@/app" src/components` → **0 hits**
- `rg "from '@/hooks" src/lib` → **0 hits**

One inversion exists: `src/hooks/use-search-results.ts:20`
`import { ProgramSearchResult, tierFromScore } from '@/components/university-search/types';`

But "clean at the alias level" is masking the real problem: **there is nothing enforcing it**
(see HIGH-1), and the directories themselves are not layers — they are file-type buckets
(see HIGH-2).

### 3. Cycles

Exactly **one** true cycle, entirely inside one route family:

```
src/app/counsellor/_components/student-roster.tsx:10   import type { DashboardFilter } from '../page'
  -> src/app/counsellor/page.tsx:18                    export type { DashboardFilter } from './_dashboard-client'
  -> src/app/counsellor/_dashboard-client.tsx:19       import { StudentRoster } from './_components/student-roster'
  -> (back to student-roster.tsx)
```

`src/app/counsellor/page.tsx:16-18` even documents it:
`// Re-exported for student-roster.tsx and the students page client, which import this type from '../page'.`

A second, cross-route instance of the same anti-pattern (not a cycle, but worse in principle):
`src/app/counsellor/students/_students-page-client.tsx:6`
`import type { DashboardFilter } from '../page';` — a **different route's** page module.

Near-cycle across directories: `src/components/landing/scroll-reveal-heading.tsx:5` imports
`@/components/landing-preview/ascent-scroll`, while four `landing-preview/*` files import
`@/components/landing/*` (`step-shots.tsx:6-7`, `comparison-settle.tsx:6-7`,
`how-it-works-scrub.tsx:5`, `preview-hero.tsx:22`). Two directories, mutually dependent,
no owner.

### 4. God-modules (fan-in)

| Fan-in | Module | Verdict |
|---:|---|---|
| 139 | `src/lib/utils.ts` | fine — it's `cn()` + `getInitials()`, 49 lines |
| 56 | `src/lib/supabase/server.ts` | fine, but every caller is a route (see HIGH-5) |
| 45 | `src/components/ui/button.tsx` / `ui/skeleton.tsx` | fine — design primitives |
| 37/35 | `src/components/layout/page-hero-skeleton.tsx` / `page-hero.tsx` | fine |
| 35 | `src/lib/utils/dates.ts` | fine |
| 34 | `src/lib/motion.ts` | **presentation module in `lib/`** |
| 31 | `src/lib/theme/categories.ts` | **presentation module in `lib/`** (imports 25 lucide icons) |
| 21 | `src/lib/data/student-demo-data.ts` | 650 lines of fixtures, in production import paths |

No pathological god-module. The fan-in profile is healthy.

### 5. De-facto feature slices — and where each one is smeared

Every slice is split across 3–5 top-level homes. Counts are `.ts`/`.tsx` files.

| Slice | `app/` route | `app/api/` | `app/**/_components` | `components/` | `lib/` | `hooks/` | Homes |
|---|---:|---:|---:|---:|---:|---:|---:|
| counsellor | 60 | 4 | (31 of the 60) | 1 (`components/counsellor`) | 6 (`lib/counsellor`) | – | **4** |
| parent | 21 | 1 | 2 + `_lib/context.ts` | 0 | 5 (`lib/parent`) | – | **3** |
| chat / assistant | 3 pages | 4 | – | 15 (`assistant` 12 + `chat` 3) | 19 (`lib/chat` + `lib/chat/tools`) | 1 (`use-chat-stream`) | **5** |
| search | 16 + 5 in `(university-info)` | 3 | 1 | 22 (`university-search`) + 2 loose `university-card*` | 1 (`lib/university-search`) | 1 (`use-search-results`, 1010 LOC) | **6** |
| matching / scoring | 3 (`/matches`) | 2 | – | 2 (`components/match`) + 1 (`components/programs`) | 8 (`matching` 4 + `scoring` 3 + `tiering` 1) + `theme/fit-score.ts` | – | **5** |
| applications | 8 | 2 (`track`, `checklist`) | – | 7 | 4 (`lib/applications`) | – | **4** |
| profile | 8 + 3 `_components` | 2 | 3 | 2 + `components/inputs` (orphan) | 5 (`lib/profile`) + `lib/validation/profile.ts` | – | **5** |
| toolbox | 13 | 1 (`essay-assist`) | – | 8 | 1 (`lib/config/toolbox.ts`) | – | **4** |
| help / inbox | 3 (`/inbox`) + 3 (`/counsellor/inbox`) | – | 2 | 2 (`components/help`) | 3 (`lib/demo/help-request-*`) | 2 | **5** |
| shortlist | 2 pages | – | – | `components/university-search/shortlist-store.ts` | `lib/shortlist/server.ts` | – | **3** |
| landing | `app/page.tsx` | – | – | 7 + 16 (`landing` + `landing-preview`) | – | – | **2** |

Nothing named `feature`, `module`, or `domain` exists. `docs/architecture.md:41-42` states the
intended rule — *"Components are grouped by domain under `src/components/`; page-private pieces
live in `_components/` folders next to their route"* — and the code does not follow it (HIGH-3).

### 6. `_components` vs `components/<feature>` — no rule is being applied

8 of 18 `components/*` subdirectories are imported by **exactly one** route family, i.e. they
are page-private components sitting in the shared bucket:

```
components/applications  <= app/applications only
components/counsellor    <= app/counsellor only
components/dashboard     <= app/dashboard only
components/forms         <= app/(auth) only
components/match         <= app/matches only
components/scholarships  <= app/scholarships only
components/toolbox       <= app/toolbox only
components/inputs        <= NOBODY (src/components/inputs/subject-grade-table.tsx has 0 importers)
```

And the same feature is split across both homes, in opposite directions:

| Feature | `app/**/_components` | `components/<feature>` |
|---|---:|---:|
| counsellor | **31** | 1 |
| dashboard | 3 | **15** |
| profile | 3 | 2 |
| course | 15 | 0 |
| applications | 0 | 7 |

`src/app/counsellor/_components/` is not "page-private" at all — 9 distinct files across
7 different routes import from it (`applications/page.tsx:3`, `deadlines/page.tsx:5`,
`documents/page.tsx:3`, `outcomes/page.tsx:3`, `inbox/page.tsx`, `students/[id]/page.tsx:11-13`,
`students/_students-page-client.tsx:5`, `_dashboard-client.tsx:10-20`, `_analytics-client.tsx`).
It is a 31-file feature component library wearing a `_`-prefix that says "private".

### 7. Cross-cutting concerns and their (missing) homes

| Concern | Home | Re-implementations |
|---|---|---|
| **Auth / session** | none | `supabase.auth.getUser()` in **56 files**; `redirect('/login')` in **20 files** |
| **Portal context** | `src/app/parent/_lib/context.ts:20` (`resolveParentContext`) — good pattern | exists for `/parent` only; student & counsellor duplicate inline |
| **Route-handler guards** | `src/lib/api/guards.ts` (23 lines) | imported by **8 of 23** `route.ts` files |
| **Error handling (UI)** | 14 `error.tsx` boundaries + `components/ui/error-state.tsx` (12 importers) | reasonable |
| **Error handling (API)** | none | 56 ad-hoc `NextResponse.json({ error … })` shapes across 23 routes |
| **Logging** | **none** — no logger module, no `pino`/`winston` | 91 raw `console.*` calls (app 39, components 23, lib 20, hooks 9) |
| **Feature flags** | **none** | 4 env-var toggles read inline: `NEXT_PUBLIC_FLAGGED_PROGRAM_IDS`, `NEXT_PUBLIC_DEMO_PROGRAM_IDS`, `NEXT_PUBLIC_DEMO_EMAIL`, `NEXT_PUBLIC_ANALYTICS_ENDPOINT` |
| **Demo mode** | `src/lib/demo/` (5 files) — a real seam, documented in `docs/architecture.md:44-63` | 20 files import it; but `DEMO_COHORT_EMAIL_SUFFIX` is hardcoded at `src/lib/counsellor/data.ts:59` and `student-demo-data.ts` is imported by 21 production files |
| **localStorage** | `src/lib/utils/local-storage.ts` (`readJSON`/`writeJSON`) | **2 importers**. 18 other files use raw `localStorage.*` — **52 call sites**, **25 distinct key literals**, only 1 key is a named constant (`lib/constants.ts:1`) |
| **Client data fetching** | `@tanstack/react-query` mounted at `src/app/providers.tsx:21` | **0 `useQuery`/`useMutation` in the entire codebase**; 15 client components hand-roll `useEffect` + fetch |
| **Analytics** | `src/lib/analytics.ts` | 4 importers — fine |

### 8. Server/client boundary as an architectural rule

What is respected:
- `lib/supabase/server.ts` (56 importers) is imported **only** from `src/app` — never from
  `components/` or `hooks/`. Verified: no `'use client'` file imports it.
- Data-layer modules take an **injected** client rather than constructing one — the correct
  pattern, applied consistently: `lib/counsellor/data.ts:38`, `lib/parent/data.ts:36`,
  `lib/matching/service.ts:24`, `lib/chat/context.ts:28`, `lib/chat/history.ts:20`,
  `lib/profile/persist-intake.ts:13`, `lib/applications/server-actions.ts:11`,
  `lib/shortlist/server.ts:8`. Only `lib/demo/use-is-demo-user.ts:16` self-constructs
  (a browser hook, so legitimate).
- Server actions are extracted into pure writers so scripts can reuse them
  (`lib/profile/persist-intake.ts:1-6`, `lib/applications/server-actions.ts:1-7`).

What is **not** enforced:
- The `server-only` package is not a dependency and `import 'server-only'` appears **zero**
  times. Nothing structurally prevents a secret-bearing module reaching a client bundle.
- `src/lib/chat/gemini.ts:21` constructs `new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })`
  at module scope, in the same directory as `lib/chat/widgets.ts`, `actions.ts`, `sse.ts`,
  `paths.ts` — which **are** imported by client components (`components/chat/chatbot-widget.tsx:26-27`,
  `components/assistant/assistant-workspace.tsx:32-33`, `hooks/use-chat-stream.ts:18-21`).
  Today the chain to `gemini.ts` is type-only (`widgets.ts:15` → `import type { ProgramHit } from './tools'`)
  so nothing leaks — but that safety is one `import type` → `import` edit away from evaporating,
  with no compile-time signal.
- `src/lib/supabase/service.ts:11-13` hand-rolls the guard
  (`if (typeof window !== 'undefined') throw`) because the real mechanism is absent.
  That module has exactly 1 importer, and it's outside `src/` (`scripts/seed-students.ts:34`).

### 9. Type homes

- `src/types/` — **1 file**, `papaparse.d.ts`, content: `declare module 'papaparse';`.
  `rg "@/types"` → **0 hits**. It is an ambient-declaration folder, not a type layer.
- `src/lib/types/` — the real home: `database.ts` (2,740 lines, generated) + `demo-tables.ts`
  (48 exported types, manual).
- Beyond that, domain types are scattered across **8 files named `types.ts`** in 4 different
  layers:
  `lib/counsellor/types.ts` (17 exports), `lib/parent/types.ts` (11), `lib/matching/types.ts` (2),
  `lib/chat/tools/types.ts` (6), `components/university-search/types.ts`,
  `components/scholarships/types.ts`, `app/counsellor/_components/types.ts`,
  `app/course/[id]/_components/types.ts`.
- Worse, one slice splits its types across two files with no rule:
  `lib/counsellor/types.ts` holds `CounsellorStudent` etc., while `lib/counsellor/data.ts:73-510`
  also exports 6 domain types (`DeadlineWithStudent`, `ActivityItem`, `CohortStats`,
  `OutcomeStats`, `ProgramInfo`, `RosterStudent`). `_dashboard-client.tsx:8-9` imports from
  **both**.

### 10. Enforcement tooling

`eslint.config.mjs` (58 lines) enables exactly two things beyond `next/core-web-vitals`:
`reportUnusedDisableDirectives` and `@typescript-eslint/no-unused-vars`.
No `no-restricted-imports`, no `import/no-restricted-paths`, no `eslint-plugin-boundaries`,
no `dependency-cruiser`, no `madge`. Grep confirms: zero hits in `package.json` and
`eslint.config.mjs`.

**The layering that exists today is held together entirely by author discipline.** That is why
this audit is worth acting on now rather than later: the graph is still ~95% clean, so the fence
is cheap to install. Every month it stays uninstalled, it gets more expensive.

---

## Findings

### [HIGH] A1 — Nothing enforces any module boundary

**Evidence.** `eslint.config.mjs:22-57` — the whole rule set is `reportUnusedDisableDirectives`
plus `@typescript-eslint/no-unused-vars`. No import-boundary rule of any kind; no
dependency-cruiser config; `madge` is not installed. The one existing inversion
(`src/hooks/use-search-results.ts:20` → `@/components/university-search/types`) and the one
cycle (`app/counsellor/_components/student-roster.tsx:10` → `../page`) both passed CI.

**Why it hurts.** The clean `lib ↛ components`, `components ↛ app` property is currently an
accident of good authorship across ~441 files. Nothing tells the next contributor (human or
agent) that it is a rule, and nothing catches the first violation. Layering degrades
monotonically once unenforced — you never get it back without a big-bang refactor.

**Refactor.**
1. Add `dependency-cruiser` (devDep) with a `.dependency-cruiser.cjs` encoding the rules in the
   Target architecture section, plus `no-circular` (severity `error`) and `no-orphans`
   (severity `warn`).
2. Add `npm run depcruise` and wire it into the CI job next to `lint`/`typecheck`.
3. Simultaneously add `server-only` as a dependency and `import 'server-only'` to
   `lib/supabase/server.ts`, `lib/supabase/service.ts`, `lib/chat/gemini.ts`,
   `lib/chat/tools.ts`, `lib/chat/tools/*`, `lib/counsellor/data.ts`, `lib/parent/data.ts`.
   That converts a whole class of leak from "runtime surprise" to "build error".
4. Do this **before** any file moves — it is the ratchet that makes the rest of the migration safe.

---

### [HIGH] A2 — The codebase is organised by technical type, not by feature

**Evidence.** Section 5 above. Counsellor code lives in 4 homes
(`app/counsellor/` 60 files, `app/api/counsellor/` 4, `components/counsellor/` 1,
`lib/counsellor/` 6). Search lives in 6. Chat/assistant in 5. Matching in 5, and its own name is
split three ways (`lib/matching/`, `lib/scoring/`, `lib/tiering/`, plus `lib/theme/fit-score.ts`).

**Why it hurts.** Three concrete costs, all measurable today:

1. *Change amplification.* Touching one feature means editing 3–5 directories. The counsellor
   decks feature landed in `lib/counsellor/decks.ts`, `app/api/counsellor/decks/*` (3 routes),
   `app/counsellor/universities/_universities-client.tsx`, and
   `app/university-search/quests/_quests-client.tsx` — five directories for one feature.
2. *No deletable unit.* `docs/architecture.md:44-63` lists five demo seams to be removed at
   launch. None of them is a directory you can delete; each is a grep across the tree.
3. *No parallelism boundary for agents.* `CLAUDE.md:5` mandates parallel Opus subagents. With
   type-based layout, two agents on two features collide in `components/` and `lib/`. With
   slice-based layout they don't.

**Refactor.** Move to a feature-sliced tree (full target below). The key move is that
`src/features/<slice>/` owns its `api/`, `model/`, `ui/`, `hooks/`, and exposes a single
`index.ts`. `src/app/` shrinks to routing + composition.

---

### [HIGH] A3 — `_components` vs `components/<feature>` is decided by coin-flip

**Evidence.** Section 6. `app/counsellor/_components/` = 31 files but is imported by
9 files across 7 sibling routes (`counsellor/applications/page.tsx:3`,
`counsellor/deadlines/page.tsx:5`, `counsellor/documents/page.tsx:3`,
`counsellor/outcomes/page.tsx:3`, `counsellor/students/[id]/page.tsx:11-13`,
`counsellor/students/_students-page-client.tsx:5`, …) — so it is shared, not private.
Meanwhile `components/dashboard/` = 15 files consumed by `/dashboard` alone — private, but shared-located.
`components/inputs/subject-grade-table.tsx` has **zero** importers.
Two files even share a name across the split: `app/profile/_components/profile-progress-card.tsx`
and `components/dashboard/hub/profile-progress-card.tsx` (different components, different props).

**Why it hurts.** "Where does this component go?" has no answer, so every contributor invents
one, and the split is now uncorrelated with actual sharing. Import paths carry no information
about reach, so nobody can tell what breaks when they change a component.

**Refactor.** One rule, mechanically checkable:
`_components/` is for components imported by **exactly one** `page.tsx`/`layout.tsx` in the
**same directory**. Anything wider moves to `features/<slice>/ui/`. Enforce with a
dependency-cruiser rule forbidding `^src/app/(.+)/_components/` from being imported outside
`^src/app/$1/`. Under that rule, `app/counsellor/_components/` (31 files) → `features/counsellor/ui/`,
and `components/dashboard/`, `components/applications/`, `components/toolbox/`,
`components/match/`, `components/scholarships/`, `components/counsellor/`, `components/forms/`
move into their slices.

---

### [HIGH] A4 — Route modules are imported as libraries; one real cycle

**Evidence.**
- `src/app/counsellor/_components/student-roster.tsx:10` — `import type { DashboardFilter } from '../page';`
- `src/app/counsellor/page.tsx:18` — `export type { DashboardFilter } from './_dashboard-client';`
  (with `page.tsx:16-17` explaining that the re-export exists purely to serve those importers)
- `src/app/counsellor/students/_students-page-client.tsx:6` — same import, from a **different route**
- `src/app/profile/_components/StudentIntakeForm.tsx:18` — `import { saveStudentIntake } from '../actions';`

**Why it hurts.** `page.tsx` is a framework entry point, not a module. It carries
`export const dynamic = 'force-dynamic'`, `metadata`, and a server-only default export
(`counsellor/page.tsx:2` imports `createServerSupabaseClient`). Importing from it couples a
client component to a server route's module graph and creates a cycle the bundler has to break.
These are type-only today so they erase at runtime — but the graph shape is wrong, and one
non-type import turns it into a real bundling problem.

**Refactor.** `DashboardFilter` is a domain type: move it to `features/counsellor/model/types.ts`
next to `CounsellorStudent`. Delete the re-export at `counsellor/page.tsx:18`. `saveStudentIntake`
moves to `features/profile/api/actions.ts`. **Rule: nothing imports from `page.tsx`, `layout.tsx`,
`route.ts`, `error.tsx`, or `loading.tsx`.** Add it to dependency-cruiser.

---

### [HIGH] A5 — Auth/authz has no home; 56 files re-derive the session

**Evidence.**
- `supabase.auth.getUser()` appears in **56 files** (`middleware.ts:46`, 20 page/layout files,
  16 route handlers, 8 components, 5 hooks, `lib/counsellor/decks.ts`, `lib/demo/use-is-demo-user.ts`).
- `redirect('/login')` appears in **20 files**.
- `src/lib/api/guards.ts` (23 lines total) is imported by **8 of 23** route handlers.
- The good pattern exists in exactly one place: `src/app/parent/_lib/context.ts:20`
  `resolveParentContext()` — auth + scoping + redirect in one call, used by all four `/parent`
  sub-pages (`deadlines/page.tsx:6`, `finances/page.tsx:6`, `messages/page.tsx:5`, `progress/page.tsx:5`).
- Placement is inconsistent even inside one segment: `app/university-search/layout.tsx:7-15`
  guards, and `app/university-search/quests/page.tsx` guards again; but
  `app/(university-info)/university-search/university/[id]/page.tsx` — same URL prefix — has
  **no guard at all** (relies solely on `middleware.ts:182`).
- `app/applications/layout.tsx:18-19` documents the correct reason layouts can't be the guard;
  `app/counsellor/layout.tsx:16-18` guards in the layout anyway.

**Why it hurts.** Access control is the highest-consequence cross-cutting concern in the app and
it is copy-pasted 56 times with at least three different placement conventions. Changing the
policy (e.g. re-restricting counsellor access — `lib/api/guards.ts:15-20` and
`app/counsellor/layout.tsx:8-11` both document that rollback) means finding and editing every
copy. The project already shipped one auth-bypass to production from a structural mistake
(`CLAUDE.md:122`, `middleware.ts` at the wrong path).

**Refactor.** Create `src/shared/auth/`:
```ts
// shared/auth/server.ts   ('server-only')
requireUser(): Promise<{ supabase, user }>              // redirect('/login') on miss
requireRole(role): Promise<{ supabase, user, profile }> // redirect on mismatch
// shared/auth/portal.ts
resolveStudentContext() / resolveCounsellorContext() / resolveParentContext()  // generalise app/parent/_lib/context.ts
// shared/auth/route.ts
withAuth(handler) / withRole(role, handler)             // wraps NextResponse error shape too
```
Then: 20 page guards → `const { supabase, user } = await requireUser();`
16 route guards → `export const POST = withAuth(async ({ supabase, user }, req) => …)`.
Deletes ~150 lines and makes the counsellor-access rollback a one-file change.

---

### [MEDIUM] A6 — Domain modules are hiding under `src/components/`, forcing an inversion

**Evidence.** 8 non-`.tsx` modules live under `components/`, and several are pure domain:
- `src/components/university-search/types.ts:4-49` — the `ProgramSearchResult` domain type
  **and** `tierFromScore()`, business logic. Imported by `src/hooks/use-search-results.ts:20`
  (the one `hooks → components` edge) and `app/university-search/shortlist/page.tsx`.
- `src/components/university-search/shortlist-store.ts` — Supabase data access
  (`getBrowserSupabaseClient` at line 4, `TABLE_NAME = 'shortlisted_programs'` at line 22,
  feature-detection at lines 25-30). Imported by 8 files including
  **`src/lib/parent/data.ts:365` and `src/lib/shortlist/server.ts:2-3` — by comment only**,
  because the lib layer *can't* import it. `lib/shortlist/server.ts:10` therefore redeclares
  `const TABLE_NAME = 'shortlisted_programs'` and its header says it "mirrors the row shape"
  of the component-layer store. **One table, two writers, kept in sync by a comment.**
- `src/components/university-search/saved-search-store.ts`, `components/scholarships/types.ts`,
  `components/scholarships/utils.ts:3` (`filterScholarships` — pure domain filtering),
  `components/layout/navigation.ts` (the app's route registry, 14 importers),
  `components/landing-preview/cta-choreography.ts`.

**Why it hurts.** It inverts the dependency direction (`hooks → components`), and it makes a
domain rule unreachable from the layer that needs it — which is exactly how
`lib/shortlist/server.ts` ended up duplicating the shortlist row contract.

**Refactor.** Move each to its slice's `model/` or `api/`:
`university-search/types.ts` → `features/search/model/program.ts`;
`shortlist-store.ts` + `lib/shortlist/server.ts` → `features/shortlist/` (one `TABLE_NAME`, one
row shape, a client store and a server writer sharing it);
`saved-search-store.ts` → `features/search/model/saved-searches.ts`;
`scholarships/{types,utils}.ts` → `features/scholarships/model/`;
`layout/navigation.ts` → `shared/layout/navigation.ts`.
Kills the `hooks → components` edge entirely.

---

### [MEDIUM] A7 — `src/lib/` is three unrelated things at once

**Evidence.** `src/lib` currently contains, in one namespace:
1. **Infrastructure** — `supabase/` (3), `api/` (2), `utils/` (3), `validation/` (2), `types/` (2).
2. **Domain** — `matching/`, `scoring/`, `tiering/`, `counsellor/`, `parent/`, `profile/`,
   `chat/`, `applications/`, `catalog/`, `shortlist/`, `university-search/`.
3. **Presentation** —
   - `src/lib/theme/categories.ts` — 25 lucide-react icon imports (lines 1-28) and Tailwind class
     tokens; exports `TIER_VISUAL`, `PRIORITY_VISUAL`, `DOC_STATUS_VISUAL`, `TASK_VISUAL`,
     `DEADLINE_VISUAL`, `SCHOLARSHIP_VISUAL`, `TOOL_VISUAL`, `SIGNAL_VISUAL`, `NOTE_VISUAL`.
     **31 importers.** This is the design system.
   - `src/lib/motion.ts` — framer-motion variants and easing curves. **34 importers.**
   - `src/lib/constants/text.ts` — UI copy (`ACTION_TEXT`, `MATCHES_TEXT`).
4. **React hooks** — 3 files with `'use client'` and `import … from 'react'`:
   `lib/applications/use-checklist-status-queue.ts`, `lib/demo/use-is-demo-user.ts`,
   `lib/hooks/use-search-param-state.ts` (6 importers) — while `src/hooks/` exists with 11 files.
5. **Fixtures** — `lib/data/student-demo-data.ts`, 650 lines, imported by 21 production files.

Plus two same-named siblings: `src/lib/constants.ts` (2 lines) and `src/lib/constants/text.ts`
(46 lines); `src/lib/chat/tools.ts` (206 lines) and `src/lib/chat/tools/` (7 files) — the
specifier `'./tools'` resolves to the file, which is why `lib/chat/tools/registry.ts:8` writes
`from '../tools'` to reach *out of* the directory named `tools` into the file named `tools`.

**Why it hurts.** `@/lib/x` carries no information about what `x` is or where it may be used.
A reviewer cannot tell from the import whether a module is server-only, client-safe, domain,
or a design token. That is precisely the ambiguity that made A8 possible.

**Refactor.** Split `lib` into three named layers:
`shared/design/` (motion.ts, categories.ts, constants/text.ts), `shared/lib/` (dates, flag,
storage, cn, validation), `features/<slice>/{api,model}/`. Move the 3 stray hooks into
`src/hooks/` or the owning slice; delete `src/lib/hooks/`. Rename `lib/chat/tools.ts` →
`lib/chat/tools/search-programs.ts` to kill the file/dir collision.

---

### [MEDIUM] A8 — No compile-time server/client fence

**Evidence.** `rg "import 'server-only'" src` → 0 hits; `server-only` is not in `package.json`.
`src/lib/chat/gemini.ts:21` holds `GEMINI_API_KEY` at module scope. `src/lib/chat/` mixes that
with `widgets.ts`, `actions.ts`, `sse.ts`, `paths.ts`, all imported by client components
(`components/chat/chatbot-widget.tsx:26-27`, `components/assistant/assistant-workspace.tsx:32-33`,
`components/assistant/conversation-rail.tsx:25`, `components/chat/shared.tsx:30`,
`hooks/use-chat-stream.ts:18-21`). `src/lib/supabase/service.ts:11-13` hand-rolls
`if (typeof window !== 'undefined') throw` — proof the need is understood but the mechanism is missing.

**Why it hurts.** The only thing keeping `GEMINI_API_KEY` out of the client bundle is that
`lib/chat/widgets.ts:15` says `import type` and not `import`. That distinction is invisible in
review and is exactly the class of mistake `server-only` exists to make impossible.

**Refactor.** Add `server-only`; import it at the top of every server module (list in A1).
Split `lib/chat/` into `features/chat/api/` (server: gemini, tools, context, history, prompts)
and `features/chat/model/` (isomorphic: sse, actions, widgets, paths, mode). Then a bad import
fails the build.

---

### [MEDIUM] A9 — Domain rules duplicated because no module owns them

Direct consequence of A2/A6. Measured duplicates:

| Rule | Implementations |
|---|---|
| University-search stop-words + tokenisation | **4** — `hooks/use-search-results.ts:43,154`; `lib/chat/tools.ts:101-114`; `app/api/search/suggestions/route.ts:30,88-94`; `app/counsellor/universities/_universities-client.tsx:64-65,204` |
| Fit-score → tier | **2** — `components/university-search/types.ts:46`; `lib/counsellor/data.ts:104` (both delegate to `lib/theme/categories.ts:236`, but via two different wrappers with two different return types) |
| `normalizeLocation` | **2** — `app/course/[id]/_components/course-data.ts:6`; `app/(university-info)/university-search/university/[id]/page.tsx:44` (different signatures) |
| Currency formatting | **5** — `lib/parent/currency.ts:42`; `app/university-search/search/page.tsx:84`; `app/course/[id]/_components/course-data.ts:14`; `components/university-search/university-information.tsx:73`; `components/university-search/ComparisonModal.tsx:50` |
| University monogram | **2** — `components/university-card.tsx:97-100`; `components/landing/product-widgets.tsx:132-135` (byte-identical) |
| Shortlist table + row shape | **2** — `components/university-search/shortlist-store.ts:22`; `lib/shortlist/server.ts:10` |

**Why it hurts.** "Which programmes does this query match?" now has four answers depending on
which surface you're on — the search page, the counsellor deck builder, the chat tool, and the
suggestions endpoint can each disagree. That is a correctness bug waiting to be reported as a
UX inconsistency.

**Refactor.** `features/search/model/query.ts` (tokenise, stop-words, sanitise, ranking bands) —
all four call sites import it. `shared/lib/format.ts` for currency + location. `features/shortlist/model/row.ts`
for the shortlist contract. Each is a small, safe, test-coverable extraction.

---

### [MEDIUM] A10 — Substantial business logic lives in route/component files

**Evidence** (largest offenders; LOC measured):

| File | LOC | What's inside that isn't presentation |
|---|---:|---|
| `src/hooks/use-search-results.ts` | 1,010 | Lines 43-500 are query building, PostgREST select strings (`buildSelect`, line 314), ranking, tuition/duration normalisation, error mapping. The actual hook starts at line 502. |
| `src/app/counsellor/universities/_universities-client.tsx` | 986 | Its own Supabase queries, its own tokeniser (lines 64-65), deck-card rarity ordering (line 57), a modal a11y hook (line 73) |
| `src/app/profile/_components/StudentIntakeForm.tsx` | 2,553 | Largest non-generated file in the repo, inside a route's `_components` |
| `src/app/university-search/search/page.tsx` | 738 | `FacetSections` component (line 110) + `UnifiedSearchInner` (line 199) + fallback facet data (lines 59-75) + `formatGbp` (line 84) |
| `src/app/course/[id]/_components/course-data.ts` | 358 | A whole formatting/mapping layer inside a route folder |
| `src/app/dashboard/page.tsx` | 507 | Multi-table data assembly + pipeline-stage derivation inline in the server component |
| `src/app/api/chat/route.ts` | 322 | Largest of 23 routes (2,443 route LOC total) |

**Why it hurts.** None of this is unit-testable without a React renderer or a Next request
context. The `__tests__/` suite (27 test files) covers `lib/scoring`, `lib/matching`,
`lib/applications`, `lib/chat` — precisely the code that *was* extracted. The 1,010-line search
hook has no equivalent.

**Refactor.** For each: extract the pure part to `features/<slice>/model/`, leave the React part.
`use-search-results.ts` → `features/search/model/query.ts` + `features/search/api/search-programs.ts`
+ a ~150-line hook. `_universities-client.tsx` → `features/counsellor/api/university-search.ts` +
UI. `StudentIntakeForm.tsx` → step components under `features/profile/ui/intake/`.
Do these opportunistically, not as a big bang — each is independently shippable.

---

### [MEDIUM] A11 — Two type homes, one of them empty; slice types split across files

**Evidence.** `src/types/` = 1 file (`papaparse.d.ts`, one line), **0 `@/types` imports**.
`src/lib/types/` = the real home. Plus 8 `types.ts` files scattered across 4 layers (section 9),
and `lib/counsellor/data.ts:73-510` exporting 6 domain types that belong next to the 17 in
`lib/counsellor/types.ts` — `_dashboard-client.tsx:8-9` imports from both.

**Why it hurts.** Small but real: "where is this type?" costs a grep every time, and the
`data.ts`/`types.ts` split means a data-layer refactor drags type consumers with it.

**Refactor.** Delete `src/types/`; move `papaparse.d.ts` to `src/lib/types/vendor.d.ts`
(or drop it — `papaparse` ships types since 5.x; confirm first). Move the 6 types out of
`lib/counsellor/data.ts` into `types.ts`. Establish: generated/global types in
`shared/types/`, slice types in `features/<slice>/model/types.ts`, nowhere else.

---

### [MEDIUM] A12 — `localStorage` is a distributed subsystem with 25 keys and no registry

**Evidence.** `src/lib/utils/local-storage.ts` (`readJSON`/`writeJSON`, with the SSR guard and
quota handling) has **2 importers** (`app/counsellor/_components/use-custom-widgets.ts:4`,
`app/counsellor/_components/widget-grid-core.tsx`). 18 other files call `localStorage.*`
directly — **52 call sites**. **25 distinct `ascenda-*` key literals**, only one of which is a
named constant (`lib/constants.ts:1`). Keys include user-scoped state
(`ascenda-university-shortlist-v2`, `ascenda-intake-draft`, `ascenda-saved-searches-v1`,
`ascenda-parent-child`, `ascenda-role`, `ascenda-is-demo`).

**Why it hurts.** localStorage is doing real product work here (the shortlist falls back to it
per `CLAUDE.md:90`). With no registry there is no way to enumerate what's stored, no way to
clear it on logout/user-switch, no migration story, and 17 places re-implementing the SSR and
parse guards the helper already solved.

**Refactor.** `shared/storage/keys.ts` — a typed const map of all 25 keys with their value
shapes. `shared/storage/index.ts` — `read`/`write`/`remove`/`clearUserScoped()`. Rewrite the 52
call sites to go through it (mechanical). Then a lint rule banning bare `localStorage.` outside
`shared/storage/`.

---

### [LOW] A13 — React Query is mounted and entirely unused

**Evidence.** `src/app/providers.tsx:3-4,18,21,36` mounts `QueryClientProvider` +
`ReactQueryDevtools`. `rg "useQuery|useMutation" src` → **0 hits**. Meanwhile 15 client
components hand-roll `useEffect` + fetch/Supabase (`hooks/use-search-results.ts`,
`app/counsellor/universities/_universities-client.tsx`, `components/university-search/IntelligentSearchBar.tsx`,
`app/course/[id]/CoursePageClient.tsx`, …), and there's a bespoke polling hook
(`hooks/use-realtime-poll.ts`, 6 consumers).

**Why it hurts.** Two dependencies + a provider + devtools in the tree for zero benefit, and a
false signal to every new contributor about what the client data-fetching strategy is.

**Refactor.** Pick one and commit. Either (a) remove `@tanstack/react-query` +
`@tanstack/react-query-devtools` and the provider, and formalise `use-realtime-poll` as the
strategy; or (b) keep it and migrate the 15 hand-rolled fetchers, starting with
`use-search-results.ts`. (a) is 30 minutes; (b) is a project. Do (a) now, revisit (b) later.

---

### [LOW] A14 — No logging abstraction

**Evidence.** 91 `console.*` calls (app 39, components 23, lib 20, hooks 9). No logger module,
no `pino`/`winston`. `lib/analytics.ts:16` uses `console.info` gated on `NODE_ENV`.

**Refactor.** `shared/observability/logger.ts` — level, `NODE_ENV` gate, structured payload,
one place to later point at a real sink. Replace `console.*` in `lib/` and `app/api/` first
(where server logs matter); leave component-level `console.error` in error boundaries.

---

### [LOW] A15 — Route groups are ad-hoc; one exists to escape a sibling's auth guard

**Evidence.** Three route groups, three unrelated conventions: `(auth)` (role), `(university-info)`
(feature), `toolbox/(shell)` (chrome). `src/app/(university-info)/university-search/university/[id]/`
serves a URL under `/university-search/` but bypasses `src/app/university-search/layout.tsx:7-15`
— which is where that segment's auth guard and nav live. Its own layout
(`(university-info)/…/layout.tsx:17-19`) is 3 lines with a 14-line comment explaining the
workaround, and `_components/page-body.ts:1-16` is a 1-constant module existing solely to cancel
CSS the shared component shouldn't own. The page itself has no `auth.getUser()` guard.

**Refactor.** Make route groups mean **portal**: `(public)`, `(student)`, `(counsellor)`,
`(parent)`, `(admin)`, each with one layout that calls the corresponding `shared/auth` context
resolver. `/university-search/university/[id]` becomes a normal child of `(student)` and its
chrome difference is expressed with a prop on `DashboardShell`, not a route group.

---

### [LOW] A16 — Naming inconsistencies that make paths unguessable

**Evidence.** 19 PascalCase filenames vs 413 kebab/lowercase — and they're not one convention
applied to one thing: `components/university-search/filters/*` is all PascalCase
(`FilterRail.tsx`, `SortMenu.tsx`, …) while its sibling `components/university-search/*` is
kebab (`filter-pill.tsx`, `save-search-button.tsx`). `hooks/useSupabase.ts` vs the other ten
`use-*.ts`. `app/counsellor/_dashboard-client.tsx` (underscore-prefixed file, not folder) vs
`app/counsellor/_components/` (folder). `lib/chat/tools.ts` + `lib/chat/tools/`.

**Refactor.** kebab-case for every file; `_`-prefix reserved for folders only. Mechanical rename,
best done per-slice during the migration rather than as its own PR.

---

### [LOW] A17 — `landing/` and `landing-preview/` are mutually dependent, and "preview" is live

**Evidence.** `src/app/page.tsx:1-18` composes both. `landing-preview/*` → `landing/*` at
`step-shots.tsx:6-7`, `comparison-settle.tsx:6-7`, `how-it-works-scrub.tsx:5`,
`preview-hero.tsx:22`. Back the other way: `landing/scroll-reveal-heading.tsx:5` →
`landing-preview/ascent-scroll`. The `/landing-preview` route no longer exists; the "preview"
components are production.

**Refactor.** Merge into `features/landing/ui/`, with `sections/` (the scrollytelling chapters)
and `widgets/` (the mock product UI both use). One directory, one direction.

---

## Target architecture

### Tree

```
src/
  app/                                # ROUTING ONLY. No domain logic, no data shaping.
    (public)/                         #   landing, login, auth callback
    (student)/                        #   dashboard, matches, course, shortlist,
                                      #   university-search, applications, profile,
                                      #   scholarships, toolbox, inbox, assistant
    (counsellor)/                     #   /counsellor/*
    (parent)/                         #   /parent/*
    (admin)/                          #   /admin/*
    api/                              #   thin handlers: parse -> guard -> features/*/api -> respond
    layout.tsx  providers.tsx  error.tsx  global-error.tsx  not-found.tsx

  features/
    search/            matching/         applications/      profile/
    counsellor/        parent/           chat/              toolbox/
    shortlist/         scholarships/     help/              landing/
      api/            # server data access; every fn takes an injected SupabaseClient
                      #   `import 'server-only'` at the top
      model/          # PURE: domain types, rules, derivations. No React, no Supabase, no next/*.
                      #   This is what __tests__ points at.
      ui/             # feature components ('use client' where needed)
      hooks/          # feature client hooks
      index.ts        # THE public surface. Outside code imports this and nothing else.

  shared/
    ui/               # design primitives (today components/ui: button, card, dialog, …)
    design/           # motion.ts, categories.ts (icon+tone tokens), constants/text.ts
    layout/           # shell, navbar, sidebar, page-hero, section-nav, navigation.ts, command-palette
    auth/             # requireUser, requireRole, resolve*Context, withAuth/withRole  ('server-only' where server)
    supabase/         # client.ts / server.ts / service.ts  (unchanged, +'server-only')
    storage/          # keys.ts registry + guarded read/write
    observability/    # logger.ts, analytics.ts
    lib/              # dates, flag, format (currency/location), cn, validation
    types/            # database.ts (generated), demo-tables.ts, vendor.d.ts

  hooks/              # only genuinely app-wide hooks: useSupabase, use-realtime-poll,
                      # use-animated-number, use-typing-effect, use-user-role
  middleware.ts
```

### Rule set (enforce with dependency-cruiser; each line is one rule)

| # | Rule | Severity |
|---|---|---|
| R1 | `app/**` may import `features/*/index.ts`, `shared/**`, `hooks/**`. | error |
| R2 | `app/**` may **not** import `features/*/{api,model,ui,hooks}/**` — only the slice's `index.ts`. | error |
| R3 | `features/x/**` may import `shared/**`, `hooks/**`, and its own `features/x/**`. | error |
| R4 | `features/x/**` may import another slice **only** via `features/y/index.ts` (never its internals). | error |
| R5 | `shared/**` may import only `shared/**`. Never `features/**`, never `app/**`, never `hooks/**`. | error |
| R6 | **Nothing** imports from `app/**`. Zero exceptions. | error |
| R7 | Nothing imports `page.tsx`, `layout.tsx`, `route.ts`, `error.tsx`, `loading.tsx`, or `default.tsx`. | error |
| R8 | `app/<seg>/_components/**` importable only from within `app/<seg>/`. | error |
| R9 | `features/*/model/**` may not import React, `next/*`, `@supabase/*` values, or `features/*/ui/**`. Pure. | error |
| R10 | Every module under `features/*/api/**` and `shared/{auth,supabase}/**` starts with `import 'server-only'`. | error |
| R11 | No circular dependencies anywhere. | error |
| R12 | Bare `localStorage.` forbidden outside `shared/storage/**` (ESLint `no-restricted-syntax`). | error |
| R13 | Bare `console.` forbidden outside `shared/observability/**` and `error.tsx` boundaries. | warn |
| R14 | Orphan modules (0 importers, not a route file) reported. | warn |

Import direction, one line: **`app` → `features` (public API) → `shared`. Never backwards.**

### Phased migration — shippable at every step

Each phase is one PR, green on `lint`/`typecheck`/`test`/`build`, and independently revertable.

**Phase 0 — Install the fence at today's shape (no file moves).** *S, very low risk.*
Add `dependency-cruiser` + `server-only`. Encode R6, R7, R11, plus the *current* true rules
(`lib ↛ components`, `lib ↛ app`, `components ↛ app`). Add `import 'server-only'` to the 10
server modules. Grandfather the two known violations
(`hooks/use-search-results.ts:20`, `student-roster.tsx:10`) with a dated `// depcruise-ignore`
so they can't multiply. Wire into CI.
*Value even if you stop here: the graph can no longer get worse.*

**Phase 1 — Give the cross-cutting concerns a home.** *M, low risk.*
Create `shared/auth/`, `shared/storage/`, `shared/observability/`. Generalise
`app/parent/_lib/context.ts` into `resolve*Context`. Convert the 20 page guards and 16 route
guards. Migrate the 52 `localStorage` call sites. Turn on R12/R13. **This is the highest
value-per-hour phase** and it does not require the slice migration.

**Phase 2 — De-invert: pull domain modules out of `components/`.** *S–M, low risk.*
Move the 8 non-component modules listed in A6 into `features/*/model/`. Unify the shortlist row
contract (A6) and extract `features/search/model/query.ts` to collapse the 4 tokenisers (A9).
Remove the `hooks → components` grandfather. Delete `src/types/` (A11).

**Phase 3 — Pilot one slice end to end: `counsellor` (71 files).** *L, medium risk.*
Biggest slice, most contained blast radius (only `/counsellor/*` renders it). Create
`features/counsellor/{api,model,ui,index.ts}`; absorb `lib/counsellor/` (6),
`app/counsellor/_components/` (31), `components/counsellor/` (1). Break the cycle (A4). Merge
`data.ts` types into `types.ts` (A11). Turn on R2/R3/R4/R8/R9 **scoped to this slice**.
Ship it, live with it for a sprint, then decide whether the shape is right before repeating it 11 more times.

**Phase 4 — Remaining slices, one PR each, largest first.**
`search` → `chat` → `applications` → `profile` → `parent` → `matching` → `toolbox` →
`landing` (merging `landing`/`landing-preview`, A17) → `scholarships` → `help` → `shortlist`.
Widen the R2–R9 globs one slice at a time. Any slice can pause indefinitely without blocking
the others.

**Phase 5 — Shell and cleanup.** *M, low risk.*
`components/{ui,layout,theme}` → `shared/{ui,layout,design}`. `lib/{motion,theme,constants}` →
`shared/design` (A7). Route groups → portals (A15). File renames (A16). React Query decision (A13).
Remove the last `depcruise-ignore`.

---

## Effort

| # | Finding | Size | Risk | Notes |
|---|---|---|---|---|
| A1 | No enforced module boundaries | **S** | Low | Config only; do first — it gates everything else |
| A2 | Organised by type, not feature | **XL** | Medium | Phases 3–4; the whole migration |
| A3 | `_components` vs `components/<feature>` has no rule | **M** | Low | Falls out of A2; the rule (R8) is S on its own |
| A4 | Route modules imported as libraries; 1 cycle | **S** | Low | 4 imports + 1 type move |
| A5 | Auth/authz has no home (56 files) | **M** | **Medium** | Touches every guarded route — test carefully. Highest value |
| A6 | Domain modules under `components/` | **M** | Low | 8 modules; kills the one inversion |
| A7 | `lib/` is 5 unrelated layers | **L** | Low | Mostly mechanical; do inside Phases 3–5 |
| A8 | No compile-time server/client fence | **S** | Low | `server-only` + ~10 imports; splitting `lib/chat` is M |
| A9 | Duplicated domain rules (4 tokenisers, 5 formatters) | **M** | **Medium** | Behaviour may differ between copies — diff before unifying |
| A10 | Business logic in route/component files | **L** | Medium | Do opportunistically per slice, not as one PR |
| A11 | Two type homes; slice types split | **S** | Low | Delete `src/types/`, move 6 types |
| A12 | localStorage: 52 sites, 25 keys, no registry | **M** | Low | Mechanical; verify key strings byte-for-byte |
| A13 | React Query mounted, unused | **S** | Low | Remove (30 min) or commit to it (separate project) |
| A14 | No logging abstraction (91 `console.*`) | **S** | Low | Server-side first |
| A15 | Ad-hoc route groups; guard-escaping group | **M** | **Medium** | Route-group moves change URLs if done carelessly |
| A16 | Naming inconsistencies (19 PascalCase) | **S** | Low | Fold into per-slice PRs; `git mv` only |
| A17 | `landing` ↔ `landing-preview` mutual dependency | **S** | Low | One directory merge |

**Recommended order:** A1 → A5 → A12/A14 → A6/A11 → A8 → A9 → A4 → A2 (pilot `counsellor`) →
remaining slices → A7/A15/A16/A17/A13.

**Do not do:** a single big-bang `src/` reorganisation. The graph is 95% clean already; the value
is in the fence (A1) and the cross-cutting homes (A5, A12), both of which are cheap and
independent of the slice migration. If only two things get done, do those.
