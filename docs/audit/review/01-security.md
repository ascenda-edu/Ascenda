# Adversarial security review — `security/phase0-contain`

**Scope:** `git diff origin/main...HEAD` (11 commits, 235 files).
**Method:** read the code, not the comments. Every "closes the hole" / "fails closed"
/ "safe by construction" claim in the diff was treated as an unverified assertion and
checked against the installed dependency, the deployed SQL, or the actual call graph.
**Constraint:** read-only. No file modified, no production database contacted. Where a
finding depends on remote DB state I say so and give the verification query.

---

## Verdict

**Partly safer — and materially more dangerous to reason about.**

The app layer genuinely improved: a real open-redirect fix, error-message redaction,
fan-out bounds on deck assignment, subject checks on the note/message write paths, one
admin guard instead of three copies with a discarded `error`, credentials removed from
the tree, parent chat mode gated on `guardian_links`, and a policy seam that makes the
next change one function instead of ten routes.

But the two controls that actually decide whether one family can read another's PII —
`can_act_as_counsellor()` and the `profiles` INSERT/DELETE escalation — are **unchanged
in production**. Both fixes are written and unapplied. Against an attacker who talks to
PostgREST directly with the anon key that ships in the bundle (which is the only threat
model that matters here, since the branch's own migration header notes RLS is the entire
security model), the net exposure is approximately what it was on `origin/main`.

Meanwhile the code now *reads* as closed. Two new claims are false — the middleware
`/api/*` gate does not gate anything, and the `ui/select.tsx` "safe by construction"
argument does not hold for the installed Radix — and one privilege-escalation path was
left wide open inside the exact endpoint the branch was hardening (`/api/chat/actions/execute`).

**Recommendation:** fix H1 and H2 in code before merge (both are small). Do not let
anyone adopt this branch's security claims until `20260801110000` and `20260801120000`
are applied and verified.

---

## CRITICAL

### C1 — The entire new authorisation layer rests on a value the attacker can set

| | |
|---|---|
| **Where** | `supabase/schema.sql:930-933`, `supabase/schema.sql:1318-1322` |
| **Actor** | Any signed-in user, from the browser console, with the public anon key |
| **At risk** | Everything: all student PII, applications, matches, help threads, chat, the catalogue |

`profiles_self_access` is declared with **no `for` clause**, so it is `FOR ALL` —
INSERT, UPDATE and DELETE — with an identity predicate (`auth.uid() = id`), not a
content predicate. The control that makes that safe, `trg_guard_profile_role`, is
registered `before update` **only** (`schema.sql:1319-1321`). There is no INSERT policy
on `profiles` anywhere in `schema.sql` or in any migration.

```js
await supabase.from('profiles').delete().eq('id', myId);            // FOR ALL covers DELETE
await supabase.from('profiles').insert({ id: myId, role: 'admin' }); // no trigger fires
```

`auth_role()` now returns `'admin'`, satisfying every `FOR ALL` admin policy in the
schema. Accounts provisioned through the Supabase dashboard do not even need the DELETE
step — nothing in the repo creates a `profiles` row on signup, so they start with none.

**What this does to this branch specifically.** Every new guard resolves `profiles.role`:

- `requireRole('admin')` — `src/lib/auth/identity.ts:148`
- `requireAdminUser` — `src/app/api/admin/admin-guard.ts:81`
- `canActAsCounsellor` — `src/lib/api/guards.ts:28`
- `actsAsCounsellor` / `can()` / `roleGrants` — `src/lib/auth/policy.ts:178, 248, 268`
- `is_admin()` and every `for delete … using (public.is_admin())` policy in the
  unapplied `20260801120000`

All of them are defeated by one `insert()`. The branch replaced "authorisation via a
guard that was a no-op" with "authorisation via a value the attacker controls" — which
is not a regression in exposure, but it *is* a regression in how the code reads.

The fix — `supabase/migrations/20260801110000_profiles_insert_guard.sql` — is written,
correct as far as I can tell (splits the FOR ALL policy, pins `role = 'student'` on
self-insert, drops self-DELETE, re-registers the trigger for INSERT), and **NOT APPLIED**.

**Fix:** apply `20260801110000` first, before anything else in this branch is trusted.
Verify:

```sql
select polname, polcmd from pg_policy where polrelid = 'public.profiles'::regclass;
select tgname, tgtype from pg_trigger where tgrelid = 'public.profiles'::regclass;
```

---

### C2 — "canActAsCounsellor now mirrors the SQL exactly" is FALSE today

| | |
|---|---|
| **Where** | claim at `src/lib/api/guards.ts:16-27`; deployed SQL at `supabase/schema.sql:1263-1272` |
| **Actor** | Any signed-in user, via PostgREST with the anon key — the app is not involved |
| **At risk** | Every student's `profiles`, `student_personal_information`, `student_academic_input`, `help_requests`/`help_messages`/`help_notes`/`help_meetings`, `counsellor_notes`, `parent_contacts`, `parent_messages`, `student_documents`, `notifications` |

The docblock asserts the app now mirrors `is_counsellor() or is_demo_account()`. The
deployed function is:

```sql
create or replace function public.can_act_as_counsellor() ... as $$
  select auth.uid() is not null;
$$;
```

That is `schema.sql:1263-1272`, unchanged by this branch. `20260801120000`, which
restores the real test, is written and **not applied** — the branch's own
`docs/audit/13-remaining-work.md:102` says so.

So the two layers do not mirror each other; they now **disagree**, and in the direction
that matters least. The app got stricter, which locks non-demo users out of
`/api/counsellor/*` (see M5), while the database — referenced 48 times across the
policies, and the only control there actually is — still reads "any signed-in user".

**Fix:** apply `20260801120000` (after `20260801110000`, per its own header) and flip
`COUNSELLOR_PORTAL_OPEN_TO_ALL` in the same deploy. Until then the docblock at
`guards.ts:16-27` should say the layers disagree, not that they match.

---

## HIGH

### H1 — Chat mode escalation is still fully open; `mode` comes from a client-written row

| | |
|---|---|
| **Where** | `src/app/api/chat/actions/execute/route.ts:86`; `src/lib/chat/history.ts:45`; `supabase/schema.sql:2537-2541`, `:2560-2574` |
| **Actor** | Any signed-in student |
| **At risk** | Writes a permanent counsellor note onto any student's record; opens a counsellor-attributed help thread that fires a notification into any student's feed |

`resolveChatMode` (`src/lib/chat/mode.ts`) was tightened, and it is correct — but it
guards only `/api/chat` and `/api/chat/suggestions`. The execute endpoint takes mode
from the persisted row and never re-authorises it:

```ts
// src/app/api/chat/actions/execute/route.ts:86
const mode = conversation.mode;
```

The comment above it claims this "tightens automatically" when `/api/chat` is tightened.
It does not, because `/api/chat` is not the row's only writer:

- `createConversation` is called from **client** components with the **browser** client —
  `src/components/assistant/assistant-workspace.tsx:362` and
  `src/components/chat/chatbot-widget.tsx:394`.
- `chat_conversations` RLS (`schema.sql:2537-2541`) is `for all … using (owner_id = auth.uid())
  with check (owner_id = auth.uid())`. Nothing constrains `mode`; the column has only a
  three-value CHECK.
- `chat_messages` RLS (`schema.sql:2560-2574`) authorises purely by ownership of the parent
  conversation, so the owner can INSERT a `role='assistant'` row with an arbitrary
  `action` JSON and `action_state='pending'`.

**Chain:**

1. `insert into chat_conversations (owner_id, mode) values (me, 'counsellor')`
2. `insert into chat_messages (conversation_id, role, action, action_state) values (…, 'assistant',
   {"kind":"tool_action","tool":"add_student_note","params":{"student_id":"<victim>","body":"…",
   "note_type":"flag"},"editable":[…]}, 'pending')`
3. `POST /api/chat/actions/execute` with those ids.

`getWriteTool('add_student_note', 'counsellor')` resolves (`registry.ts`), the stored
action passes `isChatAction`, the claim succeeds, and `execute()` runs. The only subject
check is `isActionableStudent` (`src/lib/chat/tools/counsellor-write.ts:100`), which
proves nothing beyond `role === 'student'`. The RLS insert passes because
`can_act_as_counsellor()` is open (C2). `message_student` is the same chain and produces
a notification in the victim's feed with attacker-chosen text.

This is not a regression — the path existed on `origin/main` — but the branch's headline
claim is *"chat mode is bound to what the caller is"*, and it is not.

**Fix:** in `execute/route.ts`, replace `const mode = conversation.mode` with
`const resolved = await resolveChatMode(supabase, user, conversation.mode); if (!resolved.ok) return jsonError('Forbidden', 403);`
and add a DB-side trigger or policy predicate so `chat_conversations.mode` cannot be set
to a mode the inserting user is not entitled to.

---

### H2 — The middleware `/api/*` gate is bypassed by any cookie whose name looks right

| | |
|---|---|
| **Where** | `src/middleware.ts:51-52` and `:64`; claim at `:23-35` and `:38-50` |
| **Actor** | Unauthenticated attacker with `curl` |
| **At risk** | Nothing directly today — the risk is the false assurance |

```ts
const hasSessionCookie = (req: NextRequest) =>
  req.cookies.getAll().some((cookie) => /^sb-.+-auth-token(\.\d+)?$/.test(cookie.name));
```

The check is on the cookie's **name**, and a client chooses its own cookie names:

```
curl -H 'Cookie: sb-a-auth-token=x' https://ascenda-ashy.vercel.app/api/anything
```

passes the gate and reaches the handler exactly as it did before the matcher change. The
docblock at `:44-49` acknowledges "a forged or expired cookie gets past this check" —
and then the docblock at `:26-30` nonetheless claims *"a new route that forgets its own
`getUser()` is not silently public"*. Those two statements are incompatible, and the
second one is the one a future author will read. The gate is a DoS filter, not an
authentication boundary, and it should be described as one.

Second, smaller point: the early return happens before `createServerClient`, so
`/api/*` requests no longer participate in Supabase's cookie-refresh flow. That matches
the previous behaviour (middleware never ran for `/api` at all), so it is not a
regression — but it means the gate can never become a real boundary without restructuring.

**Fix:** either delete the "not silently public" claim and keep the check as a cheap
filter, or resolve the caller properly in middleware (`auth.getUser()`) and accept the
latency. Do not leave the claim standing.

**Verified TRUE alongside it:** the `PUBLIC_API_PREFIXES` match is written correctly —
`pathname === prefix || pathname.startsWith(prefix + '/')` (`:60-62`) — so
`/api/calendar-feedXYZ` is **not** treated as public. The `sb-*-auth-token` regex does
match the real cookie names `@supabase/ssr@0.8.0` writes (default `storageKey` is
`sb-<ref>-auth-token`, chunked as `.0`/`.1`), so legitimate users are not 401'd.

---

### H3 — Subject scoping proves only "the row has `role = 'student'`"

| | |
|---|---|
| **Where** | `src/lib/api/guards.ts:64-76, 95-111, 125-148`; `src/lib/auth/policy.ts:219-230` |
| **Actor** | Under C2: any signed-in user (via PostgREST). Under the app path: the demo account, or any self-promoted admin (C1) |
| **At risk** | A permanent, counsellor-attributed note on any student's record; a help thread + notification into any student's feed |

`isActionableStudent` runs one query and asserts `data.role === 'student'`. That is not
a relationship — it is a type check on the target. `assertCounsellorMayActOnStudent` and
`filterActionableStudentIds` compose it with the counsellor test and nothing else. The
docblocks say this honestly (`guards.ts:88-93`, `policy.ts:194-217`); the **commit
message** does not, and "closes the notes IDOR" is an overstatement — it closes the
in-app half of a hole whose other half is wide open.

Real residual exposure today, with `counsellor_assignments` (`20260801122000`) written
but not applied: there is no counsellor↔student edge in the database at all, so any
caller who clears the counsellor test can act on **every** student.

**Caller correctness — checked, and clean.** I looked specifically for check-one-id /
act-on-another, TOCTOU, and unchecked array elements:

- `src/app/api/counsellor/notes/route.ts:40` checks `studentId`, `:52` inserts
  `student_profile_id: studentId`. Same variable. ✔
- `src/app/api/counsellor/decks/assign/route.ts:47` passes `allowedStudentIds` (the
  filtered list) to `assignDeck`, never the raw `studentIds`. Element type is validated
  at `:32` before the filter. ✔
- `src/lib/chat/tools/counsellor-write.ts:100` / `:186` check `params.student_id` and
  insert `params.student_id`. ✔

No wrong-id bug found. The gap is what the check *proves*, not how it is wired.

**Fix:** as the code says — add the `counsellor_assignments` membership lookup inside
`isActionableStudent`/`mayActOnStudent`, and apply `20260801122000` with its backfill.
Both are one function each, exactly as documented.

---

## MEDIUM

### M1 — `getIdentity()` discards the `profiles` error — the exact defect this branch condemns

**`src/lib/auth/identity.ts:108-112`**

```ts
const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
return { userId: user.id, email: user.email ?? null, role: parseRole(data?.role) };
```

No `error` binding. This is character-for-character the shape that
`src/app/api/admin/admin-guard.ts:12-37` spends thirty lines correctly condemning —
reintroduced in the single seam every new guard now depends on. An RLS change or a
database outage silently coerces every admin and every counsellor to `'student'`, with
nothing logged; the operator sees only unexplained redirects to `/dashboard`. The
adjacent `requireAdminUser` distinguishes this case and answers 503; `getIdentity` cannot.

**Fix:** bind `error`, `logger.error` it, and either throw or return a distinguishable
"unresolvable" identity so `requireRole` can answer 503 rather than silently demoting.

### M2 — `ui/select.tsx`'s "safe by construction" argument is false for the installed Radix

**`src/components/ui/select.tsx:39-83`** (same misconception restated at
`src/components/chat/shared.tsx:327`)

The claim: *"Radix itself forbids an empty-string `SelectItem` value — it throws … So
`''` is not reachable through user interaction by construction."*

Checked against `@radix-ui/react-select@2.3.7` (the installed version, `package.json:45`):

- `SelectItem` (`node_modules/@radix-ui/react-select/dist/index.js:879-925`) contains **no
  invariant and no throw** on `value`. The string "must have a value prop that is not an
  empty string" does not appear anywhere in the package.
- `SelectBubbleInput` (`dist/index.js:1164-1167, 1200`) explicitly computes
  `hasEmptyValueOption` and suppresses its own placeholder `<option value="">` when one
  is present — i.e. empty-valued items are a **supported case** in this version, not a
  forbidden one.

So `<SelectItem value="">None</SelectItem>` is legal today, and selecting it would fire
`onValueChange('')`, which this wrapper swallows for every Select in the app. On a
controlled Select the value would snap back to the previous choice with no error and no
console warning.

**Live impact today: none.** I enumerated every `onValueChange` in the tree — the six
Selects that support clearing all use a non-empty sentinel (`CLEAR`, or `'all'`):
`StudentIntakeForm.tsx:1314, 1333, 1470, 1550, 1563`,
`counsellor/universities/_universities-client.tsx:494`,
`scholarships/scholarship-explorer.tsx:196, 213`,
`toolbox/deadline-timeline-tool.tsx:212`. The two placeholder-style Selects
(`applications/documents-manager.tsx:63`, `applications/cross-application-tasks.tsx:292`)
clear by the parent writing `value=""`, which does not route through the callback.

So this is **latent, not live** — but the justification for a global behaviour change is
wrong, which means the next person who adds a "None" option will hit a silent, untraceable
bug. The underlying wizard fix is legitimate; the reasoning for applying it globally is not.

**Fix:** correct the comment, and scope the guard — e.g. only swallow `''` when the
Select has no empty-valued item, or apply the workaround at the wizard's call sites.

### M3 — Adding `/api/:path*` breaks the `ADMIN_API_KEY` bearer path

**`src/middleware.ts:36, 58-69`** vs **`src/app/api/admin/admin-guard.ts:62-73`** and
**`src/app/api/admin/catalog-health/route.ts:11-17`**

`catalog-health` documents and implements a cookie-less server-to-server path for
"CLI/cron use": `Authorization: Bearer $ADMIN_API_KEY`. Such a caller has no
`sb-*-auth-token` cookie, and `PUBLIC_API_PREFIXES` lists only `/api/calendar-feed`.
Middleware therefore answers 401 before the handler runs. The same commit series that
refactored this bearer check into a shared helper made it unreachable.

Answering the brief's question directly — *does adding `/api/:path*` break anything?* —
yes, this, and only this. No browser-originated API call is affected: I enumerated every
`fetch('/api/…')` in `src/` and all of them come from authenticated surfaces. SSE is
fine (the branch returns `NextResponse.next()` before constructing any client, so
`/api/chat` and `/api/chat/actions/execute` stream normally).

**Fix:** check the bearer in middleware for that prefix, or add
`/api/admin/catalog-health` to `PUBLIC_API_PREFIXES` (the handler re-checks anyway).

### M4 — Zod on `saveStudentIntake` converts unvalidated form fields into a total, un-attributable save failure

**`src/app/profile/actions.ts:48-55`** + **`src/lib/profile/intake-schema.ts`**

Auth-before-zod: **verified TRUE** (`actions.ts:42` then `:48`), and `parsed.data` — not
`payload` — reaches `writeStudentIntake`, so unknown keys are stripped. No payload field
reaches a write it should not: `writeStudentIntake` scopes every row to `userId` and
never to a payload-supplied id.

*Does the schema reject anything a legitimate student submits?* — **yes, in steps 4 and 5.**
`handleFinalSubmit` (`StudentIntakeForm.tsx:897-905`) runs `validateStep1/2/3` before
submitting, so every field the schema requires is covered. Steps 4 and 5 have **no form
validation at all** (`intake-validation.ts:93-94` return `{}`), but the schema bounds them:

| Field | Schema bound | Form bound |
|---|---|---|
| `age` | `≤ 120` (`intake-schema.ts:119`) | none |
| `sat_score` | `≤ 1600` (`:174`) | none |
| `act_score` | `≤ 36` (`:175`) | none |
| `english_score_overall` | `≤ 200` (`:159`) | none |
| `ambition_statement`, `work_experience_summary`, `career_aspiration`, `other_extracurriculars` | `≤ 4000` (`:28`) | none |

Any one of these rejects the **entire six-table save**. The user gets
*"Some of your answers could not be saved. Please review the form and try again."* — no
field highlighted, `focusFirstError` not called, the offending path logged server-side only
(`actions.ts:50`). A student who typed their birth year into "age" is in an unrecoverable
loop with no way to find the field.

**Fix:** mirror those five bounds in `intake-validation.ts` so they fail at the field, and/or
return the `formatIntakeIssues` paths to the client so the form can focus them.

*(Checked and clean: the en-dash in `activityDurationSchema` (`:78`) does match
`ACTIVITY_DURATIONS` (`intake-options.ts:156`); `graduation_year` cannot arrive as `''`
because `validateStep2` requires it; the `a_level_predicted_grades` record can only
contain values from `A_LEVEL_GRADES`, which is exactly `aLevelGradeSchema`.)*

### M5 — A behaviour break the "posture preserved" comments deny

`canActAsCounsellor` went from `Boolean(user)` to role-based (`src/lib/api/guards.ts:28`),
while `COUNSELLOR_PORTAL_OPEN_TO_ALL = true` (`src/lib/auth/policy.ts:145`) keeps the
portal open to everyone. Net effect for a signed-in, non-demo, `role='student'` account:

- `/counsellor` — still renders (the chrome, the roster, the analytics).
- `/api/counsellor/notes`, `/api/counsellor/decks`, `/api/counsellor/decks/cards`,
  `/api/counsellor/decks/assign` — now **403**.
- Counsellor chat mode via `/api/chat` — now **403** (`mode.ts:58-61`).

`src/app/counsellor/layout.tsx:16-17` states *"Nothing about who reaches /counsellor
changes with this commit"*. True of the page; false of everything the page does. Anyone
demoing from a non-demo account will hit dead buttons.

### M6 — `student_activities` / `simulation_results`: RLS state on remote is unverified

`supabase/migrations/20260801130000_reconcile_missing_tables.sql` (written, **not
applied**) states both tables are present on the remote database and absent from every
schema file — and the migration is what adds `enable row level security` and their
policies. If the remote tables were created ad hoc without RLS, then
`student_activities` — every student's extracurricular record — is readable and writable
by every authenticated PostgREST session, and `simulation_results` by anyone.

I cannot confirm this from here. **Verify before anything else:**

```sql
select relname, relrowsecurity from pg_class
where relname in ('student_activities','simulation_results');
```

If `relrowsecurity` is `false` for either, that is a CRITICAL, not a MEDIUM.

### M7 — `schema.sql` now mixes applied and unapplied state

The branch backports `is_admin()` and the `student_activities`/`simulation_results`
policies from `20260801120000` / `20260801130000` (neither applied) into `schema.sql`,
while leaving `can_act_as_counsellor()` at the open definition and **not** backporting
that migration's `parent_contacts` / `parent_messages` / `student_documents` policy
splits. The file therefore describes neither production nor the post-migration target,
and can no longer be used as the audit baseline for either. The comment
`-- From 20260801120000` at `schema.sql:1273` is actively misleading — that migration has
not run.

---

## LOW

- **L1** — `DELETE /api/counsellor/decks/assign` still returns the raw PostgREST message
  (`assign/route.ts:88`), three lines below a POST that was deliberately hardened against
  exactly that in the same commit. (Its *authorisation* is fine —
  `deck_assignments_write` scopes by `deck_owned_by_me(deck_id)`, `schema.sql:2413-2416`.)
- **L2** — `src/lib/env.ts:481` logs the offending environment variable's **value**
  verbatim. Only enum-shaped variables reach it today, but it is one line away from
  printing a secret into a Vercel function log.
- **L3** — the Playwright HTML report is uploaded on `always()` (`.github/workflows/ci.yml:328-333`).
  Traces can embed the authenticated `storageState`. Private repo, 7-day retention,
  collaborators only — but consider `trace: 'off'` in CI, or excluding traces from the artifact.
- **L4** — `/api/counsellor/notes` now runs body validation *before* the counsellor check
  (`notes/route.ts:26-38` then `:40`), so a non-counsellor can probe payload validation.
  Authentication still gates it at `:23`. Cosmetic.

---

## Claims checked and found TRUE

These are as much of the result as the findings are.

1. `PUBLIC_API_PREFIXES` prefix matching is correct — `/api/calendar-feedXYZ` is **not**
   public (`middleware.ts:60-62`).
2. Adding `/api/:path*` does not break SSE: the branch returns before constructing any
   Supabase client, so `/api/chat` and `/api/chat/actions/execute` stream unchanged.
3. No browser-originated API call is broken by the matcher. I enumerated every
   `fetch('/api/…')` in `src/`; all originate from authenticated surfaces. The only
   casualty is the server-to-server bearer path (M3).
4. **`redirect()` is not inside a `try`/`catch` anywhere in `src/`** — verified across the
   whole tree, not just the diff. No file contains both a `redirect(` call and a `try {`.
5. `requireIdentity` / `requireRole` call `redirect()` *outside* the `cache()`-wrapped
   `getIdentity`, so the throw is not memoised (`identity.ts:128-152`).
6. `getIdentity` uses `getUser()`, never `getSession()` (`identity.ts:102-104`).
7. `parseRole` fails closed to `'student'` (`identity.ts:85-86`). An unknown, null or
   unreadable role never yields `admin` or `counsellor`.
8. `actsAsCounsellor` (`policy.ts:178`) and `canActAsCounsellor` (`guards.ts:28`) agree on
   all four cases — counsellor, admin, student, demo account — including the fail-closed
   path (`guards.ts` → `false`; `policy.ts` → `parseRole` → `'student'` → denied). They
   agree with each other; they do not agree with the deployed SQL (C2).
9. `can()` refuses a subject-scoped action called without a resource (`policy.ts:275-278`),
   rather than silently answering the coarse question.
10. The `server-only` substitute is a runtime `typeof window` throw (`identity.ts:60`,
    `policy.ts:64`) — but the modules are genuinely unreachable from a client bundle
    regardless: `identity.ts` imports `next/navigation`'s `redirect` and
    `@/lib/supabase/server` (which awaits `cookies()`), so a `'use client'` import fails at
    build. Verified no `'use client'` file imports either module (the one grep hit,
    `role-context.tsx`, mentions them in prose only).
11. Auth runs before zod in `saveStudentIntake` (`actions.ts:42` → `:48`), and `parsed.data`
    — not `payload` — is what reaches `writeStudentIntake`.
12. The `auth/callback` open-redirect fix is correct: rejects anything not starting with a
    single `/`, plus `//` and `/\` (`callback/route.ts:14-18`). `new URL(next, req.url)`
    cannot then escape the origin.
13. Subject-scoping callers all act on the id they checked — no TOCTOU, no substitution, no
    unchecked array element (details under H3).
14. The `counsellor-write.ts:29` UUID tightening is real: the old `/^[0-9a-f-]{36}$/i` did
    match 36 hyphens.
15. Credentials are genuinely gone from HEAD: `AscendaDemo!2026` and `AscendaSeed!2026` are
    net deletions across nine files, and both seed scripts now `process.exit(1)` without the
    env var. The only JWT-shaped strings *added* by the diff are obvious placeholders in a
    test file (`…HUzI1NiIsInR5cCI6IkpXVCJ9.anon.signature`). They remain in git history and
    in Supabase Auth — rotation is owner work, correctly listed as such.
16. CI uses `pull_request`, **not** `pull_request_target`, with `permissions: contents: read`
    (`ci.yml:3-15`). E2E secrets sit behind a `steps.secrets.outputs.configured` gate, so
    fork PRs skip rather than leak.
17. `.gitignore` correctly excludes the Playwright `storageState` and `test-results/`.
18. Deck-assign hardening is real and correctly ordered: 200-student cap, 1000-char message
    cap, per-element `typeof id === 'string'` **before** the scope filter, and out-of-scope
    ids surfaced as `skipped` rather than silently dropped (`assign/route.ts:30-53`).
19. `admin-guard.ts` distinguishes "lookup failed" (503, logged) from "not an admin" (403),
    and both deny; `.maybeSingle()` correctly replaces the `.single()`/PGRST116 confusion.
20. `hasValidAdminBearer` fails closed when `ADMIN_API_KEY` is unset and uses
    `timingSafeEqual` behind an unavoidable length check (`admin-guard.ts:62-73`).
21. `resolveChatMode`'s new parent-mode gate is correct as written: `guardian_links` with
    `status = 'active'`, failing closed on error (`mode.ts:70-84`). *(It will 403 the parent
    assistant for any demo account with no guardian link — verify before demoing.)*
22. The two known regressions are fixed and correct: `.eq('role', 'student')` restored at
    `counsellor/data.ts:554`, and `status: app.status` (no `enrolled → decision` collapse) at
    `counsellor/data.ts:418`.

---

## Priority order for the owner

1. **Apply `20260801110000_profiles_insert_guard.sql`.** Nothing else in this branch means
   anything until it lands (C1).
2. **Verify RLS on `student_activities` / `simulation_results`** with the query in M6. If it
   is off, that jumps to the top of this list.
3. **Apply `20260801120000`** and flip `COUNSELLOR_PORTAL_OPEN_TO_ALL` in the same deploy (C2, M5).
4. **Fix H1 in code before merge** — one `resolveChatMode` call in `execute/route.ts`.
5. **Fix or retract H2's claim** in `middleware.ts`.
6. Then M3, M1, M2, M4.
