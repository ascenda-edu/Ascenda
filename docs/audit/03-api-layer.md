# 03 — Server API surface audit

**Scope:** 24 route handlers (23 under `src/app/api` + `src/app/auth/callback`), `src/middleware.ts`, 2 server-action modules.
**Method:** every file read in full; RLS policies in `supabase/schema.sql` cross-checked for every route that delegates ownership to the DB.
**Read-only.** No code changed, no DB or external API touched.

## Headline numbers

| Metric | Value |
|---|---|
| Route handler files | 24 (23 `/api` + 1 `/auth/callback`) |
| Method handlers | 29 |
| Total LOC in `/api` | 2,443 |
| Handlers with **no** auth check | 5 (`search/filters`, `search/filter-options`, `search/suggestions`, `calendar-feed`, `auth/callback`) |
| Handlers with a **role** check | 3 (all `admin/*`) |
| Object-level ownership enforced **in app code** | 6 |
| Object-level ownership delegated **to RLS only** | 6 |
| `createRouteHandlerSupabaseClient()` call sites | 27 |
| `supabase.auth.getUser()` call sites in `/api` | 18 |
| Hand-written `401` literals | 18 (in 16 files, 3 message variants) |
| Hand-written `403` / `400` literals | 8 / 40 |
| `zod` adoption | **1 of 24 routes** (`admin/import` only) |
| `parseJsonBody` vs raw `.json()` | 18 vs 6 |
| `NextResponse.json` vs bare `new Response` | 104 vs 25 |
| Distinct success/error envelope shapes | **~15** (3 error families, 12 bespoke success keys) |
| Shared response helper | **0** (one route-local `jsonError` in `chat/actions/execute`) |
| Routes with a rate limit | 6 of 24 |
| Routes with route-handler tests | 5 of 24 |

**Overall:** this is a well-audited surface. Auth-presence coverage is essentially complete on the write paths, ownership reasoning is explicit and commented, and the two SSE routes are genuinely well built (abort backstops, idempotent claim on the action row, params whitelisted against a persisted proposal). The gaps are concentrated in four places: an open redirect on the OAuth callback, two unauthenticated uncapped catalogue routes, one counsellor write path with no subject-linkage check, and a server action that writes six tables from a completely unvalidated client payload.

---

## Route inventory

`Auth` = is the caller authenticated · `Role` = is the role checked · `Own` = object-level ownership (can user A act on user B's row?)

| # | Route | Method | Auth | Role | Own | Input validation | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | `/api/admin/catalog-health` | GET | Bearer **or** session | `admin` | n/a | none needed | **OK** — timing-safe bearer compare |
| 2 | `/api/admin/import` | POST | yes | `admin` | n/a | **zod** per template | **OK** — the only zod route |
| 3 | `/api/admin/update-deadlines` | POST | yes | `admin` | n/a | **none** — body forwarded raw | MEDIUM — no try/catch, raw proxy |
| 4 | `/api/applications/track` | POST | yes | — | server-set `profile_id` | trim + presence | **OK** |
| 5 | `/api/calendar-feed` | GET | **NO** | — | n/a | none (no params) | MEDIUM — dead route, public fan-out |
| 6 | `/api/chat` | POST | yes | mode via `resolveChatMode` | conversation `owner_id` | 50 msgs × 8k chars capped | **OK** |
| 7 | `/api/chat/actions/execute` | POST | yes | mode from **persisted** row | `owner_id` + msg→convo + atomic claim | per-tool `validateParams`, editable-key whitelist | **OK — best route in repo** |
| 8 | `/api/chat/feedback` | POST | yes | mode enum | server-set `profile_id` | length + enum + rating | **OK** |
| 9 | `/api/chat/suggestions` | GET | yes | mode via `resolveChatMode` | n/a | enum | LOW — 200 on error, 401 with success body |
| 10 | `/api/checklist` | PATCH | yes | — | **app-level** via helper | enum + presence | **OK** |
| 11 | `/api/checklist` | POST | yes | — | **app-level** via helper | date + 200-char clamp | **OK** |
| 12 | `/api/checklist` | DELETE | yes | — | **app-level** inline join | presence | **OK** — 404-on-not-yours closes the oracle |
| 13 | `/api/counsellor/decks` | POST | yes | `requireCounsellor` (open) | server-set `counsellor_id` | presence | LOW — leaks `error.message` |
| 14 | `/api/counsellor/decks` | DELETE | yes | `requireCounsellor` (open) | app `.eq(counsellor_id)` + RLS | presence | **OK** |
| 15 | `/api/counsellor/decks/assign` | POST | yes | `requireCounsellor` (open) | **RLS only** (`deck_owned_by_me`) | **`studentIds` unbounded** | MEDIUM |
| 16 | `/api/counsellor/decks/assign` | DELETE | yes | `requireCounsellor` (open) | **RLS only** | presence | LOW |
| 17 | `/api/counsellor/decks/cards` | POST | yes | `requireCounsellor` (open) | **RLS only** | enum only; `note` uncapped | LOW |
| 18 | `/api/counsellor/decks/cards` | DELETE | yes | `requireCounsellor` (open) | **RLS only** | presence | LOW |
| 19 | `/api/counsellor/notes` | POST | yes | `canActAsCounsellor` → **always true** | **NONE — arbitrary `studentId`** | enum; **`body` uncapped** | **HIGH** |
| 20 | `/api/essay-assist` | POST | yes | — | n/a | essay 30k / ctx 5k; **`blocks` uncapped** | **HIGH** |
| 21 | `/api/match` | GET | yes | — | own profile | legacy-param rejection | LOW — leaks `error.stage` |
| 22 | `/api/match/score` | POST | yes | — | own profile | **capped at 100 ids** | **OK** |
| 23 | `/api/parent/messages` | POST | yes | — | **`guardian_links` check** | 4000/100 char caps | **OK — the model to copy** |
| 24 | `/api/profile/export` | GET | yes | — | own rows only | `format` param | MEDIUM — no `Cache-Control: no-store` on PII |
| 25 | `/api/profile/recalculate-score` | POST | yes | — | own profile | no body | **OK** |
| 26 | `/api/search/filter-options` | GET | **NO** | — | n/a | none | **HIGH** — unauth, unthrottled, uncapped RPC |
| 27 | `/api/search/filters` | GET | **NO** | — | n/a | none | **HIGH** — unauth, unthrottled, 1200-row scan |
| 28 | `/api/search/suggestions` | GET | **NO** | — | n/a | min length; **`q` uncapped** | MEDIUM — IP-throttled but per-instance |
| 29 | `/auth/callback` | GET | n/a (is the login) | — | n/a | **`next` unvalidated** | **HIGH — open redirect** |

### Server actions

| Action | File | Auth | Validation | Revalidation | Verdict |
|---|---|---|---|---|---|
| `saveStudentIntake(payload)` | `src/app/profile/actions.ts:38` | `ensureUser()` | **NONE** — `StudentProfilePayload` is a compile-time type only | `/profile`, `/dashboard` | **HIGH** |
| `recalculateStudentScore()` | `src/app/profile/actions.ts:54` | `ensureUser()` | no input | `/profile`, `/dashboard` | **OK** — but throws raw to client |
| `resubmitStudentProfile()` | `src/app/profile/actions.ts:77` | `ensureUser()` | server-built payload | via `saveStudentIntake` | **OK** |

`src/lib/profile/persist-intake.ts` carries a `'use server'`-adjacent comment but is a plain module (no directive of its own at the export boundary) — it is the writer called by the action and by the seed script.

### Middleware reality check

`src/middleware.ts:182` — `matcher: ['/(dashboard|profile|matches|applications|admin|university-search|course|shortlist|scholarships|counsellor|parent|role-select|inbox|assistant)(.*)', '/login', '/signup']`

**Middleware never runs for `/api/*` or `/auth/*`.** Every API guard is the route's own `supabase.auth.getUser()` call — there is no ambient protection. This is correct-by-construction today (18 of 24 routes guard themselves) but it is entirely convention: a new route handler that forgets `getUser()` is public, and nothing in CI or the type system catches it.

Verified reachable-but-unmatched pages: `/toolbox/*` is protected by its own `toolbox/layout.tsx:9` (`if (!user) redirect('/login')`), so it is fine. `/appointment` has **no** layout guard, no page guard, and no matcher entry — it renders the full `DashboardShell` to anonymous visitors (writes still fail under RLS). See LOW-4.

---

## Findings

### [HIGH] Open redirect on the OAuth callback
**`src/app/auth/callback/route.ts:7,10`**

```ts
const next = searchParams.get('next') ?? '/dashboard';
...
const redirectUrl = new URL(next, req.url);   // absolute `next` wins over the base
```

`new URL()` with an absolute or protocol-relative first argument discards the base. `?next=https://evil.example` or `?next=//evil.example` produces a redirect to the attacker's host — issued *after* `exchangeCodeForSession` has succeeded and set the session cookies on the response.

**Exploit.** Attacker sends `https://ascenda-ashy.vercel.app/auth/callback?code=…&next=https://ascenda-login.example/session-expired`. The victim completes a genuine Ascenda OAuth flow, sees the real domain in the address bar for the whole handshake, and lands on a pixel-perfect fake "your session expired, sign in again" page. Session cookies do not leak cross-origin, but the redirect is a first-class phishing primitive and it launders the credibility of the real domain. It also defeats any "we never redirect off-site" assumption a security reviewer would make about an auth endpoint.

**Fix.** Allowlist to same-origin path-only redirects:
```ts
const raw = searchParams.get('next') ?? '/dashboard';
const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard';
```
(The same predicate already exists in SQL — `20260718130000_realtime_publication_and_doc_nudge_limits.sql:57` guards `notifications.href` with exactly `href like '/%' and href not like '//%'`. The rule is known; it just was not applied here.)

---

### [HIGH] `/api/counsellor/notes` — any authenticated user can write a permanent note against any student
**`src/app/api/counsellor/notes/route.ts:16-33`**

```ts
if (!(await canActAsCounsellor(supabase, user))) { … }   // guards.ts:24 → Boolean(user)
…
.insert({ student_profile_id: studentId, author_profile_id: user.id, body, note_type: noteType })
```

`canActAsCounsellor` returns `Boolean(user)` (`src/lib/api/guards.ts:24`) and the DB mirror `public.can_act_as_counsellor()` is `select auth.uid() is not null` (`supabase/schema.sql:1199`). The insert policy (`schema.sql:1588-1590`) checks `author_profile_id = auth.uid()` — it **never constrains `student_profile_id`**. And `counsellor_notes_select` (`schema.sql:1584-1585`) is `using (can_act_as_counsellor())`, i.e. every authenticated user can read every note about every student.

**Exploit.** Any signed-in student POSTs `{studentId: "<any profile uuid>", noteType: "flag", body: "…"}` and a permanent `flag` note about another student appears in the counsellor roster, attributed to them. Combined with the open SELECT policy, one signed-in account reads the entire counsellor note corpus for the whole cohort — the most sensitive free-text data in the product.

The open-counsellor posture is a deliberate, documented demo decision. What makes this *this* route's finding rather than a blanket posture note is the inconsistency: **`/api/parent/messages` solves exactly this problem correctly** (`parent/messages/route.ts:34-48` resolves `guardian_links` and 403s if the target contact's student is not a linked child). The notes route is the same shape with the check missing.

**Fix.** Two parts, both small:
1. App layer now — resolve the caller's student roster (the same cohort scoping `src/lib/counsellor/data.ts` already uses) and 403 if `studentId` is not in it.
2. DB layer at real onboarding — add a `student_assigned_to_me(student_profile_id)` SECURITY DEFINER helper (mirroring the existing `deck_owned_by_me` in `20260713160000_fix_deck_rls_recursion.sql:19`) and put it in both `counsellor_notes_insert`'s `with check` and `counsellor_notes_select`'s `using`.

Also cap `body` — the column is bare `text` (`schema.sql:1574`) and the route applies no length limit, so one request writes an unbounded blob.

---

### [HIGH] `/api/search/filter-options` and `/api/search/filters` — unauthenticated, unthrottled, uncapped catalogue scans
**`src/app/api/search/filter-options/route.ts:8-10`** · **`src/app/api/search/filters/route.ts:12-25`**

Both are `GET` with no `getUser()`, no `checkRateLimit`, and no request parameters. `filter-options` calls the `search_filter_options()` RPC (a `SELECT DISTINCT` across the 119k-row `programs` table). `filters` pulls 1,200 `programs` rows *including the `metadata` JSON column* plus **every** `universities` row, on every request.

Their sibling `search/suggestions` **is** IP-throttled (`suggestions/route.ts:54`) and `calendar-feed` **is** IP-throttled (`calendar-feed/route.ts:170`). These two were missed.

**Exploit.** The `s-maxage` headers look like protection but are not: the CDN cache key includes the query string, and both routes ignore query strings entirely. `for i in $(seq 1 100000); do curl "…/api/search/filter-options?cb=$i" & done` is 100k full cache misses, each a `SELECT DISTINCT` over the whole catalogue, from an unauthenticated client. This is the cheapest way to take the database down, and it costs the attacker nothing.

**Fix.** Add `checkRateLimit(\`filters:${clientIp(request)}\`, { limit: 30, windowMs: 60_000 })` to both — the helper and the `clientIp` import already exist. Then set `export const revalidate = 3600` so Next's own data cache absorbs the misses server-side regardless of the CDN key, and strip unknown query params from the cache key.

---

### [HIGH] `/api/essay-assist` — `blocks` / `block` are uncapped, so the LLM prompt is attacker-sized
**`src/app/api/essay-assist/route.ts:167,171-177`**

```ts
if ((essay && essay.length > 30_000) || (studentContext && studentContext.length > 5_000)) { … }
if (action === 'expand' && !block) { … }                       // no size check
if (action === 'outline' && (!blocks || blocks.length === 0)) { … }   // no count or size check
```

`essay` and `studentContext` are capped. `block.label`, `block.detail`, and every element of `blocks[]` are not — and all of them are interpolated straight into the prompt at `buildUserPrompt` (`:76-77`, `:91-93`).

**Exploit.** POST `{action:'outline', blocks:[{label:'A'.repeat(2_000_000)}]}`. Rate limiting allows 10/min/user, but each request is now a multi-megabyte Gemini prompt instead of a ~2KB one — roughly a 1000× cost amplification per allowed request, from any single signed-in demo account. Compare `/api/chat`, which caps this correctly at `messages.length > 50 || m.content.length > 8_000` (`chat/route.ts:108-113`).

**Fix.** Mirror the chat route's cap before building the prompt:
```ts
const MAX_BLOCKS = 20, MAX_BLOCK_FIELD = 500;
const tooBig = (b?: {label: string; detail?: string}) =>
  !b || b.label.length > MAX_BLOCK_FIELD || (b.detail?.length ?? 0) > MAX_BLOCK_FIELD;
if ((blocks?.length ?? 0) > MAX_BLOCKS || blocks?.some(tooBig) || (block && tooBig(block))) {
  return json({ error: 'Input too long.' }, 400);
}
```

---

### [HIGH] `saveStudentIntake` server action writes six tables from a completely unvalidated payload
**`src/app/profile/actions.ts:38-41`** → **`src/lib/profile/persist-intake.ts:20`**

```ts
export const saveStudentIntake = async (payload: StudentProfilePayload) => {
  const { supabase, userId } = await ensureUser();
  await writeStudentIntake(supabase, userId, payload);
```

`StudentProfilePayload` is a TypeScript type — erased at runtime. A server action is a public HTTP endpoint reachable with a forged POST to the action id; the client-side form is not a control. `writeStudentIntake` then upserts into `profiles`, `student_personal_information`, `student_academic_input`, `student_lifestyle_preference`, and **deletes and re-inserts** `student_activities`, `student_subjects`, `student_admissions_tests`, and `student_matches` (`persist-intake.ts:28,36,51,81,104,120,134,165`) using values taken directly from the payload.

**Failure scenario.** Arbitrary-length strings into every profile column; unbounded `subjects`/`activities`/`tests` arrays turning one call into an unbounded multi-row insert; out-of-range IB/A-level values silently corrupting `scoreStudentProfile` and the whole match cache (which this same function wipes on every call). Ownership is safe — `userId` comes from the session, never the payload — but shape and bounds are not checked at all.

Compounding it: **`src/lib/validation/profile.ts` is 82 lines of exactly the right zod schemas** (`profilePersonalSchema`, `profileAcademicsSchema`, curriculum/campus/size enums) and is **imported by nothing**. Only `lib/validation/auth.ts` is wired up (into `components/forms/auth-form.tsx:8`), and only client-side.

**Fix.** Define `studentIntakeSchema` (extending what's already in `lib/validation/profile.ts`) with `.max()` on every string and `.max(N)` on every array, and open the action with `const parsed = studentIntakeSchema.safeParse(payload); if (!parsed.success) return { success: false, message: 'Invalid profile data' };`. Pass `parsed.data` onward.

---

### [MEDIUM] Rate limiting is per-instance in-memory — it does not bound anything globally
**`src/lib/api/rate-limit.ts:15`** — `const buckets = new Map<string, Bucket>()`

The file header is honest about this ("per server instance — on serverless this bounds abuse per warm instance rather than globally"). But it is the *only* cost control on three paid-provider routes, and Vercel will happily run dozens of concurrent lambda instances for a burst. Effective limit is `instances × limit`, and an attacker generating concurrency directly increases their own allowance. There is no global spend ceiling anywhere.

**Fix.** Move the buckets to Postgres (a `rate_limit_hits` table with a `SECURITY DEFINER` check-and-increment function keyed on `(key, window_start)`) or Upstash. The `checkRateLimit(key, {limit, windowMs})` signature stays identical, so all six call sites are unchanged. Separately, set a hard monthly spend cap in the Gemini console — a code-side limiter is not a billing control.

---

### [MEDIUM] `/api/essay-assist` ignores client disconnect; both LLM routes have a decorative model-fallback loop
**`src/app/api/essay-assist/route.ts:194-202`**

`ai.models.generateContentStream({ model, contents, config })` is called with **no `abortSignal`**. `/api/chat` does this correctly (`chat/route.ts:217` passes `abortSignal: req.signal` into `streamOptions`). A user who closes the essay panel mid-generation leaves the request billing to completion.

Separately, in **both** routes the `for (const model of MODELS)` fallback (`essay-assist/route.ts:192`, `lib/chat/gemini.ts:57`) wraps only the `await generateContentStream(...)` call, which resolves as soon as the connection opens. A per-chunk 429 or safety block surfaces later, *inside* the async iteration in the `ReadableStream` — where it is caught and turned into `{error: 'Stream interrupted. Try again.'}` (`essay-assist:220`, `chat/route.ts:292`). The two cheaper fallback models are effectively never reached for the failure mode they exist to handle.

**Fix.** Pass `abortSignal: req.signal` in essay-assist's `config`. For the fallback, pull the first chunk inside the `try` before returning the opened stream, so an immediate rejection actually triggers the next model.

---

### [MEDIUM] Six write paths delegate object-level authorization entirely to RLS
`counsellor/decks/assign` POST+DELETE, `counsellor/decks/cards` POST+DELETE, and the `deck_id` on both card/assignment inserts.

I verified the policies and **they are correct** — `counsellor_deck_programs_write` and `deck_assignments_write` both gate on `deck_owned_by_me(deck_id)` (`schema.sql:2298-2317`, `20260713160000_fix_deck_rls_recursion.sql:71-92`), a `SECURITY DEFINER` helper. So there is no live IDOR here.

The risk is structural, not present-tense: `unassignDeck(supabase, assignmentId)` (`lib/counsellor/decks.ts:295-298`) and `removeDeckCard(supabase, cardId)` (`:247-250`) are bare `.delete().eq('id', …)` with no owner predicate. Their correctness rests **entirely** on a policy in a file they never reference, on a remote database whose migration history is documented as diverged from `supabase/migrations/`. The sibling `deleteDeck` (`:201-211`) does add `.eq('counsellor_id', counsellorId)` as defence in depth. Two of the six do it; four don't.

**Fix.** Make it uniform — resolve the parent deck's `counsellor_id` and filter on it in app code too, matching `deleteDeck`. Cheap, and it makes the guarantee legible at the call site.

Also at **`counsellor/decks/assign/route.ts:16`**: `studentIds` is checked for `Array.isArray` and non-empty but has **no length cap**, and flows into `assignDeck`'s `.in('student_profile_id', studentIds)` and a bulk insert (`decks.ts:264-286`). Cap it at ~200.

---

### [MEDIUM] PostgREST error messages are returned verbatim to clients (11 sites)
`counsellor/notes:38` · `counsellor/decks:30,49` · `counsellor/decks/cards:43,63` · `counsellor/decks/assign:29,49` · `admin/import:34` · `search/filters:29` · `search/filter-options:13` · `admin/catalog-health:48`

Every one is `{ error: error.message }` straight from `@supabase/supabase-js`. PostgREST messages carry constraint names, column names, table names, and policy-violation text (`new row violates row-level security policy for table "counsellor_deck_programs"`). That hands an attacker the schema and the exact RLS topology for free.

`admin/update-deadlines:39-40` is worse in kind — it returns the **raw response body of the Supabase Edge Function** to the client.

Note the codebase already knows better: `checklist/route.ts:21-27` has a deliberate `failureResponse` helper that substitutes a generic message on 404 specifically so the error body cannot reopen the existence oracle its status codes close. That discipline just is not applied elsewhere.

**Fix.** Log `error.message` server-side; return a fixed client-safe string per taxonomy code. Fold into the wrapper below.

---

### [MEDIUM] `/api/profile/export` returns PII with no `Cache-Control`
**`src/app/api/profile/export/route.ts:151-176`**

Both branches (JSON at `:151`, CSV at `:170`) set `Content-Disposition` but no `Cache-Control`. The payload is the user's full identity record — name, email, phone, nationality, age, gender, city, school, every grade. With no explicit header, an intermediary or corporate proxy may heuristically cache a 200 with a `Last-Modified`-free body.

(The CSV formula-injection guard at `:13-22` is correct and worth keeping.)

**Fix.** `'Cache-Control': 'private, no-store'` on both responses.

---

### [MEDIUM] `/api/calendar-feed` — 228 lines of unauthenticated public route with zero consumers
**`src/app/api/calendar-feed/route.ts`**

No caller anywhere in `src/` (`CALENDAR_FEED_CONFIG` and `CalendarFeedResponse` are referenced only by `src/lib/calendar-feed.ts`, which defines them). The route is anonymous, fans out to external ICS URLs, and ships a hand-rolled ICS parser with timezone arithmetic.

It is rate-limited (`:170`) and the outbound URLs come from env vars, not user input, so it is not an SSRF or an open amplifier today. But it is unauthenticated, publicly reachable, unused attack surface with a non-trivial parser behind it.

**Fix.** Delete it, or gate it behind `getUser()` until something actually calls it.

---

### [MEDIUM] The middleware matcher and `PROTECTED_PREFIXES` are two hand-maintained lists that must agree
**`src/middleware.ts:6-21` and `:182`**

`PROTECTED_PREFIXES` (15 entries) and `config.matcher` (the same 15, re-typed as a regex alternation) are duplicated by hand. They agree today. If they drift, the failure is silent and it is an auth bypass — `CLAUDE.md:122` records that this exact class of bug already shipped to production once.

**Fix.** Derive one from the other:
```ts
export const config = { matcher: [`/(${PROTECTED_PREFIXES.map(p => p.slice(1)).join('|')})(.*)`, '/login', '/signup'] };
```
Next requires the matcher be statically analysable, so verify it still builds; if not, add a unit test asserting every `PROTECTED_PREFIXES` entry is matched by the regex.

Two secondary notes: `pathname.startsWith('/admin')` also matches a hypothetical `/administrators`; and `redirectedFrom` is set at `:145` and consumed nowhere in the codebase — dead, and worth deleting *before* someone implements it and creates a second open redirect.

---

### [MEDIUM] `admin/import` does full sanitisation work before the row cap
**`src/app/api/admin/import/validation.ts:170-180`**

```ts
const sanitized = sanitizeRows(rawRows);        // maps + JSON.parse()s every cell of every row
…
if (sanitized.length > MAX_IMPORT_ROWS) { return { error: … }; }   // cap checked after
```

`sanitizeRows` iterates every row and attempts `JSON.parse` on every string cell that looks like a JSON literal, *then* the 5,000-row cap is applied. A 500k-row body is fully processed before rejection. Bounded in practice by Vercel's 4.5MB body limit (there is no `vercel.json` and no `next.config` body config), and admin-only — but the cap is doing nothing where it is.

Also `admin/import/route.ts:21` uses raw `await request.json()`; malformed JSON throws into the catch at `:38` and returns the parser's own message as `{error}`.

**Fix.** Move the length check to `rawRows.length` before `sanitizeRows`, and use `parseJsonBody`.

---

### [LOW] Fifteen response shapes, three error envelopes, zero shared helper

Error families: `{ error }` (most routes) · `{ ok: false, error }` (`catalog-health`, `chat/feedback`) · degraded-success-as-error (`{ suggestions: [] }` returned with 401/429; `{ programs: [], universities: [] }` returned with 429 and on DB error; `{ events: [], connectedSources: [] }` returned with 429).

Success keys: `{ item }`, `{ note }`, `{ deck }`, `{ card }`, `{ message }`, `{ matches }`, `{ scores }`, `{ count }`, `{ assignments, skipped }`, `{ status, applicationId }`, `{ score, band, breakdown }`, `{ ok: true }`, `{ status: 'queued' }`, `{ suggestions }`, raw CSV. Fifteen.

Only `chat/actions/execute/route.ts:48` defines a helper (`jsonError`), and it is route-local.

Two concrete consequences beyond aesthetics:
- **25 `new Response(JSON.stringify(...))` calls send no `Content-Type: application/json`.** `fetch().json()` tolerates it, so nothing is broken today, but it is wrong HTTP and it defeats any client or proxy that content-negotiates.
- **`chat/suggestions` returns HTTP 200 on internal error** (`:53-57`) and 401 with a success-shaped body (`:27`). Genuine failures are invisible to monitoring — the "decorative feature" rationale is reasonable for the UI, but it should still emit a non-2xx or a structured log the client ignores.

---

### [LOW] Auth boilerplate copy-pasted 18 times

The exact same six lines —
```ts
const supabase = await createRouteHandlerSupabaseClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
```
— appear 18 times across 16 files, with three different messages (`'Unauthorized'` ×13, `'Not authenticated'` ×4, `'Not authenticated'` inside `jsonError` ×1) and two different envelopes. `createRouteHandlerSupabaseClient()` is called 27 times. The admin role-check block (`select role → if !== 'admin' → 403`) is duplicated verbatim 3 times.

This is the cause of the CRITICAL-class risk noted under middleware: with no wrapper, "did this route remember to authenticate?" is answerable only by reading all 24 files. Which is what this audit had to do.

---

### [LOW] `/api/appointment` page is reachable unauthenticated
**`src/app/appointment/page.tsx`** — `'use client'`, no layout guard, no matcher entry, `getUser()` only at form-submit time (`:105`).

Renders the full `DashboardShell` and counsellor booking UI to anonymous visitors. Writes fail under RLS, so this is UI/structure disclosure rather than data disclosure. Add `/appointment` to `PROTECTED_PREFIXES` + matcher, or give it a `layout.tsx` guard like `/toolbox` has.

### [LOW] Smaller items
- **`essay-assist/route.ts:160`** leaks config detail to clients: `'AI service not configured. Add GEMINI_API_KEY to .env.local.'` — tells an attacker exactly which provider and which env var. `chat/route.ts:116` gets this right (`'AI service not configured.'`).
- **`match/route.ts:38`** returns `{ error: matchResult.error.message, stage: matchResult.error.stage }` — internal pipeline stage names to the client. Also `/api/match` GET has **no in-app consumers** (only `/api/match/score` is called, from `use-search-results.ts:938`).
- **`admin/update-deadlines/route.ts`** has no `try`/`catch` at all; `await request.json()` on line 27 throws to Next's default 500 on malformed input. Same for `applications/track`, `checklist`, and the four counsellor routes — though those all use the safe `parseJsonBody`.
- **`search/suggestions/route.ts:61`** — `q` has a minimum length but no maximum, and is split into unbounded `ilike` chains (one chained `.ilike()` per word at `:97`, `:119`, `:133`). A 10k-character query becomes a query with hundreds of chained `ILIKE '%…%'` predicates.
- **`search/filters` and `search/filter-options` set `Cache-Control: public`** while constructing a **cookie-scoped** Supabase client. The data is anonymous catalogue today so nothing leaks, but if RLS is ever tightened on `programs`/`universities`, the CDN will serve one user's row-filtered view to everyone. Use the service-role or a cookie-free anon client on routes marked `public`.
- **`checkRateLimit`'s `evictForSpace`** (`rate-limit.ts:24-38`) sorts the entire 10k-entry map on every overflow — O(n log n) inside a request path. Fine at this scale, worth knowing.

---

## Target API layer

Four conventions, in dependency order.

**1. One wrapper owns auth, role, validation, envelope, and logging.** No route handler should ever call `createRouteHandlerSupabaseClient()` or `getUser()` directly again. Auth becomes a *declaration* in the route's config object, which means "is this route authenticated?" is answerable by grep instead of by reading 24 files — and a route that declares nothing fails closed.

**2. Every route declares a zod schema for body and query.** Adoption today is 1/24. The target is 24/24. The schemas are the single source of truth for the request contract and are exported for the client to import, so `fetch` call sites stop passing untyped object literals.

**3. One error taxonomy, one envelope.** A closed union of codes maps to statuses and to *client-safe* messages. Provider errors are logged with a request id and never returned. Success is always `{ data: T }`.

**4. Rate limiting is declarative and shared-store backed.** It is a field in the route config, not a call the author must remember, and the buckets live in Postgres so the limit is global rather than per-lambda.

### The wrapper

```ts
// src/lib/api/handler.ts
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/api/rate-limit';
import type { SupabaseClient, User } from '@supabase/supabase-js';

// ── Error taxonomy: the ONLY thing a client ever sees ───────────────────────
export const ERRORS = {
  unauthenticated: [401, 'Sign in to continue'],
  forbidden:       [403, 'You do not have access to this'],
  not_found:       [404, 'Not found'],          // also: exists-but-not-yours
  invalid_input:   [400, 'That request was not valid'],
  conflict:        [409, 'This was already handled'],
  rate_limited:    [429, 'Too many requests — try again in a minute'],
  unavailable:     [503, 'This service is temporarily unavailable'],
  internal:        [500, 'Something went wrong. Please try again'],
} as const satisfies Record<string, readonly [number, string]>;

export type ErrorCode = keyof typeof ERRORS;
export class ApiError extends Error {
  constructor(readonly code: ErrorCode, readonly detail?: string) { super(code); }
}

export type ApiResponse<T> = { data: T } | { error: { code: ErrorCode; message: string } };

const fail = (code: ErrorCode, requestId: string) => {
  const [status, message] = ERRORS[code];
  return NextResponse.json({ error: { code, message } }, {
    status, headers: { 'x-request-id': requestId, 'Cache-Control': 'no-store' },
  });
};

interface Ctx<B, Q> {
  supabase: SupabaseClient; user: User; body: B; query: Q; requestId: string;
}

export function route<B = undefined, Q = undefined, R = unknown>(config: {
  auth: 'required' | 'public';
  role?: 'admin' | 'counsellor';
  body?: z.ZodType<B>;
  query?: z.ZodType<Q>;
  rateLimit?: { limit: number; windowMs: number; by: 'user' | 'ip' };
  cache?: string;                       // explicit, or default no-store
  handler: (ctx: Ctx<B, Q>) => Promise<R>;
}) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const requestId = crypto.randomUUID();
    try {
      const supabase = await createRouteHandlerSupabaseClient();

      let user: User | null = null;
      if (config.auth === 'required') {
        ({ data: { user } } = await supabase.auth.getUser());
        if (!user) return fail('unauthenticated', requestId);
      }

      if (config.rateLimit) {
        const key = config.rateLimit.by === 'user' ? user!.id : clientIp(req);
        if (!checkRateLimit(`${req.nextUrl.pathname}:${key}`, config.rateLimit)) {
          return fail('rate_limited', requestId);
        }
      }

      if (config.role === 'admin') {
        const { data } = await supabase.from('profiles').select('role').eq('id', user!.id).single();
        if (data?.role !== 'admin') return fail('forbidden', requestId);
      } else if (config.role === 'counsellor') {
        if (!(await canActAsCounsellor(supabase, user!))) return fail('forbidden', requestId);
      }

      let body = undefined as B, query = undefined as Q;
      if (config.body) {
        const raw = await req.json().catch(() => null);
        const parsed = config.body.safeParse(raw);
        if (!parsed.success) return fail('invalid_input', requestId);
        body = parsed.data;
      }
      if (config.query) {
        const parsed = config.query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
        if (!parsed.success) return fail('invalid_input', requestId);
        query = parsed.data;
      }

      const data = await config.handler({ supabase, user: user!, body, query, requestId });
      return NextResponse.json({ data }, {
        headers: { 'x-request-id': requestId, 'Cache-Control': config.cache ?? 'no-store' },
      });

    } catch (err) {
      if (err instanceof ApiError) {
        console.warn(`[api] ${requestId} ${err.code}`, err.detail);   // detail stays server-side
        return fail(err.code, requestId);
      }
      console.error(`[api] ${requestId} unhandled`, err);             // PostgREST text never escapes
      return fail('internal', requestId);
    }
  };
}
```

### An example route rewritten

`/api/counsellor/notes` — the HIGH finding above — becomes a schema, an ownership check, and one insert. The auth, role, envelope, error mapping, and message-sanitisation all move into the wrapper; the missing linkage check and the missing length cap both become impossible to forget because they live in the schema and the handler body respectively.

```ts
// src/app/api/counsellor/notes/route.ts
import { z } from 'zod';
import { route, ApiError } from '@/lib/api/handler';
import { studentIsAssignedToMe } from '@/lib/counsellor/roster';

export const createNoteSchema = z.object({          // exported — the client imports this
  studentId: z.string().uuid(),
  body:      z.string().trim().min(1).max(4_000),   // was uncapped
  noteType:  z.enum(['session', 'flag', 'update']),
});

export const POST = route({
  auth: 'required',
  role: 'counsellor',
  body: createNoteSchema,
  rateLimit: { limit: 60, windowMs: 60_000, by: 'user' },
  handler: async ({ supabase, user, body }) => {
    // THE FIX: subject-linkage, mirroring /api/parent/messages:46
    if (!(await studentIsAssignedToMe(supabase, user.id, body.studentId))) {
      throw new ApiError('not_found');               // not 403 — no existence oracle
    }
    const { data, error } = await supabase
      .from('counsellor_notes')
      .insert({
        student_profile_id: body.studentId,
        author_profile_id: user.id,                  // server-set, never from the wire
        body: body.body,
        note_type: body.noteType,
      })
      .select('id, body, note_type, created_at')
      .single();
    if (error) throw new ApiError('invalid_input', error.message);  // logged, not returned
    return { note: { id: data.id, content: data.body, type: data.note_type, date: data.created_at } };
  },
});
```

**Typed contracts shared with the client.** Because `createNoteSchema` is exported from the route module, the client gets the request type for free and the response type follows from the handler's return:

```ts
// src/lib/api/client.ts
export async function apiPost<S extends z.ZodType, R>(
  path: string, schema: S, input: z.input<S>,
): Promise<R> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(schema.parse(input)),        // fails at the call site, not over the wire
  });
  const json = (await res.json()) as ApiResponse<R>;
  if ('error' in json) throw new ApiClientError(json.error.code, json.error.message);
  return json.data;
}
```
Every `fetch('/api/…')` call site (26 of them) then handles a single known error union instead of guessing at 15 body shapes.

**Rate-limit strategy.** Three tiers, declared not remembered: LLM/paid routes 10–20/min **per user**; anonymous catalogue routes 30–120/min **per IP** (this is what closes the `search/filters` HIGH); authenticated CRUD 60/min per user as a blanket default in the wrapper. Back it with a Postgres table plus a `SECURITY DEFINER` check-and-increment function so the limit is global across lambdas — `checkRateLimit`'s signature does not change, so it is a one-file swap. Independently, set a hard spend cap in the Gemini console; application code is not a billing control.

---

## Effort

| # | Finding | Effort | Risk if unfixed |
|---|---|---|---|
| 1 | Open redirect in `/auth/callback` | **S** — 2 lines | HIGH — phishing primitive on the auth endpoint |
| 2 | `counsellor/notes` arbitrary `studentId` + uncapped body | **S** app / **M** with RLS helper | HIGH — cross-student write; open SELECT exposes all notes |
| 3 | `search/filters` + `filter-options` unauth & unthrottled | **S** — 2 lines each, helper exists | HIGH — cheapest available DB DoS, no auth needed |
| 4 | `essay-assist` uncapped `blocks`/`block` | **S** — ~6 lines | HIGH — ~1000× LLM cost amplification per request |
| 5 | `saveStudentIntake` unvalidated payload | **M** — schema exists unused in `lib/validation/profile.ts` | HIGH — arbitrary writes to 6 tables via forged action POST |
| 6 | Rate limiter → shared store | **M** — one file, 6 call sites unchanged | MEDIUM — no global spend ceiling on paid providers |
| 7 | `essay-assist` missing `abortSignal`; decorative fallback loop | **S** / **S** | MEDIUM — orphaned spend; fallback never fires |
| 8 | Deck writes: app-level owner predicate + cap `studentIds` | **S** | MEDIUM — structural; correct today via RLS only |
| 9 | PostgREST message leakage (11 sites) | **S** standalone / free with the wrapper | MEDIUM — schema + RLS topology disclosure |
| 10 | `profile/export` `Cache-Control: private, no-store` | **S** — 2 lines | MEDIUM — PII cacheable by intermediaries |
| 11 | Delete or gate `/api/calendar-feed` | **S** | MEDIUM — 228 lines of unused anonymous surface |
| 12 | Derive middleware matcher from `PROTECTED_PREFIXES` | **S** | MEDIUM — silent auth bypass on drift (has happened) |
| 13 | `admin/import` cap before sanitise; use `parseJsonBody` | **S** | MEDIUM — unbounded work pre-rejection |
| 14 | `/appointment` auth guard | **S** | LOW — UI disclosure only |
| 15 | Small items (config-hint leak, `match` stage, `q` cap, `redirectedFrom`) | **S** each | LOW |
| 16 | **Build the wrapper + taxonomy + typed client** | **L** | — subsumes 9, most of 6, and prevents the whole class |
| 17 | **Migrate all 24 routes onto the wrapper** | **XL** | — mechanical; do it behind the 5 tests that exist, add tests as you go |

**Suggested order.** Items 1, 3, 4 first — each is a few lines and each closes a HIGH. Then 2 and 5, the two real authorization/validation holes. Then 16 as one focused piece of work, and 17 route-by-route, starting with the four counsellor routes (they share the most boilerplate and carry the weakest ownership story).
