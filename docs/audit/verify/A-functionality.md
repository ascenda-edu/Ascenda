# Lane A — functionality preservation

**Question:** does everything that worked on `origin/main` still work on HEAD (`40cb781`)?

---

## Summary

**Executed vs inferred: 6 claims executed, ~34 inferred by reading.** Executed: the clean-HEAD
production build (`EXIT=0`), the full Jest suite on clean HEAD (67 suites / 1541 tests, `EXIT=0`),
the A2 repro (3 assertions, executed and passing), the route-file inventory diff (empty), the
`'use client'` file-set diff, and the per-file scoping-filter census. Everything else — per-route
render comparison, the ten deletions, the parent slice, the demo walkthrough — is read-and-compare
against `git show origin/main:<path>`, not run.

**Counts:** P0 0 · P1 1 (process, not code) · P2 2 · P3 3

| ID | Claim | Regression? |
|---|---|---|
| A1 | Parent chat mode now requires an active `guardian_link` while `/parent/*` stays open to all — the Ascendi widget and `/parent/assistant` 403 on every message for any user without one | **YES** |
| A2 | Server-side zod validation rejects values the intake wizard itself accepts and stores; the whole six-table save fails with a message that names no field the user can find | **NEW** |
| A3 | `matchesTierFilter` now excludes unscored programmes from a narrowed tier facet (previously shown) | NEW (intentional) |
| A4 | Counsellor `enrolled` is no longer collapsed into `decision`; every counsellor stage count changes | NEW (intentional) |
| A5 | **Lanes are running concurrently in one working tree and corrupting each other's runs** | n/a — process |
| A6 | `isActionableStudent` fails **open** (`if (error \|\| !data) return true`), contradicting its own docstring | NO (Lane B owns) |

### Blocking other lanes

**A5 is a hard blocker and should be actioned before anything else in this round.** At the time I
ran my first `npm run build` the shared checkout contained another lane's in-flight mutations
(`src/lib/auth/identity.ts`: React `cache()` → module-global memo; `src/lib/chat/context.ts`: five
`.eq('profile_id', userId)` filters deleted plus a syntax error). My build failed with
`./src/lib/chat/context.ts:118:7 Type error: ',' expected.` — **entirely an artefact of another
agent's mutation test, not a defect in HEAD.** By the end of the session `src/lib/api/guards.ts`
was also dirty.

Consequences: (a) any gate result any lane reports this round is untrustworthy unless it says which
tree it ran in; (b) the coordinator's "baseline green" for today may have been measured on a
mutated tree; (c) two lanes mutating simultaneously will attribute each other's red to their own
mutation. **Every lane doing mutation testing must run in its own `git worktree`.** I re-ran
everything in `git worktree add --detach <scratch> HEAD` with `node_modules` symlinked; both gates
were green there, and I left the other lane's edits untouched.

Non-blocking but worth the coordinator's attention: A1 sits on the boundary of Lane A and Lane B —
the *code* is a deliberate security tightening, the *defect* is that the portal guard was not
tightened with it, so a rendered surface's only function always fails.

---

## Findings

### A1 — Parent chat mode requires a guardian link that the parent portal does not

Severity: **P2** (a portal that renders fine but whose assistant and floating widget 403 on every
message)
Location: `src/lib/chat/mode.ts:56-83` (`hasActiveGuardianLink`, `resolveChatMode`) vs
`src/lib/auth/policy.ts:162` (`PARENT_PORTAL_OPEN_TO_ALL = true`) and
`src/app/parent/layout.tsx:12-16`
Regression?: **YES** (worked on `origin/main`)

**Evidence.** `origin/main`'s `resolveChatMode` authorised counsellor mode only:

```
$ git show origin/main:src/lib/chat/mode.ts | sed -n '37,45p'
  if (mode === 'counsellor' && !(await canActAsCounsellor(supabase, user))) {
    return { ok: false, reason: 'forbidden' };
  }
  return { ok: true, mode };
```

HEAD adds a second gate (`src/lib/chat/mode.ts:64-66`):

```
  if (mode === 'parent' && !(await hasActiveGuardianLink(supabase, user.id))) {
    return { ok: false, reason: 'forbidden' };
  }
```

`hasActiveGuardianLink` counts `guardian_links` rows with
`.eq('parent_profile_id', userId).eq('status','active')` and fails closed on error.

Meanwhile the portal itself is still open to everyone:

```
$ grep -n "PARENT_PORTAL_OPEN_TO_ALL" src/lib/auth/policy.ts
162:export const PARENT_PORTAL_OPEN_TO_ALL = true;
284:  if (action === 'portal:parent' && PARENT_PORTAL_OPEN_TO_ALL) return true;
```

So `/parent`, `/parent/progress`, `/parent/deadlines`, `/parent/finances`, `/parent/messages` and
`/parent/assistant` all render for any authenticated user (they show `NoLinkedChildren`), and
`DashboardShell` mounts `<ChatbotWidgetLazy />` on every one of them.
`src/lib/chat/paths.ts:24-28` derives the mode from the pathname:

```
export function detectMode(pathname: string): ChatMode {
  if (pathname.startsWith('/counsellor')) return 'counsellor';
  if (pathname.startsWith('/parent')) return 'parent';
  return 'student';
}
```

Both consumers then hard-fail: `src/app/api/chat/route.ts:98-101` returns `403 {"error":"Forbidden"}`
and `src/app/api/chat/suggestions/route.ts:34-37` returns `403 {"suggestions":[]}`.

**Repro.** Sign in as any account with no active `guardian_links` row (i.e. anyone who is not the
seeded demo user), open `/parent`, open the Ascendi bubble, send a message → 403 on `POST /api/chat`
and on `GET /api/chat/suggestions?mode=parent`. Same on `/parent/assistant`. On `origin/main` the
same request returned a parent-mode reply.

**The counsellor half is NOT a regression.** I initially believed it was; `git show
origin/main:src/lib/chat/mode.ts` refutes that — `canActAsCounsellor` already gated counsellor mode
on main. Only the parent limb is new.

**The demo is unaffected.** `supabase/migrations/20260716120000_guardian_links.sql:63-78` seeds an
active link for `greg@workiflow.com` against the first `+seed@ascenda.demo` child, so the demo
account passes `hasActiveGuardianLink`. Verified by reading the migration; **not** verified against
the database (§2 rule 1).

Fix: pick one of the two and make them agree — either scope `portal:parent` to the same
`guardian_links` predicate (so the portal 302s instead of rendering a dead assistant), or keep the
portal open and have `resolveChatMode` downgrade an unlinked parent-mode request to a
children-less parent context rather than refusing it. This is a product decision about the demo
posture: **stop and ask the user** rather than deciding in the audit.

Test: extend `__tests__/db/portal-flag-agreement.test.ts` (or a sibling) so it asserts, for each
portal, that `can(identity, 'portal:X')` and `resolveChatMode(_, user, 'X')` return the same answer
for the same identity. It must go red if either side is changed alone — that is exactly the
coordination failure that shipped here.

---

### A2 — The intake wizard accepts values its own save endpoint now rejects, and the error names no findable field

Severity: **P2** (a student who typos one optional number cannot save their profile at all, and is
given no way to locate the field)
Location: `src/app/profile/actions.ts:39-62`, `src/lib/profile/intake-schema.ts:174-175` (and
`:28`, `:142`, `:169`, `:179`), `src/app/profile/_components/StudentIntakeForm.tsx:1746-1755`,
`:2126-2138`
Regression?: **NEW** (added by the refactor — `origin/main`'s `saveStudentIntake` had no runtime
validation and these values persisted)

**Evidence — executed.** I wrote a throwaway spec in an isolated worktree (deleted after the run):

```
$ npx jest __tests__/laneA-repro.test.ts
  console.log  SAT   issues: [ 'lifestyle_preference.sat_score: Number must be less than or equal to 1600' ]
  console.log  SAT   user-facing: lifestyle preference
  console.log  ASPIR user-facing: career aspiration
PASS __tests__/laneA-repro.test.ts (28.834 s)
  ✓ SAT 1650: passes every client step validator, then fails the save (565 ms)
  ✓ 4001-char career aspiration: same shape (3 ms)
  ✓ baseline: the same profile without those values saves (1 ms)
Tests: 3 passed, 3 total
```

The spec builds a complete A-level `IntakeFormState`, asserts `validateStep1`, `validateStep2` and
`validateStep3` all return `{}` (these are exactly the three `handleFinalSubmit` runs — see
`StudentIntakeForm.tsx:898-908`), then feeds `toPayload(state)` to `studentProfilePayloadSchema`.

**Why the browser does not catch it.** The SAT input does carry `max={1600}`
(`StudentIntakeForm.tsx:1746`) and the form has no `noValidate`, so native constraint validation
would normally fire. It cannot here: the only `type="submit"` button is the Review-step one
(`:2132`), every step-navigation button is `type="button"` (`:2118`, `:2127`), and step 4 is
conditionally rendered — by the time submit runs, the SAT input is unmounted and its
`rangeOverflow` is invisible to the browser. The value survives in React state and reaches the
payload.

**What the student sees.** `actions.ts:52-56` returns
`Some of your answers could not be saved: lifestyle preference. Please shorten or correct them and
try again.` `describeIntakeIssues` has no `FIELD_LABELS` entry for `lifestyle_preference.sat_score`,
so it falls back to `issue.path[0]` (`intake-schema.ts:249`). The student is on step 6, the field is
on step 4, `setErrors` was cleared, nothing is highlighted, and every retry fails identically.

**Same class, other fields** (all confirmed uncapped in the UI, all `text`/unbounded in
`supabase/schema.sql`): `career_aspiration` is a plain `<input type="text">` with no `maxLength`
(`:1394-1399`) against `longText` = 4000; `ambition_statement` (`:1917`) and
`work_experience_summary` (`:1902`) are `<textarea>`s with no `maxLength` against the same 4000.
`ee_summary` is the one field that is capped client-side (`maxLength={350}`, `:1587`).

`intake-schema.ts:9-11` states the intent — *"this schema must never reject a payload the real
intake form can actually produce"* — and `actions.ts:47-51` explicitly anticipates the
career-aspiration case. The intent is right; the invariant is not held, and nothing enforces it.

Fix (smallest): add the missing client-side caps so the two layers agree —
`maxLength={4000}` on the four free-text fields, and a step-4 range check on `sat_score`/`act_score`
mirroring the schema bounds. Optionally add `FIELD_LABELS` entries so the fallback message is
actionable even when a new gap appears.

Test: the executed spec above, generalised — a property/table test that, for every bound in
`studentProfilePayloadSchema`, constructs a state at bound+1, asserts the three step validators
return `{}`, and asserts `safeParse` succeeds. It fails today on `sat_score`, `act_score`,
`career_aspiration`, `ambition_statement`, `work_experience_summary`, and passes once the caps are
aligned. That is the invariant the schema's own docblock claims.

---

### A3 — Tier facet now hides unscored programmes when narrowed

Severity: **P3** (recorded so a future session does not "fix" it back)
Location: `src/components/university-search/types.ts:75-81`,
`src/app/university-search/search/page.tsx:362-368`
Regression?: **NEW** — a deliberate, documented behaviour change

**Evidence.** `origin/main` inlined the predicate at the call site:

```
-      const matchesTier = result.tier ? filters.tiers.includes(result.tier) : true;
```

HEAD extracts it and inverts the unscored case:

```
export const matchesTierFilter = (tier, selected) => {
  if (tier) return selected.includes(tier);
  return selected.length === ALL_TIERS.length;
};
```

So narrowing to "Reach only" no longer returns every unknown-fit programme alongside the Reach
ones. The default (all three tiers selected — `search-params.ts:56`) is unchanged, so the demo's
search beat is unaffected. Paired with the `scoreProgramsForProfile` change that maps an unscored
programme to `null` instead of a ~90 fallback (`src/lib/matching/service.ts:955-973`). Both changes
are argued in the code. No fix; Lane D owns the scoring half.

---

### A4 — `enrolled` is no longer collapsed into `decision` on the counsellor side

Severity: **P3** (visible number changes on four counsellor surfaces)
Location: `src/lib/counsellor/data.ts:441` (was `status: (app.status === 'enrolled' ? 'decision' :
app.status)`), `src/lib/counsellor/types.ts:26`, `src/lib/counsellor/stage-colors.ts:64-106`
Regression?: **NEW** — deliberate, and the coverage is complete

**Evidence.** The rewrite is gone:

```
-        status: (app.status === 'enrolled' ? 'decision' : app.status) as ApplicationStatus,
+        status: app.status as ApplicationStatus,
```

Consequence: `/counsellor/analytics` "Decision Received" and the kanban `decision` column both
shrink by the number of enrolled applications, and a fifth `Enrolled` bar/column/stat appears.
I checked every table that must grow with it and all five are covered: `ApplicationStatus`
(`types.ts:26`), `STAGE_LABEL` + `STAGE_COLORS` + new `STAGE_ORDER` with a compile-time
exhaustiveness guard (`stage-colors.ts:36-79`), `APPLICATION_STATUS_VISUAL` (indexed unguarded now,
so a gap is a typecheck failure), `FUNNEL_STAGE_TO_STATUS`/`FUNNEL_STAGES`, `appFunnel`
(`data.ts:672`), `buildPriorYearFunnel` (`analytics-charts.tsx:229`), `APP_STATUS` in
`student-detail-tabs.tsx:59-65`, and the kanban `emptyByStatus` helper. A new "Enrolled" stat card
was added to `/counsellor/applications`. No fix needed; recorded so the count change is not later
reported as a bug.

---

### A5 — Concurrent lanes share one working tree

Severity: **P1** (invalidates gate results across the whole round)
Location: process, not code — `/Users/gregfranck/Ascenda` working tree
Regression?: n/a

**Evidence.**

```
$ git status --short          # ~40 min into this lane
 M src/lib/auth/identity.ts
 M src/lib/chat/context.ts

$ git diff -- src/lib/auth/identity.ts | head -20
-export const getIdentity = cache(async (): Promise<Identity | null> => {
+const globalMemo = <T extends (...a: never[]) => unknown>(fn: T): T => { ... };
+export const getIdentity = globalMemo(async (): Promise<Identity | null> => {

$ git diff -- src/lib/chat/context.ts   # five .eq('profile_id', userId) removed + a lost comma

$ tail -3 build.log
./src/lib/chat/context.ts:118:7
Type error: ',' expected.
EXIT=1
```

`git show HEAD:src/lib/chat/context.ts` still has all five filters, so HEAD is fine and the failure
was purely the other agent's edit. Re-running in a detached worktree at HEAD:

```
$ npm run build     # worktree at 40cb781
 ✓ Compiled successfully in 3.4min
EXIT=0

$ npx jest --silent --runInBand
Test Suites: 67 passed, 67 total
Tests:       1541 passed, 1541 total
EXIT=0
```

By session end `src/lib/api/guards.ts` had also been modified by another lane. I did not revert any
of it.

Fix: give every lane that mutates source its own `git worktree` (`git worktree add --detach <dir>
HEAD`, symlink `node_modules`, copy `.env.local`), and require each lane report which tree its
numbers came from. Re-measure the round baseline in a clean tree.

---

### A6 — `isActionableStudent` fails open (cross-lane note; Lane B owns)

Severity: **P3** here (Lane B should re-rate it)
Location: `src/lib/api/guards.ts:63-75`
Regression?: **NO** — `origin/main` had no per-student check at all, so this is strictly stronger
than before

```
  if (error || !data) return true;
  return data.role === 'student';
```

The docblock two functions down claims *"Refuses unknown ids and non-student rows alike"*
(`guards.ts:104-105`). It does not: an unknown id, or a `profiles` row the caller cannot read under
RLS, is **accepted**. The batch sibling `filterActionableStudentIds:143` does the opposite
(`if (error || !data) return [];` — "Fail closed") — so the singular and batch forms of the same
rule disagree. Flagged here only because I hit it while checking the demo's counsellor-note beat;
Lane B is authoritative on the severity and the fix.

---

## What I checked and found clean

Do not redo these.

**Route inventory (executed).** `git ls-tree -r --name-only <ref> -- src/app` filtered to
`page|route|layout|loading|error|not-found|template|default`: **136 files on `origin/main`, 136 on
HEAD, `diff` empty.** No route was added, removed or renamed. The `error.tsx`/`loading.tsx`/
`not-found.tsx` sets are byte-for-byte the same list on both refs (54 files) — no route lost its
error boundary or loading state. The clean-HEAD build emitted 74 routes covering all 13 CLAUDE.md
route families plus `/parent/*`, `/shortlist`, `/role-select`, `/appointment` and all 27 API routes.

**The ten deletions — all were unreferenced dead code on `origin/main`.** For each file I extracted
its exported symbols with `git show origin/main:<path> | grep '^export'` and ran
`git grep -lw <symbol> origin/main -- src __tests__`. Every symbol returned exactly one file: its own
definition. Nothing imported `StepRoadmap`, `DeadlineNudges`, `OutcomeTracker`, `PulseCards`,
`PulseCardIcon`, `StatsCard`, `SubjectGradeTable`, `ShareMatchButton`, `useTypingEffect`,
`draftMessageForApplication`, or any of the 13 exports of `src/lib/validation/profile.ts`
(`CURRICULUM_OPTIONS` … `ProfileAspirationsValues`). No page rendered any of them. **Zero capability
lost.** The two grep hits for `deadline-nudges`/`outcome-tracker` are prose in a comment in
`src/lib/data/student-demo-data.ts`, present identically on both refs.

**Silently narrowed queries — none found.** I extracted every added and removed `.select(`,
`.limit(`, `.range(`, `.eq(`, `.in(`, `.order(` line from the 15,478-line `src` diff and reconciled
them. Results: two `.limit()` removals, both accounted for (`MAX_APPS` became
`loadApplicationBoard`'s `options.limit`, still 20; the other is a reordered `.limit(1)`). No
`.limit()` appeared where there was none. Every consolidated select is **equal or wider** than the
call site it replaced —
`APPLICATION_LABEL_SELECT` adds `id`/`level`/`country` to the documents page's old
`'id, program:programs(name:course_name, universities(name))'`; `APPLICATION_BOARD_SELECT` gives the
parent portal the `notes`, `level` and `application_checklist.application_id` its hand-written copy
omitted; `COMPLETION_COLUMNS.academicInput` adds the `english_status` that
`loadRoster`'s old list was missing. `MATCH_TIER_SELECT` (`program_id,breakdown`) exactly matches the
two `'program_id, breakdown'` sites it replaced, and the two sites that also read `score`
(`chat/context.ts`, `chat/tools/student-read.ts`) still use their own
`'program_id, score, breakdown'` and were not migrated. Ordering preserved:
`loadApplicationsWithTasks` keeps `.order('id')`, `loadDocumentsForApplications` keeps
`.order('uploaded_at', {ascending:false})`.

**Tenancy filters — nothing dropped (executed census).** `.eq('profile_id'|'student_profile_id'|
'parent_profile_id'|'owner_id'|'author_profile_id'|'counsellor_profile_id', …)` across `src`:
**94 on `origin/main`, 92 on HEAD.** Every per-file reduction is a move into a loader that
re-applies the same filter, verified individually: `applications/page.tsx` 2→0
(`loadApplicationBoard` + `loadTierByProgram`), `applications/tasks` 1→0, `applications/documents`
1→0, `dashboard/page.tsx` 6→5, `chat/context.ts` 6→5, `chat/tools/student-read.ts` 3→2,
`lib/parent/data.ts` 11 → `features/parent/api/data.ts` 9, `persist-intake.ts` 4→3 (three inline
deletes became one parameterised `replaceOwnedRows` scoped by `userId`, called three times);
`lib/data/applications.ts` contributes +5, `policy.ts` +2, `chat/mode.ts` +1. All five parent
loaders still scope on `childId`.

**The `parent` feature slice — complete, nothing dropped.** All 12 files are true `git mv` renames
(similarity 76–100%). Every route file now imports from the single `@/features/parent` barrel and
every symbol it needs is exported. No client component imports the barrel (which re-exports
`api/context.ts` → `next/headers`); all six moved into `ui/` and import relatively. The
`data.ts` rewrite (76% similarity) is the local `unwrap` being replaced by the shared one and the
applications embed by `loadApplicationBoard`; every returned field of `ChildOverview`,
`ChildApplication`, `ChildDeadline`, `ProgrammeCostLine` and `ParentThread` is still populated, and
`loadChildFinances` still fetches the wide `programs` row (7 columns + 4 university columns) rather
than the board shape. The layout guard changed from `if (!user) redirect('/login')` to
`requireIdentity()` + `can(identity,'portal:parent')`, which is equivalent while
`PARENT_PORTAL_OPEN_TO_ALL === true` (see A1 for the part that is not).

**Client/server boundaries.** `'use client'` file set diffed both ways: every removal is a deleted
or renamed file; the only three additions are `help-thread-drawer-impl.tsx`,
`command-palette-dialog.tsx` and `lib/auth/role-context.tsx`, all genuinely client. All four
`ssr: false` sites (`chatbot-widget-lazy`, `command-palette`, `essay-workshop-lazy`,
`help-thread-drawer`) sit in files that begin with `'use client'` — none reaches a Server Component.
No non-`'use client'` file under `src/app` touches `window`/`document`/`localStorage`/
`sessionStorage`/`navigator` (five grep hits, all false positives inside identifiers or prose). The
clean-HEAD `next build` succeeding is the independent confirmation.

**The profile intake extraction (the largest single rewrite: −643/+235 in
`StudentIntakeForm.tsx`, +1,058 in six new `lib/profile/*` modules).** I compared every option list
programmatically by parsing the array literals out of both versions: `CLUSTER_OPTIONS` 10↔10,
`SCHOOL_TYPE_OPTIONS` 5↔5, `SUBJECT_OPTIONS` 27↔27, `ENGLISH_TEST_OPTIONS` 5↔5,
`ENGLISH_STATUS_OPTIONS` 6↔6, `ADMISSIONS_TEST_OPTIONS` 8↔8, `ACTIVITY_CATEGORIES` 13↔13,
`ACTIVITY_DURATIONS` 4↔4, `ACTIVITY_LEVELS` 4↔4, `A_LEVEL_GRADES` 7↔7, `COMMITMENT_OPTIONS` 4↔4,
`EXTRACURRICULAR_OPTIONS` 9↔9, `IB_GRADES` 5↔5, `LEADERSHIP_OPTIONS` 8↔8 — **every value set
identical**. `COUNTRY_OPTIONS` and `GRADUATION_YEARS` are computed IIFEs and are textually
byte-identical apart from the `export` keyword. The 22 `const` declarations on main map 1:1 onto the
16 `intake-options.ts` exports plus the 6 that stayed in the component. Field `id`/`name`/`htmlFor`
attributes: no losses, two additions (`intake-resident-country`, `intake-school-country` — a11y
labels). JSX element churn is 12 removed vs 24 added tags, all structural. `validateStep1..5` moved
verbatim. The `/profile` page's seven reads are unchanged column-for-column
(`user.id` → `identity.userId` only). `recalculateStudentScore` and `resubmitStudentProfile` were
deleted from `actions.ts` — I confirmed both had zero callers on `origin/main` and that
`POST /api/profile/recalculate-score` still exists and is what the app calls.

**Per-route render diff for the 54 changed files under `src/app`.** Dominant pattern is
`getUser()+redirect` → `requireIdentity()`/`getIdentity()` plus `role={identity.role}` on
`DashboardShell`, with the data reads otherwise identical. `DashboardShell.role` is optional and
`useRole()` falls back to the original client derivation when absent, so the four unmigrated mounts
(`/appointment` — a client component, `/course/[id]`, `/university-search/university/[id]`, and the
seven `loading.tsx` files) behave exactly as before. The demo role switcher still wins outright:
`SideSwitcher` writes `sessionStorage['ascenda-session-role']` and `useRole` reads it ahead of the
server value (`role-context.tsx:126-132`) — the same precedence `useUserRole` had.
`/university-search/results` changed from a `'use client'` `router.replace` to a server `redirect()`
and preserves repeated query keys (`?country=UK&country=US`) and the legacy `filters=` token.

**Error-handling posture change.** `unwrap()` now **throws** where several reads previously
rendered an empty state (`/applications`, `/applications/tasks`, `/applications/documents`,
`/dashboard`, the chat student context). Each site has a written justification and each has an
`error.tsx` above it — the boundary file set is unchanged from main, so a thrown read lands in the
same boundary the page always had. `loadTierByProgram` is deliberately `soft`, so a missing tier
badge still degrades rather than failing the board.

**Demo flows (`docs/demo-flow.md`, `docs/demo-guide.md`) — every affordance still present.** Beat by
beat: the Pathway status pill (`/profile` `summarisePathwayStatus` intact); Reach/Match/Safe badges
on `/matches`; the `/course/[id]` page (untouched by the diff); the `/applications` PageHero,
priority board and **"Need help"** pill (`next-actions-list.tsx:106`, `application-list.tsx:153`);
Documents → recommendation letters; the navbar **Faculty view** pill (`SideSwitcher` + `useIsDemoUser`,
which now also `.catch()`es a failed `getUser()` instead of leaving an unhandled rejection); the
notification bell and its dropdown; the help thread drawer's **three tabs** — `TAB_KEYS =
['thread','notes','meeting']`, **Save note**, **Propose**, all present at the same positions in
`help-thread-drawer-impl.tsx` after the Radix migration; `/counsellor/documents` **Nudge student /
teacher / registrar**; `/counsellor/students/[id]` with all six tabs including **Notes** and
**Timeline**; `/counsellor/outcomes` and `/counsellor/analytics` (Compare-to-last-year and Download
Report untouched); `/toolbox/essay-workshop`. The two counsellor write paths the demo uses
(`POST /api/counsellor/notes`, `POST /api/counsellor/decks/assign`) gained per-student scoping, and
the demo account passes it — `can_act_as_counsellor()` includes `is_demo_account()`, which matches
`greg@workiflow.com`, and `profiles_counsellor_read` grants the profile read those guards need.

**Gates, on a clean HEAD worktree (executed).** `npm run build` → `EXIT=0`, 74 routes,
`✓ Compiled successfully in 3.4min`. `npx jest --runInBand` → **67 suites / 1541 tests passed,
`EXIT=0`**. These reproduce the coordinator's baseline independently and in a tree I know was clean.

---

## Not verified

- **Anything requiring the database.** No connection was made (§2 rule 1). The A1 claim that the
  demo account has an active `guardian_link` rests on reading
  `supabase/migrations/20260716120000_guardian_links.sql` and on `supabase/MIGRATIONS.md`/memory
  saying it was applied — not on a query. If that seed did not take, A1 breaks the demo's parent
  assistant too, which would raise it to P1.
- **`origin/main` was not built.** I compared the route *file* inventory (identical) and read the
  per-route diffs, but did not produce a main-side route table to diff bundle sizes or confirm every
  route still prerenders in the same mode. Lane J owns the bundle half.
- **Nothing was exercised in a browser or against a running server.** No Playwright, no dev server.
  Every "the page renders X" claim is read from the component tree, not observed. The demo walkthrough
  in particular is a code-reading exercise: I confirmed each affordance's markup and handler exist,
  not that the sequence works end to end.
- **`TZ=America/Los_Angeles`** — I ran the suite in the machine default only. Lane F owns the
  timezone matrix.
- **The Radix migrations' behaviour** (help drawer, analytics drilldown, counsellor universities
  client, command palette) was checked only for *presence* of the tabs, buttons and empty states.
  Focus trapping, Escape, scroll lock and the `<Dialog align="right">` geometry are Lane K's.
- **`src/lib/matching/service.ts`, `student_scoring.ts`, `matching_engine.ts`.** I read them only far
  enough to confirm the `tier_fit` → `admission_band` rename and the deletion of the tier-reassignment
  block do not change what the *pages* mount. Whether the resulting scores are right is Lane D.
- **`__tests__` quality.** I ran the suite; I did not ask whether any of it would go red if the
  behaviour it names regressed. That is Lane F, and given A2 passed 1541 green tests it is the right
  question to press on.
