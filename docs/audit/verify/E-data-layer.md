# Lane E — data layer and error handling

## Summary

Round 1. Findings: **P0 0 · P1 1 · P2 4 · P3 3** (8 total).
**18 of 22 substantive claims were executed** (scripts, `tsc`, `jest`, `git show`,
the ratchet itself); 4 are inferred by reading and are named in **Not verified**.

The four shared column lists in `src/lib/data/columns.ts` are **correct today**. I
diffed all seven consumers against `git show origin/main:<path>`: every migrated
select is a **superset** of what the call site used to send, every key of every
exported row type is present in its select string, and every column exists in
`supabase/schema.sql`. Nothing renders blank today.

What is missing is the **gate**. I dropped `country` from `UNIVERSITY_FIELDS`
(`'universities(name,country)'` → `'universities(name)'`) and ran the gates:
`tsc --noEmit` **exit 0**, `jest __tests__/data` **99/99 green**. At runtime that
mutation makes every programme in the parent portal read "UK" and nulls the
country in the assistant's `get_my_applications`. The refactor traded four
independently-wrong column lists for one shared list with a **larger blast
radius and no string↔type binding** (`castRows` is an unchecked `as T[]`). Of
~24 columns across the shared lists, only 7 are pinned by a test. That is E-02.

Ratchet: I counted independently with my own walker using the script's own exempt
rules and got **exactly 198**, matching `lint:datalayer`. But 198 is not the count
of PostgREST call sites: it includes **2 JSDoc-comment examples** and **4 Supabase
*Storage* `.from(bucket)` calls**. The honest figure is **192 real PostgREST sites
across 54 files**. The ratchet **does go red** (198→199, exit 1) and **refuses to
raise its own baseline** — both executed. But I demonstrated three ways past it:
deleting a doc-comment to pay for a real new call site (green), `.from(TABLES.x)`
(invisible), and `.rpc()` (uncounted, 1 real site exists). That is E-06.

Error handling: **21 sites discard a PostgREST error**, not ~25 — 8 direct
destructures, 12 named `Promise.all` responses, 1 unbound write. Of the ~30 write
chains in `src/`, **exactly one discards its error**: the compensating delete at
`matching/service.ts:922` (E-04). The most consequential *read* discards are
`middleware.ts` (E-01, a P1 onboarding lockout) and `service.ts:688` (E-05,
silently reorders and caches a student's match list).

PostgREST gotchas are clean: one `.or()` call, a fixed literal with no
user-supplied values; every date-only comparison goes through `parseLocalDate` /
`daysUntil`. One cosmetic inconsistency (E-08).

**All temporary edits reverted. `git status` shows no modification of mine.** The
only file I own here is `src/lib/data/columns.ts`; the ratchet proof required **no
repo edit at all** (scratch-tree fixture). Other lanes' edits were in flight
throughout; I polled and ran inside clean windows.

---

## Findings

### E-01 — `middleware.ts` discards all four completion-query errors, so one transient DB failure locks a fully-onboarded student into the wizard for 60 minutes
Severity: **P1** wrong behaviour
Location: `src/middleware.ts:174-188`
Regression?: **NO** (pre-existing — `git show origin/main:src/middleware.ts:101-113` is identical in disposition)

Evidence — the four responses are read for `.data`/`.count` and never for `.error`:
```
src/middleware.ts:174   const [personalResponse, academicResponse, lifestyleResponse, subjectsResponse] = await Promise.all([...]);
src/middleware.ts:181   const completionRecords = {
src/middleware.ts:182     personal: personalResponse.data,
src/middleware.ts:183     academicInput: academicResponse.data,
src/middleware.ts:184     subjectCount: subjectsResponse.count ?? 0,
src/middleware.ts:185     lifestyle: lifestyleResponse.data
src/middleware.ts:188   const needsOnboarding = !isProfileComplete(completionRecords);
```
My census script confirms `personalResponse.error` / `academicResponse.error` /
`lifestyleResponse.error` / `subjectsResponse.error` appear **nowhere** in the file:
```
===== D named response whose .error is never read =====
  src/middleware.ts:135  personalResponse
  src/middleware.ts:135  academicResponse
  src/middleware.ts:135  subjectsResponse
  src/middleware.ts:135  lifestyleResponse
```
And the wrong answer is **cached**:
```
src/middleware.ts:203   response.cookies.set('onboarding_status', `${user.id}:pending:${Date.now()}`, { maxAge: 60*60*12 })
src/middleware.ts:163   if (status === 'pending' && ageMinutes < 60) { return true; }   // short-circuits, no re-query
```

Repro: a student with a 100%-complete profile issues one request while the DB
returns any error `errors.ts` classifies as `unavailable` (`57014` statement
timeout, `08006` connection failure, `53300` too many connections). All four
`data` values are `null`, `count` is `null` → `isProfileComplete` returns `false`
→ redirect to `/profile/wizard` from **every** protected route, and the
`onboarding_status=…:pending:…` cookie short-circuits the re-check for the next
60 minutes. This is the same user-visible outcome the `COMPLETION_COLUMNS`
docblock says the refactor exists to prevent ("bounced to `/profile/wizard` from
every protected route, cached … by cookie") — the column list was fixed, the
disposition was not.

Fix: bind the errors and **fail open** on a read failure — treat "we could not
determine completion" as "do not redirect", and log via `reportDataError`. Failing
open is correct here: the wizard is not a security boundary, and a student who
genuinely is incomplete gets redirected on the next successful request. Do **not**
write the `pending` cookie when the reads errored.

Test: a middleware test that stubs the `student_academic_input` response as
`{ data: null, error: { code: '57014', message: 'canceling statement…' } }` with
the other three complete, and asserts the response is **not** a redirect to
`/profile/wizard` and that no `onboarding_status` cookie is set. Fails today
(currently redirects), passes after.

---

### E-02 — a column dropped from a shared list in `columns.ts` is caught by nothing: `tsc` exit 0, 99/99 data tests green
Severity: **P2** latent risk
Location: `src/lib/data/columns.ts:48` (and every constant in the file); `src/lib/data/applications.ts:48`
Regression?: **NEW** (the shared lists are new in this branch)

Evidence — executed. Mutation applied to my owned path, then reverted:
```
$ perl -i -pe "s/'universities\(name,country\)'/'universities(name)'/" src/lib/data/columns.ts
48:export const UNIVERSITY_FIELDS = 'universities(name)' as const;

$ npx tsc --noEmit
tsc exit=0                                    # zero errors

$ npx jest __tests__/data --silent --runInBand
PASS __tests__/data/errors.test.ts
PASS __tests__/data/call-sites.test.ts
PASS __tests__/data/columns.test.ts
PASS __tests__/data/applications.test.ts
Tests:       99 passed, 99 total
jest exit=0

$ git checkout -- src/lib/data/columns.ts
48:export const UNIVERSITY_FIELDS = 'universities(name,country)' as const;
```

Why nothing catches it: the select strings are runtime string literals and the row
shapes are independently-declared interfaces; `columns.ts:116` declares
`UniversityEmbed = Pick<Row<'universities'>, 'name' | 'country'>` with no relation
to the string. The gap is then explicitly widened by the unchecked cast at
`applications.ts:48`:
```ts
const castRows = <T>(rows: unknown): T[] => (rows ?? []) as T[];
```
`__tests__/data/columns.test.ts` pins only 7 of ~24 columns — `notes`,
`name:course_name`, `level:study_level`, `application_id`, and the three in
`APPLICATION_SUMMARY_SELECT`. **Unpinned:** `universities.name`,
`universities.country`, `programs.id`, all five of `DEADLINE_FIELDS`, four of five
of `CHECKLIST_FIELDS`, all of `MATCH_TIER_SELECT`, all of `DOCUMENT_SELECT`, and
`id`/`status`/`program_id` on the board select. The existing tests assert
`APPLICATION_BOARD_SELECT).toContain(DEADLINE_FIELDS)` — true by construction,
since the constant is interpolated, so it says nothing about the columns inside.

Repro: with the mutation above, `src/features/parent/api/data.ts:272`
(`country: app.program?.universities?.country ?? 'UK'`) renders **every** programme
as "UK" on the parent progress and finances pages, and
`src/lib/chat/tools/student-read.ts:52` reports `country: null` to the model. No
error, no log, no failing test.

Fix: derive the assertion from the type rather than restating it — one test that,
for each `(SELECT_CONSTANT, RowType)` pair, checks every key of the row type
appears as a column (or alias target) in the select string. Keys are available at
runtime via a small explicit key list per shape, or by parsing `columns.ts` for the
`Pick<…>`/interface members as the file already does for the composition checks.

Test: `expect(columnsIn(APPLICATION_BOARD_SELECT)).toEqual(expect.arrayContaining(keysOf<ApplicationBoardRow>()))`
for all seven shapes, including nested embeds. Fails under the `country` mutation
above; passes on HEAD.

---

### E-03 — `COMPLETION_COLUMNS` is bypassed by three of the six modules that compute profile completion
Severity: **P2** latent risk
Location: `src/app/dashboard/page.tsx:117,122,127`; `src/lib/chat/context.ts:97,103,109`; `src/components/forms/auth-form.tsx:58,63,66`
Regression?: **NO** (pre-existing; `COMPLETION_COLUMNS` does not exist on `origin/main` — `git show origin/main:src/lib/profile/completion.ts | grep COMPLETION_COLUMNS` → no match. The refactor introduced the constant and migrated 3 of 6 sites.)

Evidence — every caller of `buildStepCompletion` / `isProfileComplete`, and whether it uses the constant:
```
src/middleware.ts:175-177                 COMPLETION_COLUMNS   ✓
src/features/parent/api/data.ts:159-172   COMPLETION_COLUMNS   ✓
src/lib/counsellor/data.ts:609            COMPLETION_COLUMNS   ✓ (academicInput only; personal hand-written at :591)
src/app/dashboard/page.tsx:117,122,127    hand-written         ✗
src/lib/chat/context.ts:97,103,109        hand-written         ✗
src/components/forms/auth-form.tsx:58,63  hand-written         ✗
src/app/profile/page.tsx / wizard/page.tsx  select('*')        — safe (superset)
```
All three hand-written strings are byte-identical to the constant **today**:
```
COMPLETION_COLUMNS.personal       'first_name,last_name,email,nationality,resident_country'
COMPLETION_COLUMNS.academicInput  'programme_type,school_name,school_country,graduation_year,intended_clusters,english_required,english_status'
COMPLETION_COLUMNS.lifestyle      'extracurricular_interests'
```
There is no test on the three unmigrated sites. `__tests__/middleware/middleware.test.ts:451,479-480` and
`__tests__/counsellor/cohort-loader.test.ts:453` pin only the three that were migrated.

Repro: add a column to `buildStepCompletion`'s predicate and to
`COMPLETION_COLUMNS`. Middleware, the parent portal and the counsellor roster read
it; the dashboard, the assistant and **the login redirect** get `undefined` for it.
`auth-form.tsx:77` calls `isProfileComplete` to choose the post-login destination,
so a complete student is sent to `/profile/wizard` at login while middleware
considers them complete — the two halves of the app disagree about the same
student. This is the exact divergence class the constant was created for.

Fix: import `COMPLETION_COLUMNS` at the three sites. One-line change each.

Test: extend the existing source-scanner style used by
`__tests__/data/call-sites.test.ts` — a detector that lists every file calling
`buildStepCompletion` or `isProfileComplete` and asserts each either imports
`COMPLETION_COLUMNS` or selects `'*'`, with the detector itself exercised against a
synthetic hand-written source. Fails today on three files.

---

### E-04 — the compensating delete in the match-cache rollback is the one write in `src/` that discards its error
Severity: **P2** latent risk
Location: `src/lib/matching/service.ts:922`
Regression?: **NO** (`git show origin/main:src/lib/matching/service.ts:905` is identical)

Evidence — I audited every PostgREST write chain in `src/`. Of ~30, all bind
`{ error }`, return a `DbResult`, or handle it in a `.then(({ error }) => …)`.
Exactly one does none of those:
```
===== NEEDS EYES (2) =====
  src/components/university-search/saved-search-store.ts:211   → .then(({ error }) => …)   handled
  src/lib/matching/service.ts:922                              → discarded
```
```ts
// service.ts:908-925
// Rebuild the cache fail-safe: … if any insert batch fails, wipe the partial
// cache — an empty cache recomputes next request, but a truncated one would be
// served as authoritative for the full 24h TTL.
const { error: insertError } = await supabase.from('student_matches').insert(batch);
if (insertError) {
  console.warn(`Failed to persist cached matches batch ${i} — clearing partial cache`, insertError);
  await supabase.from('student_matches').delete().eq('profile_id', profileId);   // ← error discarded
  break;
}
```

Repro: insert batch 2 of 5 fails (payload/RLS/timeout), then the compensating
delete also fails. The student's `student_matches` cache is left holding batch 1
only. The code's own comment states the consequence: that truncated cache "would be
served as authoritative for the full 24h TTL". The student sees a silently
truncated match list for 24 hours, and nothing is logged about the failed rollback.

Fix: bind the delete's error and log it — `const { error: rollbackError } = await …;
if (rollbackError) reportDataError('matching.cacheRollback', rollbackError, { profileId })`.
Ideally also skip writing any cache-freshness marker so the next request recomputes.

Test: a `service` test with a mocked client whose `insert` fails on the second
batch and whose subsequent `delete` also fails; assert the failure is reported (spy
on the logger). Fails today — nothing is emitted.

---

### E-05 — a discarded error on the recognition-score read silently flattens every university to 3, reordering and then caching the student's match list
Severity: **P2** latent risk
Location: `src/lib/matching/service.ts:688`
Regression?: **NO** (`git show origin/main:src/lib/matching/service.ts:685-690` is identical)

Evidence:
```ts
// service.ts:682-696 — comment: "Used both for pinning high-prestige schools that
// fall below the result cap and for the final recognition-boosted sort."
const { data: recData } = await supabase          // ← error never bound
  .from('universities')
  .select('id, recognition_score')
  .in('id', allUniIds);
for (const row of (recData ?? []) as …) { … recognitionByUniId.set(row.id, row.recognition_score); }
```
The map is consumed at three places, two of which change what the student sees:
```
service.ts:788  const recScore = recognitionByUniId.get(course.university_id) ?? 3;      // pinning
service.ts:875  .map((m) => ({ m, key: m.score + ((recognitionByUniId.get(m.university.id) ?? 3) / 10) * 5 }))   // final sort key
service.ts:905  university_recognition_score: recognitionByUniId.get(match.university.id) ?? 3                    // written to the 24h cache
```

Repro: the `universities` read fails. `recData` is `null`, the map stays empty,
every lookup falls to `?? 3`. The recognition term in the sort key at :875 becomes
a constant `1.5` for every row, so the recognition-boosted ordering collapses to
raw score order, high-prestige pinning at :788 stops discriminating, and the
flattened `university_recognition_score: 3` is written into `student_matches` and
served for the cache's full TTL. Silent — no log, no fallback marker.

Fix: `soft<…>(await …, 'matching.recognitionScores', [])` so the failure is logged;
better, `unwrap` — there is no honest fallback for "every university is equally
recognised", and this feeds a cached, student-visible ranking.

Test: mock the `universities` select to return `{ data: null, error: { code: '57014' } }`
and assert the logger recorded `matching.recognitionScores`. Fails today.

---

### E-06 — the ratchet's "198 call sites" over-counts by 6, and three demonstrated routes get a real new `.from()` past it while it stays green
Severity: **P3** quality
Location: `scripts/check-data-layer.mjs:56-70`; `scripts/check-data-layer.baseline.json`
Regression?: **NEW**

Evidence — all executed against a scratch copy of `src/` (no repo edit).

*The number is reproducible but is not the count of PostgREST call sites.* My
independent walker, using the script's own exempt list, reproduces 198 exactly and
classifies it:
```
RATCHET-EQUIVALENT TOTAL (dedup by offset): 198

=== COMMENTS (not real call sites): 2 ===
  src/app/api/admin/admin-guard.ts:11   *       .from('profiles').select('role').eq('id', user.id).single();
  src/lib/auth/policy.ts:206            *       .from('counsellor_assignments')

=== STORAGE (not PostgREST tables): 4 ===
  src/app/applications/documents/page.tsx:51            .from(bucket)
  src/components/applications/document-uploader.tsx:84  supabase.storage.from(bucket).upload(...)
  src/components/applications/document-uploader.tsx:101 supabase.storage.from(bucket).remove(...)
  src/components/applications/document-uploader.tsx:106 supabase.storage.from(bucket).createSignedUrl(...)

REAL POSTGREST .from() SITES: 192
FILES WITH REAL POSTGREST SITES: 54
```
So the baseline carries **6 units of slack** over the real figure, and the "56
files" in the message is 54 files plus two that contain only a comment / only a
Storage call.

*The ratchet does work.* Both executed:
```
### add ONE .from() outside src/lib/data ###
✗ Direct .from() call sites outside src/lib/data rose 198 → 199.
exit=1

### --update-baseline must refuse to raise ###
✗ Refusing to raise the baseline 198 -> 199.
exit=1     # baseline file unchanged: "total": 198
```

*Three ways past it, each executed:*
```
### HOLE A: delete the JSDoc-comment .from() in policy.ts, add a REAL new call site ###
✓ 198 direct .from() call sites outside src/lib/data (at baseline, 56 files).   exit=0

### HOLE B: supabase.from(TABLES.apps).select('id')  — member-expression table name ###
✓ 198 direct .from() call sites outside src/lib/data (at baseline, 56 files).   exit=0

### HOLE C: supabase.rpc('search_filter_options')  — not counted at all ###
✓ 198 direct .from() call sites outside src/lib/data (at baseline, 56 files).   exit=0
```
Hole B is a real gap in the second pattern: `/\.from\(\s*[A-Za-z_$][\w$]*\s*[),]/`
requires `)` or `,` right after the identifier, so `.from(TABLES.apps)` is invisible.
Hole C matters because `.rpc()` is the same escape hatch and one real site exists
today (`src/app/api/search/filter-options/route.ts:10`).

This is the same class of defect as the 166→198 correction the script's own header
documents: the number is trusted as a count of a thing it does not actually count.

Fix: strip comments before matching (the project already has a `stripComments` in
`__tests__/data/call-sites.test.ts`); exclude a `.storage` receiver; widen the
identifier pattern to allow member expressions; count `.rpc(` into the same
baseline. Then re-baseline to the corrected number **in the same commit**, with the
delta explained in the JSON's `_readme` as the previous correction was.

Test: the script has no test. Give it the treatment `call-sites.test.ts` gives its
detectors — run the counter over synthetic fixtures asserting a comment counts 0, a
`.storage.from(bucket)` counts 0, `.from(TABLES.x)` counts 1, and `.rpc('f')` counts 1.

---

### E-07 — the error-logging consolidation reached 13 call sites; 95 `console.error`/`console.warn` remain, ~14 of them on PostgREST error paths, with no gate
Severity: **P3** quality
Location: repo-wide; e.g. `src/lib/applications/server-actions.ts:41,58,97,136`, `src/lib/matching/service.ts:517,638,719,914,921`, `src/lib/profile/persist-intake.ts:214,220`, `src/lib/chat/context.ts:387`
Regression?: **NO** (pre-existing; the refactor added `logger`/`reportDataError` and converted a subset)

Evidence:
```
$ rg -c 'console\.(error|warn)' src | ...   → 95 occurrences
$ rg -c 'logger\.(error|warn)' src | ...    → 13 occurrences
```
`src/lib/data/errors.ts:209` states the intent: such a call site should "record the
failure the same way and in the same format as everything else, instead of reaching
for a bare `console.error`". `documents/page.tsx:55` was converted and even
documents why; the writes in `server-actions.ts` and the whole of
`matching/service.ts` were not. The consequence is that the sanitisation
`DataError` provides — never interpolating the driver's message, which names
tables, columns, constraints and policies — does not apply to those 14 paths: they
pass the raw `PostgrestError` straight to `console`.

Fix: convert the ~14 Supabase-error `console.*` calls to `reportDataError(context, error)`.

Test: a source-scanner case in the `call-sites.test.ts` style — no
`console.error`/`console.warn` whose argument list contains an identifier matching
`/[Ee]rror$/` that came from a Supabase result, outside `lib/observability/`. Add
the allowlist, let it shrink.

---

### E-08 — `deriveAllDeadlines` sorts date-only strings with `new Date()` while its sibling three lines above uses `parseLocalDate`
Severity: **P3** quality
Location: `src/lib/counsellor/data.ts:703` (also `:461`, `:481`)
Regression?: **NO**

Evidence:
```ts
// counsellor/data.ts:698-703
    .filter((d) => parseLocalDate(d.date) >= today && parseLocalDate(d.date) <= cutoff)
    .sort((a, b) => parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime());   // correct
};
export const deriveAllDeadlines = (students: CounsellorStudent[]): DeadlineWithStudent[] =>
  withStudent(students).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());   // UTC parse
```
`d.date` is `deadlines.deadline_date`, a `date` column (`supabase/schema.sql:376`),
so these are date-only strings and `new Date('YYYY-MM-DD')` is UTC midnight —
the pattern `CLAUDE.md` and `src/lib/utils/dates.ts:3-7` both prohibit.

**No user-visible impact today**, and I want to be explicit about that rather than
inflate it: the UTC offset is a *constant* shift applied to both operands, so the
ordering a comparator produces is identical to `parseLocalDate`'s. It is a
correctness trap rather than a live defect — the next person to reuse this
expression for a *boundary* comparison instead of a sort inherits the bug.

Fix: use `parseLocalDate` at `:703` (and `:461`, `:481`) for consistency with the
rule the module already follows elsewhere.

Test: covered by whatever lint/codemod enforces the rule; there is currently none —
a `no-restricted-syntax` ESLint rule banning `new Date(` applied to an identifier
named `*date*` would be the durable form.

---

## What I checked and found clean

**Shared column lists vs every consumer (item 1).** All seven consumers diffed
against `origin/main`:

| Consumer | Old select | New | Verdict |
|---|---|---|---|
| `src/app/applications/page.tsx` | inline 4-level embed | `APPLICATION_BOARD_SELECT` | byte-identical column set |
| `src/app/applications/tasks/page.tsx` | no `status`, no `program_id`, checklist without `application_id` | `APPLICATION_TASKS_SELECT` | **wider** |
| `src/app/applications/documents/page.tsx` | `id, program:programs(name:course_name, universities(name))` | `APPLICATION_LABEL_SELECT` | **wider** |
| `src/features/parent/api/data.ts` | own `AppRecord`, no `notes`/`level`/`application_id` | `APPLICATION_BOARD_SELECT` | **wider** — this was the documented parent/child divergence, now closed |
| `src/lib/chat/context.ts` | `deadlines(name, deadline_date)`, checklist without ids | `APPLICATION_BOARD_SELECT` | **wider** |
| `src/lib/chat/tools/student-read.ts` | own `AppRow`, no programme id | `APPLICATION_BOARD_SELECT` + `{ limit: 20 }` | **wider**, cap preserved |
| `src/lib/chat/tools/student-write.ts` | own shape | `loadApplicationLabel` | **wider** |

No consumer reads a column absent from its select. Every key of
`ApplicationBoardRow`, `ApplicationTasksRow`, `ApplicationLabelRow`,
`ApplicationSummaryRow`, `MatchTierRow`, `DocumentRow`, `ProgrammeEmbed`,
`ProgrammeWithDeadlinesEmbed`, `DeadlineEmbed`, `ChecklistEmbed` and
`UniversityEmbed` appears in the corresponding select string — checked key by key.
Every column exists in `supabase/schema.sql` with a compatible type
(`programs.course_name:286+5`, `programs.study_level:286+7`, `deadlines.intake:376`,
`applications.status` is a **non-null** enum, `universities.name/country` non-null,
`documents.*:810`, `student_matches.breakdown:769`).

**Disposition changes are deliberate and documented.** Three reads changed
behaviour and each states why at the function: the board and dashboard moved from
silent-empty to `unwrap` (the original bug); the parent portal's tier lookup moved
from `throw` to `soft` so a parent and child degrade identically; chat's board read
moved to `unwrap` and lands in `buildContextForMode`'s `catch`
(`context.ts:364-367`), which I confirmed exists and returns `CONTEXT_UNAVAILABLE`.

**Error boundaries exist for every route that now throws** — `applications/error.tsx`
(covers `tasks/` and `documents/` by nesting), `dashboard/error.tsx`,
`parent/error.tsx`, plus root `error.tsx` and `global-error.tsx`; 14 in total.
`ErrorState` receives a `DataError` whose `message` is sanitised by construction
(`errors.ts:164` uses `REASON_BY_KIND`, never `detail.message`).

**Writes.** ~30 PostgREST write chains audited individually (I read the 5 lines
before each of 26 multi-line chains rather than trusting the regex). All bind
`{ error }`, return a `DbResult` to the caller (`decks.ts:191,237`), or handle it in
`.then(({ error }) => …)` (`saved-search-store.ts:211`). Only E-04 discards.

**PostgREST `.or()` gotcha — clean.** Exactly one `.or()` in `src/`:
`use-search-results.ts:276`, `q.or('admission_test.is.null,admission_test.neq.Required')`
— a fixed literal, no interpolation, no spaces. The three places that could have
built one instead use `.in()`/`.ilike()` and say so in comments
(`use-search-results.ts:144`, `chat/tools.ts:173`, `_universities-client.tsx:153`).

**Date-only gotcha — clean apart from E-08.** `src/lib/utils/dates.ts` is correct
(`parseLocalDate` regex-matches then constructs a local date; `isValidDate` uses a
UTC round-trip *deliberately*, for calendar validity, and says so). All other
`new Date(x.date)` hits are on `created_at` timestamps or inside order-preserving
sort comparators.

**Deliberately not findings.** `src/app/scholarships/page.tsx:65` discards its
error, but `scholarships` is not a real table yet and the page intentionally falls
back to clearly-labelled sample data (`:62-66`) — the discard is load-bearing, not a
defect. The remaining discarded reads (`admin/page.tsx:40`,
`admin/simulation/page.tsx:78`, `inbox-list.tsx:114`, `use-search-results.ts:629`,
`university-read.ts:71`, `service.ts:1004`) are admin-only or degrade a single
label/chip; worth cleaning up but not worth a finding line each.

**Gates run.** `npm run lint:datalayer` → green, 198 at baseline.
`npx jest __tests__/data --runInBand` → 4 suites, **99/99 green**, twice (baseline
and under the E-02 mutation). `npx tsc --noEmit` → exit 0 under the E-02 mutation.

**Tree state.** I made **zero** permanent changes. The ratchet proof used a scratch
copy of `src/` under the scratchpad and required no repo edit. The one temporary
repo edit was `src/lib/data/columns.ts` — my owned path — reverted with
`git checkout -- src/lib/data/columns.ts` and confirmed:
`git status --short -- src/lib/data/` returns nothing.

---

## Not verified

1. **The E-01 lockout end-to-end.** I traced the cookie logic by reading
   `middleware.ts:138-206` and confirmed the discarded errors with a script, but I
   did **not** run the app with an injected DB failure and observe the redirect.
   The 60-minute cache claim rests on reading `:163` (`status === 'pending' &&
   ageMinutes < 60` → `return true`), not on execution.
2. **The E-02 runtime blast radius.** `tsc` exit 0 and 99/99 green under the
   mutation are executed facts. That the parent portal then renders "UK" for every
   programme is inferred from `features/parent/api/data.ts:272`; I did not render
   the page. (The inference is strong — it is a `?? 'UK'` on the removed field —
   but it is an inference.)
3. **E-04 / E-05 consequences.** Both are reachable only when a specific query
   fails. I confirmed the discarded error and traced the downstream use
   (`service.ts:788,875,905`); I did not inject a failure and observe a truncated
   cache or a reordered match list.
4. **The full suite, and both timezones.** I ran only `__tests__/data` (and read
   `__tests__/middleware`, `__tests__/data/call-sites`, `__tests__/data/columns`).
   I did not run `npm test`, `build`, `lint`, `lint:boundaries` or the
   `TZ=America/Los_Angeles` pass — other lanes were mutating `src/` throughout this
   session and a full run would have been polluted. Lane F owns the suite.
5. **`src/lib/data/student-demo-data.ts`** (650 lines) was excluded from the
   column-list review — it is static demo fixtures, not a loader, and predates the
   refactor (mtime July 16).
6. **The 12 named-response discard sites** were identified by a heuristic
   (identifier suffix `Res|Response|Result|Row|Rows|Query` whose `.error` is never
   referenced in the file). I hand-verified `middleware.ts` and
   `chat/context.ts`; the `help-request-client.ts` and `parent/api/data.ts:152`
   entries I did not open. The true total may be slightly higher than 21.
