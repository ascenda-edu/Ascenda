# 08 — Performance Audit: bundle, rendering, caching, runtime

**Scope:** runtime performance, bundle size, rendering strategy, caching.
**Repo:** `/Users/gregfranck/Ascenda` · branch `fix/ui-phase0-bugs` · Next.js 15.5.21 · React 19.2.8
**Method:** real production build (`next build`) with CI placeholder env vars; chunk sizes measured from `.next/static`; chunk→route mapping from `.next/app-build-manifest.json`; gzip sizes computed directly.

---

## Measured baseline

### Build

Build **succeeds**, exit 0, 13.3s compile, 46 static pages generated. Three warnings worth recording:

| Warning | Meaning |
|---|---|
| `@supabase/realtime-js` uses `process.versions` — "not supported in the Edge Runtime" | Supabase SSR is pulled into the **Edge middleware** bundle. Middleware = **86.9 kB**. |
| `caniuse-lite is 9 months old` | Browserslist data stale → Next targets older browsers than necessary → more transpilation/polyfill in every chunk. |
| `ease-[cubic-bezier(0.22,1,0.36,1)]` is ambiguous | Tailwind class-parsing warning (styling scope, noted only). |

### Route table — First Load JS (gzip), sorted

`○` static · `ƒ` dynamic (server-rendered on demand). Page-specific size in brackets.

| First Load | Type | Route | Page |
|---:|:--|:--|--:|
| **336 kB** | ƒ | `/assistant` | 1.73 kB |
| **307 kB** | ƒ | `/parent/assistant` | 522 B |
| **307 kB** | ƒ | `/counsellor/assistant` | 522 B |
| **292 kB** | ƒ | `/scholarships` | 6.37 kB |
| **288 kB** | ○ | `/appointment` | 7.78 kB |
| **270 kB** | ƒ | `/university-search/search` | 29.2 kB |
| **269 kB** | ƒ | `/counsellor` | 12.1 kB |
| **266 kB** | ƒ | `/dashboard` | 5.58 kB |
| **265 kB** | ƒ | `/matches` | 4.81 kB |
| **260 kB** | ○ | `/` (public landing) | 42.8 kB |
| **260 kB** | ƒ | `/counsellor/universities` | 9.33 kB |
| 256 kB | ƒ | `/profile` | 7.92 kB |
| 255 kB | ƒ | `/applications/documents` | 8.17 kB |
| 253 kB | ƒ | `/inbox` | 4.69 kB |
| 253 kB | ƒ | `/counsellor/students/[id]` | 14.3 kB |
| 249 kB | ƒ | `/university-search/shortlist` | 14.4 kB |
| 247 kB | ƒ | `/counsellor/students` | 4.58 kB |
| 246 kB | ƒ | `/course/[id]` | 19.8 kB |
| 240 kB | ƒ | `/applications` | 19.1 kB |
| 228 kB | ƒ | `/university-search/quests` | 4.19 kB |
| 228 kB | ƒ | `/counsellor/inbox` | 8.12 kB |
| 225 kB | ƒ | `/toolbox/chances` | 12.6 kB |
| 223 kB | ƒ | `/counsellor/documents` | 13.1 kB |
| 217 kB | ƒ | `/profile/wizard` | 22 kB |
| 210 kB | ○ | `/role-select` | 3.53 kB |
| 205 kB | ƒ | `/admin` | 13.1 kB |
| 203 kB | ƒ | `/applications/tasks` | 18.1 kB |
| 198 kB | ƒ | `/parent/finances` | 15.3 kB |
| 198 kB | ƒ | `/counsellor/analytics` | 29.7 kB |
| 197 kB | ƒ | `/toolbox/timeline` | 4.68 kB |
| 196 kB | ○ | `/login` | 28 kB |
| 182 kB | ƒ | `/university-search/university/[id]` | 182 B |
| 163→155 kB | ƒ | 10 further parent/counsellor/toolbox routes | — |
| **111 kB** | ƒ | `/toolbox/essay-workshop` | 2.06 kB |
| **103 kB** | — | shared-by-all baseline / redirect stubs | — |

- **Shared by all: 103 kB** = `1255` (46 kB) + `4bd1b696` (54.2 kB) + 2.32 kB.
- **Static routes: 4 real ones** (`/`, `/login`, `/role-select`, `/appointment`) + 2 redirect stubs + 2 icons. **Every other route is `ƒ` dynamic.** Zero `generateStaticParams` in the repo; zero ISR actually in effect.
- **Middleware: 86.9 kB**, runs on 14 route-prefix families + `/login` + `/signup`.
- **CSS: 153 KB raw / 23.5 kB gz** global stylesheet, render-blocking on every route (+3 kB gz layout CSS, 0.25 kB gz landing CSS).

### Where the bytes actually are

Measured gzip, mapped to routes via `app-build-manifest.json`:

| Chunk | Contents (fingerprinted) | Raw | **Gzip** | Pages carrying it |
|---|---|---:|---:|---:|
| `4bd1b696` + `1255` | React 19 + Next runtime | 339 KB | **98.0 kB** | all (baseline) |
| `8490` | `@supabase/supabase-js` + `@supabase/ssr` + auth-js + realtime-js + storage-js | 216.9 KB | **57.4 kB** | **26 / 47** |
| `8293` | `framer-motion` | 114.5 KB | **37.5 kB** | **40 / 47** |
| `1214` | `react-markdown` + micromark/remark/mdast | 111.3 KB | **33.4 kB** | 3 (`/assistant`, `/counsellor/assistant`, `/parent/assistant`) |
| `2087` | app shell (Sidebar / MobileNav / navigation) | 45.2 KB | 12.4 kB | 22 |
| `8677`,`6406`,`6692`,`5769` | Radix popper / dismissable-layer / select / tooltip | — | 10.4 / 7.7 / 6.8 / 14.1 kB | 20–56 |
| `6318` | **papaparse** | 29.9 KB | ~9 kB | 1 (`/admin` only) ✅ |
| `1551`,`70e0d97a`,`54a60aa6`,`7911` | `@tiptap` + ProseMirror | 422 KB | **~130 kB** | **0 — async-only** ✅ |
| `polyfills` | legacy `nomodule` polyfills | 110 KB | 38.6 kB | legacy browsers only |

**The dominant fact:** the React/Next baseline is 98 kB gz. Supabase (57.4) + framer-motion (37.5) add **94.9 kB gz — a 97 % tax on the baseline — before a single line of product code**, and they load on nearly every route including the public marketing page.

### Public assets

`du -sh public` = **304 KB total.** Nothing over 200 KB except one file:

| Asset | Size | Used by |
|---|---:|---|
| `public/ascenda-banner.jpg` | **216 KB** | landing hero, `next/image` with `priority` + `sizes="100vw"` — optimised to AVIF/WebP at request time, so the 216 KB source is never served |
| `public/ascenda-logo.png` | 56 KB | nav / auth layout |
| `public/ascenda-rocket.png` | 32 KB | landing nav |

Images: **zero raw `<img>` tags** in `src/`; 7 files use `next/image`, all with `sizes`, `priority` where appropriate. Fonts: **`next/font/google`** (Outfit + Inter) with `display: 'swap'` and `adjustFontFallback: true` — self-hosted, no external font request, CLS-guarded. **Images and fonts are the healthiest area of the codebase.**

### Dependency verdicts

| Package | In client bundle? | Where | Verdict |
|---|---|---|---|
| `framer-motion` | **Yes — 37.5 kB gz on 40/47 pages** | root `providers.tsx:6` (`MotionConfig`) + 94 files | **Unavoidable at root as written**; the root-level `MotionConfig` alone guarantees it everywhere |
| `@supabase/*` | **Yes — 57.4 kB gz on 26/47 pages** | `lib/supabase/client.ts` via `useSupabase()`, 30 importers | **Over-scoped** — see F1 |
| `lenis` | No (async) | `landing-preview/smooth-scroll.tsx:227` `void import('lenis')` | ✅ correctly deferred |
| `@tiptap/*` (4 pkgs) | **No — async-only** | `toolbox/essay-workshop.tsx:6-9` behind `essay-workshop-lazy.tsx` | ✅ ~130 kB gz correctly split; `/toolbox/essay-workshop` is the app's *lightest* route at 111 kB |
| `@dnd-kit/*` (3 pkgs) | No | **zero imports anywhere in the repo** | ❌ **dead dependency** (2.2 MB installed) |
| `react-markdown` | **Yes — 33.4 kB gz** | `chat/shared.tsx:10`, `toolbox/essay-ai-panel.tsx:9` | statically bound to the 3 assistant routes — see F4 |
| recharts / equivalent | **not installed** | — | charts are hand-rolled SVG (`counsellor/analytics` page chunk is 69.7 KB raw of bespoke code) |
| `papaparse` | Yes, but **scoped to `/admin`** | `admin/_components/import-panel.tsx:4` | ⚠️ minor — see F9 |
| `date-fns` | No | **zero imports anywhere** (repo uses `lib/utils/dates.ts`) | ❌ **dead dependency** (18 MB installed) |
| `openai` | No | **zero imports anywhere** | ❌ **dead dependency** (13 MB installed). Only **one** LLM SDK is actually used |
| `@google/genai` | **No — server-only** ✅ | 12 files, all `app/api/**` + `lib/chat/**` | ✅ correct; the sole LLM SDK |
| `@tanstack/react-query` | Yes (small) | `providers.tsx:3` | fine |
| `@tanstack/react-query-devtools` | **No — verified absent from every prod chunk** ✅ | `providers.tsx:4`, guarded `providers.tsx:36` | ✅ tree-shaken. (Still mis-declared in `dependencies`, not `devDependencies`) |

Dead dependencies total **~33 MB installed** (`openai` 13 MB + `date-fns` 18 MB + `@dnd-kit` 2.2 MB) — zero bundle cost, but real `npm ci` / cold-start and supply-chain surface.

### Code splitting inventory

`next/dynamic` appears **twice** in the entire codebase:

| File | Target | `ssr` | Verdict |
|---|---|---|---|
| `src/components/chat/chatbot-widget-lazy.tsx:8` | `./chatbot-widget` | `false` | ✅ correct pattern |
| `src/components/toolbox/essay-workshop-lazy.tsx:6` | `@/components/toolbox/essay-workshop` | `false` + skeleton `loading` | ✅ correct pattern, with a shaped fallback |

The CLAUDE.md `'use client'`-wrapper rule is applied **correctly in both instances**. The problem is not misuse — it is that only two things in a 307-component app are split at all.

---

## Findings

### [HIGH] F1 — The public landing page ships the entire Supabase SDK to decide one link's `href`

`src/hooks/use-launch-href.ts:5` imports `useSupabase()`, which statically pulls `@supabase/ssr` + `@supabase/supabase-js` (auth-js + realtime-js + storage-js + postgrest-js). It is consumed by three landing components:

- `src/components/landing-preview/preview-nav.tsx:14`
- `src/components/landing-preview/preview-hero.tsx:19`
- `src/components/landing-preview/preview-cta.tsx:15`

The hook's own fast path (`use-launch-href.ts:22-27`) returns from `localStorage` **before** touching Supabase — the SDK is only used for `supabase.auth.getSession()` on a cold visitor. But the import is static, so **57.4 kB gz lands unconditionally in the critical bundle of the one route where first-paint actually matters commercially.**

**Measured cost:** `/` First Load JS = **260 kB**, of which 57.4 kB is Supabase. Chunk `8490`, 216.9 KB raw.

**Fix:** move the session probe behind a dynamic import inside the existing effect —
```ts
const { getBrowserSupabaseClient } = await import('@/lib/supabase/client');
```
`href` already defaults to `/login` and updates asynchronously, so nothing regresses.
**Expected saving: −57.4 kB gz on `/` (260 → ~202 kB), plus one fewer parse/eval of a 217 KB script before the landing page is interactive.** Same fix removes it from `/role-select` (210 kB).

---

### [HIGH] F2 — Zero `cache()` in the codebase: identity and student intake are fetched 3–4× per request

`unstable_cache` and React's `cache()` have **zero occurrences anywhere in `src/`.** There is no `getCurrentUser` / `requireUser` helper — `supabase.auth.getUser()` is inlined **48 times** across `src/app/`, and every call is a real network round-trip to `/auth/v1/user` (`@supabase/ssr` does not memoize).

Measured for one `/dashboard` render:

| # | Site | Work |
|---|---|---|
| 1 | `src/middleware.ts:46` | `auth.getUser()` |
| 2 | `src/middleware.ts:101-106` | `student_personal_information`, `student_academic_input`, `student_lifestyle_preference`, `student_subjects` |
| 3 | `src/app/dashboard/page.tsx:68` | `auth.getUser()` |
| 4 | `src/app/dashboard/page.tsx:110-125` | **the same four tables again** |
| 5 | `src/lib/matching/service.ts:260-265` (via `dashboard/_components/matches-peek.tsx:16`) | **`student_academic_input`, `student_lifestyle_preference`, `student_subjects` a third time** |
| 6 | `src/app/dashboard/_components/counsellor-quests.tsx:17` | a third `createServerSupabaseClient()` |
| 7 | `src/hooks/use-user-role.ts:22,29` (via `navbar.tsx:21`, on every shell route) | client-side `auth.getUser()` + `profiles.select('role')` |

Net per dashboard render: **`student_academic_input` ×3, `student_lifestyle_preference` ×3, `student_subjects` ×3, `student_personal_information` ×2, identity ×4.**

The same pattern repeats structurally: `/counsellor` = 3 `auth.getUser()` (`middleware.ts:46`, `counsellor/layout.tsx:14`, `counsellor/page.tsx:22`) and every sibling counsellor page repeats layout+page. `/parent` = 3 (`middleware.ts:46`, `parent/layout.tsx:14`, `parent/_lib/context.ts:22`). Three independent copies of the same 4–5-table intake read exist: `lib/matching/service.ts:260`, `lib/matching/service.ts:939`, `lib/scoring/student_score_loader.ts`.

**Fix:** two `cache()`-wrapped helpers in `src/lib/supabase/` —
```ts
export const getSessionUser  = cache(async () => (await createServerSupabaseClient()).auth.getUser());
export const getStudentIntake = cache(async (userId: string) => { /* the 5-table Promise.all, once */ });
```
React's `cache()` dedupes per-request across the whole component tree, so layout+page+leaf all hit one result.
**Expected saving: ~3 auth round-trips (≈100–300 ms of serial network) and ~8 duplicate table reads removed from every authenticated page render.** This is the single largest TTFB win available.

---

### [HIGH] F3 — `revalidate = 3600` on `/course/[id]` is dead code; the page renders per-request

`src/app/course/[id]/page.tsx:7` declares `export const revalidate = 3600`. Line 14 calls `await createServerSupabaseClient()`, which awaits `cookies()` (`src/lib/supabase/server.ts:6`). Reading `cookies()` opts the segment into dynamic rendering, so **the ISR window never applies.**

**Confirmed by the build output: `ƒ /course/[id]` — dynamic, not `● (ISR)`.**

The query at `:15-19` reads a `programs` row by id — public catalogue data with no per-user component whatsoever. This route is the app's canonical shareable/SEO surface and it currently hits the database on every single view.

Same shape at `src/app/(university-info)/university-search/university/[id]/page.tsx:117`.

**Fix:** use a cookie-free anon client for the catalogue read, keep `revalidate = 3600`, and add `generateStaticParams()` for the top ~500 programmes by `recognition_score` (the repo currently has **zero** `generateStaticParams`).
**Expected saving: `/course/[id]` becomes a CDN hit — TTFB from ~200-400 ms (DB round-trip) to ~20 ms, and the DB stops serving read traffic proportional to page views.**

---

### [HIGH] F4 — React Query is mounted app-wide with zero consumers

`src/app/providers.tsx:3,18,21` instantiates a `QueryClient` and wraps the entire app in `QueryClientProvider`. Verified: **zero `useQuery`, `useMutation`, `useInfiniteQuery`, `useSuspenseQuery`, `useQueryClient`, or `queryKey` occurrences in all of `src/`.** All client data fetching is hand-rolled `useEffect` + `getBrowserSupabaseClient()`.

The library is present in prod chunk `5769` (44 KB raw / 14.1 kB gz, shared with Radix tooltip) on every route.

There is consequently no `staleTime`/`gcTime`/`refetchOnWindowFocus` configuration to audit — `new QueryClient()` at `:18` takes no options.

**Fix:** either delete the provider and the two `@tanstack/*` dependencies, or adopt it for the ~10 hand-rolled client fetch hooks (`use-help-requests`, `use-notifications`, `use-help-thread`, `use-search-results`…) which would then get request dedup and caching for free.
**Expected saving if deleted: ~8-12 kB gz off every route.** (Note `ReactQueryDevtools` at `providers.tsx:4` **is** correctly tree-shaken from prod — verified absent from every chunk in `.next/static`.)

---

### [HIGH] F5 — Three dead dependency trees, including a second unused LLM SDK

| Package | Installed | Imports in repo |
|---|---:|---|
| `openai` ^6.34.0 | **13 MB** | **0** |
| `date-fns` 3.3.1 | **18 MB** | **0** (the repo uses its own `src/lib/utils/dates.ts`) |
| `@dnd-kit/core` + `/sortable` + `/utilities` | **2.2 MB** | **0** |

Grepped across `src/`, `scripts/`, `__tests__/`, and config — the only occurrences are the `package.json` lines themselves.

Answering the brief directly: **`openai` and `@google/genai` are not both used.** `@google/genai` is the sole LLM SDK (12 import sites, all in `src/app/api/**` and `src/lib/chat/**` — **all server-only, verified absent from every client chunk** ✅). `openai` is declared and never imported.

**Zero bundle cost** (never imported ⇒ never bundled), but ~33 MB of `npm ci` time on every CI run and every Vercel build, plus three unmonitored supply-chain surfaces.
**Fix:** `npm uninstall openai date-fns @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`. Also move `@tanstack/react-query-devtools` to `devDependencies`.

---

### [HIGH] F6 — `/api/essay-assist` streams to a disconnected client forever; no `maxDuration` on any SSE route

`src/app/api/essay-assist/route.ts:205-232` builds a `ReadableStream` around a Gemini stream with:
- **no `abortSignal`** passed to `generateContentStream` (contrast `src/app/api/chat/route.ts:217` → `abortSignal: req.signal`, correctly threaded through `src/lib/chat/gemini.ts:41,59-63`)
- **no `closed` guard** on `controller.enqueue` (contrast `api/chat/route.ts:229,234-236`)

When the client disconnects mid-generation, the `for await` loop at `:213` keeps pulling from Gemini and keeps calling `enqueue` on a dead controller. The model keeps generating and keeps billing.

Additionally: **`export const maxDuration` does not exist anywhere in the repo**, and there is no `vercel.json`. `/api/chat` runs a tool loop of up to `MAX_TOOL_ROUNDS = 5` (`src/lib/chat/gemini.ts:26`) under the platform default timeout.

Minor, same file family: `api/chat/route.ts:308` returns a bare `Response` without `X-Accel-Buffering: no`, so an intermediary proxy may coalesce the SSE stream and destroy perceived streaming latency.

**Fix:** mirror the `/api/chat` pattern in `essay-assist` (`abortSignal: req.signal` + `closed` flag); add `export const maxDuration = 60` to the three SSE routes; add `'X-Accel-Buffering': 'no'` to all three.
**Expected saving: eliminates orphaned model generations (direct token spend) and unbounded function-hold time.**

---

### [MEDIUM] F7 — O(n×m) scan on every search fetch, one line from the data that fixes it

`src/hooks/use-search-results.ts:647`:
```js
? text.uniIds.filter((id) => facetMatched.some((u) => u.id === id))
```
`text.uniIds` is capped at 100 (`:173`); `facetMatched` is up to the full ~2,926-row university list. Worst case **292,600 comparisons on the main thread per search fetch** — and search fetches are debounce-driven, so this runs repeatedly while typing.

`facetMatchedIds` — the exact array needed — is already materialised **13 lines earlier at `:634`**.

**Fix:** `const facetIdSet = new Set(facetMatchedIds);` then `text.uniIds.filter((id) => facetIdSet.has(id))`.
**Expected saving: 292,600 → 100 comparisons. One-line change, largest single runtime win in the app.**

Two adjacent issues in the same hook:
- `:701-711` recomputes the ranked/unranked cohort with **two `.filter()` + two `.sort()` over 2,926 rows on every fetch** (the comment at `:696` calls it "cheap"; two sorts of 2,926 rows is ~68k comparisons).
- `:167-197` `resolveText()` calls `.toLowerCase()` **per university per query word**, and re-runs `lookup()` once per word (`:181-186`) — N×2,926 string allocations. Precompute a lowercased name once when `universitiesCache` is populated at `:109`.

---

### [MEDIUM] F8 — Unbounded catalogue fetch into the browser + an unvirtualised infinite list

**(a)** `src/hooks/use-search-results.ts:103-105` selects the universities table with **no `.limit()`**:
```js
const { data, error } = await supabase
  .from('universities')
  .select('id, name, country, recognition_score, rank_overall');
```
~2,926 rows into the JS heap. It is session-cached (`:91`) so it is one fetch, but it is a blocking payload on first search and the source array for every hot-path scan in F7. `src/app/api/search/filters/route.ts:24` does the same server-side and serialises the full list to the client.

**(b)** **The repo contains no virtualisation library at all** — zero hits for `react-window`, `@tanstack/react-virtual`, `react-virtuoso`, `useVirtualizer`.

`src/app/university-search/search/page.tsx:674` maps `filteredResults`, which **accumulates without a cap** (`use-search-results.ts:975-976` appends each page to `prev`) and is auto-loaded by an `IntersectionObserver` at `search/page.tsx:529-541`. Scrolling a 119k catalogue at `PAGE_SIZE = 50` reaches 500–1,000+ live `motion.div` + `UniversityCard` nodes.

Mitigation present but partial: `search/page.tsx:678-683` uses `[content-visibility:auto]` + `[contain-intrinsic-size:...]`, which skips **paint and layout** for offscreen cards but does **not** stop React reconciling them or framer-motion tracking each `motion.div` (`:677`).

Latent duplicate: `src/app/scholarships/page.tsx:60` does `select('*')` with no limit into `scholarship-explorer.tsx:278`'s unvirtualised map — harmless today only because the table doesn't exist yet and it falls back to sample data.

**Fix:** cap accumulated `results` at ~300 with a "load more" reset, or adopt `@tanstack/react-virtual` for the results grid. Strip the `motion.div` wrapper on list items beyond the first page.
**Expected saving: bounded DOM/reconciliation cost; removes the current linear degradation of scroll performance with scroll depth.**

---

### [MEDIUM] F9 — framer-motion is anchored to the root layout, so it ships on 40 of 47 pages

`src/app/providers.tsx:6` imports `MotionConfig` and mounts it at `:25`, inside the root layout's `<Providers>`. That single import guarantees framer-motion in every route's critical path regardless of whether the page animates.

**Measured: chunk `8293`, 114.5 KB raw / 37.5 kB gz, on 40/47 pages.** framer-motion is *not* in Next's default `optimizePackageImports` list (verified against `node_modules/next/dist`), and `next.config.mjs` has **no `experimental` block at all** — so no barrel optimisation is applied.

`MotionConfig reducedMotion="user"` is genuinely load-bearing (the comment at `providers.tsx:22-24` is correct — CSS media queries can't govern JS-driven styles). But 94 files import framer-motion, many for a single fade that a CSS transition would do.

**Fix (incremental, low risk):** add `experimental: { optimizePackageImports: ['framer-motion', 'lucide-react', '@radix-ui/react-*'] }` to `next.config.mjs` — near-zero-risk, typically 10-20 % off barrel-imported chunks. **Fix (structural):** replace the ~30 simple `motion.div` fade/slide wrappers (`animated-section.tsx`, `section-reveal.tsx`, list-item fades) with CSS `@keyframes` + `prefers-reduced-motion`, then the root `MotionConfig` can move down into the routes that genuinely need it.
**Expected saving: 4-8 kB gz from barrel optimisation alone; up to 37.5 kB gz on non-animated routes if the root anchor is removed.**

---

### [MEDIUM] F10 — 21 non-composited animations force layout every frame

Animating `height`, `width` (percent), and `marginBottom` runs the full layout→paint→composite pipeline per frame instead of compositor-only transform/opacity.

**`height: 'auto'` accordions (15 sites):** `counsellor/universities/_universities-client.tsx:645` · `counsellor/_components/deadline-widget.tsx:108` · `student-roster.tsx:149,173` · `activity-feed.tsx:116` · `analytics-drilldown.tsx:299` · `top-students.tsx:84` · `student-alerts.tsx:87` · `assistant/conversation-rail.tsx:279` · `landing/FAQSection.tsx:106` · `university-search/filters/FacetGroup.tsx:48` · `counsellor/help-requests-widget.tsx:97` · `toolbox/deadline-timeline-tool.tsx:170,324` · `toolbox/chances-calculator.tsx:329`

**Percentage-`width` progress bars (6 sites) — should be `scaleX` + `transform-origin: left`:** `counsellor/_components/outcome-dashboard.tsx:112` · `profile/_components/profile-progress-card.tsx:83` · `profile/_components/StudentIntakeForm.tsx:1428` · `dashboard/task-list.tsx:45` · `toolbox/deadline-timeline-tool.tsx:162` · `toolbox/chances-calculator.tsx:318`

**`marginBottom` animated alongside height:** `counsellor/universities/_universities-client.tsx:754`

Separately, **19 bare `layout` props** force cross-frame layout measurement; `counsellor/_components/student-roster.tsx:299` and `:306` are **nested**, which compounds measurement.

**Worst compounding case: `src/app/counsellor/_components/activity-feed.tsx`** combines an unmemoised sort with `new Date()` in the comparator (`:80-87`), a `layout` prop (`:189`), and a `height: 'auto'` animation (`:116`) in one component.

**Fix:** progress bars → `scaleX` (mechanical, 6 sites, zero visual change). Accordions → CSS grid-rows `0fr`→`1fr` trick, or accept (height animation is hard to avoid for auto-sized content).
**Expected saving: the 6 progress bars drop from layout-per-frame to compositor-only — directly removes jank on `/profile` and `/toolbox/chances`.**

---

### [MEDIUM] F11 — Middleware runs an auth network hop, and up to 4 DB queries, before every protected page

`src/middleware.ts:46` calls `await supabase.auth.getUser()` on **every** request matching `middleware.ts:182` — a network round-trip to Supabase Auth that blocks the response. When neither the `onboarding_complete` nor a fresh `onboarding_status` cookie is present, `:101-106` fires **four more DB queries** before the page even starts rendering.

**Measured middleware bundle: 86.9 kB** — large for edge, and the build warns that `@supabase/realtime-js` uses Node APIs unsupported in the Edge Runtime (pulled in transitively via `@supabase/ssr`).

The cookie-caching at `:76-99` is thoughtful and does mitigate the common case. But the auth hop at `:46` is unconditional, and it is then **repeated** by the layout and page (F2).

**Fix:** F2's `cache()` helper cannot cross the middleware boundary, but the middleware result can be forwarded — set a request header with the resolved user id and have the page read it instead of re-calling `auth.getUser()`. Also consider `getSession()` (JWT-local, no network) for the redirect decision, keeping `getUser()` only where forgery matters.
**Expected saving: one full auth round-trip off the critical path of every protected navigation.**

---

### [MEDIUM] F12 — No `staleTimes` configured, so client-side navigation refetches everything

`next.config.mjs` has **no `experimental` block**. In Next 15 the default client Router Cache `staleTimes.dynamic` is **0 seconds** — and since nearly every route in this app is dynamic (22 explicit `force-dynamic` + 29 cookie-forced), **every back/forward and every re-visit within a session refetches the full RSC payload from the server.**

Combined with F2 (no request dedup) and F11 (auth hop per request), a user toggling between `/dashboard` and `/matches` pays the full server cost each way.

**Fix:**
```js
experimental: { staleTimes: { dynamic: 30, static: 180 } }
```
**Expected saving: back-navigation within 30 s becomes instant, eliminating a full server render + auth hop + DB queries per bounce.** One-line config change; the risk is showing up-to-30 s-stale data on return navigation, which is acceptable for every screen here except the inbox (which has its own realtime poll anyway).

---

### [MEDIUM] F13 — `remotePatterns: hostname: '**'` turns the image optimizer into an open proxy

`next.config.mjs:9` allows **any HTTPS host** as an image source. The actual remote sources are university logo URLs (`course/[id]/_components/course-hero.tsx:60`, `university-card.tsx:170`, `ComparisonModal.tsx:436`) — a small, enumerable set of CDNs.

As configured, anyone can drive arbitrary third-party images through `/_next/image`, which on Vercel is billed per source image transformed and consumes optimizer CPU.

**Fix:** enumerate the actual logo hosts, or route logos through Supabase Storage (`NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET` already exists) and pin `remotePatterns` to that one host. Add `minimumCacheTTL: 2592000` while there.
**Expected saving: removes an unbounded cost vector; longer TTL cuts repeat transformations.**

---

### [LOW] F14 — Seven `loading.tsx` files drag the full app shell into the loading chunk

`profile/loading.tsx:1`, `dashboard/loading.tsx:1`, `scholarships/loading.tsx:1`, `matches/loading.tsx:1`, `appointment/loading.tsx:1`, `assistant/loading.tsx:1`, `inbox/loading.tsx:1` all import `DashboardShell` from `@/components/layout/shell`, whose graph (`shell.tsx:2-8`) includes `CommandPalette` (imports framer-motion at `command-palette.tsx:12`) and `PageTransition` (`page-transition.tsx:5`). `matches/loading.tsx:2` additionally imports `SectionNav` (framer-motion at `section-nav.tsx:6`).

This is why `/dashboard/loading`, `/matches/loading`, `/scholarships/loading` etc. all appear in the chunk manifest carrying the 57.4 kB Supabase and 37.5 kB framer chunks — **the skeleton is as heavy as the page.**

Worst ratio: `src/app/(university-info)/university-search/university/[id]/loading.tsx` is **6 lines** but imports the full 352-line `'use client'` `UniversityInformation` component; the sibling `error.tsx:5` re-imports it too.

**Fix:** loading skeletons should import only `Skeleton` / `PageHeroSkeleton` (32 of the 40 already do this correctly) and render the shell chrome as static markup. The remaining 33 `loading.tsx` files are genuinely light — this is a 7-file cleanup.

---

### [LOW] F15 — Seven render-body sorts, several allocating `Date` objects inside the comparator

Not in `useMemo`, so they re-run on every render including unrelated state changes:

| File:line | Cost |
|---|---|
| `src/components/profile/evolution-timeline.tsx:57` | `[...entries].sort(...)` with **two `new Date()` per comparison** → 2·n·log n Date allocations |
| `src/app/counsellor/_components/activity-feed.tsx:80-87` | `.filter().sort()`, `new Date()` in comparator at `:86` |
| `src/app/counsellor/_components/top-students.tsx:38-49` | **two full sorts back to back**, re-run on every pin/hide toggle |
| `src/app/counsellor/_components/at-risk-panel.tsx:39-42` | sort + filter + slice, re-run on every filter/expand |
| `src/app/counsellor/_components/deadline-widget.tsx:70-79` | uncached helper call + filter + sort |
| `src/app/counsellor/_components/student-alerts.tsx:48-58` | `flatMap` + filter + sort |
| `src/app/parent/progress/_progress-board.tsx:74` | `[...applications].sort(...)` |

**Fix:** `useMemo`, and precompute timestamps once rather than `new Date()` per comparison. Note the codebase already does this correctly in 7 other places (`chances-calculator.tsx:94-99`, `application-list.tsx:66`, `command-palette.tsx:225`, …) — this is inconsistency, not ignorance.

---

### [LOW] F16 — Cache-header gaps on read-only API routes

The search routes are well-handled (`filter-options` `s-maxage=3600`, `filters` `s-maxage=300`, `suggestions` `s-maxage=60`, `calendar-feed` `s-maxage=300` + `next: { revalidate: 300 }` on its outbound fetches). Gaps:

- **`src/app/api/admin/catalog-health/route.ts`** — GET, **no cache headers**, and it runs two `count: 'exact'` full-table counts at `:42-43` (on a 119k-row table) plus a sample select at `:52-57`. Auth-gated, so `private, max-age=60` is the right header, not `public`.
- `src/app/api/search/suggestions/route.ts:68` — the sub-2-character exit returns a **constant empty body** under `no-store`, so it reaches the origin every time. Should be `public, s-maxage=86400`.
- `src/app/api/calendar-feed/route.ts:226` — `s-maxage=300` with **no `stale-while-revalidate`**, unlike its three siblings.
- `src/app/api/match/route.ts` and `src/app/api/profile/export/route.ts` — GET with no headers (per-user, so `private, no-store` is correct — just make it explicit).

The other 12 header-less routes are all POST/PATCH/DELETE mutations; harmless.

---

### [LOW] F17 — `papaparse` ships to the browser (scoped to `/admin`)

`src/app/admin/_components/import-panel.tsx:4` statically imports Papa. Verified: it lands in chunk `6318` (29.9 KB raw, ~9 kB gz), reachable **only from `/admin/page`** — so the blast radius is one admin-only route at 205 kB First Load. Parsing only happens on file-drop.
**Fix (optional):** `const Papa = (await import('papaparse')).default` inside the drop handler. −9 kB gz on `/admin`.

---

### [LOW] F18 — Stale `caniuse-lite` inflates every chunk

Build warns: `browsers data (caniuse-lite) is 9 months old`. Next targets a wider/older browser matrix than reality, adding transpilation and polyfill to **every** chunk.
**Fix:** `npx update-browserslist-db@latest`, and add an explicit `browserslist` key to `package.json` (there is none) so the target is pinned rather than drifting. Typically 2-5 % off total JS.

---

### [LOW] F19 — One unbatched `ResizeObserver` in the landing scrollytelling

`src/components/landing-preview/how-it-works-scrub.tsx:612` — `new ResizeObserver(measure)` invokes `measure` **directly**, unlike `preview-nav.tsx:126` which correctly routes the same pattern through a rAF `schedule()` guard (`preview-nav.tsx:108-114`). `measure` (`:555`) performs a forced-layout read cascade at `:560-590` (`offsetWidth`, `offsetTop`, `offsetHeight` per node). During a resize drag this fires synchronously per observation.
**Fix:** wrap in the existing `schedule` pattern from `preview-nav.tsx:108-114`.

---

## What is already right (do not regress these)

Measured, not assumed:

- **Code splitting where it counts.** `@tiptap` + ProseMirror (**422 KB raw / ~130 kB gz** across chunks `1551`, `70e0d97a`, `54a60aa6`, `7911`) is **async-only — it appears in zero route manifests.** This is why `/toolbox/essay-workshop` is the app's *lightest* route at **111 kB**, below the 155 kB floor of every other feature page. `lenis` is likewise deferred via `void import('lenis')` (`smooth-scroll.tsx:227`). Both `next/dynamic` uses follow the CLAUDE.md `'use client'`-wrapper rule correctly.
- **Fonts.** `next/font/google` (`layout.tsx:3,10-22`) with `display: 'swap'` **and `adjustFontFallback: true`** — self-hosted, zero external requests, CLS-guarded.
- **Images.** **Zero raw `<img>` tags in `src/`.** All 7 image sites use `next/image` with explicit `sizes`, and `priority` on the two LCP candidates (`preview-hero.tsx:158,189`, `(auth)/layout.tsx:22,51`). `public/` is only 304 KB total.
- **Server-side parallelism.** 33 `Promise.all` sites, several with comments recording the waterfall they replaced (`profile/page.tsx:35` — *"serial awaits were a 7-hop waterfall"*).
- **The realtime poll engine** (`src/hooks/use-realtime-poll.ts`) has exponential backoff (`:111`), relaxes to 30 s once subscribed, and **pauses entirely on `document.hidden`** (`:104,109,130`). Idle tabs cost nothing.
- **Scroll architecture.** Only **two** `useScroll()` subscriptions site-wide, behind one shared `PageScrollProvider` (`ascent-scroll.tsx:132-137`) whose comment documents exactly why. Every scroll/resize/pointer listener is `{ passive: true }` and rAF-batched (`preview-nav.tsx:126-134`, `cursor-grid.tsx:475-477`). No `wheel` or `touch*` listeners at all. F19 is the single exception.
- **Context values.** All 8 `.Provider value=` sites are `useMemo`'d — zero inline object literals. **No unmemoised-context re-render problem exists.**
- **`useState` initialisers.** Zero eager-initialiser bugs; the expensive ones use the lazy form (`search/page.tsx:205`).
- **`/api/chat` streaming** handles abort correctly (`route.ts:217` → `gemini.ts:41,59-63`), guards `enqueue` after disconnect (`:229,234-236`), and persists partial turns in a `finally` backstop (`:293-304`). F6 is about `essay-assist` failing to copy it.
- **Programme scoring runs server-side**, bounded at `programLimit = 5000` (`lib/matching/service.ts:251`) selecting only `id,metadata` (`:497`) — never `select('*')`, never in the browser.
- **`@google/genai` is verified server-only**; `ReactQueryDevtools` is verified tree-shaken from production.

---

## Target performance architecture

### Rendering policy, per route class

| Class | Routes | Policy |
|---|---|---|
| **Public / marketing** | `/`, `/login` | **Fully static.** No Supabase in the critical bundle (F1). Session probing behind a dynamic import inside an effect. |
| **Public catalogue** | `/course/[id]`, `/university-search/university/[id]` | **ISR, `revalidate = 3600`,** served by a *cookie-free* anon client. `generateStaticParams()` for the top ~500 by `recognition_score`; the rest fill in on demand. (F3) |
| **Authed shell** | `/dashboard`, `/profile`, `/applications/*`, `/matches`, `/counsellor/*`, `/parent/*` | Dynamic — but **one** `cache()`-deduped identity + intake read per request (F2), and `staleTimes.dynamic = 30` so back-navigation is free (F12). Shell chrome streams immediately; each data region gets its own `<Suspense>` boundary. |
| **Interactive tools** | `/university-search/search`, `/assistant`, `/toolbox/essay-workshop` | Thin dynamic server shell + `next/dynamic` client payload. `essay-workshop` is the reference implementation — copy it. |
| **Admin** | `/admin/*` | Dynamic, heavy deps (`papaparse`) behind interaction-triggered dynamic imports. |

**Streaming.** Only **3** `<Suspense>` server-streaming boundaries exist today (`dashboard/page.tsx:488,496`, `course/[id]/page.tsx:35`). Every other dynamic page blocks its entire data fetch before sending a byte of HTML. Rule: **any server component whose data fetch is not needed for the page's LCP element gets its own `<Suspense>` boundary with a skeleton.** Prime candidates: `/counsellor` widget grid, `/matches` list, `/applications` board, `/profile` completion panel.

### Code-splitting rules

1. Any dependency **> 20 kB gz** used by **fewer than a third of routes** must be behind `next/dynamic`. Currently satisfied by tiptap and lenis; **violated by `react-markdown`** (33.4 kB gz, 3 routes — split it out of `chat/shared.tsx:10` and `toolbox/essay-ai-panel.tsx:9`, saving ~33 kB gz on the three assistant routes: 336 → ~303 kB).
2. Anything triggered only by user interaction (file pickers, editors, modals with heavy bodies) imports its payload **in the handler**, not at module scope. Applies to `papaparse` (F17).
3. No heavy import in a `loading.tsx` or `error.tsx` — skeletons import `Skeleton` and nothing else (F14).
4. `next/dynamic` + `ssr: false` lives in a `'use client'` wrapper (existing CLAUDE.md rule — currently followed in both instances; keep it).

### Data-fetch policy

1. **One `cache()`-wrapped accessor per logical entity.** `getSessionUser()`, `getStudentIntake(userId)`, `getProfile(userId)`. Direct `auth.getUser()` calls in `page.tsx`/`layout.tsx` are banned — lint-enforceable.
2. **Middleware forwards, never duplicates.** Resolved user id goes onto a request header; pages read the header.
3. **Public catalogue reads never touch `cookies()`** — that's what makes ISR possible.
4. **Read-only GET API routes always set an explicit `Cache-Control`**, even if it's `private, no-store`. No route ships with an absent header.
5. **Either use React Query or remove it** (F4). If adopted, defaults go in `providers.tsx:18`: `staleTime: 30_000, gcTime: 5 * 60_000, refetchOnWindowFocus: false`.

### First Load JS budget

Current shared baseline is 103 kB (React 19 + Next runtime, ~98 kB of it irreducible). Budgets set just below today's numbers so the ratchet only tightens:

| Route class | Budget | Today (worst) | Gap |
|---|---:|---:|---|
| Shared by all | **105 kB** | 103 kB | ✅ pass — freeze it here |
| Redirect / stub | **110 kB** | 103 kB | ✅ pass |
| Public / marketing | **175 kB** | **260 kB** (`/`) | ❌ −85 kB (F1 gives 57 kB; F4 + F9 give the rest) |
| Authed shell | **200 kB** | **292 kB** (`/scholarships`) | ❌ −92 kB (F4, F9, F14) |
| Interactive tool | **240 kB** | **336 kB** (`/assistant`) | ❌ −96 kB (react-markdown split gives 33 kB) |
| Admin | **210 kB** | 205 kB | ✅ pass |
| Global CSS | **30 kB gz** | 23.5 kB gz | ✅ pass |
| Middleware | **90 kB** | 86.9 kB | ✅ pass — but it should shrink, not be defended |

### Enforcing it in CI

`.github/workflows/ci.yml` already runs `npm run build`. Add one step after it that parses `.next/app-build-manifest.json` (the same source used for every measurement in this report), gzips each chunk, sums per route, and fails on budget breach:

```js
// scripts/check-bundle-budget.mjs — run as `node scripts/check-bundle-budget.mjs` after `npm run build`
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const BUDGETS = [            // first match wins; kB gzip
  [/^\/(page)?$/,                       175], [/^\/\(auth\)\/login/,          175],
  [/^\/(assistant|university-search\/search|toolbox\/essay-workshop)/, 240],
  [/^\/admin/,                          210],
  [/./,                                 200], // authed shell default
];
const pages = JSON.parse(readFileSync('.next/app-build-manifest.json', 'utf8')).pages;
const size = f => existsSync(`.next/${f}`) ? gzipSync(readFileSync(`.next/${f}`)).length / 1024 : 0;

let failed = false;
for (const [route, files] of Object.entries(pages)) {
  if (!route.endsWith('/page')) continue;
  const kb = files.filter(f => f.endsWith('.js')).reduce((n, f) => n + size(f), 0);
  const budget = BUDGETS.find(([re]) => re.test(route.replace(/\/page$/, '') || '/'))[1];
  if (kb > budget) { console.error(`✗ ${route}: ${kb.toFixed(1)} kB > ${budget} kB`); failed = true; }
}
process.exit(failed ? 1 : 0);
```

Set the initial budgets to **today's measured numbers** so CI goes green immediately, then ratchet each one down as findings land. Pair it with a `depcheck`/`knip` step to stop F5-style dead dependencies recurring.

---

## Effort

| # | Finding | Effort | Risk | Notes |
|---|---|:--:|:--:|---|
| F7 | O(n×m) `Set` fix in search | **S** | Very low | One line; `facetMatchedIds` already exists at `:634` |
| F5 | Remove 3 dead dependency trees | **S** | Very low | Verified zero imports; `npm uninstall` |
| F12 | `experimental.staleTimes` | **S** | Low | One config line; only risk is ≤30 s stale on back-nav |
| F18 | Update `caniuse-lite` + pin browserslist | **S** | Very low | Mechanical |
| F1 | Dynamic-import Supabase in `use-launch-href` | **S** | Low | −57 kB gz on `/`; async path already exists |
| F3 | Fix dead ISR on `/course/[id]` | **S** | Low | Needs a cookie-free catalogue client; verify with `●` in build output |
| F6 | `abortSignal` + `maxDuration` on SSE routes | **S** | Low | Copy the working `/api/chat` pattern |
| F16 | Cache headers on read-only GETs | **S** | Low | 4 routes |
| F17 | Dynamic-import `papaparse` | **S** | Very low | `/admin` only |
| F19 | rAF-batch the one `ResizeObserver` | **S** | Very low | Pattern exists at `preview-nav.tsx:108-114` |
| F13 | Narrow `remotePatterns` | **S** | **Medium** | Must enumerate every real logo host first or images 404 |
| F10 | Progress bars → `scaleX` | **S** | Low | 6 sites, mechanical, zero visual change |
| F15 | `useMemo` the 7 render-body sorts | **M** | Low | Precompute timestamps out of comparators |
| F14 | Slim the 7 heavy `loading.tsx` | **M** | Low | 33 of 40 already correct — copy them |
| F4 | Remove or adopt React Query | **M** | Low if removed / **M** if adopted | Removal is a 3-line delete |
| — | Split `react-markdown` out of the 3 assistant routes | **M** | Low | −33 kB gz; same wrapper pattern as `chatbot-widget-lazy` |
| F9 | `optimizePackageImports` (config only) | **S** | Low | Ship this first |
| F9 | Un-anchor framer-motion from root layout | **L** | **Medium** | Touches ~30 components; must preserve `reducedMotion="user"` semantics |
| F11 | Forward middleware auth instead of re-fetching | **M** | **Medium** | Auth-adjacent — the repo has shipped an auth-bypass bug before; test hard |
| F2 | `cache()`-wrapped identity + intake accessors | **L** | **Medium** | Highest TTFB payoff; touches ~30 files; three duplicate intake readers to unify |
| F8 | Virtualise the search results grid | **L** | **Medium** | New dependency; interacts with `content-visibility` and the `IntersectionObserver` loader |
| F10 | Accordion `height:'auto'` → CSS grid-rows | **L** | **Medium** | 15 sites, real visual-regression surface |
| — | Add `<Suspense>` streaming to the 6 heaviest pages | **L** | Low | Best paired with F2 |

**Suggested order:** all **S**-effort items first (F7, F5, F12, F18, F1, F3, F6, F16, F17, F19, F10-bars, F9-config) — that is roughly a day's work, lands ~60-90 kB gz off the heaviest routes, fixes the dead ISR and the leaking SSE stream, and costs almost no risk. Then F2 (the TTFB win), then the **L**-effort structural items behind the CI budget ratchet.

