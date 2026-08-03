# Lane H — API routes

Branch `security/phase0-contain` @ `40cb781`. Working tree clean at start (only two
untracked files, both `docs/audit/*.md`). Read-only lane: nothing under `src/`,
`supabase/` or `__tests__/` was written, and no `git checkout`/`stash`/`reset` was run.

---

## 1. Summary

**23 route handlers audited — all of them.** 13 findings: 0 P0, 0 P1, 6 P2, 7 P3.

**Executed vs inferred.** 1 test suite executed (`npx jest
__tests__/chat/actions-execute-route.test.ts` → 13/13 pass, 32.6 s), plus ~20 executed
`git`/`grep`/`comm` commands whose output is quoted verbatim below. Every claim about
*runtime* behaviour (RLS outcomes, PostgREST row caps, response bodies under load) is
**inferred from reading source + `supabase/schema.sql`** — I could not connect to a
database. Ratio of substantive claims: **1 executed / 12 inferred by reading**. Where a
claim depends on live DB behaviour I say so in the finding.

**The headline: no guard was lost in the rewrite.** `git diff --stat origin/main...HEAD --
src/app/api src/lib/api` touches only 11 files (+425/−86) and `comm` on the route
inventories shows **zero routes added or removed**. Every one of those diffs *strengthens*
a check — the `chat/actions/execute` mode-escalation fix, `filterActionableStudentIds` on
deck-assign, `assertCounsellorMayActOnStudent` on notes, and the extraction of
`admin-guard.ts`. **No IDOR was introduced by this branch.** Everything below is either
pre-existing (`Regression?: NO`) or a gap *in the new work* (`NEW`), never lost
functionality.

**Authorization for the specific resource** is genuinely handled on the routes that
matter: `checklist` (ownership via `applications!inner(profile_id)`, exists-but-not-yours
collapsed to 404), `parent/messages` (`guardian_links` linkage), `counsellor/notes`
(`assertCounsellorMayActOnStudent`), `decks/assign` POST (`filterActionableStudentIds`),
`chat/actions/execute` (owner + persisted-mode ceiling + only whitelisted editable keys).
The three that do **not** do an app-level check — `decks/cards` POST+DELETE and
`decks/assign` DELETE — take a wire-supplied row id and rely purely on RLS
`deck_owned_by_me()`; that policy does exist in `schema.sql`, so they are defended, but
only by one layer, and a zero-row delete still answers `{ok:true}` (H-04).

**The error envelope was NOT consolidated.** I found **8 distinct failure-body shapes**
across the 23 routes plus the middleware — one more than the five the earlier audit
reported, because this branch *added* a nested one. Three routes return a success-shaped
200 on failure (up from the one previously found), all three now documented as deliberate
fail-soft. See H-08.

**Input validation is not zod.** `grep -rn "from 'zod'" src` returns exactly two files:
`src/app/api/admin/import/validation.ts` and `src/lib/validation/auth.ts`. **1 of 23
routes validates with zod.** The other 22 hand-roll checks after
`parseJsonBody<T>()`, which is a `as T` cast (`src/lib/api/guards.ts:11`). The hand-rolled
checks are mostly adequate and mostly bounded; `essay-assist` is the one with a real hole
(H-09). Where zod *is* used it is used correctly — `safeParse`, no `.passthrough()`,
and it pushes `result.data` (stripped) not the raw row.

**Rate limiting** covers every LLM route (chat 20/min, essay-assist 10/min, actions
10/min, suggestions 30/min, feedback 60/min — all keyed per user) and the two
anonymous-reachable ones (calendar-feed 10/min/IP, search/suggestions 120/min/IP).
It covers **zero of the ten non-LLM write routes** (H-05).

**Three routes have no handler-level authentication at all** — `search/filters`,
`search/filter-options`, `search/suggestions`. Middleware is explicit in its own comments
that it is not the auth boundary (a junk `sb-x-auth-token` cookie passes it). Two of the
three are saved by `auth.uid() is not null` on the catalogue RLS; `filter-options` is
**not**, because the RPC it calls is `security definer` and `grant execute … to anon`
(H-01). `search/filters` additionally has no caller anywhere in `src/` — it is dead
(H-02).

---

## 2. Per-route table

Legend — **AuthN**: does the handler itself resolve a user? **AuthZ-resource**: is the
*specific* record named by the request authorised against the caller (not merely "you are
logged in")? **zod**: validated with a zod schema, not a cast. **Unbounded**: a query with
no ceiling on rows returned or work done.

| # | Path | Methods | AuthN | AuthZ for the specific resource | zod | Error envelope | Status codes | Unbounded query | Rate limited |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `/api/admin/catalog-health` | GET | Yes — `hasValidAdminBearer` (timingSafeEqual) **or** `requireAdminUser` | n/a — no resource id in request | n/a — no body | `{ok:false,error}` | 200/401/403/500/503 | No — `head:true` counts + `.limit(3)` | **No** |
| 2 | `/api/admin/import` | POST | Yes — `requireAdminUser` | n/a — bulk catalogue upsert | **Yes** — per-row `safeParse`, 5000-row cap | `{error}` | 200/400/401/403/500/503 | No — `MAX_IMPORT_ROWS` | **No** |
| 3 | `/api/admin/update-deadlines` | POST | Yes — `requireAdminUser` + `getSession()` | n/a | No — body forwarded verbatim to edge fn | `{ok:false,error}` | 200/400/401/403/500/503 | n/a — proxy | **No** |
| 4 | `/api/applications/track` | POST | Yes | **Yes** — `trackProgram(supabase, user.id, …)`, `.eq('profile_id', userId)` | No — manual | `{error}` | 200/400/401/404 | No | **No** |
| 5 | `/api/calendar-feed` | GET | **No — public by design** (only `PUBLIC_API_PREFIXES` entry) | n/a — no user data | No | `{events:[],connectedSources:[]}` @429 | 200/429 | No — `.slice(0,50)`, upstream `revalidate:300` | Yes — 10/min/IP |
| 6 | `/api/chat` | POST | Yes | **Yes** — `conversation.owner_id !== user.id` → 403; mode via `resolveChatMode` | No — manual | raw `Response` `{error}` | 200/400/401/403/500/503 | No — ≤50 msgs, ≤8 000 ch each | Yes — 20/min/user |
| 7 | `/api/chat/actions/execute` | POST | Yes | **Yes** — owner check + persisted-mode ceiling + `resolveChatMode` floor + only `storedAction.editable` keys from the wire | No — `writeTool.validateParams` | raw `Response` `{error}` | 200/400/401/403/409/429/500 | No — `HISTORY_LIMIT=12` | Yes — 10/min/user |
| 8 | `/api/chat/feedback` | POST | Yes | **Yes** — `profile_id` server-set from `user.id` | No — manual | `{ok:false,error}` **and `{ok:false}` @ HTTP 200** | 200/400/401/429/500 | No — 16 000-ch cap | Yes — 60/min/user |
| 9 | `/api/chat/suggestions` | GET | Yes | **Yes** — `resolveChatMode` | No | `{suggestions:[]}` (success-shaped) | 200/401/403/429 | No | Yes — 30/min/user |
| 10 | `/api/checklist` | PATCH, POST, DELETE | Yes (all three) | **Yes** — ownership via `applications!inner(profile_id)`; not-yours collapsed to 404 | No — manual + `isValidDate`, `clampText(200)` | `{error}` | 200/201/400/401/404 | No | **No** |
| 11 | `/api/counsellor/decks` | POST, DELETE | Yes — `requireCounsellor` | POST n/a (`counsellor_id` server-set). DELETE **yes** — `.eq('counsellor_id', auth.user.id)` | No | `{error}` — **leaks raw PostgREST `error.message`** | 200/400/401/403 | No | **No** |
| 12 | `/api/counsellor/decks/cards` | POST, DELETE | Yes — `requireCounsellor` | **RLS only** — `deckId`/`cardId` from the wire, no app-level ownership check | No — `Set`-membership on `rarity`/`fit` | `{error}` — **leaks raw PostgREST `error.message`** | 200/400/401/403 | No | **No** |
| 13 | `/api/counsellor/decks/assign` | POST, DELETE | Yes — `requireCounsellor` | POST **yes** — `filterActionableStudentIds`. DELETE **RLS only** | No — manual | POST sanitised `{error}`; DELETE **leaks `error.message`** | 200/400/401/403 | No — `MAX_STUDENTS_PER_ASSIGN=200`, message ≤1 000 | **No** |
| 14 | `/api/counsellor/notes` | POST | Yes | **Yes** — `assertCounsellorMayActOnStudent`; 404 for unknown subject, 403 for out-of-scope | No — `Set` on `noteType` | `{error}` — sanitised | 200/400/401/403/404 | No — body ≤5 000 | **No** |
| 15 | `/api/essay-assist` | POST | Yes | n/a — no stored resource | No — manual; **`block`/`blocks` unvalidated** | raw `Response` `{error}` | 200/400/401/429/500/503 | **Yes — `blocks[]` length and per-item string length uncapped** | Yes — 10/min/user |
| 16 | `/api/match` | GET | Yes | **Yes** — `loadMatchesForProfile(…, user.id, …)` | n/a — query params | `{error, stage}` — **only route with this shape** | 200/400/401/500 | No — `resultLimit: 20` | **No** |
| 17 | `/api/match/score` | POST | Yes | **Yes** — `scoreProgramsForProfile(…, user.id, …)` | No — manual array check | `{error}` | 200/400/401 | No — `MAX_PROGRAM_IDS=100` | **No** |
| 18 | `/api/parent/messages` | POST | Yes | **Yes** — `contact.student_profile_id ∈ resolveLinkedChildIds(user.id)` else 403 | No — manual | `{error}` | 200/400/401/403/500 | No — body ≤4 000 | **No** |
| 19 | `/api/profile/export` | GET | Yes | **Yes** — every one of six reads `.eq('profile_id', user.id)` / `.eq('id', user.id)` | n/a — `?format` | `{error}` | 200/401 | Own rows only (`student_subjects`, `student_admissions_tests` have no `.limit()`) | **No** |
| 20 | `/api/profile/recalculate-score` | POST | Yes | **Yes** — `user.id` throughout, upsert keyed on `profile_id: user.id` | n/a — no body | `{error}` | 200/400/401/500 | No | **No** |
| 21 | `/api/search/filter-options` | GET | **No** | n/a | n/a | `{error}` | 200/500 | Capped inside the SQL fn (60/30/30/16) | **No** |
| 22 | `/api/search/filters` | GET | **No** | n/a | n/a | `{error}` | 200/500 | **Yes — `universities` select has no `.limit()`**; `programs` `.limit(1200)` of 119 k | **No** |
| 23 | `/api/search/suggestions` | GET | **No** | n/a | No — `q` length uncapped | `{programs:[],universities:[]}` (success-shaped) | 200/429 | No — `.limit(6)` / `.limit(200)` | Yes — 120/min/IP |

Route-inventory evidence (executed):

```
$ comm -23 <(git ls-tree -r --name-only origin/main -- src/app/api | grep route.ts | sort) \
           <(git ls-tree -r --name-only HEAD        -- src/app/api | grep route.ts | sort)
   (empty — no route removed)
$ comm -13 …
   (empty — no route added)
$ find src/app/api -name route.ts | wc -l
   23
```

---

## 3. Findings

### H-01 — Three search routes have no handler-level authentication, and `search_filter_options()` is `security definer` granted to `anon`
Severity: **P2** (latent risk)
Location: `src/app/api/search/filter-options/route.ts:8`, `src/app/api/search/filters/route.ts:12`, `src/app/api/search/suggestions/route.ts:49`; `supabase/schema.sql:2233-2295`
Regression?: **NO** (pre-existing — and strictly better than `origin/main`, where the middleware matcher did not cover `/api/*` at all)

Evidence:
```
$ grep -n "getUser\|requireAdmin\|requireCounsellor" src/app/api/search/*/route.ts
   (no output — none of the three resolves a user)

$ grep -n "hasSessionCookie" -A 3 src/middleware.ts
55:const hasSessionCookie = (req: NextRequest) =>
56:  req.cookies.getAll().some((cookie) => /^sb-.+-auth-token(\.\d+)?$/.test(cookie.name));
```
The middleware's own comment (`src/middleware.ts:49-53`) is explicit:
> **The handler is the authentication boundary, not this.** An earlier version of this
> comment claimed that a route which forgets its own `getUser()` "is not silently public".
> That was false … such a route is reachable by anyone willing to set a junk cookie.

For `filters` and `suggestions` the exposure is nil, because the catalogue RLS is
`auth.uid() is not null`:
```
$ sed -n '1043,1051p' supabase/schema.sql
create policy universities_read_all on universities for select using (auth.uid() is not null);
create policy programs_read_all    on programs    for select using (auth.uid() is not null);
```
An anon-key request with no valid JWT gets zero rows. `filter-options` is the exception —
it does not go through RLS at all:
```
$ awk 'NR>=2233 && NR<=2300' supabase/schema.sql | grep -n "security definer\|grant"
5:security definer
63:grant execute on function public.search_filter_options() to anon, authenticated;
```

Repro (inferred — not executed against a DB): `curl -H 'Cookie: sb-x-auth-token=junk'
https://…/api/search/filter-options` → 200 with the real countries / fields / studyLevels
/ levels / modes vocabulary, no session. The same request to `/api/search/filters` returns
`{"programs":[],"universities":[]}`.

The data is low-sensitivity (a facet vocabulary, hard-capped at 60/30/30/16 values), which
is why this is P2 and not higher. The cost side matters more: the function's own header
comment records that its predecessor "hit the statement timeout" on the 119 k catalogue,
and the route has **no rate limit**.

Fix: add `const { data: { user } } = await supabase.auth.getUser(); if (!user) return 401`
to all three handlers. All known callers are behind authenticated pages
(`university-search/search/page.tsx:313`, `counsellor/universities/_universities-client.tsx:108`,
`IntelligentSearchBar.tsx:82,133,234`), so this breaks nothing. Separately consider
`revoke execute on function public.search_filter_options() from anon`.

Test: a route test asserting 401 when `auth.getUser()` resolves `{user: null}`, for each
of the three handlers.

---

### H-02 — `/api/search/filters` is dead, unauthenticated, and runs an unbounded `universities` scan
Severity: **P2**
Location: `src/app/api/search/filters/route.ts:17-25`
Regression?: **NO** (pre-existing; file untouched by this branch — it does not appear in `git diff --stat origin/main...HEAD -- src/app/api`)

Evidence:
```
$ grep -rn "api/search/filters" src --include=*.ts --include=*.tsx | grep -v "app/api/search"
$ echo $?
1        # no caller anywhere in src/
```
The handler body:
```ts
supabase.from('universities').select('id,name').order('name', { ascending: true })
```
— no `.limit()`. And the programs side:
```ts
supabase.from('programs').select('id,course_name,name,university_id,metadata').limit(1200)
```
1 200 rows of a 119 k-row catalogue, meaning the facet list it computes is a truncated and
essentially arbitrary sample. Combined with H-01 this is an unauthenticated,
unrate-limited, unbounded-row endpoint that nothing calls.

Repro (inferred): `GET /api/search/filters` with a junk cookie executes a full
`universities` scan plus a 1 200-row `programs` read, once per request, with no throttle.
Row count returned depends on PostgREST `db-max-rows`, which is not configured in this
repo (`ls supabase/*.toml` → no matches), so the app imposes no ceiling of its own.

Fix: delete the route. If it is wanted later, it needs an auth check, a `.limit()` on
`universities`, and a rationale for the 1 200 that isn't "a truncated sample of 119 k".

Test: `knip`/`lint:deadcode` should flag it; if Next entrypoints are exempt from those
globs, a test asserting the route file does not exist is the honest form.

---

### H-03 — The mode-escalation fix on `/api/chat/actions/execute` has no test; deleting it leaves the suite green
Severity: **P2**
Location: `src/app/api/chat/actions/execute/route.ts:99-106`; `__tests__/chat/actions-execute-route.test.ts`
Regression?: **NEW** (the guard is new on this branch; so is the gap)

Evidence — this branch added the guard, and its own comment describes the hole it closes:
```
$ git diff origin/main...HEAD -- src/app/api/chat/actions/execute/route.ts
-    const mode = conversation.mode;
+    // … a student could POST a conversation with `mode: 'counsellor'` straight to
+    // PostgREST, then execute counsellor write tools through this route.
+    const resolved = await resolveChatMode(supabase, user, conversation.mode);
+    if (!resolved.ok) return jsonError('Not available for this conversation', 403);
+    const mode = resolved.mode;
+    if (mode !== conversation.mode) return jsonError('Not available for this conversation', 403);
```
The test file does not mock `resolveChatMode`, and every fixture uses `mode: 'student'`:
```
$ grep -n "resolveChatMode\|mode:" __tests__/chat/actions-execute-route.test.ts
140:      mode: 'student',
184:      mode: 'student',
259:      expect.objectContaining({ userId: 'user-123', mode: 'student' }),
```
`resolveChatMode` short-circuits for `'student'` (`src/lib/chat/mode.ts:59-65` guards only
`'counsellor'` and `'parent'`), so the added lines are inert in all 13 tests. Executed:
```
$ npx jest __tests__/chat/actions-execute-route.test.ts
Test Suites: 1 passed, 1 total
Tests:       13 passed, 13 total
Time:        32.628 s
```
Reverting lines 99-106 to `const mode = conversation.mode;` restores the exact
privilege-escalation path the comment describes, and all 13 tests still pass. I did **not**
execute that mutation — modifying `src/` is out of scope for this lane — so the survival
claim is a static proof from the two facts above, not a measured one.

Repro: a student creates a `chat_conversations` row with `mode: 'counsellor'` directly via
PostgREST (`chat_conversations_all_own` constrains only `owner_id`), gets a
`tool_action` proposal into it, then POSTs here. Before the fix: counsellor write tools
execute. After: 403.

Fix: none — the code is right.
Test: two cases in `__tests__/chat/actions-execute-route.test.ts` —
(a) `conversation.mode = 'counsellor'` with `canActAsCounsellor` mocked false → 403 and
`writeTool.execute` never called; (b) the same with it mocked true → executes. Case (a)
fails if lines 99-106 are removed.

---

### H-04 — Three deck mutations take a wire-supplied row id with no app-level ownership check, and a zero-row delete answers `{ok:true}`
Severity: **P2**
Location: `src/app/api/counsellor/decks/cards/route.ts:34,60`; `src/app/api/counsellor/decks/assign/route.ts:84`; `src/lib/counsellor/decks.ts:244,292`
Regression?: **NO** (pre-existing; `cards/route.ts` is not in the branch diff, and the `assign` DELETE handler is unchanged)

Evidence — the data layer filters on the wire id alone:
```ts
// src/lib/counsellor/decks.ts:244
export async function removeDeckCard(supabase, cardId) {
  const { error } = await tbl(supabase, 'counsellor_deck_programs').delete().eq('id', cardId);
  return { error };
}
// :292
export async function unassignDeck(supabase, assignmentId) {
  const { error } = await tbl(supabase, 'deck_assignments').delete().eq('id', assignmentId);
  return { error };
}
```
Compare `deleteDeck` two functions up, which *does* add `.eq('counsellor_id', counsellorId)`
"defense in depth". The asymmetry is the finding.

RLS does defend these — the policies exist and the helper is correct:
```
$ sed -n '2378,2389p;2445,2464p' supabase/schema.sql
create or replace function public.deck_owned_by_me(p_deck_id uuid) … security definer …
  select exists (select 1 from counsellor_decks d
                 where d.id = p_deck_id and d.counsellor_id = auth.uid());
create policy counsellor_deck_programs_write on counsellor_deck_programs
  using ((select public.deck_owned_by_me(counsellor_deck_programs.deck_id)))
  with check ((select public.deck_owned_by_me(counsellor_deck_programs.deck_id)));
create policy deck_assignments_write on deck_assignments
  using ((select public.deck_owned_by_me(deck_assignments.deck_id)))
  with check ((select public.deck_owned_by_me(deck_assignments.deck_id)));
```
So this is **one layer, not zero** — which is why it is P2 and not P1. But it is one layer
in a codebase whose stated convention (`decks.ts:8-9`, `guards.ts:78-94`) is that the app
authorises subjects and RLS is the backstop, and RLS silence is indistinguishable from
success: a delete that matches zero rows returns `error: null`, so the route answers
`{ok:true}` and the UI reports a successful delete of someone else's row.

Repro (inferred): counsellor A calls `DELETE /api/counsellor/decks/cards?id=<card in B's deck>`
→ RLS filters the row out → 0 rows deleted → `200 {"ok":true}`. A's UI removes the card
optimistically; B's deck is untouched.

Fix: mirror `deleteDeck` — pass `auth.user.id` into `removeDeckCard` / `unassignDeck` and
join to `counsellor_decks`; and use `.select('id')` on the delete so a zero-row result maps
to 404 rather than `{ok:true}`. For `cards` POST, resolve `deckId` ownership before the
`upsertDeckCard` read-then-write.

Test: a deck-route test where the mocked delete resolves `{data: [], error: null}` and the
handler is asserted to return 404, not `{ok:true}`.

---

### H-05 — Ten write routes have no rate limit; deck-assign can fan out 200 notification rows per unthrottled request
Severity: **P2**
Location: `applications/track`, `checklist` (×3 methods), `counsellor/notes`, `counsellor/decks`, `counsellor/decks/cards`, `counsellor/decks/assign`, `parent/messages`, `profile/recalculate-score`, `admin/import`, `admin/update-deadlines`
Regression?: **NO** (pre-existing)

Evidence:
```
$ grep -rln "checkRateLimit" src/app/api
src/app/api/calendar-feed/route.ts
src/app/api/chat/actions/execute/route.ts
src/app/api/chat/feedback/route.ts
src/app/api/chat/route.ts
src/app/api/chat/suggestions/route.ts
src/app/api/essay-assist/route.ts
src/app/api/search/suggestions/route.ts
```
7 of 23. Every LLM route is covered — the lane criterion "rate limiting where a route
writes **or** calls an LLM" is met on the LLM half and missed on the write half.

The sharpest one is `counsellor/decks/assign` POST. Its own header comment
(`route.ts:15-19`) explains why: the `trg_deck_assignment_notify` trigger is
`SECURITY DEFINER` and writes into **the subject's** notification feed with
caller-supplied `message` text. Per request that is up to 200 rows in 200 other people's
feeds (`MAX_STUDENTS_PER_ASSIGN = 200`), and nothing caps requests per minute. The
authorisation is correct (`filterActionableStudentIds`); the *volume* is not bounded.
`profile/recalculate-score` is second: six DB reads plus a full scoring pass plus an
upsert, no body, no limit.

Repro (inferred): a scripted loop of `POST /api/counsellor/decks/assign` with 200 fresh
student ids per call. Each call is individually authorised and individually legal.

Fix: `checkRateLimit('deck-assign:' + user.id, { limit: 10, windowMs: 60_000 })` and the
equivalent on the other nine, using the existing `src/lib/api/rate-limit.ts`. Note the
limiter is per-warm-instance by design (its own header says so) — that is enough to stop a
scripted loop, which is the threat here.

Test: a route test that calls the handler `limit + 1` times and asserts the last one is
429.

---

### H-06 — `/api/admin/catalog-health`'s bearer path always reports an empty catalogue
Severity: **P2** (wrong answer from the one endpoint whose job is to give the right one)
Location: `src/app/api/admin/catalog-health/route.ts:20-29`
Regression?: **NO** (identical shape on `origin/main` — `git show origin/main:src/app/api/admin/catalog-health/route.ts` has the same bearer-skips-user structure)

Evidence — the bearer path deliberately skips `requireAdminUser`, so no session is ever
established, but the client it then queries with is cookie-scoped and anon-keyed:
```ts
// route.ts:20
if (!hasValidAdminBearer(request)) {
  const { user, response } = await requireAdminUser(supabase, 'catalog-health');
  if (!user) return response;
}
```
```
$ grep -n "createRouteHandlerSupabaseClient" -A 8 src/lib/supabase/server.ts
51:export const createRouteHandlerSupabaseClient = async () => {
52-  const cookieStore = await cookies();
54-  return createServerClient<Database>(
55-    process.env.NEXT_PUBLIC_SUPABASE_URL!,
56-    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
57-    { cookies: { get(name) { return cookieStore.get(name)?.value; }, … } }
```
No Authorization pass-through; cookies only. A CLI/cron caller presenting
`Authorization: Bearer $ADMIN_API_KEY` and no cookie therefore queries as `anon`, and:
```
create policy universities_read_all on universities for select using (auth.uid() is not null);
```
→ zero rows, `error: null` → the route returns `{"ok":true,"counts":{"universities":0,"programs":0},"samplePrograms":[]}`.

This is precisely the confusion the route's own comment says it exists to prevent
(`route.ts:32-35`: "degrading to `counts: { universities: 0 }` would answer 'the catalogue
is empty' to the question 'is the catalogue reachable'"). The error branch is well
designed; the bearer branch reaches the *success* branch with zeroes.

Repro (inferred — needs a DB to confirm): `curl -H "Authorization: Bearer $ADMIN_API_KEY"
https://…/api/admin/catalog-health` → `ok:true, counts 0/0` on a healthy 119 k-row
catalogue. **This is my least-verified finding**: it turns on `auth.uid()` being null for
an anon-key PostgREST request, which I read from `schema.sql` rather than observed.

Fix: on the bearer path, build a service-role client instead of the cookie client (the key
*is* the authorisation, and the route is read-only over two counts and three rows), or
drop the bearer path and require an admin session.

Test: a route test where the Supabase mock is asserted to be the service-role factory when
a valid bearer is presented — plus a test that `counts.universities === 0` from a bearer
call is treated as a failure, not `ok:true`.

---

### H-07 — Raw PostgREST `error.message` still forwarded to the client in four deck branches
Severity: **P3**
Location: `src/app/api/counsellor/decks/route.ts:30,49`; `src/app/api/counsellor/decks/cards/route.ts:43,63`; `src/app/api/counsellor/decks/assign/route.ts:87`
Regression?: **NO** (pre-existing; these five lines are the ones the branch did *not* fix)

Evidence — the branch sanitised exactly two of the seven such sites and left five:
```
$ git diff origin/main...HEAD -- src/app/api/counsellor
-    return NextResponse.json({ error: error.message }, { status: 400 });     # notes
+    console.error('counsellor_notes insert failed:', error.message);
+    return NextResponse.json({ error: 'Could not save note.' }, { status: 400 });
-    return NextResponse.json({ error: error.message }, { status: 400 });     # assign POST
+    console.error('deck assign failed:', error.message);
+    return NextResponse.json({ error: 'Could not assign deck.' }, { status: 400 });
$ grep -rn "error: error.message" src/app/api/counsellor
decks/route.ts:30, decks/route.ts:49, decks/cards/route.ts:43, decks/cards/route.ts:63, decks/assign/route.ts:87
```
The notes route's replacement comment states the rule the other five break: "Do not surface
the raw PostgREST message — it names tables, constraints and RLS policies."

Repro (inferred): `POST /api/counsellor/decks` with a `name` that violates a check
constraint → the response body carries the constraint name and table. Requires a
counsellor session, so this is reconnaissance, not a bypass.

Fix: same two-line treatment as `notes` — `console.error` the detail, return a class of
failure.
Test: a deck-route test asserting the response body does not contain the mocked
`error.message` string.

---

### H-08 — The error envelope was not consolidated: 8 distinct failure-body shapes, and the new middleware 401 is a nested object that breaks `data.error ?? '…'` clients
Severity: **P3**
Location: across all 23 routes; `src/middleware.ts:83-86`; consumers at `src/app/counsellor/universities/_universities-client.tsx:252,282,308,425`, `src/app/university-search/quests/_quests-client.tsx:53`, `src/app/admin/_components/import-panel.tsx:75`
Regression?: **NEW** for the nested shape (the `/api/*` middleware fence did not exist on `origin/main`); NO for the other seven

Evidence — enumerated from `grep -rn "NextResponse.json\|new Response" src/app/api`:

| # | Shape | Where |
|---|---|---|
| 1 | `{error: string}` | 16 routes (the plurality) |
| 2 | `{ok:false, error:string}` | `admin/catalog-health`, `admin/update-deadlines`, `admin-guard`, `chat/feedback` |
| 3 | `{ok:false}` — **no `error` key, HTTP 200** | `chat/feedback:62` |
| 4 | `{error:string, stage:string}` | `match:38` only |
| 5 | `{suggestions: []}` on 401/403/429 | `chat/suggestions:27,31,36` |
| 6 | `{programs:[], universities:[]}` on 429, and on error **HTTP 200** | `search/suggestions:55,158` |
| 7 | `{events:[], connectedSources:[]}` on 429 | `calendar-feed:171` |
| 8 | `{error: {code:string, message:string}}` — **nested** | `middleware.ts:84` |

So the earlier audit's "one route returning a 200-shaped body on failure" is now **three**
(#3, #5, #6) — each newly documented as deliberate fail-soft for a decorative feature,
which is a defensible product call but is not consolidation.

Shape #8 is the actively harmful one. Clients do:
```
$ grep -rn "data.error ??" src/app
counsellor/universities/_universities-client.tsx:252,308,425 →  new Error(data.error ?? 'Failed to create deck')
university-search/quests/_quests-client.tsx:53               →  new Error(data.error ?? 'Failed to start application')
admin/_components/import-panel.tsx:75                        →  new Error(payload.error ?? 'Failed to sync data.')
```
Against a middleware 401 `data.error` is an **object**, so `new Error({code,message})`
renders as `[object Object]`. Worse at
`_universities-client.tsx:282`, which passes it straight into a toast:
`showToast({ title: 'Could not delete deck', description: data?.error, … })` — an object
child, which React refuses to render.

And the shape is *locked in* by a test, so it will not drift back on its own:
```
$ grep -rn "unauthenticated" __tests__/middleware/middleware.test.ts
168:      error: { code: 'unauthenticated', message: 'Authentication required.' }
```

Repro: expire a session, click "Delete deck" on `/counsellor/universities`. The middleware
401 fires before the handler, and the toast receives an object.

Fix: make the middleware 401 body `{ error: 'Authentication required.' }` to match the 16
routes (and update `middleware.test.ts:168` — a deliberate re-baseline, recorded here with
the diff, per §2 rule 3). Longer term, one `apiError(message, status)` helper in
`src/lib/api/` and route all 23 through it.

Test: a test asserting `typeof body.error === 'string'` for the middleware 401 —
red before the change, green after.

---

### H-09 — `/api/essay-assist` interpolates unbounded, unvalidated `block`/`blocks` into the LLM prompt
Severity: **P3**
Location: `src/app/api/essay-assist/route.ts:137-177`, consumed at `:88,93,76,80`
Regression?: **NO** (pre-existing)

Evidence — the route caps two fields and no others:
```ts
if ((essay && essay.length > 30_000) || (studentContext && studentContext.length > 5_000)) {
  return … 'Input too long.' … 400;
}
```
`block: {label, detail}` and `blocks: {label, detail}[]` are only checked for presence:
```ts
if (action === 'expand'  && !block) …
if (action === 'outline' && (!blocks || blocks.length === 0)) …
```
Then both are interpolated verbatim:
```ts
Block: "${data.block?.label}"                                  // :76
${(data.blocks ?? []).map((b) => `- ${b.label}: ${b.detail ?? 'no detail'}`).join('\n')}   // :93
```
No array-length cap, no per-item string cap, no `typeof` check. Note the contrast three
lines above at `:155`, where `platform` *is* carefully validated with `Object.hasOwn` and a
comment explaining why — the author saw this exact class of problem on the adjacent field
and stopped there.

Repro (inferred): `POST /api/essay-assist {action:'outline', blocks:[{label:'x'.repeat(1e6)}]}`
→ a ~1 MB prompt to Gemini. The 10/min/user limit bounds the request rate but not the
per-request cost, so the spend ceiling the rate limit is described as enforcing
("Bound per-user LLM spend", `:130`) is not actually bounded.

Second, smaller defect at the same site: `blocks: "abc"` (a non-empty string) passes
`!blocks || blocks.length === 0`, then `.map` throws → the outer catch returns **500**
where 400 is correct.

Fix: cap `blocks.length` (≤20) and each `label`/`detail` (≤500 ch), and require
`Array.isArray(blocks)` with per-item `typeof … === 'string'`. This is the one route where
a small zod schema would be strictly better than the hand-rolled checks.

Test: `blocks` of length 21 → 400; `blocks: 'abc'` → 400 not 500; a 600-char `label` → 400.

---

### H-10 — Three routes return JSON without a `Content-Type: application/json` header
Severity: **P3**
Location: `src/app/api/chat/route.ts:76,81,100,106,112,116,128,131,221,317`; `src/app/api/chat/actions/execute/route.ts:50`; `src/app/api/essay-assist/route.ts:127,132,148,156,160,164,168,172,176,240,245`
Regression?: **NO** (pre-existing)

Evidence: `new Response(JSON.stringify({ error }), { status })` with no `headers`. The
WHATWG default for a string body is `text/plain;charset=UTF-8`. The other 20 routes use
`NextResponse.json`, which sets `application/json`.

Repro: `curl -i` any of these error paths → `content-type: text/plain;charset=UTF-8` with
a JSON body. `fetch(...).json()` ignores the header so no client breaks today; anything
that content-negotiates (a proxy, a future SDK, `Accept`-based error handling) does.

Fix: `const jsonError = (error, status) => NextResponse.json({ error }, { status });` —
`actions/execute` already has a `jsonError` helper at `:49`, it just builds a raw
`Response`. Changing that one helper fixes 1 of the 3 routes for free.

Test: assert `res.headers.get('content-type')?.includes('application/json')` on the 401
path of each of the three.

---

### H-11 — `template in templateTableMap` walks the prototype chain, turning `?template=constructor` into a 500
Severity: **P3**
Location: `src/app/api/admin/import/validation.ts:166`, reached from `src/app/api/admin/import/route.ts:32-37`
Regression?: **NO** (pre-existing; `validation.ts` is not in the branch diff)

Evidence:
```ts
// validation.ts:166
if (!template || !(template in templateTableMap)) {
  return { error: 'Invalid dataset template.' };
}
…
const schema = templateSchemas[template];   // :182
const result = schema.safeParse(row);       // :187
```
`'constructor' in templateTableMap` is `true` (inherited from `Object.prototype`), so the
guard passes; `templateSchemas['constructor']` is the `Object` constructor, which has no
`.safeParse`; the `TypeError` is caught by the route's outer handler and returned as 500.
Same for `'__proto__'`, `'toString'`, `'valueOf'`.

The route also feeds it a cast rather than a check:
```ts
const parsedTemplate = typeof body.template === 'string' ? (body.template as TemplateKey) : undefined;
```

This is exactly the bug class the sibling essay-assist route fixed and documented
(`essay-assist/route.ts:153-154`: "`Object.hasOwn`, not `in`: `in` walks the prototype
chain, so 'constructor' / '__proto__' / 'toString' would pass"). The fix was applied there
and not here.

Repro: `POST /api/admin/import {"template":"constructor","rows":[{}]}` as an admin → 500
`{"error":"…"}` instead of 400 `{"error":"Invalid dataset template."}`. Admin-only, so the
consequence is a confusing 500 and a noisy log, not a breach.

Fix: `!Object.hasOwn(templateTableMap, template)`.
Test: `validateTemplateRows('constructor' as any, [{}])` returns
`{error: 'Invalid dataset template.'}` — throws before the fix. `__tests__/admin-import-validation.test.ts`
already exists and is the natural home.

---

### H-12 — `await req.json()` unguarded in three routes: a malformed body is 500, not 400
Severity: **P3**
Location: `src/app/api/chat/route.ts:86`; `src/app/api/chat/feedback/route.ts:31`; `src/app/api/essay-assist/route.ts:137`
Regression?: **NO** (pre-existing)

Evidence: all three call `await req.json()` bare inside an outer `try` whose `catch`
returns 500. `src/lib/api/guards.ts:8-14` exists for precisely this and is used by the
other body-reading routes:
```ts
export const parseJsonBody = async <T>(request: Request): Promise<T | null> => {
  try { return (await request.json()) as T; } catch { return null; }
};
```
`chat/actions/execute` — the sibling in the same directory tree — already uses it.

Repro: `POST /api/chat` with body `{` → 500 `{"error":"Something went wrong. Please try
again."}` and a `console.error` in the logs, where 400 "Invalid JSON body" is correct and
silent.

Fix: swap the three calls to `parseJsonBody` and add the `null` → 400 branch.
Test: a malformed-body case per route asserting 400. Note the existing
`__tests__/chat/actions-execute-route.test.ts:175` "rejects a malformed body" is the
template — it exists only for the one route that already does this right.

---

### H-13 — 19 of 23 routes have no route-level test, including both new authorization primitives and all of `admin-guard.ts`
Severity: **P2** (a finding against the tests, per §4 lane F's framing)
Location: `__tests__/` — only `chat/route.test.ts`, `chat/actions-execute-route.test.ts`, `chat/feedback-route.test.ts`, `checklist/route.test.ts` exist
Regression?: **NEW** for the untested new code; NO for the pre-existing gaps

Evidence:
```
$ find __tests__ -path "*api*" -o -name "*route*"
__tests__/chat/actions-execute-route.test.ts
__tests__/chat/feedback-route.test.ts
__tests__/chat/route.test.ts
__tests__/checklist/route.test.ts

$ grep -rln "filterActionableStudentIds\|assertCounsellorMayActOnStudent" __tests__
   (no output)

$ grep -rln "hasValidAdminBearer\|requireAdminUser" __tests__
   (no output)
```
The two functions with no test are the **new** per-student authorization primitives this
branch added (`src/lib/api/guards.ts:95,125`) — the ones standing between "you are a
counsellor" and "you may write to *this* student". `admin-guard.ts` is 110 new lines
including the constant-time bearer comparison, and nothing exercises it; the file's own
header (`:62-64`) even notes the bearer path "one no test covered because nothing
exercises the bearer path" — that is still true after the refactor that wrote the sentence.

The four route tests that do exist are good — `checklist/route.test.ts:178` asserts 404 for
"exists but owned by someone else", which is exactly the assertion class §2 asks for.

Fix: none in `src/`.
Test: unit tests for `assertCounsellorMayActOnStudent` (non-counsellor → `forbidden`;
counsellor + non-student target → `not_found`; counsellor + student → `ok`),
`filterActionableStudentIds` (non-counsellor → `null`; mixed roles → students only; query
error → `[]`), and `hasValidAdminBearer` (unset `ADMIN_API_KEY` → false even with a
matching header; wrong length → false; exact match → true). Each must be checked to go red
when the corresponding condition is inverted.

---

## 4. What I checked and found clean

Do not redo these.

- **Route inventory.** `comm` on `git ls-tree` for `origin/main` vs `HEAD` under
  `src/app/api`: zero routes added, zero removed. 23 handlers, all in the table above.
- **No guard lost in the rewrite.** `git diff --stat origin/main...HEAD -- src/app/api
  src/lib/api` = 11 files, +425/−86. I read every hunk. All eight behavioural changes are
  *strengthenings*: `resolveChatMode` on actions/execute, `filterActionableStudentIds` +
  `MAX_STUDENTS_PER_ASSIGN` + `MAX_MESSAGE_LENGTH` + sanitised error on decks/assign,
  `assertCounsellorMayActOnStudent` + `MAX_BODY_LENGTH` + sanitised error on notes,
  `admin-guard.ts` extraction (which fixes `.single()`→`.maybeSingle()`, binds the
  discarded `error`, and separates 503-outage from 403-denial), and three `@/lib/parent` →
  `@/features/parent` import moves. **No `.eq()` was dropped, no role literal changed, no
  predicate weakened.**
- **Resource-level authorization on the routes that carry a resource id.**
  `checklist` PATCH/POST/DELETE (ownership via `applications!inner(profile_id)`, and
  exists-but-not-yours deliberately collapsed to 404 to close the existence oracle —
  `server-actions.ts:78-83,121-126`), `applications/track` (`.eq('profile_id', userId)`),
  `match` and `match/score` (`user.id` passed to the service), `profile/export` (all six
  reads scoped, verified line by line), `profile/recalculate-score` (upsert keyed
  `profile_id: user.id`), `parent/messages` (`guardian_links` linkage before any write),
  `counsellor/notes`, `decks/assign` POST, `chat` and `chat/actions/execute`
  (`conversation.owner_id !== user.id` → 403, before any model spend).
- **`chat/actions/execute` wire-tampering surface.** Tool name is immutable
  (`storedAction.tool !== toolName` → 400); only `storedAction.editable` keys are taken
  from the wire, so target ids come from the persisted proposal; `claimMessageAction` is an
  atomic pending→sent claim so double-clicks lose the race; a failed execute reverts the
  claim. This is the best-defended route in the app.
- **`chat/feedback` attribution.** `profile_id` is server-set from `user.id`; a forged body
  cannot attribute feedback to another user. Covered by
  `__tests__/chat/feedback-route.test.ts:68`.
- **zod usage where it exists.** `admin/import/validation.ts` uses `safeParse`, has **no**
  `.passthrough()` (`grep -n passthrough` → no match), and pushes `result.data` (unknown
  keys stripped) rather than the raw row. The 5000-row cap is enforced. This is real
  validation.
- **Rate limiter implementation.** `src/lib/api/rate-limit.ts` — the overflow eviction
  correctly avoids a global `clear()` (which would let an attacker rotating spoofed IPs
  flush everyone's counters), and `clientIp` correctly prefers `x-real-ip` over the
  caller-controlled leftmost `x-forwarded-for` hop. Every LLM route is covered.
- **CSV injection in `profile/export`.** `escapeCsv` prefixes `=+-@` with a quote before
  the standard quote-doubling. Correct order, correct character class.
- **`middleware.ts` location.** `src/middleware.ts`, and the matcher now includes
  `'/api/:path*'` (line 263) — it did not on `origin/main`
  (`git show origin/main:src/middleware.ts` matcher lists page prefixes only). The `/api`
  branch returns JSON, never an HTML redirect, and runs before the Supabase client is
  constructed.
- **`PUBLIC_API_PREFIXES`** is exactly `['/api/calendar-feed']`, matched with an exact-or-
  `prefix/` test (no `startsWith` prefix-confusion bug), and that route is genuinely
  anonymous-by-design and IP-throttled.
- **PostgREST `.or()` gotcha.** `grep -rn "\.or(" src/app/api` → no matches. No route
  builds an `.or()` string from values containing spaces.
- **`assertCounsellorMayActOnStudent` 404-vs-403 split** is deliberate and correct: 404 for
  an unknown subject so the endpoint cannot enumerate profile ids, 403 once the subject is
  known. Same discipline as the checklist routes.

## 5. Not verified

- **Every RLS outcome.** I read `supabase/schema.sql` but could not connect to a database
  (§2 rule 1 forbids production; standing up a local Postgres is lane C's job and would
  have collided with concurrent agents). So H-01, H-04 and especially **H-06** rest on
  reading `create policy … using (auth.uid() is not null)` and reasoning about what an
  anon-key request returns, not on observing it. **H-06 is my least-verified finding** and
  should be reproduced against a DB before anyone acts on it.
- **The H-03 mutation.** I proved statically that the escalation guard is inert in all 13
  tests (no fixture uses a non-`student` mode; `resolveChatMode` short-circuits for
  `student`), and I executed the suite to confirm it passes. I did **not** delete lines
  99-106 and re-run, because this lane may not modify `src/`. §2 rule 5 says a check you
  have not watched go red is not known to work — that applies to my own claim here.
- **Actual row counts.** H-02's "unbounded `universities` scan" is unbounded *in the app*.
  Whether PostgREST caps it depends on `db-max-rows`, which is not set anywhere in this
  repo (`ls supabase/*.toml` → no matches) and is a dashboard setting I cannot read.
- **`npm test` / `npm run build`.** Not run — forbidden by this lane's constraints
  (CPU-contended, other agents mid-edit). The stated baseline of 67 suites / 1541 tests is
  inherited, not re-measured. I ran exactly one targeted suite.
- **Live HTTP behaviour.** No route was invoked over the wire. Every `curl` in the Repro
  sections is the request that *would* reproduce the finding, derived from the handler
  source — not a transcript.
- **`search_filter_options()` grants on the remote DB.** Read from `schema.sql`; the remote
  migration history is known to have diverged from `supabase/migrations/` (CLAUDE.md), so
  the deployed grant may differ from the checked-in one.
- **Whether `/api/search/filters` is called from outside the repo** (a bookmark, an
  external script, a Vercel cron). H-02's "dead route" claim covers `src/` only.
