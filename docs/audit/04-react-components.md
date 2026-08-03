# Audit 04 — React & Next component architecture

Scope: composition, state, and the server/client boundary **in practice**. Judged against
the house standards in the `vercel-react-best-practices` and `vercel-composition-patterns`
skills. Read-only; no code changed.

Repo: `/Users/gregfranck/Ascenda` · branch `fix/ui-phase0-bugs` · Next 15 App Router, React 19.

---

## Current state

### Server / client split

| Metric | Count |
|---|---|
| `.ts` + `.tsx` under `src/` | 441 |
| `.tsx` files | 307 |
| Files with `'use client'` | 204 (187 of them `.tsx`) |
| `page.tsx` files | 46 |
| **`page.tsx` that are client components** | **5** (11%) |
| **`layout.tsx` that are client components** | **0 of 12** |

The *route-level* boundary is healthy — this is the strongest part of the architecture.
The five client pages are `appointment`, `role-select`, `university-search/shortlist`,
`university-search/search`, `university-search/results`. Every other page is a server
component and most already parallelise their queries with `Promise.all`
(`src/app/dashboard/page.tsx:85`, `src/app/profile/page.tsx:42`,
`src/app/profile/wizard/page.tsx:35`).

The problem is not *where* `'use client'` sits in the route tree — it's how much lives
**inside** a single client component once you cross the boundary.

Of the 204 client files, **49 contain no hooks, no event handlers and no browser APIs**.
Only **15** could actually drop the directive — the rest are `error.tsx` boundaries (12,
required by Next), `framer-motion` importers (17), Radix primitives (2), `next/dynamic`
wrappers (2), and one class-based error boundary
(`src/components/assistant/widgets/index.tsx:32`, which has `getDerivedStateFromError` and
therefore cannot be a server component). Of those 15, **13 are a no-op for bundle size**
because their only importers are themselves client components — the fix belongs at the
boundary root, not the leaf. See [MED-9].

### State & effects

| Metric | Count |
|---|---|
| `useState` call sites | 353 |
| `useEffect` call sites | **166** across 78 files |
| `useMemo` | 69 |
| `useCallback` | 106 |
| **`useReducer`** | **0** |
| `createContext` | 8 |
| `React.memo` | **0** |
| `// eslint-disable … exhaustive-deps` | 7 |
| `forwardRef` (React 19 makes this unnecessary) | 34 uses across 11 `ui/` primitives |

### Libraries installed vs used

| Dependency | Status |
|---|---|
| `@tanstack/react-query` 5.90.2 + devtools | **Provider mounted, ZERO call sites.** `useQuery`/`useMutation`/`useInfiniteQuery` appear nowhere in `src/` |
| `react-hook-form` ^7.82.0 | **1 of 6 forms** (`src/components/forms/auth-form.tsx:23`) |
| `@hookform/resolvers` 3.3.4 | same 1 file |
| `zod` 3.22.4 | 3 files; `src/lib/validation/profile.ts` (82 lines) is imported by **nobody** |
| virtualisation (`react-window`/`@tanstack/react-virtual`) | absent — 2 files use `content-visibility` instead |

### File size

37 files over 400 lines, 15 over 600. Excluding generated types and `lib/`, the component
offenders are:

```
2553  src/app/profile/_components/StudentIntakeForm.tsx
1010  src/hooks/use-search-results.ts
 986  src/app/counsellor/universities/_universities-client.tsx
 919  src/components/help/help-thread-drawer.tsx
 822  src/components/assistant/assistant-workspace.tsx
 738  src/app/university-search/search/page.tsx
 737  src/components/chat/chatbot-widget.tsx
 708  src/components/landing-preview/how-it-works-scrub.tsx
 639  src/app/counsellor/_analytics-client.tsx
 604  src/components/university-search/IntelligentSearchBar.tsx
 563  src/app/counsellor/_components/widget-grid-core.tsx
 507  src/app/dashboard/page.tsx
```

### Error / loading / not-found boundary coverage — **a strength**

| Boundary | Count | Verdict |
|---|---|---|
| `loading.tsx` | 40 (for 46 pages) | Excellent. Missing only: `/`, `/shortlist`, `/role-select`, `/university-search/search`, `/university-search/results`, `/(auth)/login` — four of which are client pages that render their own skeletons |
| `error.tsx` | 13 + root catch-all `src/app/error.tsx` | Good. Every segment is covered, either directly or by the root |
| `global-error.tsx` | 1 | Present |
| `not-found.tsx` | **1** (root only) | Gap — see [MED-6] |
| `<Suspense>` | 7 sites | Used well: `src/app/dashboard/page.tsx:488` streams the expensive match compute behind a skeleton |

Shared `ErrorState` / `Skeleton` / `EmptyState` primitives exist and the route boundaries
consume them. This part of the codebase does not need work.

### Shared-primitive adoption (`src/components/ui/`, 16 primitives)

| Primitive | Files importing | Inline duplicates | Verdict |
|---|---|---|---|
| `skeleton.tsx` | 45 | 7 | Good |
| `button.tsx` | 45 | — | Good |
| `toast.tsx` | 12 | 0 | Clean |
| `empty-state.tsx` | 17 | **~44 sites / ~35 files** | Poor |
| `dialog.tsx` | 7 | 4 hand-rolled overlays | Moderate |
| `table.tsx` | 3 | 1 | Good |
| `tabs.tsx` | 2 | 2 tablists + 20 chip rows | Poor |
| `card.tsx` | 3 | `.surface-card` in 54 files | Two APIs, one visual |
| **`badge.tsx`** | **1** | **132 inline pills / 55 files** | **Worst** |
| `cn()` (`src/lib/utils.ts:34`) | 137 | 0 | Clean |

---

## Findings

### [CRITICAL] `@tanstack/react-query` is mounted app-wide but never used; a 1,010-line hand-rolled fetch state machine sits where `useInfiniteQuery` belongs

**Files:** `src/app/providers.tsx:18-21,36` · `src/hooks/use-search-results.ts:502-1010`

`providers.tsx` creates a `QueryClient`, wraps the entire app in `QueryClientProvider`, and
ships `ReactQueryDevtools` in development. There is not a single `useQuery`,
`useMutation`, or `useInfiniteQuery` anywhere in `src/`.

Meanwhile `useSearchResults` hand-rolls exactly what the library provides:

```ts
// src/hooks/use-search-results.ts:503-549
const [results, setResults] = useState<ProgramSearchResult[]>([]);
const [isLoading, setIsLoading] = useState(true);
const [isLoadingMore, setIsLoadingMore] = useState(false);
const [hasMore, setHasMore] = useState(true);
const [error, setError] = useState<string | null>(null);
const [totalCount, setTotalCount] = useState<number | null>(null);
// … 6 more refs …
const [requestId, setRequestId] = useState(0);   // manual fetch trigger
```

`requestId` is a counter bumped by a reset effect (`:552-569`) and by `loadMore` (`:986`),
purely to re-fire a second effect (`:573`). That is a re-implementation of query keys.
Also hand-rolled: `AbortController` cancellation (`:578`), a module-level promise cache to
dedupe the universities fetch (`:92-116`), cursor pagination (`:122-138`), and
request-race protection.

The same pattern is duplicated at smaller scale in
`src/app/counsellor/universities/_universities-client.tsx:143-275` (debounce + abort +
`isSearching`/`hasSearched`/`searchFailed` triad) and
`src/components/university-search/IntelligentSearchBar.tsx:53-55` (`debounceRef`,
`latestRequestRef`, `activeRequests: AbortController[]`).

**Impact:** ~600 lines of bespoke concurrency code with no cache, no dedup across
components, no stale-while-revalidate, no retry — plus the react-query bundle shipped to
every user for nothing.

**Fix:** Pick one. Either (a) adopt react-query for client-side reads — `useInfiniteQuery`
with `queryKey: ['programs', filtersKey]` replaces the whole `requestId`/ref machinery
and keeps the load-bearing query *shapes* (the timeout-avoiding SQL) untouched inside
`queryFn`; or (b) delete `@tanstack/react-query`, its devtools, and the provider. Do not
leave it half-adopted. Option (a) also fixes [HIGH-2].

---

### [HIGH] `useUserRole` refetches the user's role from the browser **four times per page load**

**Files:** `src/hooks/use-user-role.ts:6-51` · call sites `src/components/layout/navbar.tsx:21`,
`src/components/layout/sidebar.tsx:18`, `src/components/layout/mobile-nav.tsx:16`,
`src/components/layout/side-switcher.tsx:43`

`DashboardShell` (`src/components/layout/shell.tsx:30,37,52`) renders `Navbar`, `Sidebar`
and `MobileNav` — three independent `useUserRole()` mounts, plus `SideSwitcher`. The hook
has no cache and no dedup, so each mount runs `supabase.auth.getUser()` **then**
`from('profiles').select('role')` (`:20-30`) — 8 network round-trips per navigation.

It also renders `role = null` on first paint and patches it from `localStorage`
(`:11-15`), so nav items visibly pop in, and it writes role back to `localStorage` in a
second effect (`:41-48`).

The role is already known on the server — every guarded page fetches `profiles.role`
server-side, and `src/app/counsellor/page.tsx:22` and friends already `await
supabase.auth.getUser()`.

**Fix:** Fetch role once in the server layout that renders `DashboardShell`, pass it into a
`<RoleProvider role={role}>` client context, and have all four consumers read from
context. Zero client round-trips, no flash, no localStorage sync. If a client refetch is
still wanted for role switching, react-query with a shared `queryKey: ['role']` dedupes it
to one request (see CRITICAL).

---

### [HIGH] `StudentIntakeForm` — 2,553 lines, 26 `useState`, 14 `useRef`, 16 `useEffect`, zero `react-hook-form`, zero `zod`

**File:** `src/app/profile/_components/StudentIntakeForm.tsx`

The single component body runs lines **645–2553** (~1,900 lines). Inside it:

- **26 `useState`** (`:665-698`) covering five independent form sections plus wizard, status
  and draft concerns.
- **14 `useRef`** (`:652,655,678-688`), six of which
  (`draftSaveInitRef`, `skipNextDraftSaveRef`, `draftDataSnapshotRef`, `isDirtyRef`,
  `pendingDraftRef`, `submittedRef`) exist solely to coordinate one debounced
  localStorage-draft effect (`:873-915`). That is a state machine written in refs.
- **16 `useEffect`**, including three that are pure escapes from the state model:
  `:709` (timezone seeding writes state on mount), `:809` (programme-type change resets
  subjects), `:958` (english-required derives test type/status), `:978` (cluster change
  mutates the admissions-test array — with a 14-line comment documenting the two infinite
  loops it has already caused).
- **Five hand-rolled validators** (`validateStep1` `:1208`, `validateStep2` `:1220`,
  `validateSubjects` `:1230`, `validateStep3` `:1254`, and two no-op stubs `:1277-1278`)
  producing `Record<string, string>` keyed by dotted paths like
  `'academic_input.subject_list.0.grade_value'` — i.e. a re-implementation of a zod
  error map.
- **All six steps inline** as `{currentStep === N ? (<section>…</section>) : null}` blocks
  (`:1564`, `:1692`, `:1832`, step 4, `:2349`, `:2425`) — roughly 950 lines of JSX in one
  return.

Meanwhile `react-hook-form`, `@hookform/resolvers/zod` and `zod` are all dependencies, the
pattern is already proven in `src/components/forms/auth-form.tsx:23-26`, and
`src/lib/validation/profile.ts` contains 82 lines of unused zod schemas for this exact
domain.

**Consequence beyond maintainability:** validation exists *only* in the client component.
`saveStudentIntake` (`src/app/profile/actions.ts:38-52`) accepts the client-supplied
`StudentProfilePayload` and passes it straight to `writeStudentIntake` with no runtime
check — `StudentProfilePayload` is a compile-time type only.

**Fix:** see the decomposition plan below.

---

### [HIGH] Two byte-for-byte-equivalent combobox implementations, 105 lines each, in the same file

**File:** `src/app/profile/_components/StudentIntakeForm.tsx:383-490` (`CountryCombobox`) and
`:526-629` (`SubjectCombobox`)

`diff` of the two ranges yields 30 changed lines, all of them the option-source identifier
(`COUNTRY_OPTIONS` vs `SUBJECT_OPTIONS`), the placeholder, and the loop variable name
(`c` vs `s`). Everything else — the `useState(query/open/highlight)` trio, the
`useEffect(() => setQuery(value), [value])` prop sync, the outside-click listener, the
`ArrowDown`/`ArrowUp`/`Enter`/`Escape` handler, the `role="combobox"` +
`aria-activedescendant` wiring, the `<ul role="listbox">` markup — is identical.

A third, more capable implementation of the same widget exists at
`src/components/university-search/IntelligentSearchBar.tsx:34-604`, and a fourth
(searchable option list) at `CheckboxFacetList` with `searchable`.

**Fix:** one `src/components/ui/combobox.tsx` taking `options: string[]`, `value`,
`onChange`, `placeholder`, `error`. Deletes ~210 lines from `StudentIntakeForm` alone.

---

### [HIGH] `ui/badge.tsx` has one consumer; 132 inline pills across 55 files re-implement it

**Canonical:** `src/components/ui/badge.tsx:71` — CVA with 8 semantic tone variants
(`neutral/success/warning/danger/info/feature/primary/outline`), and `:49-50` documents
that `size: default` is "the canonical chip, pixel-identical to `TONE[*].chip`".

**Only importer:** `src/app/counsellor/students/[id]/page.tsx:7`.

Highest-density inline re-implementations (6 each):
`src/components/toolbox/deadline-timeline-tool.tsx:150,151,197,342,384,386` ·
`src/app/counsellor/_components/student-detail-tabs.tsx:229,278,304,325,377,416` ·
`src/app/counsellor/_components/outcome-dashboard.tsx:106,131,136,145,177,183` ·
`src/app/counsellor/_components/application-overview.tsx:126,134,149,170,223,226`.

This has already caused a shipped visual bug: the docstring on `cn()`
(`src/lib/utils.ts:5-25`) records that unconfigured `twMerge('text-success text-label')`
silently dropped the colour, and that it was live in three chips in
`application-overview.tsx`. Inline pills are where that class collision lives.

**Fix:** codemod the `<span className="rounded-full px-2 py-0.5 text-xs …">` pattern to
`<Badge variant="…">`. Ban raw pills in review.

---

### [HIGH] `EmptyState` exists and is bypassed ~44 times

**Canonical:** `src/components/ui/empty-state.tsx:44` — 17 importers.

~24 inline dashed-container empty states plus ~20 bare-`<p>` ones. Worst offender:
`src/components/applications/documents-manager.tsx:50` hand-rolls one **in a file that
already imports `EmptyState`**. Others: `src/components/match/match-list.tsx:179,272` ·
`src/app/dashboard/_components/matches-peek.tsx:36,80` ·
`src/components/help/help-thread-drawer.tsx:737,744,854,861` ·
`src/app/counsellor/universities/_universities-client.tsx:559,740,887`.

A *fifth* parallel abstraction exists: `PanelEmpty` at
`src/app/course/[id]/_components/tiles.tsx:198` with 5 consumers.

**Fix:** delete `PanelEmpty` in favour of `EmptyState size="inline"`; sweep the 44 sites.

---

### [HIGH] Four hand-rolled modal overlays and two slide-overs bypass the Radix `Dialog`; one has no focus trap at all

**Canonical:** `src/components/ui/dialog.tsx` (Radix — portal, focus trap, scroll lock,
Escape, focus restore), 7 proper consumers.

**Bypassed:**

| Site | Notes |
|---|---|
| `src/app/counsellor/universities/_universities-client.tsx:851` | assign-deck modal |
| `src/app/counsellor/universities/_universities-client.tsx:939` | delete-deck confirm |
| `src/app/counsellor/_components/analytics-drilldown.tsx:130,144` | own `onTrapKeyDown` |
| `src/components/layout/command-palette.tsx:284,288` | own `onDialogKeyDown` |
| `src/components/help/help-thread-drawer.tsx:285,299` | right-side drawer |
| **`src/components/assistant/assistant-workspace.tsx:782-793`** | **`fixed inset-0 z-modal` overlay with backdrop — no `role="dialog"`, no `aria-modal`, no focus trap, no Escape handler** |

The focus-trap logic is copy-pasted verbatim across four files. The `FOCUSABLE` selector
string is duplicated at `_universities-client.tsx:70-71` and
`help-thread-drawer.tsx:19-20`, both with a comment saying "mirrors the query in
ui/dialog.tsx" — the comment is the tell that this should be shared code, not shared prose.
`_universities-client.tsx:73-121` even extracts a local `useModalA11y` hook that is then
not exported or reused.

**Impact:** the assistant mobile rail is a keyboard trap in reverse — Tab escapes to the
page behind the backdrop, Escape does nothing, screen readers do not announce a dialog.

**Fix:** add `align="right"` to `ui/dialog.tsx` (it already supports `center` and `left` at
`:117-121`), then migrate all six. Delete the four copies of the focus trap.

---

### [MEDIUM] Two `useEffect`s reconcile URL ↔ state in both directions, guarded by three refs

**File:** `src/app/university-search/search/page.tsx:238-300`

Four effects run the search page's state:

- `:238-254` debounce `searchQuery` → `filters.q`
- `:259-271` state → URL, debounced, guarded by `skipInitialWrite` ref
- `:277-285` URL → state, guarded by `lastUrlRef` "did we write this ourselves?" comparison
- `:291-300` one-shot legacy-URL canonicalisation, with `didCanonicalizeLegacy` ref and an
  `eslint-disable exhaustive-deps`

The comments (`:273-276`, `:296-299`) carefully explain why this does not loop. That it
needs explaining is the finding. `useSearchParams()` is already the source of truth on the
server; mirroring it into `useState` and syncing back is the avoidable half.

**Fix:** derive `filters` from `searchParams` during render (`const filters = useMemo(() =>
parseSearchParams(searchParams), [searchParams])`), keep only the raw input box in local
state, and make every handler a `router.replace` of the next query string. Three effects
and three refs disappear. Same treatment for
`src/app/counsellor/_components/student-detail-tabs.tsx:92`
(`useEffect(() => { setActive(urlTab); }, [urlTab])` — textbook derived-state-in-effect).

---

### [MEDIUM] `_universities-client.tsx` — 20 `useState` in one component, three modals inline

**File:** `src/app/counsellor/universities/_universities-client.tsx` (986 lines)

State is grouped by comment banners rather than by structure: deck state (`:127-131`),
search state (`:134-141`), create-deck modal state (`:277-280`), assign modal state
(`:426-429`). Each modal's open flag, form fields and busy flag are separate `useState`s in
the parent, and each modal's JSX is inline (`:851`, `:939`).

`isSearching` / `hasSearched` / `searchFailed` / `results` / `debouncedQuery` is a five-way
encoding of one request lifecycle — the exact thing `useReducer` or a query library models
in one value.

**Fix:** extract `<DeckSearchPanel>`, `<CreateDeckDialog>`, `<AssignDeckDialog>`,
`<DeleteDeckDialog>` as siblings, each owning its own state; parent keeps only
`decks`, `selectedDeckId`, and which dialog is open (one `null | 'create' | 'assign' |
{kind:'delete', deck}` discriminated union instead of six booleans).

---

### [MEDIUM] `WidgetGridCore` writes three persisted state slices by hand in every setter

**File:** `src/app/counsellor/_components/widget-grid-core.tsx:133-260`

`visibleWidgets`, `order` and `sizes` are three `useState`s, and **every** mutator calls
`writeJSON(...)` inline alongside `setX` (`:184`, `:189`, `:198`, `:207`, `:215`, and
more). A hydration effect (`:143-164`, with `eslint-disable exhaustive-deps`) loads all
three from `localStorage` after mount, plus a `hydrated` flag and a
`knownCustomIds` ref to distinguish "first post-hydration run" from real changes
(`:170-202`).

**Fix:** one `useReducer` over `{visible, order, sizes}` plus a single
`useEffect(() => writeJSON(key, state), [state])`. Removes the persistence call from every
action and makes the `hydrated`/`knownCustomIds` dance unnecessary.

---

### [MEDIUM] Index keys on editable, removable rows

**File:** `src/app/profile/_components/StudentIntakeForm.tsx:1617` (nationalities),
`:1863` (subjects) · `src/components/inputs/subject-grade-table.tsx:35`

```tsx
{nationalities.map((val, i) => (
  <div key={i} …>          // rows are removed by index at :1057
```

Each row hosts a `CountryCombobox`/`SubjectCombobox` with internal `query`/`open`/
`highlight` state. Removing a middle row shifts every subsequent row onto a different
component instance, carrying stale internal state. It is currently masked by the
`useEffect(() => setQuery(value), [value])` prop-sync at `:394`/`:536` — which is itself an
antipattern kept alive by this bug.

Note the other ~55 `key={i}` sites are static skeleton arrays in `loading.tsx` files and
are harmless.

**Fix:** give rows stable `localId`s at creation — `activityRows` already does exactly this
(`:702`). Then the prop-sync effects can go too.

---

### [MEDIUM] Two hand-rolled tablists, and a 20-file chip-row pattern with no primitive

**Hand-rolled tabs:** `src/components/help/help-thread-drawer.tsx:341-375` (own
ArrowLeft/Right handler + manual `getElementById().focus()`) ·
`src/components/landing/hero-app-tour.tsx:345-370` (own `onTabKeyDown` + roving tabIndex).
`src/components/ui/tabs.tsx` (Radix + framer `layoutId`) has **2** consumers.

**Chip rows:** 20 files render an `aria-pressed` filter-chip row with no shared component —
`student-roster.tsx:242,262,282`, `application-overview.tsx:109,112,133`,
`match-list.tsx:134,149,162`, `deadline-timeline-tool.tsx:195,228,235`,
`theme-toggle.tsx:53,64,75`, `appointment/page.tsx:213,278`, and more.
`src/components/university-search/filters/SegmentedControl.tsx` already implements this
shape but is scoped to the search feature.

**Fix:** migrate the two tablists to `ui/tabs.tsx`; promote `SegmentedControl` (or a new
`FilterChipGroup`) to `components/ui/` and adopt it across the 20 sites.

---

### [MEDIUM] No `not-found.tsx` on dynamic segments

`notFound()` is called at
`src/app/(university-info)/university-search/university/[id]/page.tsx:142` and
`src/app/counsellor/students/[id]/page.tsx:49`, but the only `not-found.tsx` in the app is
`src/app/not-found.tsx`. A bad university or student id therefore renders the generic
site-wide 404 with no "back to the roster" affordance.

**Fix:** add `not-found.tsx` beside each dynamic segment that calls `notFound()`.
`src/app/course/[id]/` should also call `notFound()` for missing programmes.

---

### [MEDIUM] `.surface-card` (54 files) and `ui/card.tsx` (3 files) are two APIs for one visual

`src/components/ui/card.tsx:11-17` explicitly documents that `Card` was rewritten to be
visually identical to `.surface-card` (`src/app/globals.css:385`). Both are live. New code
has no rule telling it which to reach for; the CSS class currently wins 54 files to 3.

**Fix:** pick the class (it wins on adoption) and delete `ui/card.tsx`, or make `Card` a
thin wrapper that emits `surface-card` and mandate it. Either is fine; having both is not.

---

### [MEDIUM] `CoursePageClient` is a client root that pulls seven static panels across the boundary

**File:** `src/app/course/[id]/CoursePageClient.tsx` and `src/app/course/[id]/_components/*`

Seven files in `_components/` carry `'use client'` with no hooks, no handlers and no
browser APIs — `assessment-panel.tsx` (16L), `campus-panel.tsx` (117L),
`career-panel.tsx` (98L), `costs-panel.tsx` (218L), `requirement-renderer.tsx` (70L),
`requirements-panel.tsx` (78L), `rich-text.tsx` (75L), `tiles.tsx` (202L). Their only
importers are client components rooted at `CoursePageClient.tsx`, so removing the
directives individually changes nothing — the whole course-detail subtree sits inside one
client boundary.

The same shape appears in the counsellor tree: `analytics-widget-grid.tsx` (125L),
`portfolio-balance.tsx` (154L), `widget-grid.tsx` (92L) are dragged in by
`_analytics-client.tsx` / `_dashboard-client.tsx` / `student-detail-tabs.tsx`.

**Two cases where dropping the directive *does* pay off immediately**, because the parent
is a server component:
- `src/components/university-card.tsx` (355L) ← `src/app/dashboard/_components/matches-peek.tsx`
- `src/components/university-search/nav.tsx` (8L) ← `src/app/university-search/layout.tsx`,
  `src/components/layout/shell.tsx`

**Also:** `src/app/profile/_components/StepRoadmap.tsx` (58L) has **zero importers** —
dead code. Delete rather than fix.

**Fix:** re-root the course page — make `page.tsx` render the static panels as server
components and pass them into `CoursePageClient` as `children`/slots, so only the
genuinely interactive shell is a client component. Note `src/app/course/[id]/page.tsx:9-38`
already server-fetches and passes `initialData`, and `CoursePageClient.tsx:74-77`
short-circuits when it's present — the data pattern is right, only the render tree is
wrong.

---

### [MEDIUM] `results/page.tsx` is a client component whose entire job is a redirect

**File:** `src/app/university-search/results/page.tsx` (39 lines)

```tsx
'use client';
…
useEffect(() => {
  const qs = searchParams.toString();
  router.replace(qs ? `/university-search/search?${qs}` : '/university-search/search');
}, [router, searchParams]);
```

It ships a JS chunk, mounts a `Suspense` boundary, renders a spinner, hydrates, and then
bounces the user. The legacy `filters=…` token it forwards is parsed at the destination
anyway (`parseSearchParams`).

**Fix:** a server component calling `redirect()` from `next/navigation`, which forwards
`searchParams` server-side with zero JS. Best effort-to-payoff ratio in this report.

---

### [MEDIUM] `counsellor/inbox` fetches 100% of its data in the browser from a server page that fetches nothing

**Files:** `src/app/counsellor/inbox/page.tsx` (renders only `PageHero` + `<CounsellorInbox />`)
· `src/app/counsellor/inbox/_components/counsellor-inbox.tsx:35,44,51`

The page is a server component that issues no queries at all; `loadCounsellorInbox(supabase)`
runs on mount in the browser. `src/app/inbox/_components/inbox-list.tsx:32,43,77` has the
identical shape (`src/app/inbox/page.tsx:15-22` only does an auth check).

Other static data fetched client-side that belongs on the server:

| Site | Data |
|---|---|
| `src/app/counsellor/universities/_universities-client.tsx:148-153` | `/api/search/filter-options` country list — the parent `universities/page.tsx:14` **already runs a `Promise.all`**; add it there |
| `src/app/university-search/search/page.tsx:312` | same endpoint; also the reason `FALLBACK_COUNTRIES`/`FALLBACK_SUBJECTS` exist at `:56-68` |
| `src/components/assistant/assistant-workspace.tsx:194-197`, `src/components/chat/chatbot-widget.tsx:237-240` | `/api/chat/suggestions?mode=` — static per-mode lists, could be a static import |
| `src/components/university-search/IntelligentSearchBar.tsx:226-234` | `?trending=true` (the typeahead fetches at `:82,133` are legitimately client) |
| `src/lib/demo/use-is-demo-user.ts:15-16` | same anti-pattern as `useUserRole` |

**Fix:** server-fetch the first page of data, pass as `initialData`, keep the client hook
for refresh/realtime. `src/app/course/[id]/page.tsx:9-38` + `CoursePageClient.tsx:74-77`
is the in-repo reference for this pattern.

---

### [MEDIUM] Three server-component request waterfalls

| File:line | Issue |
|---|---|
| `src/app/(university-info)/university-search/university/[id]/page.tsx:115-117` | `await props.searchParams` → `await props.params` → `await createServerSupabaseClient()` in series; all three independent. Textbook `Promise.all` |
| `src/app/counsellor/students/[id]/page.tsx:48,50` | `loadStudentById` then `loadStudentEvolution`, both keyed on `id` alone. Only the `notFound()` guard at `:49` sequences them — `Promise.all` then guard |
| `src/app/dashboard/page.tsx:243` | `resolveProfileNames` for the meeting counsellor runs *after* the 8-way `Promise.all` at `:94`. Tail waterfall on the critical path |

Deliberately sequential and **not** to be "fixed": `applications/documents/page.tsx:46,69,82`
(signed URLs need `storage_path`), `applications/page.tsx:29,132`,
all five counsellor pages (`auth.getUser()` → `loadCohort(…, {excludeId: user?.id})`),
all five parent pages, and `admin/page.tsx:31,37` (auth gate).

---

### [MEDIUM] Feature components are split across two parallel folder trees

| Feature | Route-local | Shared |
|---|---|---|
| counsellor | `src/app/counsellor/_components/` (30 files) | `src/components/counsellor/` (1 file) |
| dashboard | `src/app/dashboard/_components/` (3 files) | `src/components/dashboard/` (9 files) |
| hooks | `src/hooks/` (11 files) | `src/lib/hooks/` (1 file) |

Naming is inconsistent too: `src/hooks/useSupabase.ts` (camelCase) vs
`src/hooks/use-user-role.ts` (kebab); `src/components/university-card.tsx` and
`university-card-skeleton.tsx` sit loose at the root of `components/` while everything else
is in a subdirectory.

**Fix:** one rule — a component used by exactly one route lives in that route's
`_components/`; anything used by two or more moves to `src/components/<feature>/`. All
hooks in `src/hooks/`, kebab-case.

---

### [LOW] Files where one interactive line holds a large static subtree client-side

Each of these could keep `'use client'` on a small island and render the rest as
server-component `children`:

| File | Lines | Client need is confined to |
|---|---|---|
| `src/components/landing-preview/how-it-works-scrub.tsx` | 708 | one line at `:555` inside `StepMorph`; `:89-186` are pure math, `:189-548` static presentation |
| `src/components/landing/mock-viz.tsx` | 549 | `:27-57` (`useMountedReducedMotion`, one `onMouseMove`); `:58-549` is static SVG on the **public landing page** |
| `src/app/counsellor/_components/student-detail-tabs.tsx` | 452 | `:88-108`; `:109-452` are six static panels rendering props |
| `src/components/university-search/university-information.tsx` | 352 | `:109,110,124,224`; `:158-324` is static detail layout |
| `src/app/course/[id]/_components/course-hero.tsx` | 161 | one `onClick` at `:108` |
| `src/app/parent/deadlines/_deadline-groups.tsx` | 160 | one `onClick` at `:102` |
| `src/components/dashboard/deadline-nudges.tsx` | 151 | one `onClick` at `:110` |

Ranked LOW because the payoff is bundle size (another agent's lane) rather than
correctness or maintainability — but `mock-viz.tsx` is worth doing since it's on the
unauthenticated landing page.

---

### [LOW] `forwardRef` retained across 11 primitives under React 19

34 `forwardRef` uses in `ui/badge|button|card|dialog|empty-state|input|label|select|table|tabs|tooltip`.
React 19 passes `ref` as an ordinary prop (`react19-no-forwardref`). Likewise all 8
`useContext(...)` call sites can become `use(...)`.

**Fix:** mechanical, low risk, do it in one pass when touching `ui/` for the Badge sweep.

---

### [LOW] `WIDGET_META` rebuilt on every render inside the component

`src/app/counsellor/_dashboard-client.tsx:55-63` defines a 7-entry object literal inside the
component body and passes it down. It depends only on `stats.flagged`.

**Fix:** hoist to module scope as a function of `stats`, or wrap in `useMemo`.

---

### [LOW] Zero `React.memo` and no virtualisation on the longest lists

No `React.memo` anywhere. The search grid renders up to 50 rows per page and accumulates
across `loadMore` (`src/hooks/use-search-results.ts:36`), and the counsellor roster renders
the full cohort. Both mitigate with `[content-visibility:auto]`
(`src/app/university-search/search/page.tsx:679`,
`src/app/counsellor/_components/student-roster.tsx:311`) which is a reasonable stopgap.

**Fix:** not urgent. Revisit if cohorts grow past a few hundred; `content-visibility` is
the right first tool and it's already applied.

---

### Non-findings worth recording

These were checked and are **fine** — do not "fix" them:

- **Boolean-prop proliferation is not a problem here.** Max is 6 booleans in one interface
  (`help-thread-drawer.tsx`), and the codebase consistently prefers `variant` /
  `tone` / `size` string unions (`ui/button.tsx`, `ui/badge.tsx`, `ui/empty-state.tsx`,
  `page-hero.tsx:34`, `university-card.tsx:24`). This meets the
  `architecture-avoid-boolean-props` / `patterns-explicit-variants` bar.
- **No components defined inside components.** All 52 hits for the pattern are icon
  aliases (`const Icon = item.icon`) or polymorphic tag selection, which is correct.
- **Server-side data fetching is well parallelised.** `Promise.all` is used correctly in
  `dashboard/page.tsx:85`, `profile/page.tsx:42`, `profile/wizard/page.tsx:35`,
  `auth-form.tsx:55`. `dashboard/page.tsx:126-128` documents deliberately deferring the
  expensive match compute to a `Suspense` island.
- **The two chat surfaces share code properly.** `chat/shared.tsx` and
  `assistant/widgets/` are consumed by both `chatbot-widget.tsx` and
  `assistant-workspace.tsx`; the widget is `next/dynamic`-lazy
  (`chatbot-widget-lazy.tsx`).
- **`cn()` / tailwind-merge is used consistently** — one definition, 137 importers, and it
  is a *configured* `extendTailwindMerge` (`src/lib/utils.ts:26-32`).
- **Toasts and skeletons have no duplication worth acting on.**
- **`PageHero` (`src/components/layout/page-hero.tsx`) is correctly a client component.**
  It is imported by ~71 files, which makes it look like the highest-leverage boundary fix
  in the app — it isn't. Its client need is intrinsic: the whole component is built from
  `motion.div` with `variants` (`:115,121,127,131,149,166,178,191`) plus the
  `AnimatedNumber` count-up (`:47-86`). It cannot become a server component without
  deleting its entrance animation. It already takes `actions`, `breadcrumbs` and `title`
  as `ReactNode` slots, so server-rendered content passes through it correctly. **Leave it
  alone.**
- **`src/app/matches`, `src/app/inbox`, `src/app/shortlist` and all five `src/app/toolbox/**`
  pages are already server components with client islands** — the pattern to copy, not fix.

---

## Decomposition plans

### 1. `StudentIntakeForm.tsx` — 2,553 lines → ~12 files, none over 250 lines

**Before**

```
src/app/profile/_components/StudentIntakeForm.tsx      2553 lines
└── StudentIntakeForm()                          :645-2553  (~1,900-line body)
    ├── 26 useState, 14 useRef, 16 useEffect
    ├── CountryCombobox                           :383-490   (105 lines)
    ├── SubjectCombobox                           :526-629   (105 lines, ~identical)
    ├── SectionCard / SectionTitle / Chip / FieldError  :320-523
    ├── validateStep1/2/3 + validateSubjects      :1208-1278
    ├── buildPayload                              :1088-1204
    ├── draft persistence (6 refs + 3 effects)    :681-956
    └── steps 1-6 inline JSX                      :1564-2519 (~950 lines)
```

**After**

```
src/lib/profile/intake-schema.ts                        NEW  ~180 lines
   zod schemas: personalSchema, studiesSchema, gradesSchema,
   activitiesSchema, lifestyleSchema  +  intakeSchema = merge of all
   export type IntakeValues = z.infer<typeof intakeSchema>
   export const STEP_SCHEMAS: Record<StepKey, ZodType>   // per-step trigger
   export const toPayload = (v: IntakeValues): StudentProfilePayload
   export const fromPayload = (p: StudentProfilePayload): IntakeValues
        ← absorbs buildPayload :1088 and applyPayload :719
        ← replaces the orphaned src/lib/validation/profile.ts (delete it)

src/components/ui/combobox.tsx                          NEW  ~110 lines
   <Combobox options value onChange placeholder error errorId />
        ← replaces BOTH :383-490 and :526-629

src/app/profile/_components/intake/
  StudentIntakeForm.tsx                                 ~180 lines
     OWNS: useForm<IntakeValues>({ resolver: zodResolver(intakeSchema),
                                   defaultValues: fromPayload(initialPayload) })
     OWNS: currentStep  (already URL-backed via useSearchParamState :653 — keep)
     RENDERS: <FormProvider> + <IntakeSidebar> + <IntakeStepRouter> + <IntakeNav>
     NO useEffect except the step-scroll one (:1384)

  use-intake-draft.ts                                    ~90 lines
     ONE hook. Takes `watch()` from RHF, returns { draftRestored, discardDraft }.
     Absorbs :681-956 — the 6 refs stay, but inside one hook, not the form body.

  IntakeSidebar.tsx                                      ~90 lines
     props: { steps, currentStep, completion, onGoToStep, onRestore }
     completion comes from RHF formState, not 3 re-run validators (:1390)

  IntakeStepRouter.tsx                                   ~40 lines
     switch(currentStep) → one of the six step components; owns AnimatePresence

  steps/PersonalStep.tsx                                 ~150 lines   (was :1564-1689)
  steps/StudiesStep.tsx                                  ~180 lines   (was :1692-1829)
  steps/GradesStep.tsx                                   ~250 lines   (was :1832-~2100)
  steps/ActivitiesStep.tsx                               ~220 lines
  steps/LifestyleStep.tsx                                ~130 lines   (was :2349-2422)
  steps/ReviewStep.tsx                                   ~140 lines   (was :2425-2519)
     ALL of these: zero useState. Fields bind via useFormContext() +
     <Controller> for Select/Combobox/Chip groups.

  fields/ChipGroup.tsx                                   ~60 lines
     single/multi chip selector with max — absorbs toggleCluster :1009,
     toggleMulti :1022, toggleLocationPreference :1028
  fields/SubjectRows.tsx                                 ~120 lines
     useFieldArray('subjects') — replaces :1060-1065 + the index-key bug
  fields/ActivityRows.tsx                                ~100 lines
     useFieldArray('activities')
  fields/SectionCard.tsx, SectionTitle.tsx, FieldError.tsx   ~90 total (lift :320-380)
```

**State/data ownership after**

| Level | Owns |
|---|---|
| `profile/wizard/page.tsx` (server, unchanged) | fetches `initialPayload`, computes `initialStep` |
| `StudentIntakeForm` | the single RHF form instance + `currentStep` (URL) |
| `use-intake-draft` | localStorage draft lifecycle only |
| step components | **nothing** — read/write through `useFormContext()` |
| field components | only ephemeral UI state (combobox open/highlight) |

**Cross-cutting wins**
- The four derivation effects (`:709`, `:809`, `:958`, `:978`) become zod `.transform()` /
  `.superRefine()` rules or RHF `watch` subscriptions in the owning step — no effect
  writes state.
- `saveStudentIntake` (`src/app/profile/actions.ts:38`) gains
  `const parsed = intakeSchema.safeParse(payload)` — the same schema, now enforced
  server-side. This closes the unvalidated-server-action hole for free.
- Steps 4 and 5's no-op validators (`:1277-1278`) simply don't exist.

---

### 2. `use-search-results.ts` — 1,010 lines → ~450 across 4 files

**Before:** one hook, 9 `useState`, 6 `useRef`, a `requestId` counter driving two coupled
effects (`:552`, `:573`), module-level promise cache (`:92-116`), manual `AbortController`.

**After**

```
src/lib/university-search/query-builders.ts     ~380 lines   PURE, no React
   resolveText()               (was :157-…)
   buildProgramQuery(supabase, filters, cursor) → PostgrestBuilder
   ⇒ every load-bearing NOTE/WHY comment about statement timeouts moves here
     verbatim and becomes unit-testable without a component

src/hooks/use-universities.ts                   ~30 lines
   useQuery({ queryKey:['universities'], staleTime: Infinity })
   ⇒ deletes the module-level cache at :92-116

src/hooks/use-search-results.ts                 ~120 lines
   useInfiniteQuery({
     queryKey: ['programs', filtersKey],
     queryFn: ({ pageParam, signal }) => fetchPage(filters, pageParam, signal),
     getNextPageParam: (last) => last.nextCursor,
   })
   ⇒ deletes requestId, both effects, all 6 refs, the AbortController plumbing,
     and 6 of the 9 useState (isLoading/isLoadingMore/hasMore/error come from
     the query; results = data.pages.flat())

src/hooks/use-match-scores.ts                   ~60 lines
   the on-demand score path (:543 onDemandScoresRef) as its own query,
   keyed by userId so the "in-tab auth change" concern is structural, not a ref guard
```

Ownership: `search/page.tsx` owns only `filters` (derived from URL — see [MED-1]);
react-query owns every request lifecycle value.

---

### 3. `_universities-client.tsx` — 986 lines → 6 files

**Before:** one component, 20 `useState`, 5 `useEffect`, three modals inline
(`:851`, `:939`, plus the create-deck panel at `:277`), a private `useModalA11y`
(`:73-121`) duplicating `ui/dialog.tsx`.

**After**

```
src/app/counsellor/universities/_components/
  UniversitiesClient.tsx          ~180   owns: decks, selectedDeckId,
                                          dialog: null | 'create' | 'assign'
                                                  | {kind:'delete'; deck}
  DeckList.tsx                    ~120   presentational; props: decks, selectedId, onSelect
  DeckDetail.tsx                  ~200   owns: card patch optimistic state (:335)
  ProgramSearchPanel.tsx          ~180   owns: query, country (URL-backed);
                                          data via useQuery → deletes
                                          isSearching/hasSearched/searchFailed/
                                          debouncedQuery/results (5 useState → 0)
  CreateDeckDialog.tsx            ~110   owns its own name/emoji/isCreating
  AssignDeckDialog.tsx            ~120   owns its own selection Set/message/isAssigning
  DeleteDeckDialog.tsx            ~60    owns isDeleting
```

All three dialogs use `ui/dialog.tsx`; the local `useModalA11y` (`:73-121`) is **deleted**,
not moved.

---

### 4. `help-thread-drawer.tsx` — 919 lines → 6 files

**Before:** one component with 9 `useState` + 5 `useEffect` covering drawer chrome, focus
trap (`:125-146`), a hand-rolled tablist (`:341-375`), name resolution (`:152-160`), and
three full tab bodies (`ThreadView` `:550`, `NotesView` `:693`, `MeetingView` `:771` —
already extracted, good).

**After**

```
src/components/ui/dialog.tsx        + align="right"   (extend :117-121)
src/components/help/
  HelpThreadDrawer.tsx        ~150   <Dialog align="right"> shell; owns only `tab`
                                     ⇒ deletes FOCUSABLE :19, the trap :125-146,
                                       and the Escape effect :94-101
  use-thread-participants.ts   ~50   the name-resolution effect :152-183 as a hook
  ThreadView.tsx               ~220  owns replyText          (move from :73)
  NotesView.tsx                ~140  owns noteText           (move from :74)
  MeetingView.tsx              ~200  owns meetingTitle/Time/Location (:75-77)
```

Tab strip becomes `<Tabs>` from `ui/tabs.tsx`. Parent drops from 9 `useState` to 1.

---

### 5. `assistant-workspace.tsx` — 822 lines → 5 files

**Before:** `AssistantWorkspaceInner` spans `:98-816` with 9 `useState`, 6 `useRef`, 4
`useEffect` and ~20 `useCallback`, mixing conversation CRUD, streaming, tool-action
execution, URL sync, and the mobile rail overlay.

**After**

```
src/components/assistant/
  AssistantWorkspace.tsx         ~140   Suspense shell + layout; owns railOpen
  use-conversations.ts           ~120   list/create/rename/delete/pin + selectedId↔URL
                                        (absorbs :130-235) — react-query mutations
  use-assistant-thread.ts        ~180   messages, streaming, resend, rate
                                        (absorbs :237-395)
  use-tool-actions.ts            ~200   runToolAction/handleActionSend/
                                        handleActionCancel/revertAction (:396-640)
  MobileRail.tsx                 ~80    <Dialog align="left"> — fixes the missing
                                        focus trap / role=dialog at :782-793
```

`ConversationRail.tsx` and `ThreadPane.tsx` already exist and stay as-is.

---

## Target conventions

### When a component may be a client component
1. Default to a **server component**. Add `'use client'` only for: hooks, event handlers,
   browser APIs, or a third-party client-only library.
2. Push the directive **down**, never up. If a client component renders a large static
   subtree, accept that subtree as `children` from a server parent.
3. `layout.tsx` is **never** a client component. (Currently true — keep it.)
4. A `page.tsx` is a client component only when the whole page is one interactive surface
   (the 5 current cases are all defensible; do not add a 6th without a reason).

### Where data is fetched
1. **Initial render data → server component**, in a `Promise.all`, passed as props.
2. **User-triggered / polled / paginated → client**, and always through the query library
   (once CRITICAL is resolved). Never a bare `useEffect(() => { fetch(); }, [])`.
3. **Session-wide identity (role, profile) → fetched once server-side, distributed by
   context.** Never per-component (fixes [HIGH-2]).
4. **Mutations → server actions**, and every server action `safeParse`s its input with the
   same zod schema the form uses.

### Forms
1. `react-hook-form` + `zodResolver` for **every** form with more than two fields.
   `src/components/forms/auth-form.tsx:23-26` is the reference.
2. One zod schema per form, in `src/lib/validation/` or `src/lib/<feature>/`-schema, shared
   verbatim between the client resolver and the server action.
3. Multi-step wizards: **one** `useForm` at the top in a `FormProvider`; steps validate via
   `trigger(fieldsForStep)`. Steps hold no state.
4. Repeating rows use `useFieldArray` — never `useState<Row[]>` with index keys.

### Shared primitives
1. If it exists in `src/components/ui/`, use it. Adding a local re-implementation requires
   extending the primitive instead.
2. Specifically banned going forward: inline `rounded-full … text-xs` pills (use `Badge`),
   inline dashed empty states (use `EmptyState`), `fixed inset-0` overlays (use `Dialog`),
   hand-rolled focus traps (there should be exactly one, in `ui/dialog.tsx`).
3. New primitives needed: `Combobox`, `FilterChipGroup` (promote
   `university-search/filters/SegmentedControl.tsx`), and `Dialog align="right"`.
4. Pick one card API. Recommend keeping `.surface-card` and deleting `ui/card.tsx`.

### State
1. Derive during render. `useEffect` that only calls `setState` from props/state is a bug
   (`rerender-derived-state-no-effect`).
2. Three or more `useState`s that always change together → `useReducer` or one object.
3. Search / filter / tab / step state lives in the **URL**, read via `useSearchParams`,
   written via `router.replace`. Do not mirror it into `useState`.
4. A component over ~250 lines or with more than ~8 `useState` is a decomposition signal.

### Folder placement
- Used by one route → `src/app/<route>/_components/`.
- Used by two or more → `src/components/<feature>/`.
- Generic and unstyled-by-domain → `src/components/ui/`.
- All hooks in `src/hooks/`, kebab-case (`use-thing.ts`). Delete `src/lib/hooks/`.

---

## Effort

| # | Finding | Effort | Risk |
|---|---|---|---|
| C-1 | react-query: adopt in `use-search-results` **or** remove entirely | **L** (adopt) / **S** (remove) | Med / Low |
| H-2 | `useUserRole` → server-fetched RoleProvider | **M** | Med — touches every nav surface + auth redirect paths |
| H-3 | `StudentIntakeForm` decomposition (RHF + zod + 12 files) | **XL** | **High** — the app's most bug-fixed file; every inline comment documents a past regression. Needs a test harness first |
| H-4 | Extract `ui/combobox.tsx`, delete the two copies | **S** | Low |
| H-5 | `Badge` sweep — 132 inline pills / 55 files | **L** | Low, but visually broad; do it as one PR with screenshots |
| H-6 | `EmptyState` sweep — ~44 sites, delete `PanelEmpty` | **M** | Low |
| H-7 | `Dialog align="right"`; migrate 6 overlays; delete 4 focus traps | **M** | Med — a11y-sensitive, needs keyboard testing |
| H-7a | *Just* fix the missing trap at `assistant-workspace.tsx:782` | **S** | Low — do this first, independently |
| M-1 | `search/page.tsx` URL↔state → derive from `useSearchParams` | **M** | Med — the sync comments describe real loops that were fixed |
| M-2 | `_universities-client.tsx` → 6 components | **L** | Med |
| M-3 | `WidgetGridCore` → `useReducer` + one persist effect | **M** | Low |
| M-4 | Stable row ids in intake lists (fold into H-3) | **S** | Low |
| M-5 | Migrate 2 tablists to `ui/tabs`; promote `SegmentedControl` | **M** | Low |
| M-6 | `not-found.tsx` on dynamic segments | **S** | Low |
| M-7 | Resolve `.surface-card` vs `ui/card.tsx` | **S** | Low |
| M-8 | Folder-convention consolidation | **M** | Low — mechanical, but a large diff |
| M-9 | Re-root `CoursePageClient` so the 7 static panels render server-side | **M** | Med |
| M-9a | Delete dead `StepRoadmap.tsx`; drop directive on `university-card.tsx` + `nav.tsx` | **S** | Low |
| M-10 | `results/page.tsx` → server `redirect()` | **S** | Low — **best payoff-to-effort in the report** |
| M-11 | Server-fetch initial data for `counsellor/inbox` + `inbox` + the 5 static-fetch sites | **M** | Low |
| M-12 | Fix 3 server waterfalls (`university/[id]`, `students/[id]`, `dashboard:243`) | **S** | Low |
| L-1 | Drop `forwardRef`, `useContext` → `use()` | **S** | Low |
| L-2 | Hoist `WIDGET_META` | **S** | Low |
| L-3 | Push `'use client'` down in the 7 static-subtree files | **M** | Low |
| L-4 | Virtualisation | — | Defer |

**Suggested order:** H-7a → M-10 → M-9a → H-4 → M-12 → C-1(decide) → H-2 → M-6/M-7/L-1 →
M-11 → H-5/H-6 → M-1/M-3 → M-9/M-2/M-5/M-8 → H-3 last, behind test coverage.

The first five are all **S**, low-risk, and independently shippable — a sensible first PR.
