# Audit 06 — Type system health, validation, compiler/lint configuration

**Repo:** `/Users/gregfranck/Ascenda` · branch `fix/ui-phase0-bugs` · 441 `.ts/.tsx` under `src/` (493 incl. `__tests__/` + root config).
**Toolchain:** TypeScript 5.3.3, Next 15.5.21, React 19.2.8, ESLint 9.39.5, zod 3.22.4.
**Baseline:** `npx tsc --noEmit` = **0 errors**. `npm run lint` is wired into CI (`.github/workflows/ci.yml:60-63`: lint → typecheck → test → build). The type system is *green*, which is exactly why the holes below are invisible.

---

## Current state

### 1. Escape hatches by kind

| Kind | Count (src/) | Notes |
|---|---:|---|
| `as any` | **125** | breakdown below |
| `as unknown as` | **23** | double-cast, all at Supabase-row → domain-type boundaries |
| `: any` annotations | **30** | params/locals, incl. 7 in `IntelligentSearchBar.tsx` |
| `any[]` / `Record<_, any>` / `Promise<any>` | **43** | overlaps with the above rows |
| `@ts-ignore` | **0** | ✅ |
| `@ts-expect-error` | **0** | ✅ |
| `@ts-nocheck` | **0** | ✅ |
| `: Function` type | **0** | ✅ |
| `: object` type | **2** | `lib/counsellor/data.ts:209`, `widget-grid-core.tsx:112` |
| `!` non-null assertions | **39** | 11 on `process.env.*`, ~20 on `Map.get()`, 8 genuinely risky |
| `eslint-disable` | **6** | all `react-hooks/exhaustive-deps`, all with a rationale comment |

**`as any` classified (mutually exclusive):**

| Cluster | Count | Verdict |
|---|---:|---|
| `(supabase as any).from(...)` — table missing from generated types | **33** | *Justified-but-unnecessary* — the workaround outlived its cause (see [HIGH-1]) |
| Property punch-through `(row as any).col` | **46** | **Accidental** — silences the very drift the types exist to catch |
| Row-shape casts `x as any[]` / `{} as any` | **30** | **Accidental** — `lib/counsellor/data.ts` alone has 24 |
| Residual (enum widening, framer `ease`, `.from('course_scoring_v1' as any)`) | **16** | Mixed — enum-widening ones are real bugs-in-waiting |

**By directory (`as any`):** `lib/matching` 27 · `lib/counsellor` 26 · `lib/chat` 14 · `lib/profile` 8 · `components/university-search` 8 · `app/counsellor` 7 · `app/api` 7 · `lib/parent` 6 · `app/profile` 6 · `lib/shortlist` 4 · `lib/scoring` 3 · rest ≤2.

**Worst files:** `src/lib/counsellor/data.ts` (24) · `src/lib/matching/service.ts` (18) · `src/lib/chat/tools/student-write.ts` (10) · `src/lib/matching/matching_engine.ts` (9) · `src/lib/profile/persist-intake.ts` (8).

Only **1 of 125** is a *documented* boundary in the sense CLAUDE.md promises — `src/lib/demo/help-request-client.ts:25`. CLAUDE.md says "cast through `any` in **one wrapper file**"; the reality is **33 casts across 20 files**, and `lib/counsellor/decks.ts:187` even has a comment acknowledging the sprawl.

### 2. zod adoption

| | |
|---|---:|
| Files importing `zod` | **3** (`lib/validation/auth.ts`, `lib/validation/profile.ts`, `app/api/admin/import/validation.ts`) |
| Files importing `zodResolver` | **1** (`components/forms/auth-form.tsx`) |
| Schemas defined | 7 (`loginSchema`, 4 × `profile*Schema`, 4 × import-template schemas) |
| Types derived via `z.infer` | **5** ✅ |
| API route handlers | **23** |
| Route handlers validating body with zod | **1 / 23** (admin import only) |
| Route handlers validating URL params | **0 / 23** |
| Env vars validated | **0** |
| `localStorage` JSON reads | **21 sites**; 1 helper supports validation, **0 callers pass a validator** |
| `await res.json()` sites | **28**; **0** validated, 8 asserted `as T`, 20 fully untyped |

Zod is present but is a *form-validation library* in this codebase, not a boundary library. It never runs on data crossing the network, the DB, or `localStorage`.

### 3. Duplicate entity types

| Entity | Declaration sites | Drifted? |
|---|---|---|
| **ApplicationStatus** | `lib/counsellor/types.ts:9` (4 values) · `lib/theme/categories.ts:214` `ApplicationStatusTone` (4) · `lib/parent/types.ts:23` `ChildApplicationStatus` (5) · `app/dashboard/page.tsx:34` (DB enum, 5) | **YES — 3 different value sets.** See [CRITICAL-1] |
| **MatchTier** | `lib/matching/match-tier.ts:1` · `lib/counsellor/types.ts:8` · re-exported `lib/parent/types.ts:9` | Same values today, two independent literal unions — nothing keeps them so |
| **Program/Programme** | `lib/matching/service.ts:20` `ProgramRow` (DB) · `hooks/use-search-results.ts:49` `ProgramRow` · `lib/chat/tools/university-read.ts:39` `ProgramRow` · `app/counsellor/universities/_universities-client.tsx:185` `ProgramRow` · `lib/chat/tools.ts:87` `ProgramHit` · `components/university-search/types.ts:4` `ProgramSearchResult` · `app/(university-info)/.../[id]/page.tsx:15` `ProgramRecord` · `lib/counsellor/data.ts:146` `ProgramInfo` · `lib/catalog/visibility.ts:1` `ProgramLike` | **9 shapes.** No shared base; the 4 `ProgramRow`s are 4 unrelated hand-written subsets of the same table |
| **University** | `lib/chat/widgets.ts:17` `UniversityHit` · `.../university/[id]/page.tsx:28` `UniversityRecord` · `components/university-search/university-information.tsx:13` `UniversityData` · `components/university-card.tsx:13` props | 4 shapes |
| **Application** | `components/applications/application-list.tsx:11` `ApplicationRow` · `app/applications/page.tsx:75` `ApplicationRecord` · `app/applications/tasks/page.tsx:27` `ApplicationJoin` · `app/applications/documents/page.tsx:18` `ApplicationJoin` · `lib/chat/context.ts:83` `StudentAppRecord` · `lib/parent/data.ts` `AppRecord` · `lib/counsellor/types.ts:24` `CounsellorApplication` | **7 shapes**, two of them *identically named* `ApplicationJoin` in sibling files (near-identical bodies — see [MEDIUM-2]) |
| **Profile/Student** | `lib/profile/intake-types.ts` (5 types) · `lib/validation/profile.ts` (4 `z.infer`) · `lib/profile/completion.ts:21` · `lib/counsellor/types.ts` · `lib/types/database.ts` `profiles` | The zod-derived and hand-written intake types describe the *same wizard* and are never reconciled |
| **HelpRequest** | `lib/types/demo-tables.ts:8` (hand) · `lib/types/database.ts:690` (generated) | **YES — hand type has 3 columns the generated type lacks.** See [HIGH-1] |
| **Notification** | `lib/types/demo-tables.ts:39` (hand) · `database.ts:743` (generated) | Redundant; hand version is *better* (narrowed unions) |
| **Deck** | `lib/counsellor/decks.ts:34,45,64,75` (domain) · `lib/types/demo-tables.ts:193-240` (rows) | Not in generated types at all |

### 4. Generated-types workflow

`src/lib/types/database.ts` — 2740 lines, last regenerated **2026-07-03** (`f10513f`). 33 migrations exist; **11 post-date the regeneration.**

**Relations in `supabase/schema.sql` / migrations but ABSENT from `database.ts` (10):**

`counsellor_decks` · `counsellor_deck_programs` · `deck_assignments` · `saved_searches` (20260713150000) · `guardian_links` (20260716120000) · `chat_feedback` (20260717120000) · `chat_conversations` · `chat_messages` (20260718120000) · `shortlisted_programs` (20260724100000) · `course_scoring_v1` (view, 20250308120000 — never typed).

**Column-level drift on a table that IS typed:** `help_requests` gained `counsellor_profile_id`, `student_last_read_at`, `counsellor_last_read_at` in `supabase/migrations/20260713170000_help_requests_participants_and_reads.sql:17-22` and they are in `supabase/schema.sql:1309-1313` — but `database.ts:690-702` does not have them. Any code reading `help_requests` through the generated types cannot see the ownership column the whole counsellor-inbox feature is built on.

**`demo-tables.ts` (308 lines) is now ~55% dead weight.** Redundant with `database.ts`: `HelpRequest`, `Notification`, `HelpMessage`, `HelpNote`, `HelpMeeting`, `CounsellorNoteRow`, `ParentContactRow`, `ParentMessageRow`, `StudentDocumentRow`, `ApplicationOutcomeColumns` (the `applications` Row at `database.ts:93` already has `platform`/`decision`/`decision_at`/`decision_conditions`, contradicting the file's own comment at `demo-tables.ts:104`). Still genuinely needed: `GuardianLinkRow`, `Deck*`, `SavedSearchRow`, `ChatFeedbackRow`, `ChatConversationRow`, `ChatMessageRow`.

### 5. Compiler strictness — measured

Run with scratch tsconfigs extending the repo's (repo `tsconfig.json` untouched). Baseline **0 errors**.

| Flag | Errors | Files | src / tests |
|---|---:|---:|---|
| `noUncheckedIndexedAccess` | **174** | 58 | 148 / 26 |
| `exactOptionalPropertyTypes` | **116** | 64 | 116 / 0 |
| `noPropertyAccessFromIndexSignature` | **583** | 55 | (not recommended) |
| `verbatimModuleSyntax` | **8** | 8 | 8 / 0 |
| `noImplicitOverride` | **3** | 1 | 3 / 0 |
| `noImplicitReturns` | **1** | 1 | 1 / 0 |
| `noFallthroughCasesInSwitch` | **0** | 0 | — |
| `useUnknownInCatchVariables` | **0** | 0 | already on via `strict` |
| `moduleResolution: "bundler"` | **0** | 0 | **free win** |

Notes:
- `exactOptionalPropertyTypes`: **176 of the diagnostic lines** mention `MotionStyle` / `Transition<any>` / `Easing` — the bulk is framer-motion `ease`/`style`/`transition` props receiving `T | undefined`. Real app-logic hits are a small minority (`ApplicationPlatform | undefined`, `ChatAction | undefined`, `'IB' | 'A_LEVEL'`).
- `noUncheckedIndexedAccess` hotspots: `app/api/calendar-feed/route.ts` (16), `components/landing-preview/cursor-grid.tsx` (14), `app/dashboard/page.tsx` (9), `app/counsellor/_components/custom-widget-builder.tsx` (9).
- `noPropertyAccessFromIndexSignature` 583 errors is a direct measure of how much code reads DB/LLM data through `Record<string, unknown>` — 125 in `lib/matching/service.ts`, 108 in `app/course/[id]/_components/course-data.ts`. Informative, but **do not adopt** — it's a style rule, and the underlying problem is better fixed by typing those records.

**`scripts/` is excluded from typechecking entirely** (`tsconfig.json:48`) yet ships 41 `as any`/`: any` across 10 files and includes `apply-sql.ts`, the tool that mutates production.

### 6. Lint configuration

`eslint.config.mjs` registers `@typescript-eslint` but enables exactly **one** rule (`no-unused-vars`, line 45). No `parserOptions.project` → **zero type-aware rules are possible today.** `next/core-web-vitals` supplies `react-hooks/exhaustive-deps` (warn) and `react-hooks/rules-of-hooks`. `reportUnusedDisableDirectives: 'error'` is set (good).

Rules that would have caught findings in this report:

| Rule | Type-aware? | Would catch |
|---|---|---|
| `@typescript-eslint/no-explicit-any` | no | all 125 `as any` + 30 `: any` |
| `@typescript-eslint/no-unsafe-member-access` / `-assignment` / `-argument` / `-return` | **yes** | the 46 property punch-throughs and everything downstream of `await res.json()` |
| `@typescript-eslint/no-floating-promises` | **yes** | fire-and-forget Supabase writes (`saved-search-store.ts:210` uses `void` — correct; the rule enforces it everywhere) |
| `@typescript-eslint/no-misused-promises` | **yes** | `async` handlers passed to `onClick`/`useEffect` |
| `@typescript-eslint/consistent-type-imports` | no | the 8 `verbatimModuleSyntax` errors, prospectively |
| `@typescript-eslint/no-non-null-assertion` | no | the 39 `!`s |
| `@typescript-eslint/switch-exhaustiveness-check` | **yes** | the `ApplicationStatus` union drift ([CRITICAL-1]) |
| `import/order` + `no-restricted-imports` | no | the layering violations that let 9 `Program` shapes exist |

**Cost of `parserOptions.project`:** type-aware linting builds a full TS program per lint run. On 493 files expect lint to go from ~10 s to ~45–70 s, and memory from ~400 MB to ~1.5 GB. Mitigation: `projectService: true` (typescript-eslint v8+, uses the same incremental service as the editor) and scope the type-aware config block to `src/lib/**` + `src/app/api/**` initially. Requires upgrading `@typescript-eslint/*` to v8 (currently only the plugin is a transitive dep of `eslint-config-next`; there is no direct `@typescript-eslint/parser` dependency in `package.json`).

### 7. API / client contract typing

**Server side.** `src/lib/api/guards.ts:6-13`:

```ts
export const parseJsonBody = async <T = Record<string, unknown>>(request: Request): Promise<T | null> => {
  try {
    return (await request.json()) as T;   // ← pure assertion, no validation
  } catch { return null; }
};
```

9 of 23 routes use it; the type parameter is a **lie the compiler enforces downstream**. 5 more routes call `await request.json()` bare with zero typing. `searchParams.get()` results are hand-parsed everywhere.

**Client side.** All 28 `await res.json()` sites: 8 asserted (`as { programs: any[] ... }`), 20 destructured untyped. Not one is validated. Representative:
- `components/university-search/IntelligentSearchBar.tsx:86,147,236` — `as { programs: any[]; universities: any[] }`, then `.map((program: any) => …)`. The `any[]` means a schema change in `/api/search/suggestions` produces `undefined` in the UI, silently.
- `app/counsellor/universities/_universities-client.tsx:292,322,348,465` — four bare `await res.json()`.
- `components/applications/cross-application-tasks.tsx:203` — `as { item: { id: string } }`; if the route ever returns `{ error }` this reads `undefined.id`.

**LLM boundary — the one place that is done right-ish.** `lib/chat/tools/types.ts` mandates `validateParams(params: unknown)` on every write tool, re-run server-side at execute time (`app/api/chat/actions/execute/route.ts`), and `lib/chat/widgets.ts:154` has a real `isChatWidget` type guard checking every array element. But the validators are hand-rolled and the Gemini `FunctionDeclaration` is a *second, independent* schema for the same args — see [MEDIUM-3].

---

## Findings

### [CRITICAL] 1. `ApplicationStatus` exists in three incompatible versions; the counsellor board silently relabels `enrolled` as `decision`

- Truth: `database.ts:2020-2025` — `'planning' | 'in_progress' | 'submitted' | 'decision' | 'enrolled'` (5).
- `src/lib/counsellor/types.ts:9` — 4 values, **no `enrolled`**.
- `src/lib/theme/categories.ts:214` `ApplicationStatusTone` — 4 values, no `enrolled`.
- `src/lib/parent/types.ts:23` `ChildApplicationStatus` — 5 values ✅.
- `src/app/dashboard/page.tsx:34` — derived from the DB enum ✅.

The coercion is explicit at **`src/lib/counsellor/data.ts:392`**:

```ts
status: (app.status === 'enrolled' ? 'decision' : app.status) as ApplicationStatus,
```

A student who has *enrolled* renders on the counsellor kanban as still awaiting a decision. That is a correctness bug in the counsellor's primary view, and the type system was structurally prevented from reporting it because the narrow union was hand-written.

The same narrowing makes **`src/lib/counsellor/stage-colors.ts:44`** a latent crash:

```ts
const v = APPLICATION_STATUS_VISUAL[status as ApplicationStatusTone];
return { label: STAGE_LABEL[status], text: v.text, ... };   // v is undefined for 'enrolled'
```

`as ApplicationStatusTone` defeats the index check; today `build()` is only called with the 4 literals (line 54-59) so it doesn't fire, but any future caller passing a raw `applications.status` throws `Cannot read properties of undefined (reading 'text')`.

**Fix.** Delete all three hand-written unions. Single source:
```ts
// src/lib/domain/application.ts
import type { Database } from '@/lib/types/database';
export type ApplicationStatus = Database['public']['Enums']['application_status'];
export const APPLICATION_STATUSES = ['planning','in_progress','submitted','decision','enrolled'] as const
  satisfies readonly ApplicationStatus[];
```
`satisfies` makes the array and the enum fail to compile the moment they diverge. Then add the missing `enrolled` column/visual and remove the `data.ts:392` coercion. Enable `@typescript-eslint/switch-exhaustiveness-check` so the next enum value breaks the build.

---

### [HIGH] 2. Generated DB types are 11 migrations / 10 relations stale, and the "regenerate" workflow is unenforced

- `src/lib/types/database.ts` last regenerated **2026-07-03**; migrations run through **2026-07-24**.
- 10 relations exist in `supabase/schema.sql` with no generated type (list in Current State §4).
- `help_requests` is missing 3 columns that `supabase/migrations/20260713170000_...sql:17-22` added — including `counsellor_profile_id`, the ownership column the entire `/counsellor/inbox` feature keys on.
- Consequence: **33 `(supabase as any)` casts** across 20 files, each one disabling *all* type checking for that query — column names, filter operators, and the returned row shape.

The bug class: `(supabase as any).from('chat_messages').select('conversationid')` compiles, ships, and fails at runtime. There is no test for column names.

**Fix.** (a) Run `npm run supabase:types` now — it collapses ~19 of the 33 casts immediately. (b) Add a CI job that regenerates into a temp file and diffs (see Target Architecture §CI). (c) For anything not in the remote DB yet, keep a *typed* extension rather than `any` (see §Target).

---

### [HIGH] 3. `parseJsonBody<T>` is an unchecked assertion used by 9 API routes

`src/lib/api/guards.ts:9` — `return (await request.json()) as T`.

Callers: `api/applications/track/route.ts:24`, `api/checklist/route.ts:39,65,102`, `api/counsellor/decks/route.ts:16`, `api/counsellor/decks/cards/route.ts:17`, `api/counsellor/decks/assign/route.ts:14`, `api/counsellor/notes/route.ts:20`, `api/parent/messages/route.ts:23`, `api/chat/actions/execute/route.ts:64`.

Everything after the cast — `payload.studentIds.map(...)`, `payload.theme.emoji` — is typed as safe and is not. The optional-property style (`{ deckId?: string }`) mitigates the worst of it by forcing `if (!x) return 400` guards, but nothing checks *types*: `{"studentIds": "all"}` reaches `.map` and 500s; `{"theme": {"accent": "<script>"}}` reaches the DB unexamined.

5 further routes skip the guard entirely: `api/admin/import/route.ts:21`, `api/admin/update-deadlines/route.ts:27`, `api/chat/route.ts:86`, `api/chat/feedback/route.ts:31`, `api/essay-assist/route.ts:137`, `api/match/score/route.ts:25`.

**Fix.** Change the signature so a schema is mandatory and the type is *derived*:
```ts
export const parseJsonBody = async <S extends z.ZodTypeAny>(
  request: Request, schema: S
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; error: string }> => {
  let raw: unknown;
  try { raw = await request.json(); } catch { return { ok: false, error: 'Malformed JSON body.' }; }
  const parsed = schema.safeParse(raw);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid request body.' };
};
```
Because the type comes from `z.infer<S>`, the schema and the type cannot drift — unlike today's `<T>`.

---

### [HIGH] 4. 46 property punch-through casts read columns the type system says don't exist

`(row as any).column` — the single most common escape hatch, concentrated in the two files that do the most DB work:

- `src/lib/matching/service.ts:143-146` — reads `meta_total_course_score`, `meta_selectivity_score`, `meta_university_score`, `meta_course_tier` off a row typed without them, and **writes them back** at `:662-671` and `:994-1003` (`(row as any).meta_total_course_score = …`). This mutates objects into a shape no type describes; every downstream consumer is guessing.
- `src/lib/matching/matching_engine.ts:88-95,361,509,534-535` — `institution_type`, `qs_world_rank_raw`, `the_world_rank_raw`, `university_rank_overall`, `metadata`, `program_id`, `university_id` all punched through `EnrichedCourseRecord`.
- `src/lib/shortlist/server.ts:43-46` and `src/lib/chat/tools/student-write.ts:56-60` — identical `Array.isArray((x as any).universities) ? ... : ...` PostgREST embed-shape dance, duplicated.
- `src/lib/counsellor/data.ts:334,356-358` — `{} as any` as a "missing row" placeholder, so every subsequent field read is unchecked.

Bug class: a renamed or dropped column produces `undefined`, which flows into arithmetic (`NaN` scores) or string templates (`"undefined"` in the UI) instead of a compile error. `service.ts:143` feeds `asNumber(...)` — a rename here silently zeroes a match score.

**Fix.** Define the real row shape once (`type CourseScoringRow` already exists at `service.ts` — extend it) and select into it. Where PostgREST embeds are involved, write one helper: `const one = <T>(v: T | T[] | null): T | null => Array.isArray(v) ? v[0] ?? null : v;`

---

### [HIGH] 5. Every `fetch` response in the app is trusted; 8 of them are typed with `any[]` inside

28 `await res.json()` sites, 0 validated.

Worst: `src/components/university-search/IntelligentSearchBar.tsx:86,147,236`
```ts
const payload = (await response.json()) as { programs: any[]; universities: any[] };
...
const programSuggestions = (payload.programs || []).map((program: any) => { ... });  // :161
```
This is the search autocomplete — the app's most-used surface. The `as` + `any[]` combination means the client and `src/app/api/search/suggestions/route.ts` share *no* checked contract in either direction.

Also unguarded: `src/app/counsellor/universities/_universities-client.tsx:292,348,465`, `src/app/university-search/quests/_quests-client.tsx:52`, `src/app/counsellor/_components/notes-panel.tsx:67` (`const { note } = await res.json()`), `src/app/parent/messages/_parent-thread.tsx:97`.

**Fix.** Co-locate a response schema next to each route and export it; the client parses with it. One shared helper:
```ts
export async function fetchJson<S extends z.ZodTypeAny>(input: RequestInfo, schema: S, init?: RequestInit): Promise<z.infer<S>> {
  const res = await fetch(input, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return schema.parse(await res.json());
}
```

---

### [MEDIUM] 6. `demo-tables.ts` has drifted into a *third* source of truth, and half of it is dead

21 files import from `src/lib/types/demo-tables.ts`. Ten of its declarations now duplicate `database.ts` (`HelpRequest`, `Notification`, `HelpMessage`, `HelpNote`, `HelpMeeting`, `CounsellorNoteRow`, `ParentContactRow`, `ParentMessageRow`, `StudentDocumentRow`, `ApplicationOutcomeColumns`). The file's comment at `demo-tables.ts:103-104` claims `database.ts` "lags" the `applications` outcome columns — it does not; `database.ts:93-107` has all four.

Awkwardly, the hand-written versions are *more precise*: `demo-tables.ts:5` gives `HelpRequestStatus = 'open'|'accepted'|'resolved'` where `database.ts:699` gives `status: string`, because the DB uses CHECK constraints rather than pg enums (`supabase/schema.sql:1301`). So a naive "delete demo-tables, use generated" loses real safety.

**Fix.** Keep a *narrowing layer*, not a parallel layer — see Target Architecture §2. Delete the 10 redundant declarations; convert the surviving unions into `satisfies`-checked refinements of the generated Row types.

---

### [MEDIUM] 7. Two files declare the same `ApplicationJoin` type independently

`src/app/applications/tasks/page.tsx:27` and `src/app/applications/documents/page.tsx:18` both declare `ApplicationJoin`, both describing the same `applications → programs → universities` PostgREST embed, and both are reached via the same double-cast:
```ts
const apps = ((applicationRows ?? []) as unknown as ApplicationJoin[]) ?? [];
```
(`tasks/page.tsx:64`, `documents/page.tsx:57`). They differ only in that the tasks version carries `application_checklist`. The `as unknown as` defeats the generated types entirely — if the `.select()` string and the type disagree the compiler cannot say so.

**Fix.** One `type ApplicationWithProgramme` in `src/lib/domain/application.ts` built from the generated Row types; extend it locally where the checklist embed is needed.

---

### [MEDIUM] 8. LLM write-tool params are validated twice, by two schemas that can diverge — and the UUID check is not a UUID check

`src/lib/chat/tools/types.ts` enforces `validateParams(params: unknown)` on every write tool, and `src/lib/chat/tools/student-write.ts:97-101,166-181` implements it. Architecturally correct — this is the best-guarded boundary in the codebase. Two problems:

1. Each tool has a Gemini `FunctionDeclaration` (the model-facing schema) *and* a hand-written `validateParams` (the server-facing schema). Nothing links them. Add a field to the declaration, forget the validator, and the field passes through unchecked.
2. `src/lib/chat/tools/student-write.ts:24-27`:
```ts
const UUID_RE = /^[0-9a-f-]{36}$/i;
const isUuidish = (value: unknown): value is string => typeof value === 'string' && UUID_RE.test(value.trim());
```
This accepts 36 hyphens, or `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`. The predicate returns `value is string`, so the compiler now believes an arbitrary 36-char blob is a validated programme id. RLS catches the consequences, but the guard is advertising a check it isn't performing.

3. Downstream, validated params are `Record<string, unknown>`, forcing `params.program_id as string` (`:104`), `params.task_name as string` (`:186`) — 10 `as any`/casts in that one file re-erasing what validation just established.

**Fix.** Define each tool's params as a zod schema; derive the Gemini declaration's `parameters` from it (or generate the schema from the declaration), have `validateParams` return `z.infer<Schema>`, and use `z.string().uuid()`.

---

### [MEDIUM] 9. `localStorage` reads are `JSON.parse` + assertion; the one guarded helper is never used with a guard

`src/lib/utils/local-storage.ts:6-18` offers `readJSON<T>(key, fallback, validate?)` and its own docblock says "Callers still validate shape". **Zero of the callers pass `validate`.** Meanwhile 9 sites bypass the helper entirely:

`components/university-search/saved-search-store.ts:36` (`as SavedSearchItem[]`) · `shortlist-store.ts:121` (`as ShortlistItem[]`) · `IntelligentSearchBar.tsx:70` (`as Suggestion[]`) · `components/chat/chatbot-widget.tsx:110` (`const parsed: Message[] = raw ? JSON.parse(raw) : []`) · `components/scholarships/scholarship-explorer.tsx:72` · `components/toolbox/requirements-checker.tsx:49` · `components/toolbox/essay-workshop.tsx:95` · `components/applications/rec-letter-workflow.tsx:90` · `app/counsellor/_components/counsellor-document-board.tsx:86`.

Bug class: a shape change ships, a returning user's stale `localStorage` value is trusted, and the component throws on first render. `chatbot-widget.tsx:110` renders the parsed array straight into the thread.

**Fix.** Give each key a zod schema and route every read through `readJSON(key, fallback, schema)` with `readJSON` taking a `ZodType` rather than a predicate.

---

### [MEDIUM] 10. Environment variables: 11 `!` assertions and no validation anywhere

`src/lib/supabase/server.ts:9,10,33,34,55,56` · `src/middleware.ts:27,28` · `src/app/auth/callback/route.ts:15,16` all do `process.env.NEXT_PUBLIC_SUPABASE_URL!`. `src/app/api/essay-assist/route.ts:6` and `src/lib/chat/gemini.ts:21` do `process.env.GEMINI_API_KEY ?? ''` — constructing a client with an empty key at module load.

A missing var produces `undefined` passed into `createServerClient`, and the failure surfaces as an opaque Supabase error deep in a request rather than at boot. CI already builds with placeholder values (`ci.yml:66-71`), so the miswiring would not be caught there either.

**Fix.** One `src/lib/env.ts` with a zod schema parsed at module load, split server/client (Next inlines only `NEXT_PUBLIC_*` in client bundles, so the client schema must be a separate object literal referencing each var explicitly).

---

### [MEDIUM] 11. `scripts/` is excluded from typechecking and contains 41 `any`s — including the production-mutation tool

`tsconfig.json:48` excludes `scripts`. `npm run typecheck` and CI therefore never look at `scripts/apply-sql.ts` (the documented way migrations reach production), `scripts/seed-students.ts` (7 `any`s), `scripts/simulate-profiles.ts` (11), `scripts/all-countries-to-supabase.ts` (6). They *are* executed via `tsx --tsconfig tsconfig.json`, which strips types without checking them.

**Fix.** A second project (`tsconfig.scripts.json`) included in `npm run typecheck`.

---

### [LOW] 12. `useSearchParams`/URL params are hand-parsed with `as` casts

`src/lib/university-search/search-params.ts` is the good example — `parseTiers` at `:248-253` uses a real predicate `filter((t): t is MatchTier => ...)`. But `src/app/counsellor/_dashboard-client.tsx:95,105` casts a free-form `filter.value` into a union with `as any`, and `src/app/api/chat/suggestions/route.ts:33`, `src/app/api/profile/export/route.ts:40`, `src/app/api/counsellor/decks/route.ts:41` read `searchParams.get()` with ad-hoc checks. `z.enum([...]).catch(default)` would make each of these one line and total.

### [LOW] 13. `verbatimModuleSyntax` is 8 errors away and `moduleResolution: "bundler"` is free

`tsconfig.json:16` uses the legacy `"node"` resolution. Next 15 bundles with webpack/turbopack resolution semantics; `"bundler"` is the correct setting and produces **0 new errors** (measured). `verbatimModuleSyntax` costs 8 one-line fixes (`dashboard/page.tsx:22`, 5 × `landing-preview/*`, `ComparisonModal.tsx:19`, `use-search-results.ts:20`) and then makes type/value import intent explicit forever — which matters for a codebase this heavy on `import type`.

### [LOW] 14. `noImplicitOverride` (3 errors) and `noImplicitReturns` (1) are effectively free

`src/components/assistant/widgets/index.tsx:33,37,40` (an error-boundary class needing `override`) and `src/app/counsellor/_components/analytics-drilldown.tsx:102` (a code path returning nothing). Four fixes total.

---

## Target type architecture

### 1. One canonical domain-model home

```
src/lib/types/database.ts       # GENERATED — never edited, never imported by UI code
src/lib/domain/
  index.ts                      # barrel; the ONLY module app code imports entity types from
  application.ts                # ApplicationStatus, Application, ApplicationWithProgramme
  programme.ts                  # Programme, ProgrammeSummary, ProgrammeHit
  university.ts
  student.ts                    # Profile, StudentIntake, ProfileCompletion
  match.ts                      # MatchTier, Match, MatchBreakdown
  help.ts                       # HelpRequest, HelpMessage, HelpMeeting, HelpNote
  deck.ts
  notification.ts
src/lib/schemas/                # zod, one file per boundary
  env.ts  api/*.ts  storage.ts  chat-tools.ts
```

Rule: **`Database[...]` is referenced only inside `src/lib/domain/**` and `src/lib/supabase/**`.** Everything else imports from `@/lib/domain`. Enforce with `no-restricted-imports` (config below).

### 2. The generated-DB-types boundary — three layers, no parallel types

```ts
// src/lib/domain/_base.ts
import type { Database } from '@/lib/types/database';
export type Tables = Database['public']['Tables'];
export type Row<T extends keyof Tables> = Tables[T]['Row'];
export type Insert<T extends keyof Tables> = Tables[T]['Insert'];
export type Enum<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T];

/** Narrow a generated `string` column (a CHECK constraint, not a pg enum) to its
 *  real union — while proving the union is assignable to what the DB declares. */
export type Narrow<R, K extends keyof R, U extends R[K]> = Omit<R, K> & Record<K, U>;
```

```ts
// src/lib/domain/help.ts — replaces demo-tables.ts's HelpRequest
import type { Row, Narrow } from './_base';
export type HelpRequestStatus = 'open' | 'accepted' | 'resolved';
export type HelpRequestInitiator = 'student' | 'counsellor';
export type HelpRequest =
  Narrow<Narrow<Row<'help_requests'>, 'status', HelpRequestStatus>, 'initiated_by', HelpRequestInitiator>;
```
If `supabase gen types` later drops `status`, `Narrow` fails to compile. If the CHECK constraint gains a value, the union is *still* a subtype and won't break — so pair it with a SQL-derived assertion test (below). This gives the precision `demo-tables.ts` has today without the parallel declaration.

**For the 10 not-yet-generated relations**, do not use `any`. Declare a typed extension and merge it into the client generic:
```ts
// src/lib/types/database-pending.ts  — DELETE each entry as `supabase gen types` picks it up
export interface PendingTables {
  chat_conversations: { Row: {...}; Insert: {...}; Update: Partial<...>; Relationships: [] };
  // …
}
export type DB = Omit<Database, 'public'> & {
  public: Omit<Database['public'], 'Tables'> & { Tables: Database['public']['Tables'] & PendingTables };
};
```
Then `createServerSupabaseClient()` returns `SupabaseClient<DB>` and **all 33 `(supabase as any)` casts delete themselves** while keeping full column checking.

### 3. zod-first validation with `z.infer`

Non-negotiable rule: **at every trust boundary, the zod schema is written first and the TypeScript type is `z.infer` of it.** No hand-written type may describe data that crosses a boundary.

Boundaries, in priority order: (1) API request bodies, (2) API response bodies, (3) env vars, (4) LLM tool args, (5) `localStorage`, (6) URL search params, (7) CSV import (already done).

```ts
// src/lib/schemas/api/checklist.ts — schema is the contract, both sides import it
import { z } from 'zod';
export const patchChecklistBody = z.object({
  id: z.string().uuid(),
  status: z.enum(['todo', 'doing', 'done']),
});
export type PatchChecklistBody = z.infer<typeof patchChecklistBody>;

export const patchChecklistResponse = z.object({ ok: z.literal(true), item: z.object({ id: z.string().uuid() }) });
export type PatchChecklistResponse = z.infer<typeof patchChecklistResponse>;
```

Note: zod 3.22.4 is ~2 years behind. **Upgrade to zod 3.25.x on the `/v4` import path** before the rollout (`import { z } from 'zod/v4'`) — 3.25 ships both v3 and v4 under one package so it is a non-breaking bump, and v4 is ~7× faster to parse and 2× smaller, which matters when every API response is parsed. `@hookform/resolvers@3.3.4` needs a bump to ≥5 for the v4 resolver.

### 4. Exact tsconfig to adopt

```jsonc
{
  "compilerOptions": {
    "target": "esnext",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,

    // ── ADDED ────────────────────────────────────────────────────────────
    "noUncheckedIndexedAccess": true,        // 174 errors — Phase 3
    "exactOptionalPropertyTypes": true,      // 116 errors — Phase 4 (mostly framer-motion)
    "noImplicitOverride": true,              // 3 errors   — Phase 1
    "noImplicitReturns": true,               // 1 error    — Phase 1
    "noFallthroughCasesInSwitch": true,      // 0 errors   — Phase 1, free
    "verbatimModuleSyntax": true,            // 8 errors   — Phase 1
    "allowUnreachableCode": false,           // 0 errors
    // NOT adopting: noPropertyAccessFromIndexSignature (583 errors, style-only —
    // fix the untyped Records instead), noUnusedLocals/Parameters (ESLint owns this).

    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",           // ── CHANGED from "node"; 0 errors
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "baseUrl": "src",
    "paths": { "@/*": ["./*"] },
    "types": ["jest", "node"],
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", "**/*.cjs", "**/*.mjs", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "supabase", "scripts", ".next"]
}
```

Plus a second project so `scripts/` stops being a blind spot (`npm run typecheck` becomes `tsc --noEmit && tsc --noEmit -p tsconfig.scripts.json`):

```jsonc
// tsconfig.scripts.json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "types": ["node"], "noEmit": true, "incremental": false },
  "include": ["scripts/**/*.ts", "src/lib/types/*.ts"],
  "exclude": ["node_modules"]
}
```

### 5. Exact eslint.config.mjs to adopt

Requires `npm i -D typescript-eslint@^8` (brings parser + plugin; drop the direct `@typescript-eslint/eslint-plugin` dep).

```js
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';
import tseslint from 'typescript-eslint';

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });
const LINTED = ['**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs', '**/*.ts', '**/*.tsx'];
const TS = ['**/*.ts', '**/*.tsx'];

export default [
  { ignores: ['.next/**', 'out/**', 'build/**', 'coverage/**', 'next-env.d.ts'] },
  { linterOptions: { reportUnusedDisableDirectives: 'error' } },

  ...compat.extends('next/core-web-vitals').map((e) => ({ ...e, files: e.files ?? LINTED })),

  // ── Syntactic TS rules: no type information needed, ~free ──────────────
  {
    files: TS,
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_', varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_', ignoreRestSiblings: true,
      }],
      // Phase 2: start as 'warn' with the existing 155 sites grandfathered by an
      // eslint-suppressions file, flip to 'error' at the end of Phase 5.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/consistent-type-imports': ['error', {
        prefer: 'type-imports', fixStyle: 'inline-type-imports',
      }],
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/no-empty-object-type': 'error',
      '@typescript-eslint/no-unsafe-function-type': 'error',
      '@typescript-eslint/no-wrapper-object-types': 'error',
    },
  },

  // ── Type-aware rules: scoped to the layers where data crosses boundaries.
  //    `projectService` reuses the incremental TS program (v8+), so lint goes
  //    ~10s → ~45s rather than ~10s → ~120s.
  {
    files: ['src/lib/**/*.ts', 'src/app/api/**/*.ts', 'src/hooks/**/*.ts'],
    plugins: { '@typescript-eslint': tseslint.plugin },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { projectService: true, tsconfigRootDir: __dirname },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      // Phase 5 — these are what actually catch [HIGH-4] and [HIGH-5]:
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
    },
  },

  // ── Layering: generated DB types are a boundary, not a public API ──────
  {
    files: ['src/app/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}', 'src/hooks/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['@/lib/types/database', '@/lib/types/demo-tables'],
          message: 'Import entity types from @/lib/domain. Generated DB types are internal to src/lib/domain and src/lib/supabase.',
        }],
      }],
    },
  },

  // ── react-hooks/exhaustive-deps is `warn` from next/core-web-vitals.
  //    Promote to error so the 6 documented disables stay the only exceptions.
  { files: TS, rules: { 'react-hooks/exhaustive-deps': 'error' } },
];
```

### 6. CI enforcement that keeps the generated types honest

Add to `.github/workflows/ci.yml` as a job that runs on PRs touching `supabase/**` (and nightly):

```yaml
  db-types-drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - uses: supabase/setup-cli@v1
        with: { version: latest }
      # Apply migrations to a throwaway local Postgres — no prod credentials in CI.
      - run: supabase start
      - run: supabase db reset --local
      - name: Regenerate types from the migrated local schema
        run: supabase gen types typescript --local --schema public,storage > /tmp/database.ts
      - name: Fail if committed types are stale
        run: |
          if ! diff -u src/lib/types/database.ts /tmp/database.ts; then
            echo "::error::src/lib/types/database.ts is stale. Run 'npm run supabase:types' and commit."
            exit 1
          fi
```

Two caveats specific to this repo: (a) `supabase/migrations/` has diverged from the remote (CLAUDE.md), so `db reset --local` must be seeded from `supabase/schema.sql` until the histories are reconciled — use `psql -f supabase/schema.sql` in place of `db reset`; (b) that makes this job *also* the test that `schema.sql` stays a faithful backport, which is worth having on its own.

Complementary, cheaper, and available immediately — a Jest test that costs nothing to run:

```ts
// __tests__/types/schema-contract.test.ts
import { readFileSync } from 'node:fs';
test('every table in schema.sql has a generated type', () => {
  const sql = readFileSync('supabase/schema.sql', 'utf8');
  const dts = readFileSync('src/lib/types/database.ts', 'utf8');
  const tables = [...sql.matchAll(/create table if not exists (?:public\.)?(\w+)/gi)].map((m) => m[1]!);
  const missing = tables.filter((t) => !new RegExp(`^      ${t}: \\{$`, 'm').test(dts));
  expect(missing).toEqual([]);   // fails today with the 10 relations listed above
});
```

And a compile-time assertion file that makes the domain narrowings self-checking:

```ts
// src/lib/domain/__assertions.ts  (type-only; erased at build)
import type { ApplicationStatus } from './application';
type Assert<T extends true> = T;
type Eq<A, B> = (<G>() => G extends A ? 1 : 2) extends (<G>() => G extends B ? 1 : 2) ? true : false;
export type _AppStatus = Assert<Eq<ApplicationStatus,
  'planning' | 'in_progress' | 'submitted' | 'decision' | 'enrolled'>>;
```

### 7. Phased rollout (nothing stops the world)

| Phase | Scope | Gate |
|---|---|---|
| **0 — Regenerate** | `npm run supabase:types`; add `database-pending.ts` for the 10 missing relations; type the client generic. Deletes ~19–33 `(supabase as any)`. | `tsc` green |
| **1 — Free flags** | `moduleResolution: bundler` (0), `noFallthroughCasesInSwitch` (0), `noImplicitReturns` (1), `noImplicitOverride` (3), `verbatimModuleSyntax` (8) + `consistent-type-imports` (autofixable). **13 errors total, one PR.** | `tsc` green |
| **2 — Lint scaffolding** | typescript-eslint v8; syntactic rules on; `no-explicit-any`/`no-non-null-assertion` at `warn`; `no-restricted-imports` layering rule; `exhaustive-deps` → error. No code changes required. | lint green |
| **3 — Domain home** | Create `src/lib/domain/`; migrate `ApplicationStatus` [CRITICAL-1] and `MatchTier` first; fold the 10 redundant `demo-tables.ts` declarations in; unify `ApplicationJoin`. | tests + `tsc` |
| **4 — zod boundaries** | Bump zod to 3.25/v4; `src/lib/schemas/env.ts`; rewrite `parseJsonBody`; schema-per-route for the 23 handlers; `fetchJson` for the 28 client reads; `localStorage` schemas. Route-by-route, each independently shippable. | per-route tests |
| **5 — Type-aware lint** | `parserOptions.projectService` on `src/lib/**` + `src/app/api/**`; `no-floating-promises`/`no-misused-promises`/`switch-exhaustiveness-check` at error; unsafe-* at warn. Lint time ~10s → ~45s. | CI time budget |
| **6 — Deep strictness** | `noUncheckedIndexedAccess` (174) — do `src/app/api/calendar-feed/route.ts` (16) and `src/app/dashboard/page.tsx` (9) first. Then `exactOptionalPropertyTypes` (116) — 3/4 is framer-motion `ease`/`style`, fixable with a typed `EASE` const and conditional spreads. | `tsc` green |
| **7 — Close out** | `no-explicit-any` and unsafe-* from `warn` → `error`; `scripts/` into the typecheck; drift CI job. | CI green |

Phases 1, 2 and 7 are single PRs. Phases 4 and 6 are per-file/per-route and can proceed in parallel with feature work — no phase requires a freeze.

---

## Effort

| # | Finding | Size | Risk | Notes |
|---|---|---|---|---|
| 1 | ApplicationStatus 3-way drift + `enrolled` mislabelled | **M** | **Med** | Behaviour change: an `enrolled` column/visual appears on the counsellor kanban. Needs product sign-off on the label. |
| 2 | Regenerate DB types + `database-pending.ts` | **M** | Low | Requires `SUPABASE_PROJECT_ID`; deletes 19–33 `as any`. Mechanical but touches 20 files. |
| 3 | `parseJsonBody` → zod | **L** | Low | 23 routes; each independently shippable. Existing tests cover several handlers. |
| 4 | 46 property punch-throughs | **L** | Med | `matching/service.ts` + `matching_engine.ts` are score-bearing — regressions are silent. Do behind the scoring diagnostic tests (`VERBOSE_SCORING=1 npm test`). |
| 5 | Typed+validated `fetch` responses | **L** | Low | 28 sites; `fetchJson` helper first, migrate incrementally. |
| 6 | Prune/fold `demo-tables.ts` | **M** | Low | 21 importers, but all type-only — a rename sweep. |
| 7 | Unify `ApplicationJoin` | **S** | Low | 2 files. |
| 8 | zod-ify LLM tool params + real UUID check | **M** | Low | 8 write tools; `z.string().uuid()` is a 1-line change with immediate value. |
| 9 | `localStorage` schemas | **M** | Low | 21 sites; failure mode is already "fall back to default", so low blast radius. |
| 10 | `src/lib/env.ts` | **S** | Low | ~40 lines; catches misconfiguration at boot instead of mid-request. |
| 11 | `tsconfig.scripts.json` | **S** | Low | May surface 10–40 errors in scripts on first run. |
| 12 | zod for URL params | **S** | Low | |
| 13 | `moduleResolution: bundler` | **S** | **None** | **0 errors measured.** |
| 13 | `verbatimModuleSyntax` | **S** | None | **8 errors**, all one-line. |
| 14 | `noImplicitOverride` + `noImplicitReturns` + `noFallthroughCasesInSwitch` | **S** | None | **4 errors** combined. |
| — | `noUncheckedIndexedAccess` | **L** | Med | **174 errors / 58 files** (148 src, 26 tests). Top: calendar-feed 16, cursor-grid 14, dashboard 9, custom-widget-builder 9. |
| — | `exactOptionalPropertyTypes` | **L** | Low | **116 errors / 64 files**, ~3/4 framer-motion `ease`/`style`/`transition`. |
| — | `noPropertyAccessFromIndexSignature` | **XL** | Med | **583 errors / 55 files** — **not recommended**; treat the number as a metric of untyped-`Record` debt, not a target. |
| — | typescript-eslint v8 + type-aware rules | **M** | Low | Lint ~10s → ~45–70s, memory ~400MB → ~1.5GB. Scope to `src/lib/**` + `src/app/api/**`. |
| — | CI drift job for generated types | **M** | Med | Blocked on reconciling `supabase/migrations/` with the remote, or on seeding CI Postgres from `schema.sql`. The Jest contract test is an **S**, works today, and fails immediately (proving the 10 missing relations). |
