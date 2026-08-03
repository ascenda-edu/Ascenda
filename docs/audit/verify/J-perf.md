# Lane J — performance and bundle

Branch `security/phase0-contain` @ `40cb781` vs `origin/main` @ `e5da2dc`.
Method: two full `next build`s (HEAD in the main tree; `origin/main` in a throwaway git
worktree with `node_modules` symlinked), both with the CI placeholder env, then
`scripts/check-bundle-budget.mjs --report` run against **both** `.next` trees with the
**same** script, so the two numbers are the same measure.

---

## Summary

**Executed 11 of 14 claims.** Executed: both production builds (exit 0), both gzip bundle
reports, the per-route delta, the headroom table, two microbenchmarks, the missing-chunk
gate probe, the manifest/`.nft.json` inspection, the render-mode read for `/course/[id]`,
the font/image/public/dynamic-import diffs. Inferred: that moving `ACTIVE_CHILD_COOKIE`
recovers J-4 (no variant built); J-7's severity; J-3's low CI probability.

**202-vs-197 kB: not a regression, doc not stale — two measures of the same route.**
`next build`'s route table prints `/` = 202 kB; `check-bundle-budget.mjs` prints 197 kB.
The script's header documents the offset ("~2-3% BELOW the build log ... budgets are set
against THIS script's measure"); 197 x 1.025 ~= 202. `origin/main` measures 255 kB by the
same script, so the landing page really did drop 58 kB.

**Regressed vs `origin/main` (gzip First Load JS), every one inside budget:**
`/parent` 154->201 (+47, budget 250) - `/parent/messages` 153->198 (+45) -
`/parent/progress` 156->198 (+42) - `/parent/deadlines` 157->198 (+41) -
`/counsellor/universities` 254->261 (+7, budget 270) - `/parent/finances` 194->198 (+4) -
`/{counsellor,parent}/assistant` 300->303 (+3) - four routes at +1 kB.
Everything else flat or better: `/` -58, `/inbox` -11, `/scholarships` -10, `/appointment`
-10, `/dashboard` -10, `/matches` -10, `/profile` -9, `/counsellor/inbox` -9, `/assistant`
-7, `/counsellor` -5, shared-by-all 101->100. Middleware 86.4 -> 101 kB, ungated.

**Severity: 0 P0 / 0 P1 / 4 P2 / 4 P3.**

- J-1 (P2, YES) five `/parent` routes +41..+47 kB; the gate had 49-52 kB of slack.
- J-2 (P3, NEW) budgets are a no-op on 32/47 routes; `/` measures 197 against a 270 budget.
- J-3 (P2, NEW) `check:bundle` counts a missing chunk as 0 bytes and exits 0.
- J-4 (P2, YES) the parent barrel drags a client-component tree into 4 API route handlers.
- J-5 (P3, NO) the O(n*m) scan is still there: 2.75 ms/fetch, 7.6x the Set fix.
- J-6 (P3, NO) Lane G is right - `revalidate = 3600` is inert. No other route has one.
- J-7 (P2, NO) `images.remotePatterns` `hostname: '**'` is an open image-optimiser proxy.
- J-8 (P3, YES) middleware edge bundle +15 kB, and nothing measures middleware at all.

No n+1 query was introduced by the data-layer consolidation.

---

## Findings

### J-1 — five `/parent` routes regressed 26-30% and `check:bundle` passed them
Severity: P2
Location: `src/features/parent/index.ts:65-70`; `src/app/parent/{,messages/,progress/,deadlines/,finances/}page.tsx`; `scripts/check-bundle-budget.mjs:81` (`DEFAULT_BUDGET_KB = 250`)
Regression?: **YES** (worked lighter on `origin/main`)

Evidence — same script, both `.next` trees:
```
  main       HEAD    delta    budget   result
  154 kB ->  201 kB  +47 kB   250      PASS (49 kB slack left)
  153 kB ->  198 kB  +45 kB   250      PASS
  156 kB ->  198 kB  +42 kB   250      PASS
  157 kB ->  198 kB  +41 kB   250      PASS
```
`app-build-manifest.json` chunk count for `/parent/messages/page`: **9 on main, 16 on
HEAD**. The cause is the one documented in `docs/audit/13-remaining-work.md` section 3 —
the slice barrel re-exports `ui/` alongside `api/`, and the App Router emits a client
chunk for every `'use client'` module reachable from a server entry, so a page importing
two loaders also ships all six parent components. The pilot **measured** this
(`154 -> 201`, quoted verbatim in that doc) and the branch shipped it anyway.

Repro: `npm run build && node scripts/check-bundle-budget.mjs --report | grep parent`
-> `201 kB / 250 kB   /parent`, gate exits 0.

Fix: two options, both structural. (a) Split the barrel into `@/features/parent`
(server/model) and `@/features/parent/ui`, and widen `feature-internals-are-private`'s
`to.pathNot` to allow the second entry point. (b) Accept it as a product decision and
record it — but then set the `/parent*` budgets to the *measured* value + 15, so the next
+47 kB is caught.
Test: `ROUTE_BUDGETS['/parent'] = 215` (measured 201 + headroom). That entry fails if the
slice grows again; with the current default it cannot.

### J-2 — most budgets ratchet nothing; the branch's own 58 kB win was never banked
Severity: P3
Location: `scripts/check-bundle-budget.mjs:57-81`
Regression?: NEW (the budget table was added by this branch, in `c620957`)

The file's own instruction is *"These are a CEILING... When one lands, LOWER the budget in
the same PR."* Commit `f4f36c1` (Phase 4, 19:08) cut `/` from 255 -> 197 kB. The budget
file was last touched by `c620957` (Phase 1, 18:11) and never again. `/` still carries a
270 kB budget against a 197 kB measurement.

Headroom, measured (budget minus measured, HEAD build):

| headroom | routes |
|---|---|
| > 50 kB (budget cannot plausibly trip) | **21 / 47** |
| > 25 kB | **32 / 47** |
| <= 20 kB (the gate can actually fire) | **11 / 47** |

Worst offenders: `/_not-found`, `/shortlist`, `/university-search`,
`/university-search/results` at 101/250 (149 kB, 60%); `/toolbox/essay-workshop` 109/250;
`/toolbox` 152/250; `/` 197/270 (73 kB, 27%).

The build is not byte-deterministic: the coordinator measured `/assistant` 323 and
`/scholarships` 277 today where my build gives 322 and 276. +/-1 kB, so a budget with
under 2 kB of headroom would flake. None currently does — the tightest is
`/counsellor/universities` at 9 kB.

Fix: `node scripts/check-bundle-budget.mjs --suggest` already emits a paste-ready block
from the current measurements. Regenerate it and paste it in.
Test: after regenerating, add ~10 kB to any route and confirm the gate goes red — today
adding 10 kB to 32 of 47 routes changes nothing.

### J-3 — the bundle gate treats a missing chunk as 0 bytes and still exits 0
Severity: P2
Location: `scripts/check-bundle-budget.mjs:96-108` (`gzKB`, the `catch` branch)
Regression?: NEW

The gate warns and continues when a chunk named in the manifest is absent, so any
incomplete or mismatched `.next` under-reports rather than failing.

Evidence — hid one 46 kB shared chunk, re-ran the gate, restored it:
```
$ mv .next/static/chunks/1255-e860f7d148c29927.js{,.bak}
$ node scripts/check-bundle-budget.mjs
  warning: chunk missing from .next, treated as 0 bytes: static/chunks/1255-...js
First Load JS (gzip) - 47 page routes
    55 kB / 110 kB   (shared by all)      # was 100 kB
   278 kB / 345 kB   /assistant           # was 322 kB
$ echo $?
0
```
Every route reported ~45 kB lighter and the gate passed. I hit the same failure mode
accidentally at the start of this lane: a `next dev` `.next` was on disk, and the script
reported `/course/[id]` at **27 kB / 255 kB - PASS** with its entire page chunk missing.

CI runs `build` then `check:bundle` in the same job, so this is unlikely to fire there —
but the gate's answer to "I cannot read the thing I am measuring" must be a non-zero
exit, not a smaller number.

Fix: in `gzKB`, collect missing files and `process.exit(1)` with the list, instead of
`console.error` + 0.
Test: delete a chunk listed in the manifest and assert the script exits non-zero. That
assertion fails against today's script (proven above).

### J-4 — the `@/features/parent` barrel pulls a client-component tree into four API route handlers
Severity: P2
Location: `src/app/api/chat/route.ts:36`, `src/app/api/chat/suggestions/route.ts:9`, `src/app/api/parent/messages/route.ts:4`, `src/lib/chat/context.ts:26` (which reaches `/api/chat/actions/execute`)
Regression?: **YES** (`origin/main` had none of it)

`/api/chat/route.ts:36` is `import { ACTIVE_CHILD_COOKIE } from '@/features/parent';` —
one string constant (`'ascenda-parent-child'`, defined in
`src/features/parent/model/active-child.ts:8`). Because the barrel also re-exports `ui/`,
the route handler's build graph acquires the whole parent client tree.

Evidence, `app-build-manifest.json` on HEAD (gzip of each route's chunk set):
```
/api/checklist/route              101 kB   5 chunks    <- no barrel import
/api/chat/route                   195 kB  15 chunks
/api/chat/suggestions/route       195 kB  15 chunks
/api/chat/actions/execute/route   195 kB  15 chunks
/api/parent/messages/route        195 kB  15 chunks
```
Four for four: every route that imports the barrel is affected, the one that does not is
clean. The extra chunks include `8293-*` — framer-motion, per
`docs/audit/08-performance.md` F9. `origin/main`'s build table shows all of these at
104 kB, i.e. the shared baseline.

The deployment trace moved with it — `.next/server/app/api/chat/route.js.nft.json`
`files.length`: **15 on main -> 73 on HEAD** (+69 files, including
`next/dist/compiled/next-server/app-page.runtime.prod.js`, the App-Router *page* runtime
being traced into an app-*route* function). Same shape for `/api/parent/messages`:
10 -> 66.

No user downloads these chunks (a route handler serves no HTML), so this is not a
first-load regression. The costs are serverless bundle size / cold start, and the fact
that a server-only entry now references client components at all.

Two gates that look like they should catch it, and do not:
- `check:bundle` skips it by construction — `if (!key.endsWith('/page')) continue;`
  (`scripts/check-bundle-budget.mjs:137`).
- `.dependency-cruiser.cjs:36` `lib-not-to-components` ("Measured 0 edges") matches
  `to: ^src/components/` only, so `src/lib/chat/context.ts -> @/features/parent -> ui/*`
  is invisible to it.

And `feature-internals-are-private` (`.dependency-cruiser.cjs:124`) actively **forbids**
the cheap fix, the deep import.

Fix: move `ACTIVE_CHILD_COOKIE` out of the slice (e.g. `src/lib/parent/active-child.ts`,
re-exported from the barrel for the slice's own consumers), or add a server-safe second
entry point `src/features/parent/server.ts` and add it to `feature-internals-are-private`'s
`to.pathNot`. `src/features/parent/README.md` "The barrel constraint" already anticipates
this.
Test: assert `app-build-manifest.json`'s chunk list for `/api/chat/route` is a subset of
the shared-by-all set. Fails today (15 chunks vs 5); passes once the constant moves.

### J-5 — the O(n*m) scan is still present; the fix is worth 2.4 ms/fetch, not "the largest single runtime win"
Severity: P3
Location: `src/hooks/use-search-results.ts:671`
Regression?: NO (pre-existing; identical on `origin/main`)

Still there, verbatim:
```js
671:            ? text.uniIds.filter((id) => facetMatched.some((u) => u.id === id))
```
The value the fix needs, `facetMatchedIds`, is materialised 13 lines above at `:658` —
note it is an **array**, not a `Set`, so the fix is two lines (build the `Set`, then
`.has`), not one. `text.uniIds` is capped at 100 at `:174`; `facetMatched` is up to the
full university list (`docs/audit/08-performance.md` measures 2,926 rows), so 292,600
comparisons worst case, matching the audit doc.

Measured (`node`, this machine, worst case n=2,926 m=100, 200 iterations):
```
current  .some():  2.75 ms/fetch
Set fix:           0.36 ms/fetch      7.6x
```
For calibration I benchmarked the adjacent `resolveText()` issue the same doc flags
(`:167-197`, `.toLowerCase()` per university per query word): 0.18 / 0.43 / 0.58 ms per
fetch for 1 / 2 / 4 words. So `:671` is indeed the bigger of the two — but 2.75 ms on the
main thread is under one frame, and it only fires when a text query **and** a facet are
both active. `08-performance.md`'s "largest single runtime win in the app" is not
supported by measurement; it is a cheap, correct fix, not a user-visible stall.
Fix: `const facetIdSet = new Set(facetMatchedIds);` then
`text.uniIds.filter((id) => facetIdSet.has(id))`.
Test: behaviour-preserving; `__tests__/hooks/use-search-results.test.ts` already covers
the facet-intersect-text path and must stay green across the change.

### J-6 — `revalidate = 3600` on `/course/[id]` is inert (Lane G's note: CONFIRMED)
Severity: P3
Location: `src/app/course/[id]/page.tsx:7`
Regression?: NO (byte-identical on `origin/main`)

The page calls `createServerSupabaseClient()` at `:14`, which does an unconditional
`await cookies()` (`src/lib/supabase/server.ts:6`). Reading cookies in a Server Component
opts the segment into dynamic rendering, so no ISR entry is ever produced and the export
caches nothing.

Evidence — the HEAD build's route table:
```
|- f /course/[id]                         19.8 kB         246 kB
...
f  (Dynamic)  server-rendered on demand
```
Marked Dynamic, not ISR. Every route in the table is Dynamic or Static; **no route in
this app is ISR.**

Any other dead `revalidate`? **No.** `src/app/course/[id]/page.tsx:7` is the only
`export const revalidate` in `src/app` (grep over
`revalidate|dynamic|fetchCache|runtime` exports; 29 hits, the other 28 are
`dynamic = 'force-dynamic'` and `runtime = 'nodejs'`, both consistent with what those
routes do). The only other cache primitives in the tree are
`revalidatePath('/profile')` / `('/dashboard')` in `src/app/profile/actions.ts:69-70`
(correct — they invalidate after a mutation) and `fetch(url, { next: { revalidate: 300 } })`
in `src/app/api/calendar-feed/route.ts:190` (an outbound ICS fetch inside a route handler,
genuinely cached and unaffected by segment config). No `unstable_cache`, no
`revalidateTag`, no `'use cache'`.
Fix: delete line 7, or replace it with a comment stating the page is dynamic by
construction. Deleting it changes no behaviour.
Test: a route-config assertion is overkill; the honest fix is deletion.

### J-7 — the image optimiser is an open proxy for any HTTPS host
Severity: P2
Location: `next.config.mjs:50-53` (`remotePatterns: [{ protocol: 'https', hostname: '**' }]`)
Regression?: NO (byte-identical on `origin/main`)

`hostname: '**'` lets anyone call `/_next/image?url=https://<anything>&w=...&q=...` and
have the deployment fetch, transcode to AVIF/WebP, and cache it — server-side request
forgery reach plus unmetered CPU/bandwidth on someone else's behalf. The app's only
remote images are university logos (`logoUrl`, read out of `universities.metadata` in
`src/hooks/use-search-results.ts:438` and
`src/app/course/[id]/_components/course-data.ts:302`), rendered at `sizes="44px"` /
`"40px"`. There are **zero** `<img>` tags in `src/`; all 8 image call sites use
`next/image` with explicit `sizes`, which is correct.
Fix: replace `'**'` with the actual logo hosts, or route logos through the Supabase
storage bucket and pin that one hostname. Owner-facing, not a lane fix.
Test: an assertion that `nextConfig.images.remotePatterns` contains no `'**'` hostname.

### J-8 — the middleware edge bundle grew 17% and nothing measures it
Severity: P3
Location: `src/middleware.ts:254-265`
Regression?: **YES** (86.4 kB on `origin/main`)

Build tables: `Middleware 86.4 kB` (main) -> `Middleware 101 kB` (HEAD). Drivers are the
new `'/api/:path*'` matcher entry and the `COMPLETION_COLUMNS`/`isProfileComplete` import
from `@/lib/profile/completion`. Both are deliberate and correct — the API fail-closed
fence is the point of the branch, and the shared column list fixed the `english_status`
lockout.

Runtime cost is contained, and I verified it: the `/api/` branch at `:75-89` returns
before `createServerClient` is constructed and before `supabase.auth.getUser()`, so an
API request pays a cookie-name regex, not an auth round trip. The onboarding block at
`:174-179` (four parallel queries) is behind a 30-day `onboarding_complete` cookie, so it
runs approximately once per user.

The finding is the absence of a gate: `check:bundle` reads `app-build-manifest.json`,
which does not describe middleware, so 15 kB of edge bundle moved with no signal.
Middleware executes on every matched request including all of `/api/*`, so it is the one
bundle where growth is unambiguously per-request cost.
Fix: extend `check:bundle` to read `.next/server/middleware-manifest.json` and enforce a
budget (~110 kB against today's 101).
Test: add the middleware assertion, then add a heavy import to `src/middleware.ts` and
confirm red.

---

## What I checked and found clean

**No n+1 introduced by the data-layer consolidation.** Read every function in
`src/lib/data/applications.ts` and all 20 call sites. Every list read is a single
statement; the fan-out reads use `.in(...)` (`loadDocumentsForApplications`,
`loadTierByProgram`) and both short-circuit on an empty id array. No caller invokes a
loader inside a loop; the three `loadApplicationBoard` call sites in
`src/features/parent/api/data.ts` (`:156`, `:254`, `:288`) live in three different
exported loaders, and each `/parent/*` page calls exactly one of them.

**The two per-student query fans in `src/lib/counsellor/data.ts` (`:333`, `:863`) are
pre-existing and deliberate.** Byte-for-byte the same on `origin/main` (`:284`, `:797`).
Both are `Promise.all` (one round trip of latency, not n), and both carry a comment
explaining why a single `.in()` is *wrong* here: a profile with a bloated
`student_matches` cache would blow past PostgREST's 1000-row cap and silently drop other
students' tiers. Not a finding.

**`src/lib/matching/service.ts` query shapes are unchanged vs main** (`git diff` filtered
to `.from(` / `.in(` / `.eq(` / `.limit(` / `Promise` / `chunk` lines yields one unrelated
type change). It already batches: `chunk(ids, 200)` + `mapWithConcurrency(..., 3, ...)`
at `:505`, `:628`, `:1018`.

**Column widening from the consolidation is negligible.** `src/lib/chat/context.ts` moved
from a hand-written applications select to `APPLICATION_BOARD_SELECT`, which adds `notes`,
`level`, `intake`, `program_id` and two embed ids. Per-user, bounded, and the deadlines
embed it now shares was already present in the hand-written version on main.

**Fonts: identical.** `src/app/layout.tsx` has no diff against `origin/main` —
`next/font/google` for Outfit + Inter, `subsets: ['latin']`, `display: 'swap'`,
self-hosted by Next, no external font request.

**Images: config identical, usage correct.** `public/` has no diff and totals 304 kB.
Zero `<img>` tags; 8 `next/image` sites, all with explicit `sizes`. (The `'**'`
`remotePatterns` entry is J-7 — a pre-existing hazard, not a change.)

**Dynamic imports: strictly better.** 3 files used `next/dynamic` on `origin/main`, 5 on
HEAD. The two additions are deliberate lazy boundaries off the root layout:
`src/components/help/help-thread-drawer.tsx` (its `HelpDrawerProvider` is mounted in
`app/providers.tsx`, i.e. every route) and `src/components/layout/command-palette.tsx`
(keeps only the Cmd-K listener eager). Nothing was removed.

**`optimizePackageImports` was correctly left out.** `next.config.mjs:8-36` carries a
four-build measurement table showing framer-motion gets ~1 kB *worse* and Radix is
neutral. I did not re-run it; the reasoning (framer-motion@12 ships tree-shakeable ESM;
each `@radix-ui/react-*` is one flat primitive; `lucide-react`/`date-fns` are already in
Next's built-in list) is sound, and the numbers are recorded rather than asserted.

**Dependency weight dropped.** `openai`, `date-fns`, three `@dnd-kit/*` and
`@radix-ui/react-popover` removed from `dependencies`; only `@playwright/test` added, and
to `devDependencies`.

**Route count matches.** 47 page routes in `check:bundle` on both trees; no page route
appeared or disappeared. `/university-search/results` left the client manifest entirely
(104 -> 101 kB, now a server `redirect()`), as commit `f4f36c1` claims.

**Middleware per-API-request cost is the cookie regex only** — verified by reading
`src/middleware.ts:71-89`; the Supabase client is constructed *after* the `/api/` early
return, so the new matcher entry does not add an auth round trip.

**Shared-by-all is flat and comfortably inside budget:** 101 -> 100 kB against 110.

**`IntelligentSearchBar.tsx:78`** issues one `/api/search/suggestions` request per stored
recent search. Bounded at 6 (`:309` `slice(0, 6)`), aborted via `controller.signal`, and
byte-identical to `origin/main`. Noted, not a finding.

---

## Not verified

- **`/scholarships` `select('*')` with no limit** (`src/app/scholarships/page.tsx:60`,
  `08-performance.md` F8). Not exercised — the table does not exist on the remote DB and
  the page falls back to sample data. Ground rule 1 forbids connecting to production to
  confirm, so I cannot say what it costs once the table lands.
- **Unvirtualised results list** (`08-performance.md` F8b). Still true by inspection —
  zero hits for any virtualisation library — but I did not scroll a real 119k-row
  catalogue, so I have no number for the degradation.
- **Whether relocating `ACTIVE_CHILD_COOKIE` actually recovers J-4's chunk graph.** The
  correlation is four-for-four and mechanically explained, but I did not build a variant
  with the import moved.
- **Real-world effect of `staleTimes: { dynamic: 30 }`.** Requires a running app and
  navigation timing; not measured.
- **Runtime request waterfalls per page.** I diffed query *shapes* statically. I did not
  run the app and count round trips, so a serial-await waterfall that is textually
  unchanged but newly on a hot path would not show up here.
- **`/course/[id]` under an anonymous request.** I read the render mode off the build
  table, which is authoritative for whether an ISR entry exists, but I did not curl the
  route twice and compare `x-nextjs-cache` headers.
- **Byte-determinism of the build.** My numbers differ from the coordinator's by +/-1 kB
  on two routes. I did not run the same build twice to establish the variance envelope.
- **Anything about the counsellor slice.** `13-remaining-work.md` recommends not
  migrating it; I did not test what it would cost, only confirmed the parent cost is real.
