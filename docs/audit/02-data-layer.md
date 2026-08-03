# Data Access Layer Audit — Ascenda

Scope: Supabase usage end to end. Read-only analysis, no queries run against production.
Branch: `fix/ui-phase0-bugs` @ e7f948d. Date: 2026-08-01.

---

## Current state

### 1. Client factories

Four factories, all thin, all correct in isolation:

| Factory | File | Typed? |
|---|---|---|
| `createServerSupabaseClient()` | `src/lib/supabase/server.ts:5` | `Database` |
| `createServerActionSupabaseClient()` | `src/lib/supabase/server.ts:29` | `Database` |
| `createRouteHandlerSupabaseClient()` | `src/lib/supabase/server.ts:51` | `Database` |
| `getBrowserSupabaseClient()` | `src/lib/supabase/client.ts:8` | `Database`, module-singleton |
| `createServiceRoleSupabaseClient()` | `src/lib/supabase/service.ts:15` | `Database`, `typeof window` guard at `:11` |
| (5th, hand-rolled) `createServerClient` inline | `src/middleware.ts:26` | `Database` |

`useSupabase()` (`src/hooks/useSupabase.ts:8`) wraps the browser client and returns `{} as SupabaseClient<Database>` during SSR (`:11`) — a lie that type-checks; any accidental server-render call site silently gets an object with no methods rather than a clear error.

**No factory misuse found.** All 3 async server factories are awaited at every one of their ~55 call sites (`rg` shows `await create*SupabaseClient()` universally). Server factories never appear in a `'use client'` file. The 9 client-side query files all use `getBrowserSupabaseClient`/`useSupabase`.

**Service-role key never reaches client code.** Only `scripts/seed-students.ts` imports `@/lib/supabase/service`; the module throws if `typeof window !== 'undefined'` (`service.ts:11`). Six other scripts (`debug-live-matches.ts:24`, `simulate-profiles.ts:1667`, `create-admin-users.ts:50`, `upload-all-countries.ts:78`, `upload-ucas.ts:109`, `validate-catalog.ts:21`) each rebuild a service-role client inline instead of using the shared factory — duplication, not a leak.

### 2. Call-site inventory

`rg -n "\.from\('" src` → **181 raw PostgREST call sites**, plus **52 dynamic `tbl(supabase, '…')` calls** (three separate local `tbl` helpers) = **233 query call sites**.

Per layer:

| Layer | `.from('…')` sites |
|---|---|
| `src/lib/**` | 101 |
| `src/app/**` (pages, layouts, server components) | 38 |
| `src/app/api/**` (route handlers) | 26 |
| `src/hooks/**` | 7 |
| `src/components/**` | 5 |
| `src/middleware.ts` | 4 |
| `scripts/**` | 47 (out of scope, but note the inline-client duplication above) |

Per table (raw `.from('x')` only):

```
programs                        22    student_admissions_tests   8
student_subjects                15    application_checklist      7
student_personal_information    15    student_scores             5
applications                    15    counsellor_notes           5
student_lifestyle_preference    14    student_activities         4
student_academic_input          14    parent_contacts            3
student_matches                 13    parent_messages            2
profiles                        12    guardian_links             2
universities                    10    documents                  2
                                      deadlines                  2
        + 1 each: student_documents, sources, simulation_results,
          shortlisted_programs, scholarships, notifications,
          help_messages, help_meetings, chat_feedback, course_scoring_v1
```

Plus dynamic (`tbl(...)`) sites: `chat_messages` 9, `help_requests` 8, `chat_conversations` 6, `deck_assignments` 5, `counsellor_deck_programs` 5, `notifications` 4, `help_messages` 4, `counsellor_decks` 4, `help_meetings` 3, `help_notes` 2, `student_personal_information` 1, `profiles` 1.

### 3. Is there a data-access abstraction?

**Partially — three unconnected islands and a lot of smear.**

Islands (the closest thing to a repository layer):
- `src/lib/counsellor/data.ts` (901 lines, 23 query sites) — cohort assembly + pure derivations.
- `src/lib/parent/data.ts` (496 lines, 13 sites) — child-scoped loaders behind `resolveLinkedChildIds`.
- `src/lib/demo/help-request-client.ts` (404 lines, 23 sites) — help/notification CRUD wrappers.
- `src/lib/chat/history.ts` (15 sites), `src/lib/counsellor/decks.ts` (14 sites) — same shape.
- `src/lib/applications/server-actions.ts` (141 lines) — the only module with a proper `ActionResult<T>` discriminated union.

Smear (query building inside UI/route code):
- `src/app/dashboard/page.tsx` — 9 query sites inline in the page component.
- `src/app/profile/page.tsx` — 7. `src/app/profile/wizard/page.tsx` — 4.
- `src/hooks/use-search-results.ts` — 6 sites + ~250 lines of hand-rolled PostgREST query building, pagination cursors and index-hinting, in a client hook.
- `src/app/counsellor/universities/_universities-client.tsx` — 3 sites building a whole second programme-search implementation client-side.
- `src/middleware.ts` — 4 sites.

There is **no shared row-contract module, no shared error type, no shared select-column constants** (one exception: `PROGRAMS_SELECT` shared by `src/app/course/[id]/page.tsx:17` and `src/app/course/[id]/CoursePageClient.tsx:87`).

### 4. Caching / revalidation

- `@tanstack/react-query` **is installed and provider-mounted** (`src/app/providers.tsx:18,21`) but **has exactly zero consumers**: `rg "useQuery|useMutation" src` returns nothing outside `providers.tsx`. It is dead weight in the bundle plus a devtools import.
- Next caching: **1** `export const revalidate` in the whole app (`src/app/course/[id]/page.tsx:7`, 3600s). **19** `export const dynamic = 'force-dynamic'`. No `unstable_cache`, no React `cache()`, no `revalidateTag`. `revalidatePath` used twice, both in `src/app/profile/actions.ts:44-45,72-73`.
- The only real caching is hand-rolled: a module-level universities cache (`src/hooks/use-search-results.ts:92-116`), a module-level name cache (`src/lib/demo/help-request-client.ts:158`), and the `student_matches` DB table used as a match cache with TTL logic in `src/lib/matching/service.ts:314-449`.

### 5. Type safety at the boundary

`rg -n "as any|as unknown as" src/lib src/app src/components src/hooks | wc -l` → **149**.

Top offenders: `lib/counsellor/data.ts` 24, `lib/matching/service.ts` 21, `lib/chat/tools/student-write.ts` 10, `lib/matching/matching_engine.ts` 9, `lib/profile/persist-intake.ts` 8, `lib/parent/data.ts` 7.

Three modules deliberately erase the schema type entirely:
- `src/lib/demo/help-request-client.ts:23` — `type AnyClient = SupabaseClient<any, any, any>`
- `src/lib/shortlist/server.ts:8` — same
- `src/lib/applications/server-actions.ts:11` — same

`src/lib/types/demo-tables.ts` (308 lines) hand-maintains 20 row/insert types for tables the generated types "don't cover".

### 6. Schema files

`supabase/schema.sql` (2513 lines) + 33 files in `supabase/migrations/`. Consistency findings in §Findings below.

---

## Findings

### [CRITICAL] Duplicated profile-completion query has diverged, and the middleware copy is wrong

The same four-query profile-completion read is written out by hand in **eight** places, each with its own column list:

| Site | `student_academic_input` columns |
|---|---|
| `src/app/dashboard/page.tsx:115-119` | …`english_required,english_status` ✅ |
| `src/lib/parent/data.ts:236-239` | …`english_required,english_status` ✅ |
| `src/lib/chat/context.ts:110-116` | …`english_required,english_status` ✅ |
| `src/app/profile/page.tsx:47` | `select('*')` ✅ |
| `src/app/profile/wizard/page.tsx:38` | `select('*')` ✅ |
| `src/lib/counsellor/data.ts:258` (`buildStudents`) | `select('*')` ✅ |
| **`src/middleware.ts:103`** | …`english_required` — **no `english_status`** ❌ |
| **`src/lib/counsellor/data.ts:545-548`** (`loadRoster`) | …`english_required` — **no `english_status`** ❌ |

`buildStepCompletion` (`src/lib/profile/completion.ts:48-52`) computes `academic_details` as
`subjectCount > 0 && (english_required != null || Boolean(english_status))`.

`src/lib/parent/data.ts:232-234` documents exactly why `english_status` must be selected: a student who answers "Not sure" to the English question persists `english_required = null` and `english_status = <value>`.

**Impact:** For any student who answered "Not sure", `middleware.ts:115` `isProfileComplete()` returns `false` forever. Every visit to `/dashboard`, `/matches`, `/applications`, `/university-search`, `/course`, `/scholarships`, `/inbox`, `/assistant` is 302'd to `/profile/wizard?onboarding=true` (`middleware.ts:166-174`) — while the dashboard itself would have shown 100% complete. The `onboarding_status` cookie caches the wrong answer for 12h (`:131-136`). The user cannot reach the app.
Secondary: `loadRoster` (used by `/counsellor/universities`, `universities/page.tsx:19`) under-reports those students' completion vs `loadCohort`, which uses `select('*')` — the same student shows two different completion percentages on two counsellor pages.

**Fix:** One `PROFILE_COMPLETION_COLUMNS` constant + one `loadProfileCompletion(supabase, profileId)` function in `src/lib/profile/`; all eight sites call it. Immediate hotfix: add `english_status` to `middleware.ts:103` and `counsellor/data.ts:547`.

---

### [CRITICAL] `student_activities` and `simulation_results` exist on the remote DB but in no schema file

`rg -ln "student_activities" supabase/` → **no hits**. Same for `simulation_results`. Neither appears in `supabase/schema.sql` (2513 lines) nor in any of the 33 migrations. Both **are** present in the generated `src/lib/types/database.ts:1400` / `:1187`, which proves they exist on the remote project.

Application code depends on them:
- `src/lib/profile/persist-intake.ts:103-117` — delete-then-insert on `student_activities` on **every profile save**, and throws on error (`:105`, `:117`).
- `src/lib/matching/service.ts:265` and `src/lib/scoring/student_score_loader.ts:129` read it.
- `src/app/admin/simulation/page.tsx:79` reads `simulation_results`.

**Impact:** `supabase/schema.sql` is documented as the schema of record, and CI/local/preview environments are provisioned from it. A fresh environment has no `student_activities` → `persist-intake.ts:103` throws `42P01` → **every profile save fails**, which is the app's onboarding gate. The two tables were created out-of-band (probably via the Supabase dashboard) and never backported.

**Fix:** Write idempotent `create table if not exists` migrations for both (with RLS policies), apply via `npm run db:apply`, and backport into `schema.sql`. Then add a CI check that diffs `schema.sql`-derived table names against `database.ts` table names.

---

### [HIGH] `persist-intake.ts` performs 9 dependent writes with no transaction and no rollback

`src/lib/profile/persist-intake.ts:28-168` runs, strictly sequentially and non-atomically:

```
profiles.upsert                                 :28
student_personal_information.upsert             :36
student_academic_input.upsert                   :51
student_lifestyle_preference.upsert             :81
student_activities.delete  → .insert            :103, :115
student_subjects.delete    → .insert            :120, :130
student_admissions_tests.delete → .insert       :134, :144
student_scores.upsert                           :151
student_matches.delete                          :165
```

Each `if (error) throw` aborts the rest. The three delete-then-insert pairs are the dangerous ones: `student_subjects.delete` succeeds at `:120`, `student_subjects.insert` fails at `:130` → **the student's subject list is gone**, and with it their matches (`academic_details` completion, matching input). Same for activities and admissions tests. Recovery requires re-entering the wizard from memory.

There is also no reason for the ordering: `profiles`, `personal`, `academic`, `lifestyle` are independent upserts to four tables (~4 serial round-trips that could be one `Promise.all`).

**Fix:** Move the whole payload into a single Postgres function (`save_student_intake(p_profile_id uuid, p_payload jsonb)`) called via `supabase.rpc()` — one round trip, one transaction, real atomicity. Interim mitigation: `Promise.all` the four independent upserts, and replace delete-then-insert with upsert-then-delete-not-in so a failed insert leaves the old rows intact.

---

### [HIGH] ~90 of the 149 `as any` casts are stale — the generated types now cover those tables

The `as any` convention is documented in `CLAUDE.md:113` and repeated in five file headers (`counsellor/data.ts:9-11`, `parent/data.ts:15-16`, `help-request-client.ts:1-4`, `decks.ts:4-7`, `matching/service.ts:264`). Every one of those headers is now **out of date**: `src/lib/types/database.ts` was regenerated at some point and contains:

`counsellor_notes`, `parent_contacts`, `parent_messages`, `student_documents`, `help_requests`, `help_messages`, `help_notes`, `help_meetings`, `notifications`, `student_activities`, `simulation_results`, `documents`, `application_checklist`, and `course_scoring_v1` (as a View, `database.ts:1924`).

So these casts are pure noise, and they suppress real type errors:
- `src/lib/demo/help-request-client.ts:23` — the entire module is typed `SupabaseClient<any,any,any>` for `help_requests` / `help_messages` / `help_notes` / `help_meetings` / `notifications`, **all five of which are generated**.
- `src/lib/counsellor/data.ts` — 24 `as any` including `counsellor_notes` (`:268`, `:884`) and `student_documents` (`:854`), both generated.
- `src/lib/parent/data.ts:246` — `(supabase as any).from('counsellor_notes')`, generated.
- `src/lib/matching/service.ts:621,975` — `.from('course_scoring_v1' as any)`, generated as a View.
- `src/lib/profile/persist-intake.ts:81` — `(supabase as any).from('student_lifestyle_preference')`, which has **always** been in the generated types.

The tables that genuinely still need manual types: `guardian_links`, `saved_searches`, `shortlisted_programs`, `counsellor_decks`, `counsellor_deck_programs`, `deck_assignments`, `chat_conversations`, `chat_messages`, `chat_feedback`, `scholarships`. That is 10 of the 20 hand-written types in `demo-tables.ts` — the other half now duplicate generated ones and can drift silently.

**Fix:** Run `npm run supabase:types`, then delete the stale casts file-by-file and let `tsc` find the mismatches. Delete the halves of `demo-tables.ts` now covered by `database.ts` (keep `HelpRequestInsert`-style narrowing types, but derive them: `type HelpRequest = Database['public']['Tables']['help_requests']['Row']`).

---

### [HIGH] The applications-with-programme-and-checklist query is written four times, four different ways

The nested `applications → programs → universities/deadlines + application_checklist` embed:

| Site | Selects |
|---|---|
| `src/app/applications/page.tsx:31-56` | + `notes`, `level:study_level`, `deadlines(id, name, deadline_date, intake, program_id)`, `application_checklist(id, task_name, status, due_date, application_id)` |
| `src/lib/parent/data.ts:143-158` | no `notes`, no `level`; same deadlines; checklist without `application_id` |
| `src/lib/chat/context.ts:128-140` | no `id` on program, no `intake` on deadlines, checklist without `id` |
| `src/app/applications/documents/page.tsx:48` | `id, program:programs(name:course_name, universities(name))` only |

Each site re-declares its own local row interface: `ApplicationRecord`/`DeadlineRecord`/`ChecklistRecord` at `applications/page.tsx:59-88`, `AppRecord` at `parent/data.ts:113-135`, `StudentAppRecord` at `chat/context.ts:83-97`, `ApplicationJoin`/`DocumentJoin` at `documents/page.tsx:28-33`. All four cast via `as unknown as X` because the PostgREST embed types don't line up.

Same story for the `student_matches → tier` lookup, written three times:
`src/app/applications/page.tsx:132-144`, `src/lib/parent/data.ts:163-183` (`fetchTierByProgram`), `src/lib/counsellor/data.ts:107-110` (`tierFromMatchRow`) — plus a fourth score-based fallback in `src/lib/matching/service.ts:389-390`.

**Impact:** `parent/data.ts:138` claims to be "same shape the student board uses" but isn't — a parent sees different data than the student on the same application. Any new column (e.g. `platform`, `decision`) has to be added in four places and will be forgotten in at least one.

**Fix:** One `applications-repo.ts` exporting `APPLICATION_WITH_PROGRAMME_SELECT` and `loadApplicationsFor(supabase, profileId)` returning a single exported `ApplicationWithProgramme` type. One `tierForPrograms(supabase, profileId, programIds)`.

---

### [HIGH] `loadUniversities` fetches the whole `universities` table from the browser with no bound

`src/hooks/use-search-results.ts:103-105`:

```ts
const { data, error } = await supabase
  .from('universities')
  .select('id, name, country, recognition_score, rank_overall');
```

No `.limit()`, no `.range()`. The comment at `:87` says "~2,926 rows". PostgREST's row cap is referenced throughout this same codebase as **1000** (`src/lib/counsellor/data.ts:152, 249, 281, 790`).

**Impact:** If the cap applies, this silently returns the first ~1000 universities. Everything downstream in the search page derives from this array: free-text university matching (`:169-205`), country/ranking facets (`:626-634`), and the entire ranking-sort cohort walk (`:700-714`). Two thirds of universities would be invisible to search-by-name and to ranked browsing, with no error and no symptom other than "we don't have that uni". This is the highest-traffic query in the app and the failure mode is silent.

**Fix:** Verify the project's `db-max-rows` setting. Regardless, page this explicitly with `.range()` in a loop (the file already implements paging twice elsewhere), or move it behind a cached route handler (`/api/search/universities`, `revalidate: 3600`) so it's fetched once server-side rather than per browser session, and can be gzipped/CDN-cached.

---

### [MEDIUM] Six counsellor pages each re-run the entire cohort pipeline on every request

`loadCohort()` (`src/lib/counsellor/data.ts:495`) is called by `/counsellor` (`page.tsx:23`), `/counsellor/students` (`:23`), `/counsellor/analytics` (`:12`), `/counsellor/applications` (`:14`), `/counsellor/deadlines` (`:14`). All are `export const dynamic = 'force-dynamic'`, so nothing is cached.

Each call does: 2 sequential queries → 6 parallel queries → **N parallel queries, one per student** (`data.ts:284-293`, an explicit and documented N+1) → chunked `programs` resolution (`:155-168`) → `deadlines`. For a 30-student cohort that is ~40 round-trips per page view, and the five pages differ only in which pure `derive*` helper they call afterwards.

`loadOutcomes` (`:797-805`) repeats the same per-profile match fan-out independently.

The N+1 is a deliberate trade (documented at `:280-283`) to avoid PostgREST's 1000-row cap starving students — a correct instinct, wrong tool.

**Fix:** Replace the per-student loop with one `student_matches` query using a window function via RPC (`select … from (select *, row_number() over (partition by profile_id order by score desc) rn from student_matches where profile_id = any($1)) t where rn <= 30`) — one round trip, no cap risk. Then wrap `loadCohort` in React `cache()` so a single request that renders two cohort-derived components pays once, and add a short `revalidate` to the counsellor pages that don't need second-level freshness.

---

### [MEDIUM] Four incompatible error conventions; 27 call sites silently discard `error`

1. **`unwrap()` throws `Error`** — defined *three separate times*, character-for-character identical apart from the label prefix: `src/lib/counsellor/data.ts:45`, `src/lib/parent/data.ts:41`, `src/lib/counsellor/decks.ts:84`.
2. **`if (error) throw error`** — raw `PostgrestError` propagated. 52 sites, concentrated in `help-request-client.ts`, `chat/history.ts`.
3. **`ActionResult<T>` discriminated union** — `src/lib/applications/server-actions.ts:19-21`. The best pattern in the codebase; used in exactly one module.
4. **Silent drop** — `const { data } = await …` with no `error` binding: **27 sites**.

The silent-drop sites that matter:
- `src/app/dashboard/page.tsx:77` — `applications` query. A failure renders the hub with 0 applications, "Nothing scheduled", and "All caught up".
- `src/app/applications/page.tsx:29` — the whole page. A failure renders the "No applications yet — let's pick a first one" empty state (`:92-126`) to a user with tracked applications.
- `src/app/applications/page.tsx:132` — tier lookup; failure silently drops every Reach/Match/Safe badge.
- `src/app/admin/page.tsx:31` and `src/app/api/admin/import/route.ts:16` and `.../update-deadlines/route.ts:14` and `.../catalog-health/route.ts:34` — **the admin role check**. `const { data: profile } = await supabase.from('profiles').select('role')…` — if the query errors, `profile` is `undefined` and the guard falls through to whatever the null-check does. Worth a direct read in the security pass.
- `src/lib/matching/service.ts:961` and `src/lib/chat/tools.ts:133` and `src/lib/chat/tools/university-read.ts:71`.

`src/app/applications/documents/page.tsx:53-55` and `:74-76` show the right instinct ("an empty documents page for a user who has uploads reads as data loss") — that reasoning applies verbatim to the dashboard and applications board and was not applied there.

**Fix:** One `src/lib/data/result.ts` exporting `DataError` (wrapping `PostgrestError` with a `stage` label), a single `unwrap`, and the `ActionResult<T>` type. Delete the three `unwrap` copies. Add an ESLint rule banning `const { data } = await supabase` without an `error` binding.

---

### [MEDIUM] Three independent programme-search implementations

1. `src/hooks/use-search-results.ts` (1010 lines) — client hook, cohort+offset cursors, in-memory uni matching, index-shaped ordering.
2. `src/app/api/search/suggestions/route.ts:86-160` — route handler, its own `STOP_WORDS`/`SUBJECT_WORDS`/`ABBREVIATIONS` heuristics, `recognition_score >= 5` gate.
3. `src/app/counsellor/universities/_universities-client.tsx:164-240` — client component, third free-text heuristic with its own `UNI_STOP_WORDS`, its own two-query merge.

All three independently rediscovered the "never build `.or()` with university names" gotcha (`use-search-results.ts:144-145`, `_universities-client.tsx:192-194`, `suggestions/route.ts:139-142`) and all three re-implement AND-ilike word matching. `src/app/api/search/filters/route.ts:20-22` is a fourth, bounded at `.limit(1200)`.

**Fix:** Extract `src/lib/search/query.ts` with `resolveFreeText(unis, q)` and `applyProgramFilters(query, ctx)` (the latter already exists as `applyWhere` inside the hook — it just needs to move out). All three consumers call it. Long-term the free-text half belongs in Postgres (`pg_trgm` GIN on `course_name` + `universities.name`), which would delete most of the heuristics.

---

### [MEDIUM] `select('*')` on wide/hot tables

**59 `select('*')` sites.** The ones that cost:

- `src/lib/counsellor/data.ts:242,258,260` — `student_personal_information`, `student_academic_input`, `student_lifestyle_preference` with `select('*') .in('profile_id', ids)` across the whole cohort, on **six** pages, when `loadRoster` two hundred lines below proves the needed columns are a handful (`:535`, `:547`).
- `src/lib/counsellor/data.ts:854` — `student_documents.select('*')` with **no filter at all** and no `.limit()`; every row every counsellor can see.
- `src/app/(university-info)/university-search/university/[id]/page.tsx:118` — `programs.select('*, universities(*)')`, the widest possible read of the two widest tables.
- `src/lib/scoring/student_score_loader.ts:124-129` and `src/lib/matching/service.ts:260-265, 939-942` — six `select('*')` each, duplicated between the two files.
- `src/lib/demo/help-request-client.ts` — 9 `select('*')`; `listOpenHelpRequests` (`:39-42`) and `listInboxRequests` (`:54-57`) have **no `.limit()`**, and `listInboxRequests` is on the dashboard critical path (`dashboard/page.tsx:137`).

Genuinely unbounded list queries with no `.limit()`/`.range()`: `universities` (`use-search-results.ts:105`), `student_documents` (`counsellor/data.ts:854`), `help_requests` inbox (`help-request-client.ts:39,54`), `sources` (`admin/page.tsx:37`), `scholarships` (`scholarships/page.tsx:60`), `counsellor_notes` per student (`counsellor/data.ts:881-885`), `parent_messages` per contact (`parent/data.ts:466-472`), `deadlines` by program (`counsellor/data.ts:306-309`).

**Fix:** Column constants per read shape (`STUDENT_COMPLETION_COLUMNS`, `PROGRAMME_CARD_COLUMNS`, …). A default `.limit()` on every list read, enforced by making the repo functions the only way to reach a list.

---

### [MEDIUM] `@tanstack/react-query` is mounted but has zero consumers

`src/app/providers.tsx:3-4,18,21,41` installs `QueryClientProvider` + `ReactQueryDevtools`. `rg "useQuery|useMutation|useInfiniteQuery" src` → nothing.

Meanwhile the app hand-rolls exactly what react-query provides: request de-duplication (`use-search-results.ts:92-116`, `shortlist-store.ts:55-76` single-flight), abort-on-supersede (`use-search-results.ts:578-580`), stale-while-revalidate (`matching/service.ts:314-449`), and polling with backoff (`use-realtime-poll.ts`).

**Fix:** Pick one. Either adopt it for the ~9 client-side query sites (which would delete the single-flight and module-cache code in `shortlist-store.ts`, `saved-search-store.ts`, `use-search-results.ts`, `use-user-role.ts`) or remove the dependency and the provider.

---

### [LOW] `useSupabase()` returns a fake client during SSR

`src/hooks/useSupabase.ts:10-12` returns `{} as SupabaseClient<Database>` when `typeof window === 'undefined'`. Any method call on it is a `TypeError: x.from is not a function` at runtime with no hint about the cause, and the cast means TypeScript will never warn. 13 components consume this hook.

**Fix:** Throw a named error instead of returning a fake, or drop the branch — `getBrowserSupabaseClient()` already throws a descriptive error on missing env (`client.ts:14-17`) and client components don't run their effects during SSR anyway.

### [LOW] `documents` and `student_documents` are two parallel, unrelated document systems

`documents` (`schema.sql:745`) is keyed by `application_id` and drives `/applications/documents` (`documents/page.tsx:70`) and the uploader (`document-uploader.tsx`). `student_documents` (`schema.sql:1664`) is keyed by `student_profile_id` and drives the counsellor view (`counsellor/data.ts:852-875`). Neither reads the other. A student's upload is invisible to their counsellor's document board and vice-versa.

**Fix:** Out of this audit's remit to redesign, but the data layer should at minimum expose one `documentsForStudent()` that unions both, so the divergence is visible rather than implicit.

### [LOW] `scholarships` table does not exist anywhere

`src/app/scholarships/page.tsx:60` — `supabase.from('scholarships' as never).select('*')`. Not in `schema.sql`, not in migrations, not in `database.ts`. The page is honest about it (`:57-59`, and a "Sample data" banner at `:106`), and swallows the error (`const { data } =`), but it fires a guaranteed-failing PostgREST request on every render of a route in the middleware matcher.

**Fix:** Delete the query until the table exists; feature-flag the page or keep the sample data unconditional.

### [LOW] `.single()` vs `.maybeSingle()` inconsistency

26 `.single()` vs 51 `.maybeSingle()`. `.single()` throws `PGRST116` when zero rows match. `src/app/admin/page.tsx:31`, `src/app/api/admin/import/route.ts:16`, `src/app/api/admin/update-deadlines/route.ts:14`, `src/app/api/admin/catalog-health/route.ts:34` all do `.single()` on `profiles` **and discard the error** — a user with no `profiles` row gets `data: null` and falls through the role guard's null branch rather than an explicit deny. `src/lib/applications/server-actions.ts:27-28` documents the correct reasoning for preferring `.limit(1)`; nothing else follows it.

---

## Target data layer

### Shape

```
src/lib/data/
  client.ts        # re-export the 5 factories; the ONLY module allowed to import @supabase/ssr
  result.ts        # DataError, ActionResult<T>, unwrap(), ok()/err()
  columns.ts       # exported select-column constants, one per read shape
  repos/
    profiles.ts        # loadProfileCompletion, loadStudentProfile, saveStudentIntake (rpc)
    applications.ts    # loadApplicationsFor, trackProgram, checklist CRUD
    matches.ts         # loadMatches, tierForPrograms, invalidateMatchCache
    catalogue.ts       # loadUniversitiesList, searchProgrammes, loadProgramme
    help.ts            # (today's help-request-client.ts, retyped)
    counsellor.ts      # cohort loaders (today's counsellor/data.ts query half)
    parent.ts          # child-scoped loaders (today's parent/data.ts query half)
  types.ts         # row contracts derived from Database, never hand-written
```

Rule: **`.from(` may appear only under `src/lib/data/repos/`.** Enforced by an ESLint `no-restricted-syntax` rule. Pages, route handlers, hooks and components call repo functions.

### Typed row contracts — derive, never hand-write

```ts
// src/lib/data/types.ts
import type { Database } from '@/lib/types/database';

type Tables = Database['public']['Tables'];
export type Row<T extends keyof Tables> = Tables[T]['Row'];
export type Insert<T extends keyof Tables> = Tables[T]['Insert'];

// Narrowed read shapes are Pick<>s of the generated row — they cannot drift.
export type ProfileCompletionRow = {
  personal:  Pick<Row<'student_personal_information'>,
               'first_name'|'last_name'|'email'|'nationality'|'resident_country'> | null;
  academic:  Pick<Row<'student_academic_input'>,
               'programme_type'|'school_name'|'school_country'|'graduation_year'
               |'intended_clusters'|'english_required'|'english_status'> | null;
  subjectCount: number;
  lifestyle: Pick<Row<'student_lifestyle_preference'>, 'extracurricular_interests'> | null;
};
```

`demo-tables.ts` shrinks to only the 10 genuinely-ungenerated tables, and each entry carries the migration that created it so the next `supabase gen types` run can retire it.

### Column constants — kill the divergence class

```ts
// src/lib/data/columns.ts
export const PROFILE_ACADEMIC_COLS =
  'programme_type,school_name,school_country,graduation_year,intended_clusters,english_required,english_status' as const;

export const APPLICATION_WITH_PROGRAMME = `
  id, status, notes, program_id,
  program:programs(
    id, name:course_name, level:study_level,
    universities(name, country),
    deadlines(id, name, deadline_date, intake, program_id)
  ),
  application_checklist(id, task_name, status, due_date, application_id)
` as const;
```

The middleware bug and the parent/student divergence both become impossible: there is one string.

### Error convention — one type, three dispositions

```ts
// src/lib/data/result.ts
export class DataError extends Error {
  constructor(readonly stage: string, readonly cause: PostgrestError) {
    super(`${stage}: ${cause.message}`);
  }
  get code() { return this.cause.code; }
  get isMissingTable() { return this.code === '42P01' || this.code === 'PGRST205'; }
}

/** READS that must not render as empty: throw → the route's error.tsx. */
export const unwrap = <T>(res: PostgrestResponse<T>, stage: string): T => {
  if (res.error) throw new DataError(stage, res.error);
  return res.data as T;
};

/** READS that are genuinely optional (a widget, a nice-to-have): log + fall back. */
export const soft = <T>(res: PostgrestResponse<T>, stage: string, fallback: T): T => {
  if (res.error) { console.error(new DataError(stage, res.error)); return fallback; }
  return res.data ?? fallback;
};

/** WRITES: never throw across an API boundary. */
export type ActionResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: string; code?: 'not_found' | 'conflict' | 'fk_violation' };
```

Disposition is a *decision at the call site*, made explicit — the current codebase makes it by accident (whether the author bound `error`). Default is `unwrap`. `soft` is opt-in and must name a fallback. Writes return `ActionResult`.

### Repo API sketch

```ts
// src/lib/data/repos/applications.ts
export async function loadApplicationsFor(
  supabase: Client, profileId: string
): Promise<ApplicationWithProgramme[]> {
  return unwrap(
    await supabase.from('applications')
      .select(APPLICATION_WITH_PROGRAMME)
      .eq('profile_id', profileId)
      .limit(200),
    'applications.loadApplicationsFor'
  ) as unknown as ApplicationWithProgramme[];
}

// src/lib/data/repos/profiles.ts
export const loadProfileCompletion = cache(async (
  supabase: Client, profileId: string
): Promise<ProfileCompletionRow> => { /* the ONE four-query Promise.all */ });

export async function saveStudentIntake(
  supabase: Client, profileId: string, payload: StudentProfilePayload
): Promise<ActionResult<{ scoreComputed: boolean }>> {
  // single supabase.rpc('save_student_intake', …) — atomic
}

// src/lib/data/repos/matches.ts
export async function tierForPrograms(
  supabase: Client, profileId: string, programIds: string[]
): Promise<Map<string, MatchTier>>;

export async function topMatchesForCohort(   // replaces the N+1
  supabase: Client, profileIds: string[], perStudent = 30
): Promise<Map<string, MatchRow[]>>;          // one rpc, window function
```

### Caching policy

| Data class | Policy | Where |
|---|---|---|
| Catalogue (`universities` list, programme detail) | `unstable_cache` / route `revalidate: 3600`, tag `catalogue` | `repos/catalogue.ts` |
| Per-request dedupe (profile completion, cohort) | React `cache()` around the repo fn | `repos/*` |
| Student-owned mutable (applications, checklist, matches) | `force-dynamic` + `revalidatePath` on the corresponding write | pages + write repos |
| Client-side interactive (search, shortlist, inbox poll) | **react-query** — `staleTime` per key; delete the hand-rolled single-flight/module caches | hooks |
| Expensive derived (`student_matches`) | keep the DB-table cache + TTL in `matching/service.ts` | unchanged |

Decide react-query in or out *first* — the current half-adoption means every new client query re-invents caching.

### Migration order

1. **Hotfix** `english_status` in `middleware.ts:103` and `counsellor/data.ts:547`. Ship alone.
2. **Schema reconciliation**: write + apply idempotent migrations for `student_activities` and `simulation_results`; backport to `schema.sql`; add the CI drift check.
3. **`npm run supabase:types`**, then create `src/lib/data/{result,columns,types}.ts`. Delete the three `unwrap` copies. No behaviour change.
4. **Strip stale `as any`** file-by-file, tsc-guided. `help-request-client.ts` first (it is the reference the others cite). Shrink `demo-tables.ts` to the 10 real gaps.
5. **`repos/profiles.ts`** — one `loadProfileCompletion`; rewire all eight call sites. This is where the CRITICAL class of bug dies.
6. **`repos/applications.ts` + `repos/matches.ts`** — collapse the 4 nested-query copies and the 3 tier-lookup copies. Rewire student board, parent portal, chat context, documents page.
7. **`repos/counsellor.ts`** — move the query half of `counsellor/data.ts` in; replace the per-student match fan-out with the window-function RPC; wrap in `cache()`. The `derive*` pure helpers stay put (they are good and correctly separated).
8. **`repos/catalogue.ts`** — bound/paginate `loadUniversitiesList`, move it server-side behind a cached route. Extract `resolveFreeText`/`applyProgramFilters` from `use-search-results.ts` and rewire the three search implementations.
9. **`saveStudentIntake` RPC** — the atomicity fix. Last because it needs a real migration and a seed-script update (`scripts/seed-students.ts` shares `persist-intake.ts`).
10. **Decide react-query**; adopt or remove. Then the ESLint rule confining `.from(` to `repos/`.

---

## Effort

| # | Finding | Size | Risk |
|---|---|---|---|
| 1 | `english_status` divergence → onboarding redirect loop | **S** | Low — two-column addition; verify against a "Not sure" profile |
| 2 | `student_activities` / `simulation_results` schema drift | **S** | Medium — must write idempotent SQL matching the live shape; `npm run db:apply` from an IPv4 network needs the pooler host |
| 3 | `persist-intake` non-atomic 9-write sequence → RPC | **L** | High — touches the onboarding gate and the seed script; needs a migration and a rollback plan |
| 4 | Stale `as any` sweep + `demo-tables.ts` shrink | **L** | Medium — tsc-guided so failures are compile-time, but ~90 sites and the embed types will fight back |
| 5 | 4× applications-embed + 3× tier-lookup consolidation | **M** | Medium — parent/student outputs currently differ; unifying them *changes* the parent portal's data |
| 6 | Unbounded `universities` fetch in the search hook | **M** | Medium — highest-traffic query; needs the `db-max-rows` fact confirmed before choosing paging vs. cached route |
| 7 | Counsellor cohort N+1 → window-function RPC + `cache()` | **M** | Medium — new DB function; the 1000-row-cap reasoning at `data.ts:280-283` must be preserved |
| 8 | Error-convention unification (one `unwrap`, `DataError`, lint rule) | **M** | Low — mostly mechanical; the 27 silent-drop sites each need a deliberate throw-vs-soft call |
| 9 | Three search implementations → shared `lib/search/query.ts` | **L** | High — `use-search-results.ts` encodes hard-won index/timeout knowledge; regressions are silent timeouts |
| 10 | `select('*')` → column constants | **M** | Low |
| 11 | react-query: adopt or remove | **M** (remove: S) | Low |
| 12 | `useSupabase()` SSR fake client | **S** | Low |
| 13 | `documents` / `student_documents` unification | **XL** | High — product decision, not just a data-layer one |
| 14 | Drop the dead `scholarships` query | **S** | Low |
| 15 | Repo-layer scaffolding + `no-restricted-syntax` lint rule | **XL** | Medium — the umbrella for 5–8; do it incrementally, one repo at a time |
