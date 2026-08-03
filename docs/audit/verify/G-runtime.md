# Lane G — React, Next 15, and runtime correctness

## Summary

Read-only lane. No file under `src/`, `supabase/` or `__tests__/` was touched; no
`git checkout`/`stash`/`reset`; no `npm test`/`build`.

**Executed vs inferred.** Every *fact about the source and its history* here was
executed: ~30 `rg` sweeps, `git diff origin/main..HEAD` / `git show origin/main:<path>`
for every `Regression?` verdict, a brace-matching scan of **all 163 `useEffect`/
`useLayoutEffect` bodies** in `src/` for listener/timer/observer cleanup pairing, and
one real `npx eslint` run over `src/hooks src/components/help src/components/notifications
src/components/layout src/lib/auth src/app/inbox src/app/counsellor/inbox
src/components/assistant` (**exit 0, zero output — zero errors and zero warnings,
including `react-hooks/exhaustive-deps`**). Every *claim about runtime behaviour* is
inferred by reading: **0 of 7 findings were reproduced in a browser or under Jest.**
That is the lane's stated method, but it is the honest ratio.

**Item 1 (async factories / `params` / `searchParams`) is clean, and clean by
construction.** All 74 call sites of `createServerSupabaseClient` /
`createRouteHandlerSupabaseClient` / `createServerActionSupabaseClient` `await`; a PCRE2
negative-lookbehind sweep for a non-awaited call returns zero. All 3 dynamic route
segments and all 4 `searchParams` consumers type the prop as `Promise<…>` and `await` it.
There is no `generateMetadata`/`generateStaticParams` anywhere. The one raw `cookies()`
outside the factories (`features/parent/api/context.ts:26`) is awaited. Crucially this
class *cannot* go green-and-wrong here: a missed `await` leaves a `Promise`, and the very
next line is `.from(...)` or `.id`, which TS rejects — I found no `as any` on a factory
result in any `page.tsx`/`layout.tsx` that would launder it. The type-aware ESLint rules
(`no-floating-promises`, `await-thenable`) do **not** cover `src/app/**/page.tsx`, but TS
structural typing does, so no finding.

**The value is in item 3.** The five 0%-coverage hooks hold one P1 and three P3s, and
none of them is a refactor regression — all five files are byte-identical to
`origin/main` except `use-launch-href.ts`, whose change is a strict improvement.

**G1 is the finding that matters.** `useHelpThread.reply()` returns silently when
`currentProfileId` is null, and the drawer's `handleReply` then clears the composer and
toasts *"Reply sent to your counsellor."* The student's message is destroyed and they are
told it was delivered. The trigger is an uncaught `supabase.auth.getUser()` at
`use-help-thread.ts:59`. The refactor **added exactly this `.catch()` to
`use-is-demo-user.ts`** (diff quoted in G1) with a comment naming the hazard — and did not
apply it to the two hooks where the same pattern exists, one of which loses user data.

Counts: **P0 0 · P1 1 · P2 1 · P3 5.** Regressions: **0 YES · 7 NO · 0 NEW.**
Nothing in this lane blocks another lane. G7 overlaps Lane J; G2's fix touches a file
Lane A may also be looking at.

Out-of-lane observation, reported once: a live `OPENAI_API_KEY=sk-proj-…` is present in
this machine's **shell environment** (visible in `pgrep -fl` output). Not in the repo
tree, so not a Lane L tree-secret finding, but the coordinator should know it is exposed
to every subprocess this audit spawns.

---

## Findings

### G1 — A help-thread reply is silently destroyed and the student is told it was sent
Severity: **P1** (wrong behaviour — user data loss with a false success confirmation)
Location: `src/hooks/use-help-thread.ts:59`, `src/hooks/use-help-thread.ts:228`,
`src/components/help/help-thread-drawer-impl.tsx:143`, `:417`
Regression?: **NO** (pre-existing — `use-help-thread.ts` is byte-identical to `origin/main`)

Evidence:

`git diff origin/main..HEAD -- src/hooks/use-help-thread.ts` → **empty output**
(the hook is unchanged by the refactor).

The guard, `src/hooks/use-help-thread.ts:226-228`:

```ts
const reply = useCallback(
  async (body: string, authorRole: 'student' | 'counsellor') => {
    if (!requestId || !currentProfileId || !request) return;   // ← resolves undefined
```

`currentProfileId` is populated only here, `src/hooks/use-help-thread.ts:57-65` —
note there is **no `.catch()`**:

```ts
useEffect(() => {
  let cancelled = false;
  supabase.auth.getUser().then(({ data }) => {
    if (!cancelled) setCurrentProfileId(data?.user?.id ?? null);
  });
  return () => { cancelled = true; };
}, [supabase]);
```

The caller treats the resolved promise as success,
`src/components/help/help-thread-drawer-impl.tsx:143-156`:

```ts
const handleReply = async () => {
  if (busy || !replyText.trim()) return;
  setBusy(true);
  try {
    await reply(replyText, side);
    setReplyText('');                                   // composer cleared
    showToast({
      title: isCounsellor ? `Reply sent to ${studentName}` : 'Reply sent to your counsellor',
      variant: 'success'                                // ← success, unconditionally
    });
  } catch {
    showToast({ title: "Couldn't send reply", variant: 'error' });
  } finally { setBusy(false); }
};
```

The Send button is gated on `disabled={busy || !replyText.trim()}`
(`help-thread-drawer-impl.tsx:417`) — **not** on `currentProfileId`. The composer as a
whole renders on `{tab === 'thread' && request ? (…)}` (`:390`), so the `!request` arm of
the guard is unreachable from the UI; the `!currentProfileId` arm is fully reachable.
Enter also routes to `handleReply` (`:405`), so no click is required.

That the refactor knew about this failure mode is on the record — it added the missing
`.catch()` to the *sibling* hook and not to this one.
`git diff origin/main..HEAD -- src/lib/demo/use-is-demo-user.ts`:

```diff
+      // getUser() reaches the network, so it can reject (offline, auth server
+      // down). Unhandled, that surfaced as an unhandled rejection and left
+      // `isDemo` stuck at whatever sessionStorage last cached. Failing closed to
+      // "not the demo user" is the safe default.
+      .catch(() => {
+        if (cancelled) return;
+        setIsDemo(false);
+      });
```

Repro (three inputs, one observed output):
1. **`getUser()` rejects** — offline, or the Supabase auth endpoint 5xxs, at the moment
   the drawer mounts. `currentProfileId` stays `null` for the entire life of the mount and
   an unhandled rejection is logged. Type a reply → Enter → textarea clears, green toast
   *"Reply sent to your counsellor"*, **nothing is inserted into `help_messages`**, nothing
   is queued, no error is surfaced. Every subsequent reply in that drawer session behaves
   the same way.
2. **Session expired** — `getUser()` resolves `{ data: { user: null } }` →
   `setCurrentProfileId(null)` → identical outcome.
3. **Race** — the composer unlocks the instant `request` lands (`refresh()`'s
   `Promise.all` of 4 queries). `getUser()` is a separate in-flight request. Send inside
   that window → identical outcome. Narrowest of the three, but it needs no network fault.

Fix (smallest change that resolves it): make the failure loud instead of silent, in the
hook rather than the caller — `reply()` should `throw` rather than `return` when it cannot
identify the author, so the existing `catch` in `handleReply` fires the *"Couldn't send
reply"* toast and `setReplyText('')` never runs:

```ts
if (!requestId || !request) return;
if (!currentProfileId) throw new Error('useHelpThread: no author profile resolved');
```

and add the `.catch()` at `:59` mirroring `use-is-demo-user.ts` so the rejection is
handled rather than unhandled. (Optionally also `disabled={… || !currentProfileId}` at
`:417`, but that alone is cosmetic — it does not fix cases 1 and 2, where the button would
simply stay disabled forever with no explanation.)

Test (fails before, passes after): render `HelpThreadDrawer` with `auth.getUser()` mocked
to `Promise.reject(new Error('offline'))` and `getHelpRequest` resolving normally; type
into `#help-drawer-reply`, press Enter; assert (a) `insertHelpMessage` was **not** called,
**and** (b) the toast title is `"Couldn't send reply"`, **and** (c) the textarea still
holds the typed text. Assertion (a) alone passes today and is therefore worthless — it is
(b) and (c) that go red.

---

### G2 — `SideSwitcher` hydrates with different markup than the server rendered
Severity: **P2** (React hydration mismatch on every demo-user page load)
Location: `src/lib/demo/use-is-demo-user.ts:10-13`, consumed at
`src/components/layout/side-switcher.tsx:42`, `:59`
Regression?: **NO** (pre-existing — the `useState` initialiser is unchanged from `origin/main`)

Evidence — `src/lib/demo/use-is-demo-user.ts:10-13`:

```ts
const [isDemo, setIsDemo] = useState<boolean>(() => {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(CACHE_KEY) === '1';
});
```

`src/components/layout/side-switcher.tsx:59`:

```ts
if (!isDemo && role !== 'admin') return null;
```

`git show origin/main:src/lib/demo/use-is-demo-user.ts` contains the identical
initialiser, so the mismatch source predates the refactor. `git diff` shows the refactor
touched only the `.catch()` (see G1) and the `useUserRole` → `useRole` swap.

`SideSwitcher` is a plain SSR'd Client Component — `src/components/layout/sidebar.tsx:11`
imports it statically and renders it at `:89`; `rg "dynamic\(|ssr" src/components/layout/sidebar.tsx
src/components/layout/dashboard-shell.tsx` returns nothing, so there is no `ssr: false`
wrapper shielding it. `rg "suppressHydrationWarning" src` matches only
`src/app/layout.tsx:62` on `<html>`, which covers attribute drift from the theme script,
not a subtree that appears out of nowhere.

Repro: sign in as the demo user (`greg@…`), let the page settle — the effect writes
`sessionStorage['ascenda-is-demo'] = '1'`. Now hard-reload any authenticated route. Server
render: `isDemo === false`, `role !== 'admin'` → `SideSwitcher` returns `null`, the HTML
contains no switcher. Client hydration render: the lazy initialiser reads `'1'` → `true`
→ the same component returns a `<div>` with two `<button>`s. React finds client content
where the server emitted none and logs *"Hydration failed because the server rendered HTML
didn't match the client"*, discarding and re-rendering the subtree. This fires on **every**
demo page load, which is every load in a demo.

Fix: drop the storage read from the initialiser and gate the render on mount instead —
`useState(false)` plus the existing effect. The `sessionStorage` cache then only
short-circuits the *network* call, not the first render:

```ts
const [isDemo, setIsDemo] = useState(false);
useEffect(() => {
  const cached = sessionStorage.getItem(CACHE_KEY);
  if (cached === '1') setIsDemo(true);
  …existing getUser() flow…
}, []);
```

Test: render `<SideSwitcher />` twice — once via `renderToString` with `sessionStorage`
unavailable, once via `hydrateRoot` with `sessionStorage['ascenda-is-demo'] = '1'` — and
assert `console.error` was not called with a hydration message. A simpler proxy that also
goes red: assert the component's **first** client render output equals its server render
output for the same props.

---

### G3 — `useNotifications` swallows an `auth.getUser()` rejection, leaving the bell permanently empty
Severity: **P3** (silent degradation; no data loss)
Location: `src/hooks/use-notifications.ts:49-58`
Regression?: **NO** (file unchanged from `origin/main`)

Evidence — same shape as G1, milder consequence:

```ts
useEffect(() => {
  let cancelled = false;
  supabase.auth.getUser().then(({ data }) => {
    if (cancelled) return;
    setProfileId(data?.user?.id ?? null);
  });
  return () => { cancelled = true; };
}, [supabase]);
```

No `.catch()`. On rejection: an unhandled promise rejection, `profileId` stays `null`,
which makes `enabled: !!profileId` false at `:86` — so `useRealtimePoll` creates neither a
channel nor a poll, and the initial-load effect at `:62-66` takes the `if (!profileId)`
branch and calls `setLoading(false)`.

Repro: force `auth.getUser()` to reject → the notification bell renders the "No
notifications yet" empty state indistinguishably from a genuinely empty inbox, with no
retry path short of a reload, for the whole session.

Fix: `.catch(() => { if (!cancelled) setProfileId(null); })`, matching
`use-is-demo-user.ts`.

Test: mock `auth.getUser()` to reject; assert no unhandled rejection is emitted and that
`loading` settles to `false` (today the rejection escapes).

---

### G4 — `useRealtimePoll` binds handlers to array *index*, captured once at channel creation
Severity: **P3** (latent — correct at all 5 current call sites, unenforced)
Location: `src/hooks/use-realtime-poll.ts:147-157`, effect deps at `:184`
Regression?: **NO** (file unchanged from `origin/main`)

Evidence:

```ts
subscriptionsRef.current.forEach((sub, index) => {
  …
  builder = builder.on('postgres_changes', config, (payload: any) => {
    subscriptionsRef.current[index]?.handler(payload);     // ← index frozen at build time
  });
});
```

with

```ts
}, [supabase, channelName, enabled, fastMs, slowMs, maxMs]);
```

`subscriptions` is deliberately excluded from the deps (documented at `:181-183`) so
fresh closures don't churn the channel — but the *filter strings* and the *ordering* are
also read only at build time. The channel is rebuilt only when `channelName`, `enabled` or
an interval changes.

Repro (not currently reachable): a consumer that renders `subscriptions` conditionally —
e.g. `[...base, ...(isCounsellor ? [extra] : [])]` — while keeping `channelName` constant
would, on the flag flipping, route every event to the wrong `handler` or drop it, with no
error. I verified all five consumers pass fixed-length array literals:
`use-notifications.ts:94` (2), `use-help-thread.ts:161` (4), `use-help-requests.ts:51` (2),
`src/app/inbox/_components/inbox-list.tsx:94` (2),
`src/app/counsellor/inbox/_components/counsellor-inbox.tsx:63` (2),
`src/components/assistant/assistant-workspace.tsx:204` (1). So this is latent, not live.

Fix: key on `sub.table` + `sub.event` + `sub.filter` rather than `index`, or add a
dev-mode invariant that the array's length and `table`/`filter` tuple are stable for a
given `channelName`.

Test: mount the hook with a 2-element `subscriptions`, rerender with the order swapped
(same `channelName`), fire a payload for the second table, assert the *second* handler
received it. Fails today.

---

### G5 — `useChatStream` never aborts in-flight streams on unmount
Severity: **P3** (leaked network stream and LLM token spend after navigation)
Location: `src/hooks/use-chat-stream.ts:97`, `:111`, `:125`
Regression?: **NO** (file unchanged from `origin/main`)

Evidence: `controllersRef` (`:97`) is populated at `:125` and drained at `:217` only when a
stream *settles*. `stop()` (`:111`) aborts them all but is caller-invoked; there is no
`useEffect(() => () => stop(), [])`. `rg "AbortController|abort\(|useEffect"
src/hooks/use-chat-stream.ts` returns exactly the lines above plus the cooldown timer at
`:101` — no unmount cleanup.

Repro: start a chat turn in the assistant workspace, navigate away before it finishes. The
`fetch` is never aborted, the server keeps generating and streaming, and the reader loop
keeps consuming into a component that no longer exists. `setIsStreaming(false)` at `:218`
is a no-op on an unmounted component in React 18+, so nothing warns.

Fix: `useEffect(() => () => { for (const c of controllersRef.current) c.abort(); }, []);`

Test: mount, start a stream against a never-resolving mock `fetch`, unmount, assert the
controller's `signal.aborted === true`.

---

### G6 — `realtimeOkRef` in `useNotifications` is written on every status change and never read
Severity: **P3** (quality — dead state; the `onStatusChange` callback exists only to feed it)
Location: `src/hooks/use-notifications.ts:36`, `:88-93`
Regression?: **NO** (file unchanged from `origin/main`)

Evidence: `rg -n "realtimeOkRef" src/` returns exactly three lines — the `useRef` and the
two assignments. No read anywhere in the tree.

`lint:deadcode` (knip) cannot see this: it is a live `useRef` inside a used module, not an
unused export. And `knip` runs as `knip --no-exit-code` (`package.json:21`), so it could
not fail the gate regardless.

Fix: delete the ref and the `onStatusChange` option from this call site — the two-speed
backoff inside `useRealtimePoll` already acts on `SUBSCRIBED`/`CHANNEL_ERROR` itself, so
nothing is lost. Or surface it as a returned `realtimeOk` if a "reconnecting…" indicator is
wanted.

Test: n/a (deletion). Covered by `lint:deadcode` only if knip is taught about unread refs,
which it cannot be — so this one goes in the ledger as a quality item, not a gated one.

---

### G7 — `export const revalidate = 3600` on `/course/[id]` is inert; the page is dynamic
Severity: **P3** (intended 1-hour ISR never happens; every course view hits the DB)
Location: `src/app/course/[id]/page.tsx:7` (with `:14`)
Regression?: **NO** (`git diff origin/main..HEAD -- src/app/course/` is empty)

Evidence:

```ts
export const revalidate = 3600;

export default async function CoursePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  …
    const supabase = await createServerSupabaseClient();   // :14
```

and `createServerSupabaseClient` opens with `const cookieStore = await cookies();`
(`src/lib/supabase/server.ts:6`). In Next 15, reading `cookies()` opts the route into
dynamic rendering; `revalidate` then governs nothing about the route render. The page's
query is public catalogue data (`programs` + `universities`) and needs no session at all —
the cookie read is incidental, inherited from using the session-bound factory.

Repro: not executed. The only `.next/` in the tree is a **dev-server** build
(`ls -la .next/` — no `prerender-manifest.json`, timestamps from a concurrently running
`npm run dev`), so I could not read a route-classification manifest, and I am not
permitted to run `build`. See "Not verified".

Fix: use a cookie-free client for this page (an anon `createClient` with no cookie
handlers) so the route can actually be statically revalidated — or delete the
`revalidate` line so the file stops asserting a caching behaviour it does not get.

Test: assert against `.next/prerender-manifest.json` (or `next build` output) that
`/course/[id]` is listed as revalidating rather than `ƒ (Dynamic)`. Requires a build, so
this is a Lane J / Lane L handoff.

---

## What I checked and found clean

Re-checking these is wasted effort unless the underlying files change.

**Item 1 — async factories, `params`, `searchParams` (executed).**
- All 74 call sites of the three factories `await`. PCRE2 negative-lookbehind sweep
  (`(?<!await )create…SupabaseClient\(\)`) → zero hits.
- The right factory in the right place: `createRouteHandlerSupabaseClient` appears only
  under `src/app/api/**/route.ts`; `createServerActionSupabaseClient` only in
  `src/app/profile/actions.ts`; `createServerSupabaseClient` (whose cookie `set`/`remove`
  are deliberate no-ops) only in Server Components and in `lib/auth/{identity,policy}.ts`.
  I specifically checked whether `getIdentity`/`requireIdentity`/`can` are reached from a
  Route Handler — which would silently drop a token refresh through the no-op writer —
  and they are not: `rg` over `src/app/api`, `src/features/parent/api`, `src/lib/api`
  returns nothing.
- All 3 dynamic segments (`course/[id]`, `counsellor/students/[id]`,
  `(university-info)/…/university/[id]`) type `params: Promise<…>` and `await` it. All 4
  `searchParams` consumers likewise.
- No `generateMetadata` / `generateStaticParams` / `generateViewport` anywhere in `src/app`.
- The only bare `cookies()` outside the factory file is awaited
  (`features/parent/api/context.ts:26`).

**Item 2 — server/client boundary (executed).**
- All 4 `ssr: false` sites are inside files whose first line is `'use client'`:
  `help/help-thread-drawer.tsx`, `toolbox/essay-workshop-lazy.tsx`,
  `chat/chatbot-widget-lazy.tsx`, `layout/command-palette.tsx`.
- No non-`NEXT_PUBLIC_` `process.env` reference in any `'use client'` file (swept every
  such file individually). `SUPABASE_SERVICE_ROLE_KEY` appears only in `scripts/`, never
  in `src/`.
- Every `'use client'` file that imports `@/lib/data/*` does so with `import type` (10
  sites, all verified) — erased at compile, no runtime edge. No client file imports
  `@/lib/auth/identity`, `@/lib/auth/policy`, `@/lib/env`, `@/lib/supabase/server` or
  `@/features/parent/api` at all.
- `identity.ts:61`, `policy.ts:64` and `env.ts` carry `typeof window !== 'undefined'`
  throws as the stand-in for the absent `server-only` package.
- `src/middleware.ts` exists; there is no `middleware.ts` at the repo root.

**Item 3 — hooks, beyond the findings above (executed + read).**
- `npx eslint` over the 8 hook/live-view directories: **exit 0, zero output**. So
  `react-hooks/rules-of-hooks` and `react-hooks/exhaustive-deps` are satisfied there, and
  the rule *is* live (six `eslint-disable-next-line react-hooks/exhaustive-deps` comments
  exist elsewhere in `src/` — `page-hero.tsx:79`, `side-switcher.tsx:55`,
  `preview-cta.tsx:304`, `IntelligentSearchBar.tsx:303`,
  `university-search/search/page.tsx:300`, `widget-grid-core.tsx:163`).
- **Cleanup discipline, all 163 effects in `src/`:** a brace-matching scan pairing
  `addEventListener`/`removeEventListener`, `setInterval`/`clearInterval`,
  `setTimeout`/`clearTimeout`, `requestAnimationFrame`/`cancelAnimationFrame` and
  `new *Observer`/`disconnect` flagged 4 candidates, every one of which I read and
  confirmed a false positive (branch-paired cleanups, or one `cancelAnimationFrame`
  legitimately covering two `requestAnimationFrame` call sites sharing an id, or the word
  `setInterval` occurring in a comment). **Zero real leaks.**
- **Dep arrays:** a second scan for `useEffect` bodies not followed by `, [` flagged 3,
  all false positives (concise arrow bodies: `useEffect(() => setMounted(true), [])`).
  There is no effect in `src/` without a dependency array.
- `useSupabase()` (`src/hooks/useSupabase.ts`) memoises with `[]` over a module-level
  singleton, so `supabase` is referentially stable — the realtime effects keyed on it do
  not churn.
- `use-realtime-poll.ts` itself is careful and I could not fault it beyond G4: the
  `disposed` flag closes the documented re-arm-after-`CLOSED` leak; `scheduleNext` clears
  before re-arming and refuses to arm while `document.hidden`; the `pollMode !== 'fallback'`
  guard on `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED` correctly prevents a dead channel's retry
  storm from pinning the poll at `fastMs`; cleanup clears the timer, removes the
  `visibilitychange` listener, and `removeChannel`s inside a `try`.
- `use-help-thread.ts`'s three concurrency guards — `pendingRef` (optimistic dedupe by
  greedy `(author, role, body)` credit), `refreshSeqRef` (stale-snapshot ticket), and
  `activeRequestIdRef` (thread-switch splice guard) — I read closely and believe correct.
  The mark-read effect's `request.id !== requestId || loading` precondition correctly
  prevents forging a read on a newly-switched thread using the previous thread's marker,
  and the counsellor-side ownership check at `:210-216` is present.
- `use-launch-href.ts` is the one hook of the five the refactor changed; the diff
  (static `useSupabase()` → dynamic `import()`, plus a `try/catch` and `[supabase]` → `[]`)
  is a strict improvement and the `isActive` guard covers the unmount case.
- `use-animated-number.ts`: the `duration <= 0` reduced-motion path is correct and both
  callers pass `shouldReduceMotion ? 0 : 1200`. It does restart from 0 if `target` changes
  mid-flight, but `target` is constant at both call sites — noted, not filed.
- `notification-bell.tsx`'s new focus/`focusout` effects are ordered safely: the
  `panelRef.current?.focus()` effect is declared *before* the `focusout` listener effect,
  so the programmatic focus move cannot trip the listener that would close the panel.

**Item 4 — realtime and polling (read).** Backoff is present and documented; all five
`channelName`s are distinct (`counsellor_inbox`, `inbox_list`, `chat_conversations_${mode}`,
`notif:${profileId}:${audience}`, `help_thread:${requestId}`) and no two components mount
the same one concurrently. `rg "\.channel\(|removeChannel|subscribe\("` over `src/`
excluding the hook returns exactly one unrelated line (`role-select/page.tsx:102`, an auth
listener with its `unsubscribe`). Every `setInterval` in `src/` (4) has a matching clear.

**Item 5 — error boundaries and loading states (executed).** 14 `error.tsx` (+
`global-error.tsx`) and 40 `loading.tsx`. Every one of the 14 begins with `'use client'`
and takes `{ error, reset }`. `src/app/error.tsx` is the catch-all, so the handful of
fetching routes without their own boundary (`/inbox`, `/shortlist`, `/appointment`,
`/assistant`, `/role-select`) still cascade to one. No gap found.

**Item 6 — hydration (executed).** Beyond G2: no `useState` lazy initialiser anywhere in
`src/` touches `localStorage`/`sessionStorage`/`Math.random`/`new Date`/`Date.now` other
than `use-is-demo-user.ts`. No `useSyncExternalStore` at all (so no
`getServerSnapshot` divergence). The two `Math.random()` uses are both inside event
handlers (`task-list-panel.tsx:73` in `handleToggle`, `StudentIntakeForm.tsx:489` in
`addActivityRow`), never in render. `suppressHydrationWarning` appears once, correctly, on
`<html>` (`src/app/layout.tsx:62`) for the theme script; the theme script's
`dangerouslySetInnerHTML` is a static string with no interpolated data.
`role-context.tsx:123` explicitly seeds `useState` from the server-provided context value
so the first client render matches the HTML — the comment claims this and the code does it.
`sidebar-context.tsx` and `theme-provider.tsx` both start from a constant and hydrate from
storage in an effect.

---

## Not verified

- **Every runtime consequence in every finding.** Nothing was reproduced in a browser or
  under Jest. Reason: the lane brief forbids `npm test`/`npm run build`, and other agents
  hold in-flight edits in this working tree. All 7 findings are inferred by reading; the
  source facts and `origin/main` comparisons behind them were executed.
- **G7's dynamic-vs-static claim.** Reason: the only `.next/` present is a dev-server
  build from a concurrently running `npm run dev` (no `prerender-manifest.json`), and
  `next build` is off-limits. The claim rests on the documented Next 15 rule that
  `cookies()` forces dynamic rendering plus the confirmed `await cookies()` at
  `src/lib/supabase/server.ts:6`.
- **`exhaustive-deps` across the rest of `src/`.** Reason: I ran ESLint over 8 directories
  (clean, exit 0); a full `eslint .` is the `lint` gate and is CPU-contended — the one
  targeted run took over 6 minutes against a running dev server. The six explicit
  `eslint-disable-next-line react-hooks/exhaustive-deps` sites listed above were **not**
  individually audited for whether the suppression is justified.
- **A possible theme flash for dark-mode users.** `theme-provider.tsx` declares
  `useEffect(() => applyDocumentTheme(mode), [mode])` (`:85`) *after* the effect that
  resolves `preference === 'system'` to `'dark'` (`:58-84`). In the first commit `mode` is
  still `'light'`, so `applyDocumentTheme('light')` runs once, overriding what the inline
  theme script wrote, before the `setMode('dark')` scheduled from the earlier effect
  re-renders and re-applies. Whether the browser paints between the two depends on how
  React flushes updates scheduled inside passive effects — I could not determine it by
  reading and did not measure it. Filed here rather than as a finding for that reason.
  `theme-provider.tsx` is unchanged from `origin/main`, so it is not a regression either way.
- **Whether `lint`'s warnings are gated.** `"lint": "eslint ."` with no `--max-warnings`,
  so `no-restricted-imports` warnings (and any other warning-level rule) cannot fail the
  gate; `"lint:deadcode": "knip --no-exit-code"` cannot fail by construction. I observed
  both in `package.json:19,21` but did not test the gates — **Lane L owns this**, and it
  bears on G6.
