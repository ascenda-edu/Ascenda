# 04 — Runtime behaviour review (adversarial)

**Branch:** `security/phase0-contain` (11 commits ahead of `origin/main`)
**Scope:** `src/components/`, `src/hooks/`, `src/lib/data/`, `src/lib/profile/`, `src/app/profile/`, `src/features/`, `src/lib/observability/`, `src/lib/env.ts`, `src/instrumentation.ts`, `next.config.mjs` (+ `src/app/dashboard/page.tsx` and `src/lib/chat/context.ts`, named in the brief).
**Method:** every claim checked against `git diff origin/main...HEAD`; suspected deltas proved with throwaway jsdom/Jest and Node scripts, not by reading. `npm run typecheck` passes (exit 0). No tracked file was modified; no DB was touched.

> **Working-tree note.** During this review the working tree gained uncommitted changes to
> `src/app/api/chat/actions/execute/route.ts` (a `resolveChatMode` authz tightening),
> `src/lib/auth/identity.ts`, `src/lib/scoring/student_scoring.ts` and `src/middleware.ts`.
> None are part of this branch's commits and none were made by this review — something else is
> editing this checkout concurrently. They are excluded from the findings below, which are all
> against `git diff origin/main...HEAD`. **Re-run this review after those land**, because at
> least one of them touches a file this review reasoned about (`identity.ts`, behind
> `requireIdentity()` in F4).

---

## Verdict on the `Select` guard — **CONDITIONALLY SAFE**

`src/components/ui/select.tsx:39-88`.

**Safe today. Built on a premise that is factually false for the installed Radix version, with two proven failure modes and no test guarding either.**

### The bug it fixes is real — proved

The docblock's mechanism check out against `node_modules/@radix-ui/react-select/dist/index.mjs`:
`SelectBubbleInput` renders `onChange={(event) => onValueChange(event.target.value)}` (line 1121) and an
effect does `setValue.call(select, selectValue); select.dispatchEvent(new Event('change'))` (lines 1098-1110).
Before the `SelectItem` effects have registered their `<option>`s, assigning an unknown value to a native
`<select>` yields `''`, and that `''` is handed straight back to the app.

Scratch test (jsdom + RTL, harness = a controlled `Select` inside a `<form>` whose parent applies a saved
value in a mount effect — i.e. the profile wizard):

```
RAW  @radix-ui Root : onValueChange calls = [""]   final value = ""     ← value wiped
WRAP app <Select>   : onValueChange calls = []     final value = "2026" ← preserved
```

So the fix works, and the class of bug it fixes (returning students having graduation year / school type /
subject levels / TOK-EE grades / English test type silently blanked on hydration) is real.

### The safety argument is wrong — proved

The docblock states:

> *"Radix itself forbids an empty-string `SelectItem` value — it throws "A `<Select.Item />` must have a
> value prop that is not an empty string." So `''` is not reachable through user interaction by
> construction, and every `onValueChange('')` is this artefact."*

**That restriction does not exist in `@radix-ui/react-select@2.3.7`, the version this repo installs.**
The string does not appear anywhere in the package, and the primitive now has explicit *support* for
empty-value items — `hasEmptyValueOption` (`index.mjs:1094`) exists precisely to suppress the synthetic
placeholder `<option value="">` when the author supplied one.

Scratch test — `<SelectItem value="">None</SelectItem>`, item clicked:

```
RAW  radix 2.3.7 : rendered with NO throw. calls=[""]  finalValue=""   ← clears, correctly
WRAP app <Select>: rendered with NO throw. calls=[]    finalValue="b"  ← click does NOTHING
```

**Failure mode A (latent, high blast radius).** The idiomatic Radix way to write a "None"/"Any"/"Clear"
option — and the thing `StudentIntakeForm.tsx:85-90` itself says the native predecessors had — is
`<SelectItem value="">`. Under this wrapper that item renders, highlights, and is clickable, and does
absolutely nothing. No throw, no warning, no failing test. The next person to write it will lose an
afternoon.

**Failure mode B (latent, proved).** Radix registers a native `form` **reset** listener that calls
`setValue(initialValueRef.current)` (`index.mjs:81-88`). Any `<Select>` bound as `value={state || ''}` —
which is every one in `StudentIntakeForm.tsx`, `documents-manager.tsx:63` and
`cross-application-tasks.tsx:292` — has an initial value of `''`, so a form reset resolves to `''` and is
swallowed:

```
RAW  radix : before reset="b"  after reset=""   ← reset works
WRAP       : before reset="b"  after reset="b"  ← reset silently no-ops
```

There is currently **no `type="reset"` button anywhere in `src/`**, so this is latent, not live.

### Enumeration of all current call sites — none broken

Ten files import from `@/components/ui/select`. Every `onValueChange` was read:

| File | Clear path | Reaches `''`? |
|---|---|---|
| `src/app/profile/_components/StudentIntakeForm.tsx` (7 Selects) | `CLEAR = '__clear'` sentinel → mapped to `''` **outside** the handler | No |
| `src/app/counsellor/universities/_universities-client.tsx:494` | `'all'` sentinel | No |
| `src/components/scholarships/scholarship-explorer.tsx:196,213` | `'all'` sentinel | No |
| `src/components/toolbox/deadline-timeline-tool.tsx:212` | `'all'` sentinel | No |
| `src/app/admin/_components/import-panel.tsx:109` | none | No |
| `src/app/appointment/page.tsx:256` | none | No |
| `src/components/applications/cross-application-tasks.tsx:292` | none | No |
| `src/components/applications/documents-manager.tsx:63` | none | No |
| `src/components/chat/shared.tsx:332` | none | No |
| `src/features/parent/ui/cost-explorer.tsx:112` | none | No |

The `CLEAR` sentinel is **pre-existing on `origin/main`** — not introduced here — so the wizard's
clear-to-empty path routes `'__clear'` through the handler and is unaffected by the guard.

### Structural review of the wrapper — clean

- Module-scope `const` → stable component identity → **no remount / no subtree loss**.
- `SelectPrimitive.Root` is a plain function component, not a `forwardRef` — **no ref to forward**, nothing dropped.
- All props spread; `displayName` set (TS expando-property assignment on a const arrow is legal).
- The inline `onValueChange` arrow is recreated per render but `useControllableState` stores `onChange` in
  a ref via `useInsertionEffect` (`@radix-ui/react-use-controllable-state/dist/index.mjs:56-60`) — **no
  render churn, no stale closure**.
- In **controlled** mode `setValue` already suppresses `value2 === prop`, so the guard only ever fires on a
  genuine change. In **uncontrolled** mode the guard desynchronises Radix's internal state from the app's —
  but I found no uncontrolled `<Select>` in `src/` (all ten pass `value`).

### Recommendation

Keep the guard — the bug it fixes is worse than the trap it sets — but:
1. Correct the docblock: Radix 2.3.7 **permits** `SelectItem value=""`; the guard is a deliberate policy,
   not a no-op on an impossible input.
2. Add a dev-mode `console.warn` when `''` is swallowed, or an ESLint rule banning `<SelectItem value="">`.
3. Add the two scratch tests above to `__tests__/` so the behaviour is pinned.

---

## Undisclosed behaviour changes, ranked by user impact

### F1 — HIGH · New zod gate rejects payloads the profile form can actually produce

`src/app/profile/actions.ts:48-55` (new) · `src/lib/profile/intake-schema.ts`

Every profile save now passes through `studentProfilePayloadSchema.safeParse`. The schema header claims
*"this schema must never reject a payload the real intake form can actually produce."* It does. Verified by
running the real `toPayload` (`src/lib/profile/intake-logic.ts:145`) into `safeParse`:

| Field | Bound | Where |
|---|---|---|
| `ambition_statement`, `career_aspiration`, `work_experience_summary`, `other_extracurriculars` | `.max(4000)` | `intake-schema.ts:179,142,178,169` |
| `sat_score` | `.max(1600)` | `:174` |
| `act_score` | `.max(36)` | `:175` |
| `age` | `.max(120)` | `:119` |
| `english_score_overall` | `.max(200)` | `:159` |
| `admissions_tests[].percentile` / `.score_numeric` | `.max(100)` / `.max(100_000)` | `:98` / `:97` |
| `school_name` | `.max(300)` | `:128` |
| `a_level_predicted_grades` values | `z.enum(['A*','A','B','C','D','E','U'])` | `:154` |

Reachability (this is the load-bearing part):
- `career_aspiration` (`StudentIntakeForm.tsx:1394`) and `ambition_statement` (`:1917`) have **no
  `maxLength`** — only two `maxLength` attributes exist in the whole 2100-line form (`:1587`, `:1865`).
  A pasted UCAS personal statement is 4000 characters *by definition*; a draft is longer.
- The wizard's "Next" is `type="button"` (`:2127`), so native `min`/`max` constraint validation never runs
  while stepping. The only `type="submit"` is on Review (`:2132`), by which point `AnimatePresence` has
  **unmounted** the step-1/3/4 inputs — unmounted controls are not constraint-validated.
- `validateStep4` and `validateStep5` return `{}` (`intake-validation.ts:95-96`) — steps 4 and 5 have no
  client validation at all.
- Pre-2016 SAT is out of 2400; the field accepts `2100` happily.

**Impact:** the save fails wholesale with
`"Some of your answers could not be saved. Please review the form and try again."` — **no field named**,
the real reason going only to `console.error` server-side. The student cannot discover which answer is at
fault and is permanently locked out of saving their profile. On `origin/main` all of these saved fine
(`sat_score` is `number | null` in `database.ts:1542`; `career_aspiration` is `text` with no bound in
`schema.sql:97`).

**Fix:** loosen the bounds to "block absurd, never block reachable", or mirror each bound in a step
validator so the error lands on the offending field.

### F2 — HIGH · Search results are now re-sorted per page, producing a non-monotonic list

`src/hooks/use-search-results.ts:488-511` (new `sortByFit`), applied at `:882`.

```ts
const mapped = f.sort === 'fit' ? sortByFit(mappedRows) : mappedRows;
```

`fit` is the **default** sort. The DB order is `.order('id', { ascending: true })` (`:852`) and pagination is
`OFFSET`-based (`:854`). `sortByFit` reorders **only the rows within the page just fetched**, and
`commitPage` appends. The resulting list is therefore ordered by *(page index, fit desc)*: a user clicking
"Load more" sees fit scores run 97, 92, 85 … 41 and then jump back to 96 at the top of page 2.

Before this branch, results appeared in a single consistent (arbitrary) `id` order. This is a visible change
to the primary product surface, shipped inside commits described as refactor/perf work, and the commit
message does not mention it.

Secondary: when no fit scores resolve (signed-out visitor, or a student with no `student_matches` rows) the
comparator falls through to `a.id.localeCompare(b.id)`, which is ICU collation — **not** the byte order
Postgres used for `order by id asc`. Proved divergent for ids differing only by case; benign for canonical
lowercase UUIDs, but it means the in-memory order is not the DB order even in the all-null case.

### F3 — MEDIUM-HIGH · `experimental.staleTimes.dynamic: 30` re-opens a 30-second auth-staleness window

`next.config.mjs:33-45`.

Confirmed against `next@15.5.21`: the framework default is `{ dynamic: 0, static: 300 }`
(`next/dist/server/config-shared.js:201-204`). This branch sets `{ dynamic: 30, static: 180 }`.

Three problems, none disclosed:

1. **The stated rationale is wrong.** The comment says the change exists to make *back/forward* navigation
   instant. Back/forward navigation already restores from the Router Cache regardless of `staleTimes`.
   What `dynamic: 30` actually changes is **forward `<Link>` navigation**: a soft nav to any route visited
   in the last 30 s is served from the client cache with **no server request at all**.
2. **The server is not consulted, so neither is `middleware.ts`.** After a session expiry, a revoked
   session, or a role change, a user can navigate to a recently-visited protected route and be served their
   previously-cached RSC payload for up to 30 s. On a branch whose stated purpose is security containment
   this is the wrong direction. (Cross-*user* leakage is not reachable: all three sign-out paths —
   `navbar.tsx:57-59`, `sidebar.tsx:32-34`, `mobile-nav.tsx:35-37` — call `router.refresh()`, which clears
   the Router Cache, before `router.push('/login')`.)
3. **Stale data after a mutation.** Only 6 `router.refresh()` calls exist in `src/`. Any mutation that does
   not refresh, followed by a forward nav back to a page visited <30 s ago, shows pre-mutation data.
4. Minor and self-contradicting: `static: 180` is **below** the 300 s default, so static segments now
   refetch *more* often than before — a small perf regression inside a perf change.

### F4 — MEDIUM · `/dashboard` can now render an error page where it used to render a partial page

`src/app/dashboard/page.tsx:150-155`, plus `src/lib/data/applications.ts:93-105` via `:78`.

Seven reads on the post-login landing page moved from "discard the error" to `unwrap` → **throw**:
`applications.summaries`, `dashboard.checklist`, `dashboard.deadlines`, `dashboard.personalInformation`,
`dashboard.academicInput`, `dashboard.lifestylePreference`, `dashboard.subjects`.

The reasoning is sound and is the *right* direction — an empty dashboard is a lie. `src/app/dashboard/error.tsx`
exists, so it degrades to a boundary rather than a white screen. But note two things the commentary does not:

- `personalResponse` / `academicResponse` / `lifestyleResponse` use `.maybeSingle()`, which returns
  `PGRST116` when **more than one** row matches. I checked whether that is reachable: all three tables
  declare `profile_id uuid primary key` (`schema.sql:70,86,137`), so duplicates are impossible and this is
  **not** a new failure path. Noted because it is the kind of thing `unwrap` converts from "emptier page"
  into "error page" wherever the uniqueness is not actually enforced.
- Two reads on the same page were kept `soft` (`dashboard.lastCounsellorReply` `:117`, `dashboard.nextMeeting`
  `:262`). Both choices are defensible and both are documented at the call site — I agree with them.

`src/lib/chat/context.ts:122`: `loadApplicationBoard` now throws where the old code took `appsRes.data ?? []`.
**Verified** `buildContextForMode` has a `try/catch` at `:365` that degrades to "context unavailable", so the
claim holds and the assistant will not 500.

### F5 — MEDIUM · The chat and parent application reads got materially wider

`src/lib/data/columns.ts:78-79` (`APPLICATION_BOARD_SELECT`).

Consolidating five hand-written select strings onto one means the **narrow** callers now fetch the **widest**
shape. Against `origin/main`:

- `src/lib/chat/context.ts` gains `applications.notes`, `programs.id`, `programs.study_level`,
  `deadlines.id`, `deadlines.intake`, `deadlines.program_id`, `application_checklist.id`,
  `application_checklist.application_id`.
- `src/features/parent/api/data.ts` gains `applications.notes`, `programs.study_level`,
  `application_checklist.application_id`.

Two consequences:
- **Least privilege.** `applications.notes` is the student's own free-text note. The parent portal is
  documented as a read-scoped mirror; it now pulls that column across the guardian boundary on every
  `/parent/progress` and `/parent/finances` render. Nothing renders it today — it is not mapped into
  `ChildApplication` — but it is in the RSC render tree and one `...row` spread away from exposure. This
  deserves an explicit intent confirmation.
- **Query cost.** This repo has a documented history of PostgREST statement timeouts driven by query shape
  (`docs`, memory: search-redesign). A wider nested embed on the chat context path — which runs on every
  assistant turn — was not measured.

### F6 — MEDIUM · Parent portal tier badges: throw → silent degrade

`src/features/parent/api/data.ts:256,321` → `src/lib/data/applications.ts:229-252`.

`origin/main:src/lib/parent/data.ts:163-183` (`fetchTierByProgram`) used the local `unwrap` — i.e. **threw**.
It now calls `loadTierByProgram`, which is `soft(..., [])`. If the `student_matches` read fails,
`/parent/progress` and `/parent/finances` previously hit the parent error boundary; they now render every
application with **no Reach/Match/Safe badge**, which is indistinguishable from an unscored child. Logged, at
least. Documented at `applications.ts:220-228` but absent from the commit message.

### F7 — MEDIUM · `replaceOwnedRows` is a semantic change with an ineffective failure mode in one direction

`src/lib/profile/persist-intake.ts:35-90`.

Verified against `supabase/schema.sql:115-133,155-167`: all three tables are
`id uuid primary key default gen_random_uuid()` with plain columns and no identity/`generated always`
columns, so **re-inserting the snapshot verbatim (ids and `created_at` included) is legal** — the failure
mode the brief asked about does not exist here.

Answers to the specific questions:
- **Delete scope unchanged.** `.eq('profile_id', userId)` on all three, same as `origin/main`.
- **Empty-`rows` early return is correct.** Old code deleted unconditionally and skipped the insert when the
  list was empty; new code does the same (`if (rows.length === 0) return;` **after** the delete). Equivalent.
- **Restored rows keep their original `created_at`**, not a fresh default. Correct, and better.

What *is* new and undisclosed:
- **Three extra round trips per save** (one `select('*')` per table).
- **The read now throws where the old code proceeded.** A snapshot failure aborts the save *before* the
  delete — safer, but a save that previously succeeded now fails.
- **The safety net is silently empty if the SELECT policy is narrower than the DELETE policy.** Checked:
  `subjects_self` / `admissions_self` / `student_activities_self` are `for all` with
  `using (auth.uid() = profile_id)` (`schema.sql:956-979`), so SELECT is permitted and the guard works
  *today*. But nothing in the code detects the case where it silently degrades to a no-op — if a future
  policy change narrows SELECT, `previous` becomes `[]` with no error and the "compensating transaction"
  compensates nothing while still claiming to.
- On restore failure the thrown message changes shape entirely (a multi-sentence string naming the table).
  Nothing appears to match on message text, but the contract changed.

### F8 — LOW-MEDIUM · Wizard status message now persists across steps

`src/app/profile/_components/StudentIntakeForm.tsx:2077-2116`.

The status line and post-save CTA moved out of the Review `<section>` so the "Restored last saved progress."
message becomes visible for the first time. Side effect: `statusMessage` is never cleared on navigation, so
a red `role="alert"` **"Save failed."** set on Review now follows the user back through steps 1–5.

### F9 — LOW · Dashboard pipeline stage colours changed

`src/components/dashboard/hub/pipeline-card.tsx:14-21`.

`STAGE_COLOR` deleted in favour of `APPLICATION_STATUS_VISUAL`. Three of five stages change on the
dashboard: `planning` grey → info, `in_progress` blue → amber, `decision` amber → feature/violet. Also
`src/features/parent/ui/progress-board.tsx:41-44`: `enrolled` changes from emerald + `CheckCircle2` to
brand primary + `GraduationCap`. Intentional (it unifies two disagreeing tables), but it is a visual change
in a branch presented as containment/refactor.

### F10 — LOW · Parent-portal error contract changed

`src/features/parent/api/data.ts` (8 sites).

The deleted local `unwrap` threw `Error("parent data: ${label} query failed — ${res.error.message}")`. The
shared one throws a `DataError` whose message is *sanitised* (never the driver text), and it now
**calls `logger.error` as a side effect** on every failed parent query. All eight context labels changed
(`'guardian_links'` → `'parent.guardian_links'`). Not user-visible — `error-state.tsx:76` renders only
`error.digest` — but the type, message and logging behaviour all changed.

### F11 — LOW · `LOG_LEVEL` is silently ignored outside the Node runtime

`src/lib/observability/logger.ts:96-97` reads `process.env[name]` — dynamic property access. `src/lib/env.ts:46-49`
states the rule this violates: Next substitutes only *literal* `process.env.NAME` expressions, so a computed
lookup yields `undefined` in the Edge runtime and the browser. `LOG_LEVEL` therefore works on the Node server
and nowhere else. Minor, but it is the module's own documented rule being broken one file over.

### F12 — HIGH · Toasts raised from inside a migrated overlay are now silenced for screen readers

`src/components/ui/toast.tsx:45,109-118` × the dialog migrations.

Radix Dialog runs `hideOthers()`, which sets `aria-hidden="true"` on the app root while any `DialogContent`
is open (verified at the DOM level, along with `document.body.style.pointerEvents === 'none'`).
`ToastViewport` renders **inline in the React tree**, not in a portal, so its `role="status"` /
`role="alert"` cards (`toast.tsx:92`) now sit inside that hidden subtree and are never announced.

Newly affected because these overlays were plain `div`s on `origin/main`:
- `help-thread-drawer-impl.tsx` — all eight toasts (reply sent, note saved, meeting proposed / confirmed /
  cancelled / completed, request accepted / resolved) plus every error path.
- `_universities-client.tsx` — assign-quest and delete-deck success and error toasts.

`toast.tsx:111-113` already documents raising the viewport to `z-toast` *because* the help drawer used to
hide it visually. The visual half was fixed; migrating the drawer to Radix broke the ARIA half. Visual
z-order and click-to-dismiss are fine (`z-toast` 300 > `z-modal` 200; the card's `pointer-events-auto`
beats the body's `none`) — this is announcement only.

Note the obvious fix does not work: portalling the viewport to `document.body` makes it a sibling of the
Radix portal, which `hideOthers` also hides. Options are an `aria-live` mirror rendered inside
`DialogContent`, or `@radix-ui/react-toast`, which registers with the layer stack.

### F13 — MEDIUM-HIGH · Corner radius silently downgraded on three migrated modals (tailwind-merge trap)

`src/components/ui/dialog.tsx:148` — the centre base is `w-full max-w-lg rounded-xl sm:rounded-2xl`.
tailwind-merge only de-dupes classes sharing a variant prefix, so a consumer's unprefixed `rounded-3xl`
evicts `rounded-xl` but **`sm:rounded-2xl` survives and wins at ≥640 px**. Rendered class list, verbatim
from a DOM probe: `… focus:outline-none sm:rounded-2xl … w-full max-w-2xl flex-col rounded-3xl`.

| Call site | Passes | Was | Now renders ≥640 px |
|---|---|---|---|
| `src/app/counsellor/_components/analytics-drilldown.tsx:97` | `rounded-3xl` | 24 px | **18 px** |
| `src/app/counsellor/universities/_universities-client.tsx:836` | `rounded-4xl` | 28 px | **18 px** |
| `src/app/counsellor/universities/_universities-client.tsx:914` | `rounded-4xl` | 28 px | **18 px** |

This is precisely the tailwind-merge trap the UI-uplift notes warn about. Fix: add the `sm:` twin at each
call site, or collapse the primitive's base to a single unprefixed `rounded-2xl`.

### F14 — MEDIUM · Command palette scrim colour and mobile geometry changed

`origin/main:src/components/layout/command-palette.tsx:284,299` had `bg-background/70 backdrop-blur-sm`,
panel `rounded-2xl` at all widths, container `pt-24`. The shared primitive gives `bg-black/50`
(`dialog.tsx:79`), `rounded-xl sm:rounded-2xl` (`:142`) and `pt-20 sm:pt-24` (`:95`).
**In light theme the palette backdrop flips from a light wash to a dark one**; corners tighten to 10 px
below 640 px; the panel sits 16 px higher on phones.

### F15 — MEDIUM · Notification bell moves focus into the panel but only restores it on Escape

`src/components/notifications/notification-bell.tsx:106-111` now calls `panelRef.current?.focus()` on open.
Focus is restored only on the Escape path (`:83-92`). The outside-mousedown close (`:71-80`) and
`handleItemClick` (`:127-137`) unmount a focused element, so focus drops to `<body>` and the next Tab
restarts at the top of the document. Before this branch focus never left the bell, so nothing could be lost.
Adding `buttonRef.current?.focus()` to the mousedown path closes it.

### F16 — LOW · Analytics drilldown can paint one frame of the *previous* drilldown

`src/app/counsellor/_components/analytics-drilldown.tsx:55-58`. `snapshot` is written in a `useEffect`, but
`open={Boolean(data)}` flips in the same render as `data`. On the second and subsequent opens Radix mounts
and starts the enter animation while `snapshot` still holds the previous title/subtitle/accent/items. (The
first open shows one empty frame for the same reason.) `analytics-drilldown.test.tsx` cannot catch it —
`act()` flushes the effect before the assertion. One-line fix: `const view = data ?? snapshot`.

### F17 — LOW · Assistant mobile rail grew 300 px → 360 px

`origin/main` used `w-[300px] max-w-[85vw]`. `src/components/assistant/assistant-workspace.tsx:807`
overrides border/bg/shadow/padding but not width, so it inherits `align="left"`'s `w-[min(88vw,360px)]`
(`dialog.tsx:130`).

### F18 — LOW · Scroll lock now exists where it never did

Only the drilldown ever set `document.body.style.overflow`, and that call is deleted —
`grep -rn "body.style.overflow" src/` returns **zero hits**, so there is no double-lock. But the palette,
help drawer, assistant rail and both deck modals now get `react-remove-scroll` where the page previously
scrolled behind them. Its scrollbar-gap compensation pads `body`, while `navbar` and `mobile-nav` are
`position: fixed` and do not shift — expect a few-pixel content jog when any dialog opens.

### F19 — LOW · Misleading new comment blames the wrong file

`src/features/parent/api/data.ts:162-164` now attributes the `english_status` / `COMPLETION_COLUMNS` bug to
this file. Verified: the three column lists this file already had were byte-identical to `COMPLETION_COLUMNS`,
`english_status` included. The buggy caller was `middleware.ts`. No behaviour change; the comment is wrong.

---

## Items checked and found sound

**`src/lib/env.ts` + `src/instrumentation.ts` (brief item 4).**
- Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are required. I enumerated every
  `process.env` read in `src/` and `scripts/` against the two schemas; nothing else is load-bearing at boot.
- `GEMINI_API_KEY` **does** degrade gracefully — verified at all four reads: `api/chat/route.ts:115` and
  `api/essay-assist/route.ts:159` return 503; `api/chat/actions/execute/route.ts:220` short-circuits to
  `null`; `lib/chat/gemini.ts:21` constructs with `?? ''` and is only reached past those guards.
- `SUPABASE_SERVICE_ROLE_KEY` is correctly optional, but the docblock at `env.ts:222-228` says it has *"zero
  importers under `src/`"* — it is read at `src/lib/supabase/service.ts:17`. That module has no importers in
  `src/`, so the conclusion holds; only the sentence is wrong.
- `instrumentation.ts` returns early for `NEXT_RUNTIME === 'edge'` (`:56-59`), so `assertEnv()` never runs
  there and **middleware is not affected**. Both required vars are `NEXT_PUBLIC_*` and are statically inlined
  at build, so a successful build cannot produce a boot that fails on them. The Edge bundle does pay for
  importing `@/lib/env` (zod) and `@/lib/observability` — worth confirming against the Edge size budget, but
  neither module has top-level side effects.
- `logger.ts` is browser/Edge-safe (no Node built-ins, guarded `process` access at `:96`, redaction by key
  pattern at `:128`). **No client component imports `@/lib/data/errors`, `@/lib/data/applications` or
  `@/lib/observability`** — checked by scanning every importer for a `'use client'` pragma.

**`src/features/parent/**` (brief item 7).** 10 of 12 moved files are import-only. The two that are not are
F6 and F9 above. All 12 originals were **deleted**, not duplicated; zero remaining imports of `@/lib/parent/*`
anywhere in `src/`, `__tests__/`, `e2e/`, `scripts/` or the tooling configs. The `index.ts` barrel re-exports
everything with an external consumer; the nine withheld exports were verified to have had no consumers
outside the slice on `origin/main`. Role/status literals (`'Mother'|'Father'|'Guardian'`,
`.eq('status','active')`, `'counsellor'|'parent'`, tier strings, `'todo'|'doing'|'done'`) are **all
identical** — no find-and-replace clobber in this slice.
One weak invariant: `index.ts:5-7` claims deep imports fail `npm run lint:boundaries`, but
`.dependency-cruiser.cjs:315` excludes `^__tests__/` and `package.json:20` cruises `src` only —
`__tests__/parent/slice.test.ts:38` deep-imports and passes.

**`StudentIntakeForm.tsx` extraction (brief item 8).** Mechanically diffed, not eyeballed:
- `toPayload` ≡ old `buildPayload` — **zero diff** across 109 lines. No `?? ''`/`|| ''` swaps, no
  `parseInt`/`Number` change, no changed literal, no `new Date('YYYY-MM-DD')`.
- `fromPayload` ≡ old `applyPayload` — field-for-field identical.
- `validateStep1/2/3/4/5`, `validateSubjects`, dispatch — zero logical diff.
- `intake-options.ts` — all 15 option tables byte-identical, EN-dash in `ACTIVITY_DURATIONS` preserved.
- `parseNumber`, `computeIbSubjectSum`, `formatNationalities`, `shouldShowEnglishScore`,
  `shouldShowAdmissionsTests`, all four `buildInitial*` — identical bodies.
- **The `formState` `useMemo` does not change effect firing.** It appears in **no** `useEffect` dependency
  array. All eight effects have byte-identical dep arrays to `origin/main` (the ninth is a new, additive
  unmount cleanup). The only delta is `stepCompletion`'s `useMemo` deps (`:947`), which now recompute on
  `englishScoreOverall` / `activityRows` changes — the computed value is identical and there is no
  `React.memo` in the file, so this is three extra pure validator runs per keystroke and nothing else.
- `focusFirstError` rescoped from `document` to `contentTopRef` (`:840`) — verified all 20 `data-field`
  nodes live inside that ref (`:1124-1679`).
- `recalculateStudentScore` / `resubmitStudentProfile` deleted — **zero callers** in `src/`, `scripts/`,
  `__tests__/`. Safe, and it removes two unauthenticated-surface server-action endpoints.
- `page.tsx`: `requireIdentity()` redirects anonymous users to `/login`, identical to the removed guard;
  `identity.email` makes the email fallback chain equivalent. `__tests__/profile` → 291/291 pass.

**The dialog migrations (brief item 5).** Everything the brief asked about was checked against rendered DOM,
not just source. Regressions are F12–F18 above; the following are genuinely intact:
- **⌘K / Ctrl+K survives the lazy split.** `open` lives above the boundary
  (`command-palette.tsx:27-45`) and `<CommandPaletteDialog>` renders unconditionally, so a keypress landing
  before the chunk arrives is honoured. Because it always renders, `next/dynamic` fetches at hydration and
  the impl mounts with `open=false` — it **does** see the `false→true` transition, so the enter animation
  and `onOpenAutoFocus` run normally. A second ⌘K closes it. Both wrappers are `'use client'` on line 1, so
  `ssr: false` is legal.
- **Palette autofocus lands on the search input**, not the panel — `DialogTitle`/`DialogDescription` are
  `sr-only` and non-tabbable. Arrow/Enter handling (`command-palette-dialog.tsx:227-243`) still works;
  Escape delegates to Radix once, not twice.
- **Help drawer focus target is identical.** The old code focused `querySelector(FOCUSABLE)` = the header
  Close button; Radix's first-tabbable is `DialogClose`, the same element. Tablist roving
  `tabIndex`/Arrow keys (`help-thread-drawer-impl.tsx:314-340`) untouched — Radix Dialog does not intercept
  arrows. Composer Enter/Shift+Enter/IME guard byte-identical. `w-full max-w-xl h-full` matches the old aside.
- **No double-Escape.** No dialog is nested inside another overlay; palette-over-drawer is arbitrated by
  Radix's layer stack. The bell's `document` Escape listener cannot coexist with a Radix layer because its
  new `focusout` handler closes the bell the moment Radix takes focus.
- **No `Select`/`Popover` inside any migrated Dialog** — `_universities-client.tsx:494` sits in the filter
  panel, outside both dialogs.
- **Outside-click semantics preserved.** All five old overlays closed on backdrop click unconditionally;
  Radix's default matches. The one deliberate exception — no dismiss while `isDeletingDeck` — still holds
  (`_universities-client.tsx:390-392`), and Radix now covers Escape *and* scrim *and* the Close button with
  the one guard where the old code needed two.
- **z-index ladder intact.** `nav` 30 · `docked` 40 · `panel` 60 · `overlay` 100 · `modal` 200 · `toast` 300.
  The palette moved *up* (`z-overlay` → `z-modal`). No inversion.
- **`aria-modal` lies fixed, not introduced.** Every migrated overlay has a real `DialogTitle`; the two with
  no visible title use `sr-only` titles + descriptions. No missing-title console warnings.
- **State reset on close is equivalent.** Palette clears `query`/`activeIndex`
  (`command-palette-dialog.tsx:182-186`); drawer resets on `[open, requestId]`
  (`help-thread-drawer-impl.tsx:87-96`); the assign modal never reset `assignSelection`/`assignMessage` on
  `origin/main` either. No in-flight request needed aborting.
- **`ui/dialog.tsx` itself is purely additive** — `align` gains `'right'` and `'top'`; the `'center'` and
  `'left'` branches are byte-equivalent to `origin/main` apart from the `isSlideOver` refactor.
- All eight new `__tests__/ui` suites (49 tests) pass.

**Dead-code deletions.** `deadline-nudges`, `outcome-tracker`, `pulse-cards`, `stats-card`,
`share-match-button`, `subject-grade-table`, `use-typing-effect`, `StepRoadmap` — grepped across `src/`,
`__tests__/`, `e2e/`. Only two stale prose mentions in `src/lib/data/student-demo-data.ts:4-5`. Genuinely dead.

**`use-launch-href.ts`.** The dynamic-import deferral is correct; `href` already defaulted to `/login` and
already updated asynchronously, the new `catch` is a strict improvement, and the `[]` dep array is right now
that `useSupabase()` is gone.

**`src/lib/data/errors.ts` dispositions.** The `unwrap`/`soft` split is well-designed and each call site
states its reason. Two traps worth knowing about, neither currently hit: `soft` returns
`result.data ?? fallback`, so a `{ head: true, count: 'exact' }` query (whose payload is `count`, with
`data === null`) would always yield the fallback; and `unwrap` returns `T` which may be `null` for
`.maybeSingle()`, so callers must keep the `?? []` / `?? null`.

---

## Proved with a scratch test

All scratch files were deleted after use; nothing was left in the repo.

1. **Radix hydration wipe is real, and the guard fixes it.** jsdom + RTL, controlled `Select` in a `<form>`
   with a mount-effect hydration. Raw `SelectPrimitive.Root` → `onValueChange('')`, value wiped. Wrapped
   `Select` → no call, value `"2026"` preserved.
2. **`<SelectItem value="">` is legal in `@radix-ui/react-select@2.3.7` and the guard silently breaks it.**
   Rendered without throwing under both roots; clicking it fires `onValueChange('')` under raw Radix
   (value clears) and fires **nothing** under the wrapper (value unchanged). This falsifies the wrapper's
   stated safety premise.
3. **The guard breaks native `<form>` reset for any Select whose initial value was `''`.** Raw Radix reset
   `"b"` → `""`; wrapped stays `"b"`. Latent — no `type="reset"` exists in `src/`.
4. **`String.localeCompare` ≠ Postgres byte order** for the `sortByFit` tiebreaker. Node script; divergence
   demonstrated for case-differing ids, benign for canonical lowercase UUIDs.
5. **The zod intake gate rejects form-producible payloads** — real `toPayload` output fed into
   `studentProfilePayloadSchema.safeParse`, rejections reproduced for the bounds listed in F1.

---

## Recommended before merge

1. **F1** — loosen the intake schema bounds or surface the failing field. This is the one finding that will
   hard-block a real user from saving.
2. **F12** — restore toast announcements from inside dialogs (an `aria-live` mirror inside `DialogContent`,
   or `@radix-ui/react-toast`). Every confirmation in the counsellor help drawer is currently silent to AT.
3. **F2** — decide whether per-page fit sorting is wanted; if so, sort the accumulated list, not the page.
4. **F3** — reconsider `staleTimes.dynamic: 30`, or at minimum fix the rationale comment and confirm the
   30 s auth-staleness window is acceptable on a security branch.
5. **F13** — add the `sm:rounded-*` twin at the three call sites (one-line each).
6. **Select guard** — correct the docblock, add the two pinning tests, and consider a dev-mode warn.
7. **F5** — confirm `applications.notes` crossing into the parent portal's read is intentional.
8. **F15 / F16** — two one-liners (`buttonRef.current?.focus()`; `const view = data ?? snapshot`).
