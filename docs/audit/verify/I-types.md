# Lane I — types and validation

Branch `security/phase0-contain` vs `origin/main`. Read-only lane; no file under
`src/`, `supabase/` or `__tests__/` was touched.

---

## 1. Summary

**Compiler strictness was tightened, not relaxed.** The 30-line `tsconfig.json` diff
keeps `strict: true` and *adds* `noFallthroughCasesInSwitch`, `noImplicitReturns`,
`noImplicitOverride`, `verbatimModuleSyntax`, and moves `moduleResolution` to
`bundler`. The only loosening is a `"ts-node"` block that disables
`verbatimModuleSyntax` for ts-node's in-memory compile of `jest.config.ts`; it is
scoped to ts-node and does not reach `tsc --noEmit` or the app build. Three further
flags (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noPropertyAccessFromIndexSignature`) are documented as deliberately deferred.

**The branch did not add escape hatches — on net it removed them.**
`@ts-expect-error` and `@ts-ignore`: **0 on both refs**. Real non-null assertions
added under `src/`: **0** (the three `!` the scanner flagged in `src/lib/env.ts` are
inside comments documenting the *old* bad pattern). Total `any`-ish occurrences under
`src/` went **165 → 163**. `src/lib/counsellor/data.ts` holds 24 `as any` on both
refs — those lines are relocated, not added.

**`demo-tables.ts` still matches `schema.sql`.** All 18 tables it covers were
compared column by column against the DDL in `supabase/schema.sql`; every column
name, nullability and string-union matches the corresponding `CHECK` constraint. No
drift.

**The real finding is not in the diff — it is in what the new zod layer chose not to
check.** `src/lib/profile/intake-schema.ts` (260 new lines) mirrors 14 Postgres enums
exactly and is well aligned with the form's own validators. It leaves exactly one
field loose — `desired_location_type: mediumText.nullable()` — and that is the one
field whose DB column is an enum the app cannot satisfy. The intake form offers a
chip `capital_city` that **is not a member of the `location_type` enum** in either
`schema.sql` or the generated (remote-derived) types, and the multi-select is
comma-joined into a single enum column. Both are pre-existing (byte-identical on
`origin/main`), and both are hidden by `as` at `intake-logic.ts:231` and `as any` at
`persist-intake.ts:142`. I reproduced the rejection in a throwaway local Postgres 16.

Severity counts: **P0 0 · P1 1 · P2 1 · P3 3.**
Regression status: **0 YES · 3 NO (pre-existing) · 2 NEW.**

**Executed vs inferred: 22 of ~30 substantive claims were executed** (the diff scan,
all counts, the DDL/enum extraction and comparison, the Postgres rejection proofs,
the `git show origin/main` comparisons). The ~8 inferred claims are severity and
user-reachability judgements, and the runtime consequences of I-1/I-2 on a live
database — I did not and must not query production.

`npm run typecheck` was **not run**: the working tree went dirty mid-lane (another
agent editing `src/lib/chat/tools/student-read.ts`), and a concurrent mutation would
have corrupted the result.

---

## 2. The escape-hatch inventory

Method: `git diff origin/main...HEAD --unified=0 -- '*.ts' '*.tsx'` parsed line by
line, tracking new-file line numbers, matching `any` / `as X` / `@ts-expect-error` /
`@ts-ignore` / non-null assertion. 539 added lines matched at least one pattern; 221
of those are under `src/`, `e2e/`, `scripts/` or `playwright.config.ts`, and 111 of
*those* are comment or JSX-prose false positives (the word "as" in English, `!` in a
doc comment). 27 are `as const`. That leaves **79 substantive added escape hatches in
production code**, itemised below.

### `@ts-expect-error` / `@ts-ignore`

**Zero.** `git grep -c '@ts-expect-error\|@ts-ignore'` over `src/` + `__tests__/`
returns `0` on `origin/main` and `0` on `HEAD`.

### Non-null assertions (`!`) added under `src/`

| Location | Verdict |
|---|---|
| `src/lib/env.ts:56`, `:57`, `:138` | **Not assertions.** All three are inside a block comment illustrating the `process.env.X!` pattern the file exists to replace. Legitimate. |

Outside `src/`: `e2e/auth.setup.e2e.ts:29,30` (`process.env.E2E_EMAIL!`) — legitimate
in a Playwright setup file that is meaningless without those vars.
`scripts/simulate-profiles.ts:1638` (`bestBand!`) — guarded by the `anyMatch ?`
ternary immediately to its left. Legitimate.

### `as const` — 27 sites

`src/lib/data/columns.ts:48,56,59,67,79,86,89,96,103,106`,
`src/lib/auth/identity.ts:68`, `src/lib/matching/match-tier.ts:108`,
`src/lib/counsellor/stage-colors.ts:84`, `src/lib/profile/completion.ts:53`,
`src/lib/profile/intake-options.ts:153,155,156,183,184`, `src/lib/env.ts:365`,
`src/lib/observability/logger.ts:321`, `src/components/help/help-thread-drawer-impl.tsx:25,496`,
`src/app/counsellor/_components/analytics-charts.tsx:215,218`, e2e ×2.
**All legitimate** — literal narrowing, the opposite of an escape hatch.

### `SupabaseClient<any, any, any>` — 5 sites

`src/lib/api/guards.ts:29`, `:65`, `:96`, `:126`; `src/lib/chat/mode.ts:29`.
**Suspicious** — see finding I-3. The generic is erased precisely where
`data.role === 'counsellor'` is compared (`guards.ts:47`), which is the comparison the
audit prompt names as the one six static gates failed to protect.

### `as any` / `as any[]` under `src/` — 30 sites

| Location | Verdict |
|---|---|
| `src/lib/counsellor/data.ts` ×14 (`:209,321–326,343,359,615,618,622,873`) | **Legitimate-but-unchanged.** Count is 24 on both refs; these are relocated lines with new `unwrap` context labels, not new hatches. Pre-existing debt. |
| `src/lib/counsellor/decks.ts:133,137,319,325` (`(res: any) =>`) | **Suspicious, low impact.** Only feeds `unwrap`; the row shape is re-narrowed by the caller. Quality, not correctness. |
| `src/lib/profile/persist-intake.ts:42,48,56,62` (`(supabase as any)`) | **Legitimate boundary** — the rollback helper is generic over table name, which the generated client cannot express. But see I-1: the same pattern at `:139/:142` is what lets an invalid enum value through. |
| `src/lib/profile/intake-logic.ts:260,261` (`(r.level \|\| null) as any`) | **Suspicious** — see I-4. |
| `src/lib/profile/intake-options.ts:86` (`(Intl as any).supportedValuesOf`) | **Legitimate** — `supportedValuesOf` is not in the TS lib target. Guarded by a try/catch and a regex filter. |
| `src/features/parent/api/data.ts:340` | **Legitimate-but-unchanged**, same class as `counsellor/data.ts`. |
| `src/lib/chat/tools/counsellor-write.ts:102,187` (`params.student_id as string`) | **Legitimate** — `UUID_RE.test(student_id)` runs in the tool's `validate` step before `execute` (`counsellor-write.ts:91`). |

### Other `as` assertions of note

| Location | Verdict |
|---|---|
| `src/lib/profile/intake-logic.ts:231` (`arr.join(',') as …['desired_location_type']`) | **DEFECT** — I-1. Asserts a comma-joined string into a single-valued enum column. |
| `src/lib/profile/persist-intake.ts:142` (`… as any`) | **DEFECT** — I-1. Second layer over the same value. |
| `src/app/api/admin/import/route.ts:44` (`validation.rows! as never`) | **Suspicious** — I-5. `as never` is the standard Supabase union-table workaround and is fine; the `!` is not type-enforced. Note this is an *improvement* on main, which had `as any`. |
| `src/lib/auth/identity.ts:87` (`parseRole`) | **Legitimate.** `(ROLES as readonly string[]).includes(raw as string) ? (raw as Role) : 'student'` — membership is tested before the assertion and the fallback is the least-privileged role. Fails closed. |
| `src/lib/data/applications.ts:48` (`castRows<T>`) | **Legitimate, documented.** PostgREST cannot type aliased embed columns (`name:course_name`); the cast is deliberately centralised in one place instead of four. Unchecked, but a net reduction. |
| `src/lib/data/applications.ts:212`, `src/lib/data/errors.ts:130`, `src/lib/observability/logger.ts:151,166,178,189` | **Legitimate.** All are `unknown → Record<string, unknown>` narrowings immediately followed by a runtime shape test. `tierFromBreakdown` in particular validates `tier === 'Reach' \| 'Match' \| 'Safe'` before returning. |
| `src/app/dashboard/page.tsx:210,211` | **Legitimate boundary**, same `unwrap` class. |
| `src/lib/api/guards.ts:145` (`data as Array<{id: string; role: string \| null}>`) | **Suspicious** — I-3. `role: string`, not the `Role` union, so no literal checking. |
| `src/lib/counsellor/stage-colors.ts:108`, `src/app/counsellor/_components/*` | **Legitimate** — `Object.keys` widening, a TS limitation. |

### Test-side (317 rows, `__tests__/`)

Predominantly comment prose ("a change to any part of it") and mock-builder plumbing
(`Record<string, any>`, `args: any[]`). No `as any` found that suppresses an
assertion. Not itemised; nothing rose to a finding.

---

## 3. Findings

### I-1 — The intake form can submit two `location_type` values the DB enum rejects, and three layers of type assertion hide it
Severity: **P1** (wrong behaviour — a student's whole profile save fails, after a partial write)
Location: `src/lib/profile/intake-logic.ts:227-232`, `src/lib/profile/persist-intake.ts:139-158`, `src/lib/profile/intake-schema.ts:166`, `src/app/profile/_components/StudentIntakeForm.tsx:1950`
Regression?: **NO** (pre-existing — the same `arr.join(',')` and the same `capital_city` chip are on `origin/main` at `StudentIntakeForm.tsx:1160-1164` and `:2372`)

Evidence:

The column is a single-valued Postgres enum, in both the schema file and the
generated types (which are produced from the real remote database):

```
supabase/schema.sql:41
  create type location_type as enum ('london','major_city','smaller_city','suburban','no_preference');
supabase/schema.sql (student_lifestyle_preference)
  desired_location_type location_type,

src/lib/types/database.ts:2712  location_type: ["london","major_city","smaller_city","suburban","no_preference"]
src/lib/types/database.ts:1531  desired_location_type: Database["public"]["Enums"]["location_type"] | null
```

The form offers a value that is not in that set, and allows multi-select:

```
src/app/profile/_components/StudentIntakeForm.tsx:1950
  { value: 'capital_city', label: '🏙 Capital city' },      ← not an enum member
src/app/profile/_components/StudentIntakeForm.tsx:751
  return { ...prev, desired_location_type: [...withoutNone, value] };   ← appends
src/app/profile/_components/StudentIntakeForm.tsx:1947
  "Select as many as you like. Choosing multiple is fine — it won't affect your score."
```

The multi-select is then joined into the single enum column, with the mismatch
asserted away:

```
src/lib/profile/intake-logic.ts:227-232
  desired_location_type: (() => {
    const arr = lifestylePreference.desired_location_type;
    if (!arr || arr.length === 0) return null;
    // Store comma-separated; scoring treats multi-select same as no_preference
    return arr.join(',') as StudentProfilePayload['lifestyle_preference']['desired_location_type'];
  })(),
```

and again at the write, through an `any`-typed client:

```
src/lib/profile/persist-intake.ts:139-142
  const { error: lifestyleError } = await (supabase as any).from('student_lifestyle_preference').upsert({
    profile_id: userId,
    ...
    desired_location_type: lifestyle_preference.desired_location_type as any,
```

The branch's *new* runtime validator is the one place this could have been caught,
and it is deliberately loose there — `intake-schema.ts:165-166`:

```
  // Multi-select stored comma-joined by the form.
  desired_location_type: mediumText.nullable(),      // = z.string().max(500)
```

Executed proof, throwaway local Postgres 16 (own datadir, port 54399, torn down):

```
$ create type location_type as enum ('london','major_city','smaller_city','suburban','no_preference');
$ create table lp (profile_id uuid primary key, desired_location_type location_type);
$ insert into lp values ('1111...','london');
INSERT 0 1
$ insert into lp values ('2222...','london,major_city');
ERROR:  invalid input value for enum location_type: "london,major_city"
```

`'capital_city'` fails by the same mechanism — it is demonstrably absent from the
enum in both `schema.sql:41` and `database.ts:2712`. (I executed the comma-joined
case; the single `capital_city` case is the same rejection class, not separately run.)

Repro: open `/profile`, reach step 5, click the "🏙 Capital city" chip (or any two
location chips), submit → `persist-intake.ts:158` throws
`invalid input value for enum location_type: "capital_city"` and
`actions.ts:73-75` returns `{ success: false, message: <that string> }`.

Aggravating: `writeStudentIntake` is **not transactional**. `profiles` (`:86`),
`student_personal_information` (`:94`) and `student_academic_input` (`:137`) have all
committed by the time the lifestyle upsert throws at `:139`. The student sees a
failure but half the write landed.

Also note `fromPayload` (`intake-logic.ts:301-305`) migrates a stored `'london'` back
to `'capital_city'` on hydration — so a profile that *was* saved successfully with
`'london'` becomes un-resavable once opened and submitted again.

Fix (smallest): the DB is the authority here, so map the UI value to the enum at the
boundary rather than widening the column — in `intake-logic.ts:227-232`, map
`capital_city → london` and collapse a multi-selection to `'no_preference'` (which is
what the code comment already claims scoring does), then tighten
`intake-schema.ts:166` from `mediumText` to
`z.enum(['london','major_city','smaller_city','suburban','no_preference']).nullable()`
so the schema can never again permit a value the column rejects.
**This changes what is persisted for a student preference — per AUDIT-PROMPT §6 it
needs a product decision before being applied, not a unilateral fix.** The
alternative (an `alter type location_type add value 'capital_city'` plus widening to
`location_type[]`) is a production migration, which is out of scope.

Test: a unit test asserting
`studentProfilePayloadSchema.safeParse(payloadWith('capital_city,major_city')).success === false`
— red today (`mediumText` accepts it), green after the schema is tightened. Plus a
`ci-db-local.sh` assertion that every value `toPayload` can emit for
`desired_location_type` is a member of `location_type`.

---

### I-2 — Admin-import zod schemas permit values the catalogue columns reject, and the branch made the resulting error unreadable
Severity: **P2** (latent risk; admin-only surface)
Location: `src/app/api/admin/import/validation.ts:32,106,91-94`; `src/app/api/admin/import/route.ts:46-53`
Regression?: **NO** for the schema gaps (`validation.ts` is untouched by this branch — `git diff --stat` shows only `route.ts` changed). **NEW** for the error-message redaction layered on top.

Evidence:

```
validation.ts:106  deadline_date: z.string().optional()      DB: deadlines.deadline_date  date
validation.ts:32   rank_overall: z.coerce.number().optional() DB: universities.rank_overall int
validation.ts:91-94 min_ib_total/min_sat/min_act: z.coerce.number()  DB: program_requirements  int
```

Executed, local Postgres 16:

```
$ create table u (id int, rank_overall int, deadline_date date);
$ insert into u values (2, 5, 'Autumn 2027');
ERROR:  invalid input syntax for type date: "Autumn 2027"

$ insert into u values (1, 3.7, '2027-01-01');
INSERT 0 1
$ select rank_overall from u;   →  4
```

So the two classes differ: a bad date is a **hard 500**; a fractional integer is
**silent rounding** (3.7 imported as rank 4), which is the worse of the two because
nothing reports it.

The branch then removed the only diagnostic the admin had. `origin/main` returned
`{ error: error.message }` — PostgREST names the column and the offending value.
`route.ts:46-53` now returns `failure.message` (a generic class-of-failure string)
and logs the detail server-side. That redaction is correct as a security posture, but
combined with the pre-existing validation gap it means an admin with one malformed
date in a 5,000-row CSV gets an opaque 500 and no way to find the row.

Repro: POST `/api/admin/import` with `template: 'deadlines'` and a row whose
`deadline_date` is `"Autumn 2027"` → zod passes it → PostgREST 22007 → 500 with a
message that does not name the row.

Fix: `deadline_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()` and
`.int()` on the four integer-column coercions. Both are one-word changes and both
turn a 500 into the existing per-row 400 that already names the row index
(`validation.ts:191`).

Test: `validateTemplateRows('deadlines', [{program_id: <uuid>, name: 'x', deadline_date: 'Autumn 2027'}])`
returns an `error` naming row 1 — currently returns `{ rows: [...] }`.

---

### I-3 — `SupabaseClient<any, any, any>` in the auth guards erases literal checking on the exact role comparison the audit calls out
Severity: **P3** (quality / defence-in-depth; no live defect found)
Location: `src/lib/api/guards.ts:29,47,65,96,126,145`; `src/lib/chat/mode.ts:29`
Regression?: **NEW** (both files are added by this branch)

Evidence:

```
src/lib/api/guards.ts:28-29
  export const canActAsCounsellor = async (
    supabase: SupabaseClient<any, any, any>,
...
src/lib/api/guards.ts:36-47
    .from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (error || !data) return false;
    return data.role === 'counsellor' || data.role === 'admin';

src/lib/api/guards.ts:145
  return (data as Array<{ id: string; role: string | null }>)
    .filter((row) => row.role === 'student')
```

With the generic erased, `data.role` is `any` at `:47` and `string | null` at `:145`.
Neither position would reject `'counsellor.student'` — the literal that AUDIT-PROMPT
§2 records as having emptied the counsellor roster while six static gates stayed
green. The logic here is *correct today* and fails closed on an unreadable profile
(`:44-46`), so this is not a live defect; it is the removal of the one gate that
would have caught that bug class for free.

Fix: type the parameter `SupabaseClient<Database>` (importing the generated
`Database`) and drop the assertion at `:145`, letting `role` narrow to the generated
enum. If the two client factories genuinely produce incompatible generics, a shared
`type AnyServerClient = SupabaseClient<Database, 'public', any>` preserves the role
narrowing while keeping the call sites compatible.

Test: a type-level test (`expectTypeOf(data.role).toEqualTypeOf<Role | null>()`), or
simply the compile failure that `data.role === 'counsellor.student'` should produce
once the generic is real.

---

### I-4 — The new intake schema constrains `student_activities.level`/`duration` more tightly than the DB column, making a legacy row un-resavable
Severity: **P3** (latent risk)
Location: `src/lib/profile/intake-schema.ts:75,78,104,105`; `src/lib/profile/intake-logic.ts:260,261`
Regression?: **NEW** (the zod schema is added by this branch)

Evidence: the DB column is unconstrained text —

```
supabase/schema.sql:155  create table if not exists student_activities (
  ...
  level text,
  duration text,
```

— with no `CHECK`. The new schema admits only four values each:

```
intake-schema.ts:75  activityLevelSchema    = z.enum(['School','Regional','National','International'])
intake-schema.ts:78  activityDurationSchema = z.enum(['< 1 year','1–2 years','3–4 years','5+ years'])
```

and the write path casts the form's raw strings past the compiler:

```
intake-logic.ts:260-261
  level: (r.level || null) as any,
  duration: (r.duration || null) as any,
```

Because `saveStudentIntake` now hard-rejects on a parse failure
(`actions.ts:48-64`), any `student_activities` row already in the database whose
`level` or `duration` falls outside those eight strings will be hydrated by
`fromPayload`, fail validation on the next submit, and block the *entire* profile
save with a message pointing at "activities list".

Mitigating: the only writers I found are `scripts/seed-students.ts:247-248`, which
uses valid members, and the form itself, whose selects are bound to
`ACTIVITY_LEVELS` / `ACTIVITY_DURATIONS` (`intake-options.ts:155-156`) — and the
en-dash in `'1–2 years'` matches on both sides, which the schema author explicitly
called out at `intake-schema.ts:77`. So there is no known bad data. This is a risk
carried by imported or hand-edited rows.

Fix: `.catch(null)` on the two enum members, so an unrecognised legacy value degrades
to `null` instead of blocking the save.

Test: `studentProfilePayloadSchema.safeParse(payloadWithActivityLevel('Local')).success`
— currently `false`, should be `true` with the value normalised to `null`.

---

### I-5 — `validation.rows!` relies on a correlation the return type does not express
Severity: **P3** (quality)
Location: `src/app/api/admin/import/route.ts:44,56`
Regression?: **NO** (present on `origin/main` at the same lines; the branch changed `as any` → `as never`, an improvement)

Evidence: `validateTemplateRows` returns
`{ error?: string; rows?: Record<string, unknown>[] }` (`validation.ts:165`) — not a
discriminated union. The route tests `if (validation.error)` and then asserts
`validation.rows!` twice. Correct today, because every early return sets `error` and
the success return sets `rows`; but the invariant lives in the function body, not the
type, so a future fifth early-return that sets neither would upsert `undefined`.

Fix: change the return type to
`{ error: string; rows?: never } | { error?: never; rows: Record<string, unknown>[] }`;
both `!` then disappear on their own.

Test: not needed — the compile error after removing the `!` is the test.

---

## 4. What I checked and found clean

- **`tsconfig.json`** — `strict: true` intact. No strictness relaxed. Four flags
  added beyond `strict` plus `verbatimModuleSyntax` and `moduleResolution: bundler`.
  The `"ts-node"` override that disables `verbatimModuleSyntax` is scoped to ts-node's
  compile of `jest.config.ts` and cannot affect `tsc --noEmit` or the build. The
  `exclude` array is unchanged from `origin/main`.
- **`@ts-expect-error` / `@ts-ignore`** — zero on both refs, across `src/` and
  `__tests__/`. Nothing to justify.
- **Non-null assertions in `src/`** — zero added. The three matches are comment text.
- **Net `any` under `src/`** — 165 → 163 across 41 → 44 files. The branch did not
  trade type safety for velocity.
- **`src/lib/counsellor/data.ts`** — 24 `as any` on both refs. Every one the scanner
  flagged as "added" is a relocated line whose only change is the `unwrap` context
  label (`'programs'` → `'counsellor.programs'`). No new hatch.
- **`demo-tables.ts` ↔ `schema.sql`, column by column** — 18 tables compared
  (`help_requests`, `notifications`, `help_messages`, `help_notes`, `help_meetings`,
  `counsellor_notes`, `parent_contacts`, `parent_messages`, `guardian_links`,
  `student_documents`, `counsellor_decks`, `counsellor_deck_programs`,
  `deck_assignments`, `saved_searches`, `chat_feedback`, `chat_conversations`,
  `chat_messages`, plus the `applications` outcome columns). Every column present,
  every nullability correct, and every hand-written string union matches its `CHECK`
  constraint exactly — including `HelpRequestStatus`, `HelpMeetingStatus`,
  `GuardianLinkStatus`, `DeckCardRarity`, `DeckCardFit`, `CounsellorNoteType`,
  `ParentContactStatus`, `StudentDocumentType/Status`, `ChatMessageActionState`,
  and `ApplicationDecision` (against `applications_decision_check`). Two nuances
  worth knowing but not findings: `help_requests.application_id` is `text` in the DB,
  not a uuid FK, and the type correctly says `string | null`; and
  `SavedSearchRow.filters` / `CounsellorDeckRow.theme` are hand-typed shapes over
  unvalidated `jsonb`, which is the documented trade-off of this file.
- **`intake-schema.ts` enums ↔ Postgres enums** — 14 of 14 match member for member:
  `programme_type`, `intended_cluster` (all 10), `english_test_type`,
  `english_status`, `admissions_test_type`, `admissions_status`, `subject_level`,
  `gender_type`, `school_type`, `language_of_instruction`, `ib_grade`,
  `ib_math_pathway`, `teaching_style`, `campus_size_preference`.
  `location_type` is the only one not mirrored — that is I-1.
- **`intake-schema.ts` vs the form's own validators** — checked for the opposite
  failure (a new schema rejecting a payload the form can produce, which would be a
  regression). None found. Every non-nullable/`min(1)` field in the schema is gated
  by `validateStep1`/`2`/`3` in `src/lib/profile/intake-validation.ts`. The one field
  that looked exposed — `english_test_type`/`english_status` are non-nullable but the
  form does not require them when `englishRequired === 'no'` — is safe, because
  `intake-logic.ts:95-96` initialises them to `'NONE'` and `'missing'`, both valid
  members, and their TypeScript types exclude `''`.
- **The `Exact<>` drift guard** (`intake-schema.ts:203-215`) is a real bidirectional
  structural-identity check, not a tautology, and is backed by two mutual-assignability
  functions. It is compile-time only and erased at build.
- **`.passthrough()` / `.catchall()`** — zero occurrences anywhere in `src/`. The only
  loose zod is `z.record(z.any())` on two `metadata` fields, both of which map to
  `jsonb` columns. Correct.
- **Unknown-key handling on the two public write endpoints** — both strip rather than
  forward. `actions.ts:48` parses and then passes `parsed.data` (not `payload`) to the
  six-table write; `validation.ts:194` pushes `result.data`. zod's default `.strip()`
  means caller-invented keys cannot reach PostgREST.
- **`parseRole`** (`identity.ts:87`) — membership-tested before assertion, falls back
  to the least-privileged role. Correct fail-closed coercion.
- **Deleted `src/lib/validation/profile.ts`** — `git grep -n "validation/profile"
  origin/main -- src __tests__` returns nothing. The file had zero importers on
  `main`; its deletion loses no validation. (Cross-lane note for Lane A: this one of
  the ten deletions is confirmed safe.)
- **Test-side escape hatches** — 317 flagged rows under `__tests__/` reviewed in
  aggregate. Comment prose and mock-builder plumbing; no `as any` suppressing an
  assertion.

---

## 5. Not verified

- **`npm run typecheck`** — not run. `git status --short` was clean at lane start but
  showed ` M src/lib/chat/tools/student-read.ts` partway through, from a concurrent
  agent. Per my constraints a dirty tree invalidates the result, so I skipped it. The
  branch is reported green by the coordinator and I found nothing that contradicts
  that; **treat "typecheck exits 0" as inherited, not verified by this lane.**
- **The live remote schema.** I-1 rests on `supabase/schema.sql:41` and
  `src/lib/types/database.ts:2712` agreeing that `location_type` has five members and
  that `desired_location_type` is that enum. `database.ts` is generated from the
  remote database, so this is strong evidence — but I did not query production
  (AUDIT-PROMPT §2.1) and cannot rule out an out-of-band `ALTER TYPE ... ADD VALUE`
  applied after the last type generation. If someone has that access, one
  `select enum_range(null::location_type)` settles it.
- **End-to-end runtime behaviour of I-1 and I-2.** I proved the Postgres rejections
  directly in a local cluster, but I did not exercise the full
  form → server action → PostgREST path, so the exact HTTP status and the
  partial-write claim are reasoned from reading `persist-intake.ts:86-158`, not
  observed.
- **Whether any production row already violates I-4.** Requires reading
  `student_activities` on the remote database.
- **`src/lib/types/database.ts` as a whole vs `schema.sql`.** Out of lane scope
  (it is Lane C item 6, and the file is generated). I checked only the enums and the
  one table relevant to I-1.
- **Severity calibration for I-1.** I rated it P1 on the reasoning that the first
  location chip and any two-chip selection both fail. If product intends
  `capital_city` to be display-only sugar for `london`, the multi-select half remains
  but the single-select half disappears, and P2 would be fairer.
