# Ascenda — Application Security, AuthN/AuthZ & Data Isolation Audit

**Scope:** cross-cutting identity, authorisation and tenant-isolation design. Route-by-route API review and devops/secrets are owned by other agents; routes are cited here only as evidence of a design property.
**Method:** static read of the repo at `/Users/gregfranck/Ascenda` (branch `fix/ui-phase0-bugs`). No database was contacted; all RLS claims come from `supabase/migrations/*.sql` and `supabase/schema.sql`. Migration files are assumed applied per project memory — **the two most severe findings should be re-confirmed against the live DB before remediation is scoped.**

---

## 1. Identity & Authorisation Map

### 1.1 How a request acquires identity

There is exactly one authentication mechanism — a Supabase GoTrue session in HTTP cookies — and three cookie adapters over it:

| Adapter | File | Key | Cookie writes |
|---|---|---|---|
| Middleware inline client | `src/middleware.ts:26-42` | anon | yes (`res.cookies.set`) |
| `createServerSupabaseClient` | `src/lib/supabase/server.ts:5-27` | anon | **no-op** (RSC cannot set) |
| `createServerActionSupabaseClient` | `src/lib/supabase/server.ts:29-49` | anon | yes |
| `createRouteHandlerSupabaseClient` | `src/lib/supabase/server.ts:51-71` | anon | yes |
| `getBrowserSupabaseClient` | `src/lib/supabase/client.ts:8-23` | anon | browser-managed |
| `createServiceRoleSupabaseClient` | `src/lib/supabase/service.ts:15-24` | **service role** | n/a |

Session acquisition is sound. `src/app/auth/callback/route.ts:32` does a proper PKCE `exchangeCodeForSession`, sets cookies on the redirect response, and falls through to `/login` on error. `src/middleware.ts:44-46` uses `auth.getUser()` (server-verified) rather than `getSession()` (JWT-decode only) — correct. Middleware is correctly located in `src/`, so it actually runs (the historical root-location bug is fixed).

### 1.2 What middleware does — and does not — do

`src/middleware.ts:6-21` lists 14 protected prefixes, and `:142-149` redirects unauthenticated users to `/login`. **That is the whole of it.** Middleware performs:

- ✅ authentication (is there a user)
- ✅ onboarding-completion routing (`:71-140`, cookie-cached)
- ✅ `/signup` disablement (`:52-59`)
- ❌ **no role resolution, no role-based routing, no authorisation of any kind**

`/admin`, `/counsellor` and `/parent` sit in the same undifferentiated `PROTECTED_PREFIXES` bucket as `/dashboard`. Middleware treats "signed in" as the only access decision in the system.

### 1.3 Independent implementations of "get the current user and their role"

**Nine distinct app-layer implementations, plus four DB-layer helpers. There is no shared one.**

| # | Implementation | File:line | Resolves role? | Notes |
|---|---|---|---|---|
| 1 | Middleware inline | `src/middleware.ts:26-46` | no | own cookie adapter, duplicated from server.ts |
| 2 | Per-page RSC pattern | ~25 sites, e.g. `src/app/dashboard/page.tsx:68`, `src/app/matches/page.tsx:28`, `src/app/counsellor/page.tsx:22` | no | copy-pasted `createServerSupabaseClient()` + `auth.getUser()` + `if (!user) redirect('/login')` |
| 3 | Per-route-handler pattern | ~18 sites, e.g. `src/app/api/chat/route.ts:74`, `src/app/api/checklist/route.ts:33/58/96` | no | same, with `401` instead of redirect |
| 4 | `ensureUser` (server actions) | `src/app/profile/actions.ts:11-20` | no | the only named helper on the student side |
| 5 | `resolveParentContext` | `src/app/parent/_lib/context.ts:20-28` | no (resolves *links*) | **the one good pattern in the codebase** — one seam, returns client + userId + authorised child set |
| 6 | `requireCounsellor` | `src/lib/counsellor/decks.ts:100-113` | via #7 | |
| 7 | `canActAsCounsellor` | `src/lib/api/guards.ts:21-24` | **stubbed to `Boolean(user)`** | 3 call sites |
| 8 | `resolveChatMode` | `src/lib/chat/mode.ts:28-42` | via #7 | client-supplied `mode`, enum-validated only |
| 9 | `useUserRole` (client) | `src/hooks/use-user-role.ts:6-51` | **from `sessionStorage`/`localStorage` first** | drives nav + side-switcher |
| — | `useIsDemoUser` (client) | `src/lib/demo/use-is-demo-user.ts:9-33` | demo flag | `sessionStorage`-cached |
| DB | `auth_role()` | `20260713130000_fix_auth_role_recursion.sql:21-32` | yes | admin policies only |
| DB | `is_counsellor()` | `20260628120000_counsellor_real_data.sql:20-23` | yes | **defined but unused** |
| DB | `is_demo_account()` | `20260628120000...:25-28` | email match | **defined but unused** |
| DB | `can_act_as_counsellor()` | `20260712130000_open_counsellor_access.sql:15-23` | **`auth.uid() is not null`** | ~25 policies route through this |

**Role is never resolved server-side on any non-admin path.** The five server-side `profiles.role` lookups in the entire application are all ad-hoc copies of the same three-line admin check:

```
src/app/admin/page.tsx:31-35
src/app/admin/simulation/page.tsx:75-76
src/app/api/admin/catalog-health/route.ts:34-38
src/app/api/admin/update-deadlines/route.ts:14-17
src/app/api/admin/import/route.ts:16-19
```

### 1.4 Authorisation model: there isn't one

There is **no** `can(user, action, resource)`, no route→role map, no guard HOC, no policy module, no middleware role table. Authorisation is:

- **5 sites** of ad-hoc `if (profile?.role !== 'admin')` (above) — the only real role checks in the app
- **3 sites** calling `canActAsCounsellor()`, which is hardwired to `true` for any authenticated user (`src/lib/api/guards.ts:21-24`)
- **~43 sites** of `if (!user)` — authentication masquerading as authorisation
- **Everything else** delegated to RLS

**Guard variants observed:**

```ts
// V1 — admin, server component (2 sites)
const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
if (profile?.role !== 'admin') redirect('/dashboard');          // admin/page.tsx:31-33

// V2 — admin, route handler (3 sites)
if (profile?.role !== 'admin') return NextResponse.json({...}, { status: 403 });

// V3 — "counsellor" (3 sites) — a no-op
if (!(await canActAsCounsellor(supabase, user))) return 403;    // guards.ts:21-24 → Boolean(user)

// V4 — auth-only, the dominant pattern (~43 sites)
if (!user) redirect('/login');                                   // counsellor/layout.tsx:16-18
```

### 1.5 Role-privileged UI with no server-side guard

| Surface | Guard present | Evidence |
|---|---|---|
| `/counsellor/*` — 10 routes: overview, inbox, students roster + detail, universities, analytics, deadlines, outcomes, documents, applications, assistant | **auth only** | `src/app/counsellor/layout.tsx:12-18`; zero `page.tsx` under `src/app/counsellor/` references `role` |
| `/parent/*` — 6 routes | **auth only** | `src/app/parent/layout.tsx:12-18` (mitigated: data scoped via `guardian_links`, §3) |
| `/role-select` | **none — client-side theatre** | `src/app/role-select/page.tsx:123` writes `sessionStorage.setItem('ascenda-session-role', role.id)` then `router.push()`. No DB read, no role verification, no persistence. The "role" a user picks here is a UI preference, not a claim. |
| `/admin` | ✅ per-page | `src/app/admin/layout.tsx:17-20` documents *why* the guard is per-page (layouts don't re-run on client nav) — this reasoning is correct and is the best authorisation thinking in the repo |

The counsellor and parent layouts carry honest comments explaining the open posture (`counsellor/layout.tsx:8-11`, `parent/layout.tsx:8-11`) and name the exact rollback. The intent is documented; the control is absent.

### 1.6 Structural gap: the counsellor↔student relationship does not exist as data

Grepping every `create table` in `supabase/migrations/` and `supabase/schema.sql`: there is **no counsellor assignment/cohort table**. The relationship primitives that exist are:

- `guardian_links` (`20260716120000_guardian_links.sql:23-31`) — parent↔student, with RLS
- `help_requests.counsellor_profile_id` (`20260517120000`, `20260713170000`) — per-*thread* claim, not a standing relationship
- `counsellor_decks.counsellor_id` — deck ownership, not student assignment

"Cohort" is an **email-suffix filter in application code**: `DEMO_COHORT_EMAIL_SUFFIX = '+seed@ascenda.demo'` at `src/lib/counsellor/data.ts:59`, applied at `:246`, `:540`, `:775`.

**This is the root architectural problem.** Even a perfectly-written RLS policy has nothing to scope a counsellor on. Every fix below that says "restore the counsellor check" is blocked on first creating this table.

---

## 2. Isolation Matrix

`CACC` = `can_act_as_counsellor()`, currently `auth.uid() is not null` (`20260712130000:15-23`) — i.e. **true for every logged-in user**. Read the CACC column as "any authenticated user".

| Resource | RLS enabled | Policy (effective) | App-level check | Verdict |
|---|---|---|---|---|
| `profiles` | ✅ | self + `CACC` select (`20260628120000:69-70`) | none | 🔴 **every profile readable by everyone** |
| `student_personal_information` | ✅ | self + `CACC` select (`:73-74`) | none | 🔴 **all student PII (name, email, nationality, country) readable by everyone** |
| `student_academic_input` | ✅ | self + `CACC` (`:77-78`) | none | 🔴 open read |
| `student_subjects` | ✅ | self + `CACC` (`:81-82`) | none | 🔴 open read |
| `student_admissions_tests` | ✅ | self + `CACC` (`:85-86`) | none | 🔴 open read |
| `student_lifestyle_preference` | ✅ | self + `CACC` (`:89-90`) | none | 🔴 open read |
| `student_scores` | ✅ | self + `CACC` (`:93-94`) | none | 🔴 open read |
| `student_matches` | ✅ | self + `CACC` (`:97-98`) | none | 🔴 open read |
| `applications` | ✅ | self + `CACC` (`:101-102`) | `profile_id = userId` on writes (`server-actions.ts:50,81,124`) | 🟠 writes correct, reads open |
| `application_checklist` | ✅ | self + `CACC` (`:105-106`) | join-based owner check (`api/checklist/route.ts:107-121`) | 🟠 writes correct, reads open |
| `documents` | ✅ | self + `CACC` (`:109-110`) | none | 🟠 metadata open; bytes protected by storage RLS |
| `counsellor_notes` | ✅ | select `CACC`; insert `CACC and author=uid`; **update `CACC`** (`:140-152`) | **none** (`api/counsellor/notes/route.ts:20-35`) | 🔴 **anyone reads, writes and edits any note on any student** |
| `parent_contacts` | ✅ | **`for all` using `CACC`** (`:172-175`) | `guardian_links` check on the parent write path only (`api/parent/messages/route.ts:33-48`) | 🔴 **anyone can read/update/DELETE all parent contacts** |
| `parent_messages` | ✅ | **`for all` using `CACC`** (`:192-195`) | same | 🔴 **anyone can read/update/DELETE all parent↔counsellor correspondence** |
| `student_documents` | ✅ | **`for all` using `CACC`** (`:215-218`) | none | 🔴 **anyone can read/update/DELETE every student's document tracker** |
| `help_requests` | ✅ | participant-or-`CACC` (`20260611130000:56-58`, `20260713170000:36-45`) | none | 🔴 open read/insert of threads to any student |
| `help_messages` / `help_notes` / `help_meetings` | ✅ | participant-or-`CACC` (`20260611130000:78-138`) | none | 🔴 open |
| `notifications` | ✅ | select self (`20260611130000:143`); insert **narrowed** to self OR (`CACC` + `kind='doc_nudge'` + root-relative href) (`20260715120000:53-68`, re-stated `20260718130000:43`) | none | 🟢 direct path fixed — 🟠 **but bypassed by a SECURITY DEFINER trigger, see F6** |
| `guardian_links` | ✅ | select `parent_profile_id = auth.uid()`; **no insert/update/delete policy** (`20260716120000:41-49`) | `resolveLinkedChildIds` (`lib/parent/data.ts:58-71`) | 🟢 **the best-designed seam in the schema** |
| `chat_conversations` | ✅ | `owner_id = auth.uid()` (`20260718120000:51-57`) | `owner_id !== user.id → 403` (`api/chat/route.ts:127-129`) | 🟢 correct, defence in depth |
| `chat_messages` | ✅ | `for all` to conversation owner (`20260718120000:58-71`) | ownership re-checked (`actions/execute/route.ts:81-93`) | 🟠 correct for confidentiality, **fatal as an action-provenance store — see F4** |
| `chat_feedback` | ✅ | self insert/select/update (`20260717120000:26-38`) | `profile_id: user.id` (`api/chat/feedback/route.ts:51`) | 🟢 |
| `counsellor_decks` | ✅ | owner-scoped (`20260713160000:51-62`) | `.eq('counsellor_id', …)` on delete (`decks.ts:206-209`) | 🟢 |
| `counsellor_deck_programs` | ✅ | `deck_owned_by_me()` (`20260713160000:72-79`) | none (`decks.ts:239-248`) | 🟠 RLS-only, but RLS is genuine |
| `deck_assignments` | ✅ | write gated on **deck** ownership only, never the student (`20260713160000:89-93`) | **none** (`decks.ts:257-291`) | 🔴 **assign to arbitrary students → notification injection, F6** |
| `saved_searches` | ✅ | self (`20260713150000:187`) | none | 🟢 |
| `shortlisted_programs` | ✅ | self CRUD (`20260724100000:53-68`) | `profile_id: userId` (`lib/shortlist/server.ts:65`) | 🟢 |
| `programs` / `universities` / `cities` | ✅ | public select, admin write (`20260719120000:13-34`) | admin role check on import (`api/admin/import/route.ts:16-19`) | 🟢 **fixed** |
| `storage.objects` (`application-documents`) | ✅ | path-prefix bound to `applications.profile_id = auth.uid()` or `unassigned/<uid>/` (`schema.sql:1054-1145`) | uploader derives path client-side | 🟢 **the strongest policy in the schema** |

### Places where application code is the ONLY thing preventing a cross-tenant read

1. **`parent_contacts` / `parent_messages`** — RLS is `for all using (CACC)` = fully open. The `guardian_links` verification at `src/app/api/parent/messages/route.ts:33-48` is the sole control on the parent write path, and there is **no** equivalent control on reads. Correct as written, load-bearing, and one refactor away from silent failure.
2. **The entire counsellor cohort scope** — `inDemoCohort()` (`src/lib/counsellor/data.ts:66-69`) is an in-process email-string filter over rows RLS already returned in full. Any direct PostgREST call bypasses it entirely.
3. **`counsellor_notes` authorship** — `author_profile_id = auth.uid()` is the only DB constraint; *which student* a note attaches to is decided entirely by client input.
4. **`chat_messages` action provenance** — RLS guarantees only that the row belongs to the caller, not that the server wrote it.

---

## 3. Known Posture Problems — Current State

| Memory claim | Verified state today | Evidence |
|---|---|---|
| (a) Counsellor access opened to ALL users for demo; called a launch blocker | 🔴 **STILL OPEN, in both layers.** DB: `can_act_as_counsellor()` returns `auth.uid() is not null`. App: `canActAsCounsellor()` returns `Boolean(user)`. `is_counsellor()` and `is_demo_account()` remain defined but are referenced by nothing. Blast radius is **wider than memory records** — it is not just "the counsellor pages are visitable"; it disables ~25 RLS policies including three `for all` policies that permit DELETE. | `supabase/migrations/20260712130000_open_counsellor_access.sql:15-23`; `src/lib/api/guards.ts:21-24` |
| (b) Notification-injection RLS finding left open | 🟢 **FIXED on the direct path** — `notifications_insert` now requires `profile_id = auth.uid()` OR (`CACC` AND `kind='doc_nudge'` AND root-relative href). The migration carries a self-verifying `do $$` block that aborts if not applied. 🟠 **But a bypass exists**: `notify_on_deck_assignment_insert()` is SECURITY DEFINER (which the fix's own header at `:14` notes is unconstrained) and interpolates the caller-supplied `new.message` into the notification `body` for a caller-supplied `new.student_profile_id`. See F6. | `20260715120000_tighten_notifications_insert_and_accept_trigger.sql:53-91`; `20260714090000_deck_notification_href_quests.sql:9-42` |
| (c) Catalogue RLS hole fixed | 🟢 **CONFIRMED FIXED.** RLS enabled on `cities`/`programs`/`universities`, public SELECT policies added, `cities_admin` write policy added. | `20260719120000_enable_rls_catalogue_tables.sql:13-35` |

---

## 4. Service-Role Usage

**`SUPABASE_SERVICE_ROLE_KEY` is not reachable from any user-controlled input path.** This is the strongest area of the codebase and I could not find a way to break it.

| File | Context | Server-only? | User-reachable? | Re-checks authz? |
|---|---|---|---|---|
| `src/lib/supabase/service.ts:15-24` | the only admin-client factory in `src/` | ✅ hard runtime `typeof window !== 'undefined'` throw at `:11-13`; no `next/*` imports | **no importers in `src/`** (verified by grep) | n/a |
| `scripts/seed-demo-user.ts:63`, `create-admin-users.ts:50`, `seed-students.ts`, `upload-ucas.ts:109`, `upload-all-countries.ts:78`, `upload-updated-programs.ts:312,327`, `update-program-entry-requirements.ts:130`, `validate-catalog.ts:21`, `debug-live-matches.ts:24`, `simulate-profiles.ts:1667` | CLI, `process.env` | ✅ never bundled | ✅ no HTTP surface | n/a |
| `supabase/functions/update_deadlines/index.ts:18` | Deno edge function | ✅ | 🟠 **yes, indirectly** — `POST /api/admin/update-deadlines` (`src/app/api/admin/update-deadlines/route.ts:27,35`) forwards a raw client `payload` to it | 🟢 caller is admin-gated at `:14-17`; the function's own validation is outside this audit's scope but should be reviewed |
| `supabase/functions/import_ucas/index.ts:14-32` | Deno edge function | ✅ | unknown invocation path | ⚠️ **verify its JWT/authz posture separately** — it takes the service role from three env fallbacks and appears to accept import payloads |

**Verdict: 🟢 for the Next.js application.** Every `route.ts` and every Server Component uses the anon key, so RLS is always active. The single admin-client factory has a defence-in-depth browser guard and zero importers. The two edge functions are the only service-role code with a network surface; `update_deadlines` is fronted by an admin check, `import_ucas` needs separate verification.

The corollary matters: **because nothing in the app bypasses RLS, RLS is the entire security model — and §2 shows it is open.**

---

## 5. Client-Trusted Data (IDOR surface)

| Value | Source | Used as | Verified? | Verdict |
|---|---|---|---|---|
| `studentId` | body, `api/counsellor/notes/route.ts:20` | `counsellor_notes.student_profile_id` (`:29`) | ❌ nothing | 🔴 **F2** |
| `studentIds[]` | body, `api/counsellor/decks/assign/route.ts:14` | `deck_assignments.student_profile_id` (`decks.ts:278-286`) | ❌ nothing | 🔴 **F6** |
| `params.student_id` | **LLM output**, `lib/chat/tools/counsellor-write.ts:90,172` | `counsellor_notes` / `help_requests` insert | ❌ regex `/^[0-9a-f-]{36}$/i` only (`:81`, `:160`) | 🔴 **F3** |
| `mode` | body, `api/chat/route.ts:87`; query, `suggestions/route.ts:33` | selects system prompt, tool set, **and which data is loaded** | 🟠 enum + stub guard (`mode.ts:37`) | 🔴 **F3** |
| `action` payload on `chat_messages` | client-writable DB row, `actions/execute/route.ts:91-116` | the tool + params actually executed | 🟠 shape-validated (`isChatAction`), **provenance not validated** | 🟠 **F4** |
| `contactId` | body, `api/parent/messages/route.ts:23` | `parent_messages.contact_id` | ✅ `linkedChildIds.includes(contact.student_profile_id)` (`:34-48`) | 🟢 **exemplary** |
| `ACTIVE_CHILD_COOKIE` | cookie, `api/chat/route.ts:162` | scopes parent context | ✅ selector over `guardian_links`-derived set (`lib/parent/data.ts:105-109`) | 🟢 |
| `conversationId` | body, `api/chat/route.ts:93` | conversation scope | ✅ `owner_id !== user.id → 403` (`:127-129`) | 🟢 |
| `id` (checklist) | body/query, `api/checklist/route.ts` | task scope | ✅ join-based owner check (`:107-121`), 404-not-403 to avoid a UUID oracle | 🟢 |
| `programId`, `programIds[]` | body, `api/applications/track:24`, `api/match/score:30` | catalogue lookups | n/a (public data), capped at 100 | 🟢 |
| `?id=` (deck card / assignment) | query, `decks.ts:248,296` | `.delete().eq('id', …)` | ❌ no owner predicate in app code | 🟠 **F9** — RLS covers it, app layer contributes nothing (contrast `deleteDeck` at `:206-209`, which does it right) |
| `ascenda-session-role` | `sessionStorage`, `use-user-role.ts:11-18` | drives nav visibility + side-switcher | ❌ trusted over the DB value (`:18` returns early) | 🟠 **F8** |

---

## 6. Demo Mode

**Demo behaviour is compiled into production paths and is not switchable.** There is no `NODE_ENV`/`DEMO_MODE` gate anywhere in the identity path.

| Mechanism | Kind | File |
|---|---|---|
| `DEMO_EMAIL` | runtime env with a **hardcoded production fallback** — `process.env.NEXT_PUBLIC_DEMO_EMAIL \|\| 'greg@workiflow.com'` | `src/lib/demo/demo-profile.ts:5-6` |
| `DEMO_COHORT_EMAIL_SUFFIX = '+seed@ascenda.demo'` | **hardcoded constant**, no env override | `src/lib/counsellor/data.ts:59` |
| `is_demo_account()` | hardcoded email **inside a DB function** | `20260628120000:25-28` |
| `can_act_as_counsellor()` open posture | **permanently applied migration** | `20260712130000:15-23` |
| `useIsDemoUser` | client hook, `sessionStorage`-cached | `src/lib/demo/use-is-demo-user.ts:9-33` |
| `DEMO_COUNSELLOR = { fullName: 'Sarah Mitchell' }` | hardcoded persona fallback | `src/lib/demo/counsellor.ts:5-8` |

**Can a real user trip a demo branch?** Yes, in both directions:

- Every authenticated user permanently trips the "demo" counsellor branch — that *is* the current posture (F1).
- Conversely, `inDemoCohort()` (`data.ts:66-69`) is a **containment** mechanism: real (non-`+seed@`) students are invisible in the counsellor roster. Onboarding real students therefore requires deleting that filter, at which point the counsellor UI immediately exposes every real student to every user unless F1 is fixed first. **The demo filter is currently masking the severity of F1 — removing it without fixing F1 turns a demo-data exposure into a real-PII breach.**
- `src/lib/demo/help-request-client.ts` is not demo-specific at all despite its path — it is the production data layer for `help_requests`/`help_messages`/`notifications`, used by the real inbox. The directory name is misleading.

---

## Findings

### [CRITICAL] F1 — `can_act_as_counsellor()` is `auth.uid() is not null`, disabling ~25 RLS policies

**`supabase/migrations/20260712130000_open_counsellor_access.sql:15-23`** (DB), mirrored at **`src/lib/api/guards.ts:21-24`** (app).

Every counsellor-side RLS policy routes through this one function. With it returning true for all authenticated users, the following are readable by **any signed-in account**: `profiles`, `student_personal_information`, `student_academic_input`, `student_subjects`, `student_admissions_tests`, `student_lifestyle_preference`, `student_scores`, `student_matches`, `applications`, `application_checklist`, `documents`, `counsellor_notes`, all four `help_*` tables. And `parent_contacts`, `parent_messages`, `student_documents` are `for all` — **read, update and DELETE**.

**Attack:** a student signs in, opens devtools, and issues one PostgREST call with the anon key already in the bundle:
```js
await supabase.from('student_personal_information').select('*')
```
No app code is involved; middleware, layouts and route handlers are all bypassed. Returns every student's first name, last name, **email address**, nationality and country of residence. `student_scores` and `student_matches` follow, then `counsellor_notes` — a counsellor's private written assessments of named students.

**Actor:** any authenticated user (registration is disabled at `middleware.ts:52-59`, so today that means any account the team has provisioned — which does not include future real students).
**Data:** PII of every student on the platform. The user base is **international high-school students, i.e. minors** — this is a GDPR Art. 9-adjacent exposure with a mandatory-notification profile.
**Currently masked by:** `inDemoCohort()` limiting the *UI* to seeded accounts. The DB has no such limit.

**Fix (in order):**
1. Create the missing `counsellor_assignments (counsellor_profile_id, student_profile_id, status)` table with RLS, mirroring `guardian_links`.
2. Rewrite the helper to be *relationship*-scoped, not boolean:
```sql
create or replace function public.counsells(student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from counsellor_assignments a
    where a.counsellor_profile_id = auth.uid()
      and a.student_profile_id = student
      and a.status = 'active'
  ) or public.auth_role() = 'admin';
$$;
```
3. Replace every `using (can_act_as_counsellor())` with `using (profile_id = auth.uid() or public.counsells(profile_id))`.
4. Delete `src/lib/api/guards.ts:21-24` and resolve role from `profiles` in the one identity seam (§Target).

---

### [CRITICAL] F2 — `parent_contacts`, `parent_messages`, `student_documents` grant `for all` (incl. DELETE) to every authenticated user

**`supabase/migrations/20260628120000_counsellor_real_data.sql:172-175, 192-195, 215-218`**

```sql
create policy parent_messages_all on parent_messages
  for all to authenticated
  using (public.can_act_as_counsellor())
  with check (public.can_act_as_counsellor());
```

Separate from F1 because the fix differs: these should never be `for all` **even with a correct counsellor guard**. Counsellor A must not be able to delete Counsellor B's parent correspondence.

**Attack:** `await supabase.from('parent_messages').delete().neq('id','00000000-0000-0000-0000-000000000000')` from any signed-in browser session destroys every parent↔counsellor message on the platform. Same for `parent_contacts` (cascading), and `student_documents` (every student's document tracker). There is no soft-delete, no audit table, and no application code between the attacker and the table.

**Actor:** any authenticated user. **Data:** all parent communications and document-tracking state — **destructive, not just confidential**.

**Fix:** split into `select` / `insert` / `update` policies scoped through the student relationship; grant no `delete` policy at all (parity with `guardian_links`, which deliberately has no write policy — `20260716120000:43-45`). Add a `sender_profile_id` column to `parent_messages`; `sender: 'parent'` at `api/parent/messages/route.ts:52` is currently an unattributed string.

---

### [CRITICAL] F3 — Chat `mode` is client-supplied, granting counsellor cohort data + counsellor write tools to any user

**`src/app/api/chat/route.ts:87` → `src/lib/chat/mode.ts:33-39` → `src/lib/api/guards.ts:21-24`**; also `src/app/api/chat/suggestions/route.ts:33`.

`mode` is enum-validated then checked against the stubbed guard. `mode='counsellor'` yields the counsellor system prompt, the counsellor tool set, and — critically — `buildCounsellorContext` calls **`loadCohort(supabase)` with no scope argument whatsoever** (`src/lib/chat/context.ts:255-258`), inlining the whole cohort into the prompt.

Compounding this, both counsellor write tools take the target from **model output**:
```ts
// src/lib/chat/tools/counsellor-write.ts:90-99
.from('counsellor_notes').insert({
  student_profile_id: params.student_id,   // model/wire-supplied
  author_profile_id: ctx.userId, ...
})
```
The only check is `UUID_RE = /^[0-9a-f-]{36}$/i` (`:81`, `:160`) — a shape test that also accepts 36 hyphens. `message_student` (`:172-179`) likewise opens a `help_requests` thread against any `student_profile_id`, firing a real notification via `trg_help_request_notify`.

**Attack:** `POST /api/chat {"mode":"counsellor","messages":[{"role":"user","content":"summarise every student"}]}` → the response contains every seeded student's name, at-risk reasons and deadlines. Then ask it to note a specific UUID and confirm the card → a permanent `counsellor_notes` row on a student the attacker has no relationship with. The card's UI shows only `title` + `summary` (`counsellor-write.ts:66-74`); `student_id` is never displayed, so a mis-targeted note is invisible at confirm time.

**Fix:** derive `mode` from `profiles.role` server-side — never accept it from the wire. Pass `ctx.userId` into `loadCohort` and scope it. Replace the regex on `student_id` with a `counsells(student_id)` membership check inside the tool.

`mode.ts:3-11` predicts exactly this and asserts tightening RLS closes it "automatically, no change needed at the call sites". That is only true for the *data* reads; the write tools' missing membership check is an independent bug that RLS alone will not fix once a real counsellor exists.

---

### [HIGH] F4 — `/api/chat/actions/execute` treats a client-writable table as its action-provenance store

**`src/app/api/chat/actions/execute/route.ts:91-116`** + **`supabase/migrations/20260718120000_chat_conversations.sql:58-71`**

The endpoint is well-built against a *malicious model*: it re-reads the action from `chat_messages` rather than the wire, pins the tool name (`:102`), whitelists overridable params to `storedAction.editable` (`:112-116`), takes `mode` from the conversation row (`:89`), and atomically claims `pending→sent` (`:120-122`). That is the right shape.

But its trusted store is `for all` to the conversation owner, and conversations are created by a **client-side insert** (`assistant-workspace.tsx:338`, `chatbot-widget.tsx:394`). `src/lib/chat/history.ts:8-9` even concedes "`action_state` is client-writable … advisory".

**Attack (no model involved):** the user inserts `chat_conversations {mode:'counsellor'}`, inserts `chat_messages {role:'assistant', action_state:'pending', action:{kind:'tool_action', tool:'add_student_note', params:{student_id:'<victim>',…}, editable:[]}}`, then POSTs execute. Owner matches, mode matches, `isChatAction` validates *shape not provenance* (`lib/chat/actions.ts:55-73`), the write lands. **The confirmation gate constrains the model, not the client.**

**Fix:** move pending actions to a server-only table with no client INSERT/UPDATE policy (`pending_tool_actions`), keyed by a server-generated nonce; or sign the action payload server-side and verify the signature at execute. Set `chat_conversations.mode` server-side from the resolved role.

---

### [HIGH] F5 — Ten counsellor routes and six parent routes ship role-privileged UI with an auth-only guard

**`src/app/counsellor/layout.tsx:12-18`**, **`src/app/parent/layout.tsx:12-18`**, **`src/app/role-select/page.tsx:123`**, **`src/middleware.ts:6-21`**

No `page.tsx` under `src/app/counsellor/` references `role`. `/role-select` performs zero verification — it writes a `sessionStorage` string and navigates. Middleware places `/counsellor`, `/parent` and `/admin` in one undifferentiated protected bucket.

**Attack:** any signed-in student navigates to `/counsellor/students` and gets the roster UI, notes composer, document board and messaging. What they *see* is limited only by F1's open RLS plus the `inDemoCohort` filter.

**Actor:** any authenticated user. **Data:** counsellor operational surface + whatever F1 returns.

**Fix:** one server-side identity resolver returning `{ userId, role }` from `profiles`, called by both middleware (for coarse routing) and each protected page (for the real boundary — `admin/layout.tsx:17-20` documents correctly why the page, not the layout, is the boundary). Make `/role-select` a *view* over the user's actual role, offering only portals their role grants.

---

### [HIGH] F6 — Deck assignment reopens cross-user notification injection through a SECURITY DEFINER trigger

**`src/app/api/counsellor/decks/assign/route.ts:14-26` → `src/lib/counsellor/decks.ts:257-291` → `supabase/migrations/20260714090000_deck_notification_href_quests.sql:9-42`**

`deck_assignments_write` gates on **deck** ownership only (`20260713160000:89-93`) and never on the student. `studentIds[]` comes straight from the request body with no membership check. The insert then fires `notify_on_deck_assignment_insert()`, which is `security definer` and interpolates caller-controlled `new.message` into the notification body:

```sql
coalesce(deck_name, 'A university deck') || ' · ' || card_count || ' universities'
  || coalesce(' — ' || nullif(trim(new.message), ''), '')
```

The 20260715120000 fix narrowed *direct* `notifications` inserts to `kind='doc_nudge'` with root-relative hrefs — and its own header at `:14` notes "SECURITY DEFINER triggers bypass this policy and are unaffected." This trigger is exactly that bypass.

**Attack:** `POST /api/counsellor/decks` (creates a deck the attacker owns), then `POST /api/counsellor/decks/assign {"deckId":"<own>","studentIds":["<any uuid>",…],"message":"<attacker text>"}`. Attacker-authored text lands in any student's notification feed under the trusted heading "New quest from your counsellor". `href` and `title` are hardcoded, so this is a text/social-engineering primitive rather than a phishing-link one — but it is cross-user content injection, and the `deck_name` (fully attacker-controlled) is also interpolated.

**Fix:** intersect `studentIds` with a server-derived cohort before insert; add `and public.counsells(student_profile_id)` to `deck_assignments_write`; strip or length-bound `new.message` in the trigger.

---

### [MEDIUM] F7 — Prompt injection from `counsellor_notes` and student free-text into counsellor and parent LLM contexts

**`src/lib/chat/tools/counsellor-read.ts:215-219`**, **`src/lib/counsellor/data.ts:266-269`**, **`src/lib/chat/context.ts:338-340`**

`counsellor_notes.body` — writable by *any* user today (F1/F3) — is read into `get_student_overview.recentNotes`, into the counsellor system prompt via `loadCohort`, and into the **parent** system prompt as `Latest counsellor note: "…"`. Student-controlled `school_name` / `career_aspiration` reach the counsellor prompt too.

The tool loop allows 5 rounds (`gemini.ts:26,113`), so read→write chaining happens **within one turn**: injected text can cause the model to emit a write proposal with an attacker-chosen `student_id` and body. Execution still requires a human click, and `registry.ts:80-83` / `context.ts:62-71` frame tool output as data-not-instructions — real mitigations, but advisory only. The proposal card never displays `student_id` (`counsellor-write.ts:66-74`), so a redirected note is not visible at confirm time.

**Fix:** display the resolved target name **and** id on every confirm card; re-validate the target against the caller's cohort at execute time, not just at proposal time; keep untrusted note text out of the system prompt (move it to tool-result position only).

---

### [MEDIUM] F8 — Client role is read from `sessionStorage` in preference to the database

**`src/hooks/use-user-role.ts:11-18`**

```ts
const sessionRole = sessionStorage.getItem('ascenda-session-role');
const localRole  = localStorage.getItem('ascenda-role');
if (sessionRole || localRole) setRole(sessionRole ?? localRole);
if (sessionRole) return;   // never consults profiles.role
```

Written by `/role-select` (`role-select/page.tsx:123`). Consumed by `navigation.ts:285` (`item.segment !== 'admin' || role === 'admin'`) and `side-switcher.tsx:58` (`if (!isDemo && role !== 'admin') return null`).

**Impact bounded:** `localStorage.setItem('ascenda-role','admin')` reveals admin nav entries and the portal switcher, but `/admin/page.tsx:33` and the three admin API routes re-check server-side, so no data is exposed. This is a UI-integrity and design defect — a role claim sourced from attacker-writable storage — not a live breach.

**Fix:** resolve role once server-side and pass it down as a prop from the shell; delete the storage fast-path.

---

### [MEDIUM] F9 — Ad-hoc, duplicated, inconsistent guard sites

Five hand-copied admin checks (`admin/page.tsx:31-35`, `admin/simulation/page.tsx:75-76`, `api/admin/catalog-health/route.ts:34-38`, `api/admin/update-deadlines/route.ts:14-17`, `api/admin/import/route.ts:16-19`) with two different failure modes. Sibling data helpers disagree on whether the app layer should scope at all: `deleteDeck` adds `.eq('counsellor_id', counsellorId)` (`decks.ts:206-209`) while `removeDeckCard` (`:248`) and `unassignDeck` (`:296`) delete by bare client id. Not exploitable today, but it means a new route is secure only if its author remembers the convention — and there is no convention to remember.

---

### [LOW] F10 — Rate limiting is per-instance in-memory

**`src/lib/api/rate-limit.ts:1-7`** — documented as such. On Vercel, N warm lambdas multiply every limit and a cold start resets the bucket. Affects the five LLM endpoints (`chat` 20/60s, `execute` 10/60s, `suggestions` 30/60s, `feedback` 60/60s, `essay-assist` 10/60s). Cost/abuse issue, not an isolation issue.

### [LOW] F11 — `/api/essay-assist` interpolates unbounded client text into the model prompt

**`src/app/api/essay-assist/route.ts:88-96`** vs the caps at `:167-169`. `essay` (30k) and `studentContext` (5k) are capped; `block.label`, `block.detail` and the entire `blocks[]` array are **uncapped in length and count** and interpolated directly. Self-scoped (no cross-user data), so this is a cost/guardrail-bypass issue.

### [LOW] F12 — `send_help_request.application_id` unvalidated

**`src/lib/chat/tools/student-write.ts:370-374, 383`** — not UUID-checked, not ownership-checked, into an FK-less `text` column (`20260512120000:7`). Cosmetic mislabelling only.

### [INFO] Things this codebase gets right

Worth preserving through any refactor: service-role containment (`service.ts:11-13` + zero importers); storage RLS path-binding to `applications.profile_id` (`schema.sql:1054-1145`); `guardian_links` designed with no write policy (`20260716120000:43-45`); `resolveParentContext` as a single scoping seam (`parent/_lib/context.ts:20-28`); the `guardian_links` re-check on parent writes (`api/parent/messages/route.ts:33-48`); 404-not-403 to avoid UUID existence oracles (`api/checklist/route.ts:107-121`); the atomic `pending→sent` claim (`history.ts:164-172`); tool-result framing (`registry.ts:80-83`); and the `admin/layout.tsx:17-20` note on why layouts are not authorisation boundaries.

---

## Target Authorisation Architecture

### Principle 0 — model the relationship before writing any policy

Nothing else is fixable first. Create the missing counsellor↔student edge, mirroring `guardian_links`:

```sql
create table if not exists counsellor_assignments (
  id uuid primary key default gen_random_uuid(),
  counsellor_profile_id uuid not null references profiles(id) on delete cascade,
  student_profile_id    uuid not null references profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('pending','active','revoked')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (counsellor_profile_id, student_profile_id)
);
alter table counsellor_assignments enable row level security;
-- read your own edges; NO write policy — links are created by an invite flow
-- running as service role, never by a client. (Same posture as guardian_links.)
create policy ca_self on counsellor_assignments for select to authenticated
  using (counsellor_profile_id = auth.uid() or student_profile_id = auth.uid());
```

### Principle 1 — one identity resolution point

Replace nine implementations with one server-only module. Everything downstream consumes its output; nothing else calls `auth.getUser()`.

```ts
// src/lib/auth/identity.ts  — server only
import { cache } from 'react';

export type Role = 'student' | 'counsellor' | 'admin';
export interface Identity { userId: string; role: Role; email: string | null; }

/** Per-request memoised. Throws for anonymous — callers use requireIdentity/optionalIdentity. */
export const getIdentity = cache(async (): Promise<Identity | null> => {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  return { userId: user.id, role: (data?.role as Role) ?? 'student', email: user.email ?? null };
});

export const requireIdentity = async (): Promise<Identity> => {
  const id = await getIdentity();
  if (!id) redirect('/login');
  return id;
};
```

`role` is resolved **only** here, only from `profiles`, never from `sessionStorage`, a request body, or a cookie. `useUserRole` becomes a prop threaded from the shell. `role-select` shows only portals the resolved role permits.

### Principle 2 — a declarative policy layer

One table of truth, consulted by middleware, pages, route handlers and chat tools alike.

```ts
// src/lib/auth/policy.ts
export type Action =
  | 'portal:student' | 'portal:counsellor' | 'portal:parent' | 'portal:admin'
  | 'student:read'   | 'student:note'      | 'student:message'
  | 'catalogue:write';

const ROLE_ACTIONS: Record<Role, Action[]> = {
  student:    ['portal:student'],
  counsellor: ['portal:student', 'portal:counsellor', 'student:read', 'student:note', 'student:message'],
  admin:      ['portal:student', 'portal:counsellor', 'portal:parent', 'portal:admin',
               'student:read', 'student:note', 'student:message', 'catalogue:write'],
};

/** Coarse capability. Resource-scoped calls MUST also pass `resource`. */
export const can = async (
  id: Identity, action: Action, resource?: { studentId: string }
): Promise<boolean> => {
  if (!ROLE_ACTIONS[id.role].includes(action)) return false;
  if (!resource) return true;
  if (id.role === 'admin') return true;
  if (id.userId === resource.studentId) return true;
  return hasEdge(id.userId, resource.studentId);   // counsellor_assignments ∪ guardian_links
};

/** Route→action map — the ONLY place a URL prefix maps to a permission. */
export const ROUTE_POLICY: [string, Action][] = [
  ['/admin',      'portal:admin'],
  ['/counsellor', 'portal:counsellor'],
  ['/parent',     'portal:parent'],
  ['/dashboard',  'portal:student'],
];
```

Usage — every guard becomes one line, and resource-scoped actions cannot forget the resource:

```ts
// page or route handler
const id = await requireIdentity();
if (!(await can(id, 'student:note', { studentId }))) return forbidden();
```

Middleware consults `ROUTE_POLICY` for coarse routing (fast rejection, better UX); **the page/handler re-check is the real boundary**, exactly as `admin/layout.tsx:17-20` already argues. Adding a route without adding a policy entry should fail a lint rule or a test (below).

### Principle 3 — RLS as backstop, with an explicit division of responsibility

Today RLS is the *only* control and it is open; the fix is not to move enforcement into app code, but to make both layers independently sufficient.

| Layer | Owns | Must never |
|---|---|---|
| **RLS** | The hard boundary. Every table answers "may this `auth.uid()` touch this row?" without reference to app code. Every policy is either `self` (`profile_id = auth.uid()`) or `relationship` (`counsells(...)` / `is_guardian_of(...)`) or `admin` (`auth_role() = 'admin'`). No policy may be a bare boolean over `auth.uid() is not null`. | Be relied on for *which* rows a screen shows, or for business rules |
| **App policy (`can`)** | UX, coarse routing, early 403s, defence in depth, and business rules RLS cannot express | Be the only thing standing between a user and another tenant's row |
| **Service role** | Nothing user-facing. Migrations, seeds, and the invite flow that writes relationship edges | Be imported by anything under `src/app/` |

**Containment rule, enforceable:** `src/lib/supabase/service.ts` is the sole construction site; add an ESLint `no-restricted-imports` rule banning it from `src/app/**` and `src/components/**`, and a CI grep asserting it has zero importers outside `scripts/` and a future `src/lib/server-only/`. If a request path ever needs it, it must first call `requireIdentity()` + `can()` — because service role bypasses RLS, the app check becomes the *only* control.

**Rewrite pattern for every open policy:**
```sql
-- before (20260628120000:73-74)
create policy personal_counsellor_read on student_personal_information
  for select to authenticated using (public.can_act_as_counsellor());

-- after
create policy personal_read on student_personal_information
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (select public.counsells(profile_id))
    or (select public.is_guardian_of(profile_id))
    or (select public.auth_role()) = 'admin'
  );
```
Wrap helper calls in `(select ...)` — the `20260713140000_initplan_admin_policies.sql` migration exists precisely because uninlined helpers destroyed query plans.

### Principle 4 — a policy test suite

The reason this drifted is that nothing failed when it did. Add `__tests__/policy/` running against a local Supabase with three fixture users (student A, student B, counsellor C assigned only to A, parent P linked only to A) and assert the **negative** cases, which are the ones that regressed:

```ts
// __tests__/policy/isolation.test.ts   @jest-environment ./jest.environment-node.js
const TENANT_TABLES = [
  'student_personal_information', 'student_academic_input', 'student_scores',
  'student_matches', 'applications', 'counsellor_notes',
  'parent_contacts', 'parent_messages', 'student_documents',
];

describe.each(TENANT_TABLES)('%s isolation', (table) => {
  it('student B cannot read student A rows', async () => {
    const { data } = await asUser(studentB).from(table).select('*');
    expect(rowsBelongingTo(data, studentA.id)).toHaveLength(0);
  });
  it('student B cannot delete any row', async () => {
    const { error } = await asUser(studentB).from(table).delete().neq('id', ZERO_UUID);
    expect(error ?? { code: '' }).toBeTruthy();          // F2 regression guard
  });
  it('counsellor C cannot read student B rows', async () => {          // F1 regression guard
    const { data } = await asUser(counsellorC).from(table).select('*');
    expect(rowsBelongingTo(data, studentB.id)).toHaveLength(0);
  });
});

it('no policy is a bare auth.uid() boolean', async () => {             // F1 root-cause guard
  const { data } = await admin.rpc('exec', { sql:
    `select tablename, policyname, qual from pg_policies where schemaname='public'` });
  const bare = data.filter((p) => /^\(?\s*auth\.uid\(\)\s+is\s+not\s+null\s*\)?$/.test(p.qual ?? ''));
  expect(bare).toEqual([]);
});

it('every protected route prefix has a ROUTE_POLICY entry', () => {    // F5 regression guard
  for (const prefix of PROTECTED_PREFIXES) {
    expect(ROUTE_POLICY.some(([p]) => prefix.startsWith(p))).toBe(true);
  }
});

it('service-role client has no importers under src/app or src/components', () => {  // §4 guard
  expect(grepImporters('lib/supabase/service', ['src/app', 'src/components'])).toEqual([]);
});
```

Wire these into the existing CI job alongside lint/typecheck/test. The `20260715120000` migration's self-verifying `do $$ ... raise exception` block (`:70-91`) is the right instinct already present in the repo — generalise it: every security migration ends with an assertion that it took effect.

### Migration order (each step safe to ship alone)

1. `counsellor_assignments` + `counsells()` + `is_guardian_of()`; backfill from the current demo cohort. *No behaviour change.*
2. Policy test suite, written against the **target** posture and marked `.failing`. *Makes the gap visible in CI.*
3. `src/lib/auth/identity.ts` + `policy.ts`; migrate the 5 admin guards and the counsellor/parent layouts. *Closes F5, F8.*
4. Bind chat `mode` to `identity.role`; scope `loadCohort`; add `can(..., {studentId})` to both counsellor write tools. *Closes F3.*
5. Rewrite the `for all` policies on `parent_*` / `student_documents`. *Closes F2.*
6. Rewrite all `can_act_as_counsellor()` policies; drop the function and `guards.ts`. *Closes F1.* Un-`.failing` the suite.
7. Server-only pending-action store. *Closes F4.* Cohort check on deck assignment + trigger message bounding. *Closes F6.*

---

## Effort

| # | Finding | Effort | Risk if unfixed |
|---|---|---|---|
| — | **Prereq:** `counsellor_assignments` table + relationship helpers | **M** | blocks F1/F3/F6 |
| F1 | `can_act_as_counsellor()` opens ~25 policies | **L** | 🔴 Full PII disclosure of every student (minors) to any authenticated user; regulatory notification event |
| F2 | `parent_*` / `student_documents` are `for all` | **S** | 🔴 Any user can delete all parent correspondence and document state; unrecoverable, unaudited |
| F3 | Client-supplied chat `mode` + model-controlled `student_id` | **M** | 🔴 Cohort PII via LLM; forged counsellor notes and notified messages against arbitrary students |
| F4 | Client-writable action-provenance store | **M** | 🟠 Confirmation gate bypassable; arbitrary tool execution within the caller's RLS rights |
| F5 | No role guard on 16 counsellor/parent routes; `/role-select` unverified | **S** | 🟠 Any user reaches counsellor operational UI (severity currently dominated by F1) |
| F6 | Deck-assignment IDOR → notification injection via SECURITY DEFINER trigger | **S** | 🟠 Attacker text into any student's feed under a trusted heading; reopens a previously-fixed class |
| F7 | Prompt injection from `counsellor_notes` into counsellor/parent prompts | **M** | 🟡 Fabricated confirm cards with hidden targets; needs a human click |
| F8 | Client role from `sessionStorage` | **S** | 🟡 UI-integrity defect; no data exposure today |
| F9 | Ad-hoc duplicated guards; inconsistent app-layer scoping | **M** | 🟡 New routes ship insecure by default |
| F10 | In-memory rate limiting | **S** | 🟢 Cost/abuse |
| F11 | Unbounded `blocks[]` into essay-assist prompt | **S** | 🟢 Cost/guardrail bypass |
| F12 | Unvalidated `application_id` on `send_help_request` | **S** | 🟢 Cosmetic |
| — | Policy test suite + service-role lint rule | **M** | prevents recurrence of F1/F2/F5 |
| — | Full target architecture (identity + policy layer + RLS rewrite) | **XL** | — |

**Suggested cut for a pre-launch fix:** prereq + F2 + F5 + F6 + F8 (all S/M, ~a week) closes the destructive and structural issues; then F1 + F3 (the L) as the gate on onboarding any real student. **Do not delete `inDemoCohort()` (`src/lib/counsellor/data.ts:59-69`) before F1 lands** — it is currently the only thing keeping F1 a demo-data exposure rather than a real-PII breach.
