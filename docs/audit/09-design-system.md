# 09 — Design System & Styling Layer Audit

**Scope:** CSS, design tokens, `tailwind.config.ts`, `globals.css`, UI primitives as a *system*.
**Repo:** `/Users/gregfranck/Ascenda` @ `fix/ui-phase0-bugs` (e7f948d)
**Method:** static counts over `src/` (307 `.tsx`, 134 `.ts`). All counts are `rg` occurrence counts unless labelled "files".
**Read-only:** no repo file was modified.

---

## Executive summary

This codebase has a **genuinely good token layer that nothing enforces**. The `surface-*` /
tone-token / elevation / radius / z-index system in `tailwind.config.ts` + `src/app/globals.css`
is unusually well-reasoned — every decision is documented with its WCAG measurement and the bug
that motivated it. The three memory claims I was asked to verify all **hold**:

| Claim | Verdict | Evidence |
|---|---|---|
| `surface-*` is the card system of record; `panel` near-dead | **TRUE, and `panel` is now fully dead** | `surface-card` 102 uses / 55 files; `.panel` **0** call sites (`tailwind.config.ts:14`) |
| One radius ladder bound to `--radius`; never `rounded-[Npx]` | **TRUE** | 6 total `rounded-[`, 4 of them `rounded-[inherit]`; **zero** `rounded-[Npx]` |
| Status = semantic tokens, `text-primary-ink` for copy | **TRUE inside the app, FALSE on the landing pages** | tone tokens 1,061 uses; `text-primary-ink` 171 uses; but 245 palette literals survive in `landing*` |

The failure mode is **governance, not design**. There is no lint rule, no CI check, and no test
that enforces any of it (`eslint.config.mjs` has zero style rules; `.github/workflows/ci.yml`
runs lint/typecheck/test/build only; `eslint-plugin-tailwindcss` is not a dependency). The result
is a clean core and one large un-migrated island (`src/components/landing*`, 23 files) that holds
**99% of all palette-literal violations** and **65% of all `dark:` variants** — plus a slow leak of
primitive-bypass in `src/app/counsellor/` (101 raw `<button>` vs 6 `<Button>`).

---

## Current state

### Token inventory

**Layer 1 — CSS custom properties** (`src/app/globals.css:5–215`): **46 unique properties**, each
declared twice (`:root` light, `[data-theme='dark']` dark) = 92 declarations.

| Group | Count | Properties | Referenced? |
|---|---|---|---|
| Neutrals / chrome | 14 | `background` `foreground` `card(-foreground)` `popover(-foreground)` `muted(-foreground)` `secondary(-foreground)` `border` `input` `ring` | all live (`border` 457, `muted` 1241, `foreground` 639) |
| Brand | 4 | `primary` `primary-foreground` `primary-ink` `accent(-foreground)` | live; `primary-ink` 171, `accent` only 14 |
| Destructive | 2 | `destructive(-foreground)` | 58 |
| Tone × 4 values | 20 | `{success,warning,danger,info,feature}` × `{DEFAULT,-fill,-foreground,-subtle}` | **all 20 live**; totals: success 311, danger 241, warning 193, info 166, feature 150 |
| Chart series | 5 | `series-1..5` | 45 total, thinly used |
| Geometry | 1 | `--radius` | drives the whole radius ladder |

**Zero unreferenced custom properties.** That is rare and worth saying out loud.

**Layer 2 — Tailwind theme extensions** (`tailwind.config.ts:83–290`):

| Extension | Tokens | Uses | Health |
|---|---|---|---|
| `colors` | 40 keys | ~4,700 | healthy |
| `boxShadow` (elevation ladder) | 5 (`e-1..e-4`, `nav`) | **145** (e-1 86, e-2 25, e-3 19, e-4 14, nav 1) | healthy but 25 off-ladder `shadow-sm/md/lg/xl/2xl` survive |
| `borderRadius` | 7 (`sm`…`4xl`) | 1,115 (`full` 490, `2xl` 240, `xl` 226, `lg` 111, `4xl` 31, `md` 20, `3xl` 14, `sm` 3) | **healthy** — this migration succeeded |
| `opacity` (extra steps 3/8/15/45/85) | 5 | 3→8, 8→4, 15→16, 45→8, 85→24 | **fully clean** — every one of ~1,400 opacity modifiers in `src` is now in the legal scale |
| `zIndex` (named layers) | 8 | **52** vs **92 raw numeric `z-`** | **broken — see HIGH-6** |
| `fontFamily` | 2 (`sans`, `heading`) | live | healthy |
| `typography` (prose token binding) | 30 CSS vars | `prose` used in 4 render files | healthy, correctly token-bound |
| `keyframes` / `animation` | 3 (`accordion-down`, `accordion-up`, `shimmer`) | accordion **0 / 0**, shimmer 1 | 2 of 3 dead |

**Layer 3 — component classes.**
`@layer components` in `globals.css:338–438` (16 classes) + `customUtilitiesPlugin` in
`tailwind.config.ts:11–59` (13 classes) + `@layer utilities` (4 classes) = **33 component classes.**

| Class | Uses | Class | Uses |
|---|---|---|---|
| `eyebrow` | 281 | `form-input` | 23 |
| `text-label` | 258 | `surface-chip` | 14 |
| `surface-card` | 102 | `surface-toolbar` | 14 |
| `hover-lift` | 37 | `surface-stat` | 14 |
| `surface-subcard` | 36 | `eyebrow-accent` | 14 |
| `nav-pill` | 13 | `scrollbar-thin` | 8 |
| `text-body-sm` | **7** | `shell-gutter` | 7 |
| `form-label` | 6 | `form-feedback` | 6 |
| `form-field` | 5 | `surface-stage` | 4 |
| `nav-pill-active` | 3 | `scrollbar-none` | 3 |
| `form-action` | 3 | `form-feedback--error` | 3 |
| `form-stack` | 2 | `section-fade` | 1 |
| `form-grid` | 1 | `navbar-brand` | 1 |
| **DEAD (0):** `panel`, `text-gradient`, `helper-text`, `page-soft-bg`, `surface-card--static`, `form-input--multi`, `form-input--textarea`, `form-feedback--success` | | | |

**Layer 4 — class-string lookup tables in `src/lib`** (the de-facto "component token" layer,
7 files, 665 lines, all outside any type-checked contract):

| File | Lines | Consumer files |
|---|---|---|
| `src/lib/theme/categories.ts` | 372 | 38 |
| `src/app/counsellor/_components/chart-palette.ts` | 76 | 8 |
| `src/lib/counsellor/stage-colors.ts` | 59 | 3 |
| `src/lib/counsellor/deck-theme.ts` | 54 | 3 |
| `src/lib/theme/fit-score.ts` | 39 | 5 |
| `src/app/counsellor/_components/avatar-palette.ts` | 33 | 3 |
| `src/lib/config/toolbox.ts` | 32 | 25 |

### Violation counts, per directory

| Directory | files | `[Npx]` | `rounded-[` | raw hex | palette literals | `style={{` | `dark:` | `xxx-[…]` arbitrary |
|---|---|---|---|---|---|---|---|---|
| `src/app` | 209 | 26 | 1 | 2 | 2 (comments) | 21 | 19 | 19 |
| `src/components` | 141 | 77 | 5 | 42 | **245** | 45 | 125 | 99 |
| `src/lib` | 78 | 0 | 0 | 0 | 1 (comment) | 0 | 6 (comments) | 0 |
| `src/hooks` | 11 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| **TOTAL** | **439** | **103** | **6** | **36** | **248** | **66** | **138** | **118** |

Breaking `src/components` down shows the violations are **not distributed** — they are one island:

| Sub-directory | files | `[Npx]` | hex | palette | `dark:` | arbitrary colour |
|---|---|---|---|---|---|---|
| `landing-preview/` | 16 | 22 | 34 | 93 | 23 | 28 |
| `landing/` | 7 | 15 | 6 | **152** | 67 | 57 |
| `university-search/` | 22 | 12 | 0 | 0 | 10 | 1 |
| `layout/` | 15 | 3 | 0 | 0 | 11 | 5 |
| `assistant/` | 12 | 4 | 0 | 0 | 0 | 0 |
| `toolbox/` | 8 | 2 | 0 | 0 | 2 | 6 |
| `dashboard/` | 15 | 2 | 0 | 0 | 2 | 1 |
| `ui/` | 16 | 3 | 0 | 0 | 2 | 0 |
| all other 12 dirs | 30 | 8 | 2 | 0 | 1 | 1 |

**`landing/` + `landing-preview/` = 23 files (5% of the tree) carrying 245/248 palette literals
(99%), 40/36 hex (all the non-`layout.tsx` ones), and 90/138 `dark:` variants (65%).**

Worst individual files:

| File | palette | `dark:` | arbitrary type | hex |
|---|---|---|---|---|
| `src/components/landing/mock-viz.tsx` | 21 | 27 | 19 | 0 |
| `src/components/landing/product-widgets.tsx` | 22 | 21 | 15 | 0 |
| `src/components/landing/TeamSection.tsx` | 15 | 9 | 8 | 0 |
| `src/components/landing/hero-app-tour.tsx` | 11 | 8 | 10 | 0 |
| `src/components/landing-preview/step-shots.tsx` | 9 | 11 | 15 | 0 |
| `src/components/landing-preview/preview-cta.tsx` | 15 | 0 | 3 | 0 |
| `src/components/landing-preview/rocket-art.tsx` | 0 | 0 | 0 | 34 (SVG illustration — legitimate) |

The palette literals in `landing*` decompose as: **emerald 79, rose 47, amber 43, sky 29,
violet 22**, slate 19, indigo 5, orange 1. Those first five are *exactly* the five legacy tone
names that `src/lib/theme/categories.ts:97-107` says were already migrated to
`success/warning/danger/info/feature`. The landing pages are the un-swept remainder of that
migration.

### Other system-level counts

| Metric | Value |
|---|---|
| Arbitrary type sizes `text-[…]` (excl. globals.css) | **99** |
| …of which below the documented 11px floor (`globals.css:288`) | **24** |
| …of which are `text-[0.6875rem]` (= `.text-label`, already a named step) | **39** |
| …of which are `text-[0.8125rem]` (= `.text-body-sm`, already a named step) | **20** |
| Arbitrary `tracking-[…]` (despite `.eyebrow` collapsing "a 15-value free-for-all") | **46** |
| Raw numeric `z-` vs named ladder | **92 vs 52** |
| Off-ladder shadows (`sm/md/lg/xl/2xl`) vs ladder (`e-*`) | **25 vs 145** |
| `cn()` call sites | 643 |
| `className={\`` template literals (bypass `cn()`/tailwind-merge) | **25** |
| `cva` usages | 4 (`button`, `badge`, `tabs`, `select` — all in `ui/`) |
| Direct `clsx` import (bypassing `cn`) | 1 file |
| Bare `rounded` (0.25rem, off the ladder) | 19 |

---

## Findings

### [CRITICAL] Nothing enforces the design system — it is prose, not policy

**Evidence:** `eslint.config.mjs` (all 62 lines) enables exactly one non-Next rule
(`@typescript-eslint/no-unused-vars`). `package.json` has no `eslint-plugin-tailwindcss`,
no `stylelint`, no design-lint script. `.github/workflows/ci.yml` runs `lint`, `typecheck`,
`test`, `build` — none of which can see a palette literal. `__tests__/` contains **zero** files
referencing `className`, `tailwind`, or `globals.css`.

Every rule in this system currently lives as a comment: `tailwind.config.ts:4-10` ("prefer the
`.surface-*` family… that's the card system of record"), `:177-179` ("58 sites used arbitrary
`rounded-[Npx]`"), `:190-198` (the opacity trap), `globals.css:274-290` (the 7-step type scale and
the 11px floor), `globals.css:341-349` (the `text-secondary` collision), `src/lib/utils.ts:5-31`
(the tailwind-merge group registration), `src/components/ui/badge.tsx:6-29`.

**Why it causes drift/rework:** These comments encode real, expensive incidents — a class-name
collision that shipped white-on-white text to chat bubbles; 68 silently-dead opacity modifiers;
`text-primary` failing AA at 3.58:1 on 10px labels. Every one of those was found by a human
re-reading the codebase, not by a machine. The landing island (below) is what happens over three
months without a gate: the *same* five-tone migration that was completed everywhere else simply
never reached 23 files, and nothing noticed.

**Fix:** the enforcement stack in "Target design system" below. Minimum viable version is a
40-line `scripts/check-design-tokens.mjs` wired into CI — it catches 90% of the classes of
violation counted here and needs no new dependency.

---

### [HIGH] The landing pages are a second, un-migrated design system — and a sub-CLAUDE.md sanctions it

**Evidence:**
- `src/components/landing/CLAUDE.md` § *Color*: *"use near-black (`#0A0A0F`) / warm off-white
  (`#F8F7F4`) equivalents… Muted text: `#5A5A66`-class greys on light, `#9C9CA8` on dark."*
  This instructs authors to write **raw hex**, in direct contradiction of the root token contract.
- `src/app/page.tsx:1-18` — the live `/` route imports 12 components from `landing/` +
  `landing-preview/`. This is production, not dead preview code.
- 245 palette literals: `src/components/landing/mock-viz.tsx:473`
  (`text-emerald-600 dark:text-emerald-400`), `TeamSection.tsx:149`
  (`border-violet-500/30 … text-violet-700 … dark:text-violet-300`),
  `TeamSection.tsx:141` (`from-violet-500 to-violet-600 … shadow-violet-500/25 ring-violet-500/10`),
  `landing-preview/preview-cta.tsx:526` (`bg-slate-50 text-slate-900 shadow-xl … hover:shadow-2xl`).
- 24 sub-floor type sizes, all here: `mock-viz.tsx:299` `text-[0.5rem]` (8px),
  `mock-viz.tsx:260,276,377,448,467` `text-[0.5625rem]` (9px),
  `landing-preview/step-shots.tsx:191` `text-[0.5625rem]`, `:350` `text-[0.65625rem]`.

**Why it causes drift/rework:** Two problems compound. (a) A visitor who lands on `/` in dark mode
sees hand-paired `dark:` colours that were never contrast-tested, while every in-app surface was;
`text-violet-700 dark:text-violet-300` is exactly the pattern
`src/app/counsellor/_components/avatar-palette.ts:13` documents as having been removed for failing
AA. (b) The tone-token change that `globals.css:38-96` promises ("tune one variable, the whole app
follows") is a lie for 5% of the tree, so any brand-colour change now needs a manual sweep of 23
files. The `#0A0A0F`/`#F8F7F4` rule also *cannot* be honoured — `--background` is
`220 16% 96%` / `224 32% 6%`, neither of which is those hexes, so following the sub-doc guarantees
a mismatch against the app the visitor is about to enter.

**Fix:** (1) Amend `src/components/landing/CLAUDE.md` § Color to name tokens, not hex — the
existing tone tokens already cover all five landing tones. (2) Codemod the 245 literals with the
mapping already documented at `src/lib/theme/categories.ts:104-107`:
`emerald→success, rose→danger, amber→warning, sky→info, violet→feature`; `slate-*` → `muted-*` /
`foreground`. Every `dark:` twin of a migrated literal is then deleted, not translated.
(3) Raise the 24 sub-floor sizes to `.text-label`. Exempt only `landing-preview/rocket-art.tsx`
(34 hex values in an SVG illustration — legitimately outside the token system; add an
`eslint-disable`-style allowlist entry rather than migrating it).

---

### [HIGH] Three parallel card systems, and the React one is losing

**Evidence:**
- `.surface-card` (`globals.css:385`) — **102 uses across 55 files**. The system of record.
- `<Card>` (`src/components/ui/card.tsx:4-23`) — **7 JSX usages, 3 importing files.** Its class
  string at `card.tsx:17` is a near-copy of `.surface-card` minus `overflow-hidden` and padding.
- Hand-rolled: **75** occurrences of `rounded-{xl,2xl,3xl,4xl} border … bg-card`, of which **28**
  are the byte-exact `rounded-2xl border border-border bg-card`:
  `src/components/university-card.tsx:235,275`, `university-card-skeleton.tsx:9,27`,
  `help/help-thread-drawer.tsx`, `layout/sidebar.tsx:39`, `layout/navbar.tsx:66`,
  `layout/nav-dropdown.tsx:103`, `layout/command-palette.tsx`,
  `notifications/notification-bell.tsx:135`, `university-search/IntelligentSearchBar.tsx:426`,
  `university-search/filters/SortMenu.tsx:121`, and 15 more.
- `.panel` (`tailwind.config.ts:14-16`) — **0 call sites.** The memory's "2 uses" is now zero; the
  122 textual matches for "panel" are `z-panel` (6), DOM ids, and prose.

**Why it causes drift/rework:** `dark:border-white/10` has to be hand-repeated at all 28 sites
because the token doesn't carry it (see MEDIUM below); `overflow-hidden` is present on
`.surface-card` and absent from the hand-rolled copies, so a card's rounded corner clips its
children in one place and not another. Any elevation or radius change requires 3 edits + a sweep.
`<Card>`'s existence with 7 uses is worse than useless — it invites new code down a fourth path.

**Fix:** Delete `.panel` from `tailwind.config.ts:11-17`. Re-export `Card` as a thin wrapper that
literally renders `<div className={cn('surface-card', className)}>` so there is exactly one class
string, and keep `CardHeader/Title/Description/Content/Footer` as the slot API. Codemod the 28
exact-match hand-rolls to `surface-card` (mechanical). The 47 near-matches need eyes.

---

### [HIGH] `Badge` is a well-built primitive with 2 usages; 44 hand-rolled pills and two tone vocabularies

**Evidence:**
- `src/components/ui/badge.tsx` — 79 lines, `cva`, 8 variants × 2 sizes, an AA-verified tone
  bundle, an `asChild` escape hatch, a documented tailwind-merge hazard. **`<Badge` appears
  2 times in the entire app; 1 importing file.**
- `src/lib/theme/categories.ts:110-120` defines `chip:` as
  `'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-danger-subtle text-danger border border-danger/25'` —
  which `badge.tsx:14-16` explicitly says it copied "verbatim". 38 files consume `categories.ts`.
- 44 further ad-hoc pill class strings matching `inline-flex … rounded-full … text-xs|text-label`,
  e.g. `src/components/university-card.tsx:305,311`,
  `src/app/counsellor/_components/outcome-dashboard.tsx`.
- **Two names for the same five tones:** `categories.ts:60-67` exports
  `CategoryTone = 'rose'|'amber'|'emerald'|'sky'|'violet'|'primary'|'neutral'`;
  `badge.tsx:36-45` exports `success|warning|danger|info|feature|primary|neutral|outline`.

**Why it causes drift/rework:** The chip geometry now exists in three places that must be kept
pixel-identical by hand (`badge.tsx:49`, `categories.ts:110`, and 44 call sites). The dual
vocabulary means a developer reading `tone: 'rose'` has to know it renders `--danger`, and a
grep for "which components show danger state" misses 38 files. `badge.tsx:14` even states the
intent — *"categories.ts to eventually hand out Badge props instead of class strings"* — that
migration was never done.

**Fix:** Change `categories.ts` to emit `{ variant: BadgeVariant }` instead of `chip: string`,
rename `CategoryTone` to the semantic names with a deprecated type alias for one release, then
codemod `<span className={cat.chip}>` → `<Badge variant={cat.variant}>`. Delete the geometry from
`categories.ts` entirely so `badge.tsx:49` is the only definition.

---

### [HIGH] 148 raw `<button>` elements across 42 files have no focus ring at all

**Evidence:** 266 raw `<button>` app-wide (vs 105 `<Button>`). Of those, **148 sit in 42 files
that contain zero `focus-visible`**. Concentration:

| Region | files | raw `<button>` | `<Button>` |
|---|---|---|---|
| `src/app/counsellor/` | 56 | **101** | 6 |
| `src/app/counsellor/_components/` alone | 27 | 83 | 6 |
| `src/components/toolbox/` | 8 | ~29 | few |
| `src/app/profile/` | 8 | 19 | 11 |

Worst single files: `counsellor/universities/_universities-client.tsx` (15),
`components/toolbox/essay-workshop.tsx` (16), `counsellor/_components/widget-grid-core.tsx` (12),
`counsellor/_components/analytics-charts.tsx` (11), `app/profile/_components/StudentIntakeForm.tsx` (19).

`buttonVariants` (`ui/button.tsx:13`) carries
`focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` in its base class, so
every one of these would have got a correct ring for free. Note `.nav-pill` (`globals.css:413`)
*also* has no focus ring — `ui/tabs.tsx:25-28` documents this and patches around it at the call
site, which means the same patch has to be repeated by every other `.nav-pill` consumer.

**Why it causes drift/rework:** This is a WCAG 2.4.7 failure across the entire counsellor surface,
and it is invisible to the current CI. It is also the clearest signal that "reach for the
primitive" isn't a habit in `src/app/counsellor/**` — 94% of its buttons are raw.

**Fix:** Add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
focus-visible:ring-offset-2` into `.nav-pill` (one edit, 13 sites fixed, lets `tabs.tsx` and
`section-nav.tsx` drop their local `PILL_FOCUS`). Then migrate the counsellor `_components`
buttons to `<Button variant="ghost"|"outline" size="sm"|"icon">` — this is the single highest
value/effort ratio item in the audit. Add the lint rule below so raw `<button>` without
`focus-visible` errors.

---

### [HIGH] Five hand-rolled modals with no focus trap, while Radix Dialog is already a dependency

**Evidence:** `@radix-ui/react-dialog` is installed and used correctly by 7 files via
`src/components/ui/dialog.tsx`. Five other files hand-roll `role="dialog"` instead:

| File | `aria-modal` | Escape | Focus trap (`Tab` handling) |
|---|---|---|---|
| `src/components/notifications/notification-bell.tsx:128+` | no | yes | **no** |
| `src/components/layout/command-palette.tsx` | yes | yes | **no** |
| `src/components/help/help-thread-drawer.tsx:308+` | yes | yes | **no** |
| `src/app/counsellor/universities/_universities-client.tsx` | yes (×2) | yes | **no** |
| `src/app/counsellor/_components/analytics-drilldown.tsx` | yes | yes | **no** |

None of the five contains any `'Tab'` key handling or `inert`/`aria-hidden` management of the
background tree. `aria-modal="true"` on a container that does not trap focus is worse than no
attribute: it tells assistive tech the rest of the page is inaccessible while the keyboard walks
straight out of it.

**Why it causes drift/rework:** Each one is ~60–120 lines of open/close/escape/scroll-lock
plumbing that Radix already ships and that `ui/dialog.tsx` already wraps with the app's look. It
will keep being re-written until the primitive is the obvious path.

**Fix:** Port all five to `ui/dialog.tsx`. `help-thread-drawer` and `notification-bell` need a
`side`-anchored variant — add `DialogContent variant="drawer" | "popover"` rather than letting
them stay bespoke. Also delete `@radix-ui/react-popover` from `package.json`: **it is installed
and imported nowhere**, so anyone reaching for a popover today assumes there is no primitive.

---

### [HIGH] The z-index ladder is bypassed almost 2:1 and the layers now overlap

**Evidence:** named ladder (`tailwind.config.ts:208-217`: `raised 10, sticky 20, nav 30,
docked 40, panel 60, overlay 100, modal 200, toast 300`) = **52 uses**. Raw numeric = **92**:
`z-10` ×60, `z-50` ×14, `z-40` ×4, `z-20` ×4, `z-30` ×2, `z-60`, `z-[60]`, `z-[55]`, `z-[5]`,
`z-[3]`, `z-[2]`, `z-[1]`, `z-0`. **`z-nav` (the layer for the navbar) has 0 uses.**

The collisions are live:
- `src/components/layout/navbar.tsx:62` — the fixed navbar is `z-50`, i.e. **above** `z-docked`
  (40) and **below** `z-panel` (60).
- `src/components/layout/mobile-nav.tsx:98,104,108` — `z-50` / `z-40` / `z-50`.
- `src/components/layout/nav-dropdown.tsx:103` — `z-50`.
- `src/components/chat/chatbot-widget.tsx:441,456` — `z-docked` for the FAB but `z-[55]` for the
  panel, then `md:z-panel`. The config comment at `tailwind.config.ts:206-207` says this exact bug
  ("chat panel used to sit at `z-[60]` and paint over modals") was fixed; it has regressed into
  `z-[55]`.
- `src/components/landing-preview/preview-nav.tsx:228,238` — `z-[60]` progress bar over a `z-40` nav.

**Why it causes drift/rework:** With half the stack in raw numbers, the ladder can't be reasoned
about, and every new overlay is decided by trial and error against whatever it happens to overlap
that day. `z-10` ×60 is mostly innocent (`relative z-10` inside a card, lifting content over a
decorative `::before`) — that case deserves its own name (`z-raised` already exists and is used 19
times, so the split is arbitrary).

**Fix:** Codemod `z-10 → z-raised`, `z-20 → z-sticky`, `z-30/z-40 (nav contexts) → z-nav/z-docked`,
`z-50 (nav/chrome) → z-nav`, `z-[55]/z-[60] → z-panel`. Then ban raw `z-<number>` in lint. Adjust
the ladder so `nav` sits above `docked` if the navbar genuinely must overlay the chat FAB — the
current numbers say it shouldn't and the code says it does.

---

### [MEDIUM] `dark:border-white/10` × 51 is a missing token, and `dark:bg-card` × 7 is a no-op

**Evidence:** `dark:border-white/10` appears **51 times across 23 files**, including inside the
token layer itself — `globals.css:386, 394, 398, 402, 406, 410` (every `surface-*` class) and
`ui/card.tsx:17`. `dark:bg-card` appears 7 times (`globals.css:386,402,406,410`,
`layout/sidebar.tsx:39`) and is a **pure no-op**: `bg-card` already resolves through
`--card`, which flips under `[data-theme='dark']`.

Outside `landing*` there are only 48 `dark:` occurrences at all, and roughly half are *comments
explaining why `dark:` isn't needed* (`lib/theme/categories.ts:93`, `lib/theme/fit-score.ts:3`,
`lib/counsellor/stage-colors.ts:13`, `lib/config/toolbox.ts:21`, `app/appointment/page.tsx:23`,
`app/inbox/_components/inbox-list.tsx:24`, `components/ui/toast.tsx:60`,
`components/dashboard/hub/next-up-card.tsx:19`). That is a strong signal the token layer *is*
doing its job — with exactly one gap.

**Why it causes drift/rework:** The gap is real: on a near-black card, `--border` (`224 14% 18%`)
is too dark to read as an edge, so every author independently discovered `white/10`. Because it
isn't a token, the value has to be hand-carried onto every new card, and half the hand-rolled
cards in HIGH-3 forget it — producing borderless cards in dark mode.

**Fix:** Add `--card-border: 220 13% 89%` (light) / `0 0% 100% / 0.10` (dark) — or simpler, lighten
`--border` in the dark block and delete all 51. Then `dark:border-white/10` and all 7
`dark:bg-card` disappear from `globals.css` and from every call site, and `border-border` becomes
correct in both themes by itself. This is a ~30-minute change that removes 58 utility usages.

---

### [MEDIUM] The 7-step type scale is documented but only half migrated

**Evidence:** `globals.css:274-290` defines the scale and names two steps as classes to kill the
arbitrary values. Yet:
- `text-[0.6875rem]` (= `.text-label`) still appears **39 times** in 10 files —
  `landing/product-widgets.tsx` (8), `landing/mock-viz.tsx` (6), `landing/TeamSection.tsx` (5),
  `app/counsellor/_components/analytics-charts.tsx` (5), `landing/hero-app-tour.tsx` (4),
  `landing-preview/step-shots.tsx` (3), `app/counsellor/_components/custom-widget-chart.tsx` (2),
  `landing-preview/comparison-settle.tsx` (2), +2.
- `text-[0.8125rem]` (= `.text-body-sm`) still appears **20 times** in 10 files — while
  `.text-body-sm` itself has only **7 uses**. The arbitrary value is winning 3:1 over the named step.
- 24 sizes **below the documented 11px floor** survive (see HIGH-2 for locations, plus
  `app/counsellor/_components/analytics-charts.tsx:291,308` at `text-[0.625rem]` — inside the app,
  not the landing page).
- 46 arbitrary `tracking-[…]` remain despite `globals.css:358-360` claiming `.eyebrow` collapsed
  "a 15-value tracking free-for-all".

**Why it causes drift/rework:** Two spellings of the same size means `cn()` conflict resolution
behaves differently depending on which one a call site used — and `src/lib/utils.ts:26-32`
registered `text-label`/`text-body-sm` in tailwind-merge's `font-size` group specifically so the
named classes override `text-xs`. The raw `text-[0.6875rem]` gets no such treatment, so a
component that composes `text-label` from a parent and `text-[0.6875rem]` from a child resolves
inconsistently.

**Fix:** Pure codemod — `text-[0.6875rem]` → `text-label`, `text-[0.8125rem]` → `text-body-sm`,
`text-[0.9375rem]` → (it's the body default, delete). Ban `text-[` in lint with an allowlist for
the `h1`/`h2` declarations inside `globals.css`.

---

### [MEDIUM] `Tooltip` is fully dead; 138 native `title=` and 5 hand-rolled CSS tooltips stand in

**Evidence:** `src/components/ui/tooltip.tsx` (70 lines, Radix-backed, portal + arrow + token
colours) exports `Tooltip`, `TooltipTrigger`, `TooltipContent`. **None is used anywhere.** Only
`TooltipProvider` is mounted, at `src/app/providers.tsx:31` — a provider with no consumers.

Instead: **138 `title="…"` attributes** (native tooltips: no touch support, no keyboard trigger,
no styling, 1–2s browser delay), plus 5 hand-rolled CSS tooltips at
`src/app/counsellor/_components/analytics-charts.tsx:45,57,301,356` and
`custom-widget-chart.tsx:48`, all of the form
`absolute -top-8 … opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-within:opacity-100`
— which have no `role="tooltip"`, no `aria-describedby`, and are unreachable on touch.

**Fix:** Convert the 5 chart tooltips to `<Tooltip>` (they are the ones that carry real data). Leave
`title=` where it is genuinely supplementary; audit the subset that carries information available
nowhere else.

---

### [MEDIUM] Three competing input treatments; the `form-*` plugin layer is near-dead

**Evidence:**
- `.form-input` (`tailwind.config.ts:32-34`) — the class the config calls *"THE input treatment.
  There were ten competing ones"* — **23 uses**.
- `<Input>` (`src/components/ui/input.tsx`, 24 lines) — **7 JSX uses, 4 importing files**.
- Raw `<input>` — **57**; raw `<textarea>` — **13**.
- The rest of the form layer is effectively dead: `form-grid` 1, `form-stack` 2, `form-field` 5,
  `form-label` 6, `form-action` 3, `form-feedback` 6, `form-feedback--error` 3,
  `form-feedback--success` **0**, `form-input--multi` **0**, `form-input--textarea` **0**.
- `navbar-brand` has exactly 1 use (`layout/navbar.tsx:80`) and its whole body is
  `@apply text-foreground` — a class that exists to say nothing.

**Why it causes drift/rework:** 70 raw form controls means the `--input` contrast fix documented at
`globals.css:32-35` (WCAG 1.4.11, raised from 1.30:1 to 3:1) only lands where `border-input` was
actually used. `<Input>` and `.form-input` also disagree — `input.tsx` is a plain shadcn input,
`.form-input` is `rounded-2xl` with a hover border and `shadow-e-1`.

**Fix:** Make `ui/input.tsx` render `cn('form-input', className)` so there is one string, add
`<Textarea>` as a sibling, and codemod raw `<input className="…">` → `<Input>`. Delete
`form-input--multi`, `form-input--textarea`, `form-feedback--success`, `navbar-brand`,
and `form-grid` (1 use, replaceable inline).

---

### [MEDIUM] `cva` stops at the `ui/` boundary; 7 hand-rolled class-string tables carry the rest

**Evidence:** `class-variance-authority` is imported by exactly 4 files, all in
`src/components/ui/` (`button`, `badge`, `tabs`, `select`). Every other variant system in the app
is an untyped `Record<string, string>` of Tailwind classes:
`src/lib/theme/categories.ts` (372 lines, 38 consumers), `chart-palette.ts` (76L, 8),
`stage-colors.ts` (59L, 3), `deck-theme.ts` (54L, 3), `fit-score.ts` (39L, 5),
`avatar-palette.ts` (33L, 3), `config/toolbox.ts` (32L, 25).

These are why `tailwind.config.ts:66-73` had to add `./src/lib/**/*.{js,ts}` to `content` — and
that comment records that omitting it left `ring-primary/25`, `border-warning/40` and
`border-info/40` emitting nothing, silently.

**Why it causes drift/rework:** A class string in a `.ts` table has no type relationship to the
component that consumes it, so a rename in `globals.css` is invisible to `tsc`. It is also
fragile against tailwind-merge: a table value merged with a call-site override resolves by
tailwind-merge's group matching, which is exactly the failure `src/lib/utils.ts:5-25` documents.

**Fix:** Convert each table to emit **component props** (`{ variant, size }`) rather than class
strings, backed by a `cva` in the corresponding primitive. `categories.ts` → `BadgeVariant` +
`Swatch` component; `stage-colors`/`deck-theme`/`fit-score` → the same five semantic tones;
`chart-palette` stays (it maps to `series-*`, which has no component).

---

### [MEDIUM] 25 template-literal classNames bypass `cn()` and tailwind-merge

**Evidence:** `className={\`…\`}` appears 25 times:
`src/components/landing-preview/comparison-settle.tsx` (5, incl. `:100` which concatenates
`${note.pos}` containing `md:left-[5%] md:top-[3%] md:z-10 md:-rotate-[5deg]`),
`src/components/profile/evolution-timeline.tsx` (3),
`src/app/counsellor/_components/student-alerts.tsx` (3),
`src/app/admin/simulation/page.tsx` (3),
`src/app/counsellor/_components/{top-students,application-funnel,activity-feed}.tsx` (2 each),
`src/app/counsellor/_analytics-client.tsx` (2), +5 singles.

**Why it causes drift/rework:** `cn()` is the only thing that makes a later class beat an earlier
one. String concatenation makes the *stylesheet order* decide, which for two classes in the same
`@layer` is source order in the compiled CSS — unpredictable and invisible in review. This is the
same class of bug as the `.text-secondary` incident recorded at `globals.css:341-349`.

**Fix:** Mechanical — wrap each in `cn(...)` with the conditional as a separate argument. Then add
the lint rule below so it can't come back.

---

### [LOW] Dead CSS and one unused dependency

Zero call sites, safe to delete today:

| Thing | Where |
|---|---|
| `.panel` | `tailwind.config.ts:14-16` |
| `.form-input--multi`, `.form-input--textarea` | `tailwind.config.ts:35-40` |
| `.form-feedback--success` | `tailwind.config.ts:47-49` |
| `.navbar-brand` (1 use, body is a no-op) | `tailwind.config.ts:55-57` |
| `.text-gradient` | `globals.css:314-316` |
| `.helper-text` | `globals.css:369-371` |
| `.page-soft-bg` | `globals.css:421-423` |
| `.surface-card--static` (already an empty rule; last call site removed per `page-hero.tsx:111`) | `globals.css:389-391` |
| `accordion-down` / `accordion-up` keyframes **and** animations (no accordion component exists) | `tailwind.config.ts:272-279, 286-287` |
| `@radix-ui/react-popover` — installed, **never imported** | `package.json:36` |

`tailwindcss-animate` **is** live (`animate-in` 6, `fade-in` 7, `slide-in-from` 8, via
`ui/dialog.tsx` / `ui/select.tsx` / `ui/tooltip.tsx`). `@tailwindcss/typography` **is** live
(`prose` in 4 render files, correctly token-bound at `tailwind.config.ts:226-270`).

### [LOW] Shared page shell is bypassed by a third of routes; `Shell` has zero usages

`<PageHero>` — 49 usages, 71 importing files, but **16 of 46 `page.tsx` files don't use it**:
`app/page.tsx` (landing, fine), `(auth)/login`, `role-select` (fine), and then
`assistant/`, `university-search/`, `university-search/results`, `university-search/quests`,
`shortlist/`, `counsellor/`, `counsellor/assistant`, `counsellor/analytics`, `parent/assistant`,
`course/[id]`, `(university-info)/…/university/[id]`, `toolbox/essay-workshop`,
`toolbox/(shell)/chances` — several of which are core student surfaces that CLAUDE.md:119 says use
it. `<SectionNav>` 13 usages. **`src/components/layout/shell.tsx` exists and has 0 `<Shell>`
usages** — either dead or exported under another name; either way it isn't the shell.

### [LOW] Spacing is disciplined; sizing is not

Only **7** arbitrary spacing values app-wide (`px-[3px]` ×2, `pl-[18px]`, `gap-[3px]`,
`pb-[0.16em]`, `mb-[0.16em]`, `pb-[env(safe-area-inset-bottom,8px)]` — the last is correct). That
is a genuinely clean spacing scale. By contrast there are **154** arbitrary `w/h/min-/max-[…]`
values and **103** `[Npx]` overall, plus **19** bare `rounded` (0.25rem, the one radius not on the
ladder). Also `bg-primary/[0.03]` at `src/components/landing/FAQSection.tsx:66` — the opacity scale
already declares `3`, so `/3` would work and be consistent.

---

## Target design system

### The token contract — three layers, one direction of dependency

```
  PRIMITIVE            SEMANTIC                     COMPONENT
  (raw values,         (role names, theme-aware,    (per-component, cva)
   never used in JSX)   the ONLY thing JSX names)
  ─────────────────    ─────────────────────────    ────────────────────────
  --indigo-550         --primary       (fill)       buttonVariants.default
                       --primary-ink   (text)       badgeVariants.primary
  --emerald-700/500    --success                    badgeVariants.success
  --emerald-600/500    --success-fill               chartBar.success
  --emerald-50/900     --success-subtle
  0.625rem             --radius                     rounded-lg … rounded-4xl
  rgba ladder          --elevation-1..4             shadow-e-1 … shadow-e-4
  —                    --card-border   (NEW)        border-border in both themes
```

**Rules, in priority order:**

1. **JSX may only name semantic tokens.** No palette literal, no hex, no `rgb()/hsl()` in a
   `className` or `style`. Exception: SVG *illustration* files on an explicit allowlist
   (`landing-preview/rocket-art.tsx`).
2. **A token that needs a `dark:` twin is a missing token.** Every `dark:<colour-utility>` in the
   tree is a bug report against layer 2. Today's outstanding one is `--card-border`.
3. **Geometry is a ladder, never a number.** radius → `rounded-*`; elevation → `shadow-e-*`;
   stacking → `z-<name>`; type → the 7 named steps. No `rounded-[`, `shadow-[`, `z-[`, `text-[`.
4. **The opacity scale is closed.** `tailwind.config.ts:199-205` is the whole legal set
   (0/3/5/8/10/15/20/25/30/40/45/50/60/70/75/80/85/90/95/100). Anything else emits nothing.
   *(Currently 100% compliant — keep it that way with the lint rule.)*
5. **Every class string is composed through `cn()`.** No `className={\`…\`}`, no `+`.
6. **A variant is a `cva`, not a lookup table.** `Record<K, string>` of Tailwind classes is banned
   outside `cva` definitions.

### Primitive component set

Present and healthy — keep the API, raise adoption:

| Primitive | API today | Adoption | Action |
|---|---|---|---|
| `Button` | `variant: default\|destructive\|outline\|secondary\|ghost\|link\|soft` × `size: default\|sm\|lg\|icon\|xs` + `asChild` | 105 uses / 43 files | migrate 148 unringed raw buttons |
| `Skeleton` | `className` | **278 uses / 45 files** — the success story | migrate 17 stray `animate-pulse` |
| `EmptyState` | `icon: ReactNode, title, description, hint, action, size, tone` | 21 uses / 17 files | migrate 8 hand-rolled |
| `ErrorState` | — | 12 files | keep |
| `Toast` | `ToastProvider` + `useToast()` | 13 files | keep |
| `Breadcrumbs` | `items: BreadcrumbItem[]` | 14 files | keep |
| `Dialog` | Radix; `DialogContent` + Header/Title/Description | 7 files | **+ `variant: 'modal'\|'drawer'\|'popover'`**, absorb the 5 hand-rolls |
| `Select` | Radix, `cva` trigger | 10 files | keep |
| `Tabs` | Radix + sliding `layoutId` indicator, `tabsListVariants` | 2 files | absorb `help-thread-drawer` tab strip |
| `Table` | 8 slots | 3 files | keep |

Present and starved — fix by *deletion or absorption*, not by writing more:

| Primitive | Adoption | Action |
|---|---|---|
| `Badge` | **2 uses** vs 44 hand-rolled pills | make `categories.ts` emit `BadgeVariant`; codemod the pills |
| `Card` | **7 uses** vs 102 `surface-card` + 75 hand-rolls | re-implement as `cn('surface-card', …)`; one string, two entry points |
| `Tooltip` | **0 uses**, provider mounted | absorb the 5 CSS tooltips; keep `title=` only for supplementary text |
| `Input` | **7 uses** vs 70 raw controls | re-implement as `cn('form-input', …)`; add `Textarea` |

Missing, and repeatedly hand-rolled — add:

| New primitive | Why | Replaces |
|---|---|---|
| `Textarea` | 13 raw `<textarea>`; `.form-input--textarea` was written for it and never used | 13 sites |
| `Switch` / `Checkbox` (Radix) | `role="switch"` ×4, `role="checkbox"` ×4, `role="radio"` ×2 across 9 files, all hand-wired | `filters/ToggleSwitch.tsx`, `filters/CheckboxFacetList.tsx`, `filters/TierPills.tsx`, `filters/SegmentedControl.tsx` |
| `Popover` (Radix — **already installed, unused**) | `role="listbox"`/`"combobox"`/`"menu"` hand-rolled in 5 files | `SortMenu.tsx`, `child-switcher.tsx`, `nav-dropdown.tsx`, `notification-bell.tsx` |
| `Chip` / `IconSwatch` | `categories.ts` `swatch:` string used across 38 files | `categories.ts:112-113` |

### Enforcement — make violations unmergeable

**A. `eslint-plugin-tailwindcss` (one new devDependency).** Add to `eslint.config.mjs` after the
existing TS block:

```js
// eslint.config.mjs — append
import tailwind from 'eslint-plugin-tailwindcss';

// … inside the exported array:
{
  files: ['**/*.tsx'],
  plugins: { tailwindcss: tailwind },
  settings: {
    tailwindcss: {
      config: 'tailwind.config.ts',
      // Our own component classes, so the plugin doesn't flag them as unknown.
      whitelist: [
        'surface-(card|subcard|chip|toolbar|stage|stat)', 'hover-lift',
        'text-(label|body-sm)', 'eyebrow(-accent)?', 'shell-gutter',
        'nav-pill(-active)?', 'section-fade', 'scrollbar-(thin|none)',
        'form-(grid|stack|field|label|input|feedback|action)',
      ],
      callees: ['cn', 'cva', 'clsx'],
      classRegex: '^(class(Name)?|chip|swatch|bar|accent)$',
    },
  },
  rules: {
    // Bans EVERY arbitrary value: rounded-[…], text-[…], z-[…], bg-[#…], w-[…].
    // Start as 'warn' to land the config, flip to 'error' at the end of phase 2.
    'tailwindcss/no-arbitrary-value': 'error',
    'tailwindcss/no-custom-classname': 'error',   // catches typo'd + orphan classes
    'tailwindcss/no-contradicting-classname': 'error',
    'tailwindcss/enforces-shorthand': 'warn',
  },
},
```

`no-arbitrary-value` alone kills the 103 `[Npx]`, 99 `text-[…]`, 46 `tracking-[…]`, 6
`rounded-[…]`, 118 `bg|text|border-[…]` and the raw `z-[…]` — one rule, ~370 violations. It does
**not** catch palette literals or `dark:`, hence B.

**B. `scripts/check-design-tokens.mjs` — the house rules ESLint can't express.** Zero
dependencies, runs in <1s, wired as `npm run lint:design` and a CI step.

```js
#!/usr/bin/env node
// Design-system gate. Run: node scripts/check-design-tokens.mjs [--fix-report]
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';           // node >= 22
import { relative } from 'node:path';

const PALETTES = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';

// Files exempt from a specific rule, with the reason. Every entry needs a reason.
const ALLOW = {
  hex: [
    'src/components/landing-preview/rocket-art.tsx', // SVG illustration, not UI chrome
    'src/app/layout.tsx',                            // <meta name="theme-color">, must be literal
    'src/components/theme/theme-provider.tsx',       // ditto, mirrors --background
  ],
};

const RULES = [
  { id: 'palette-literal',
    re: new RegExp(`\\b(?:text|bg|border|ring|from|to|via|fill|stroke|shadow|divide|outline)-(?:${PALETTES})-\\d{2,3}\\b`, 'g'),
    msg: 'Palette literal. Use a semantic tone token (success/warning/danger/info/feature) — see globals.css:38.' },
  { id: 'hex',
    re: /#[0-9a-fA-F]{3,8}\b/g,
    msg: 'Raw hex. Colour lives in globals.css custom properties only.' },
  { id: 'dark-variant',
    re: /\bdark:(?!prose-invert)[a-z-]+/g,
    msg: 'A `dark:` colour utility means a missing token. Add/extend the token instead.' },
  { id: 'raw-z',
    re: /\bz-(?:\[[^\]]+\]|\d+)\b/g,
    msg: 'Use the named z ladder (raised/sticky/nav/docked/panel/overlay/modal/toast).' },
  { id: 'off-ladder-shadow',
    re: /\bshadow-(?:sm|md|lg|xl|2xl)\b/g,
    msg: 'Use the elevation ladder shadow-e-1..e-4.' },
  { id: 'template-classname',
    re: /className=\{`/g,
    msg: 'String-concatenated className bypasses tailwind-merge. Use cn().' },
  { id: 'subfloor-type',
    re: /text-\[0\.(?:5|5625|625|65625)rem\]|text-\[(?:8|9|10)px\]/g,
    msg: '11px (.text-label) is the floor — see globals.css:288.' },
  { id: 'named-step-as-arbitrary',
    re: /text-\[0\.6875rem\]|text-\[0\.8125rem\]/g,
    msg: 'Use .text-label / .text-body-sm — the arbitrary value skips tailwind-merge (lib/utils.ts:26).' },
];

// Illegal opacity modifiers: anything outside the generated scale silently emits NOTHING.
const LEGAL_OPACITY = new Set([0,3,5,8,10,15,20,25,30,40,45,50,60,70,75,80,85,90,95,100]);

let failures = 0;
const files = globSync('src/**/*.{ts,tsx}');
for (const file of files) {
  const rel = relative(process.cwd(), file);
  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');

  for (const rule of RULES) {
    if (ALLOW[rule.id]?.includes(rel)) continue;
    lines.forEach((line, i) => {
      if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) return; // comments
      for (const m of line.matchAll(rule.re)) {
        console.error(`${rel}:${i + 1}  [${rule.id}] ${m[0]}\n    ${rule.msg}`);
        failures++;
      }
    });
  }

  lines.forEach((line, i) => {
    for (const m of line.matchAll(/(?:bg|text|border|ring|from|to|via|shadow|divide|outline|fill|stroke|placeholder)-[a-z0-9-]+\/(\d{1,3})\b/g)) {
      if (!LEGAL_OPACITY.has(Number(m[1]))) {
        console.error(`${rel}:${i + 1}  [dead-opacity] ${m[0]}\n    Not in the opacity scale — Tailwind emits NOTHING. Add the step to tailwind.config.ts:199.`);
        failures++;
      }
    }
  });
}

if (failures) {
  console.error(`\n${failures} design-system violation(s).`);
  process.exit(1);
}
console.log(`Design tokens OK across ${files.length} files.`);
```

Ratchet strategy: land it with a `BASELINE` count per rule so it fails only on *increase*, drop the
baseline to 0 as each phase completes.

**C. A11y guard, as an ESLint rule.** `jsx-a11y` is already transitively present via
`next/core-web-vitals`, but the two rules that matter here are not on. Add to the TS block:

```js
'jsx-a11y/no-noninteractive-element-to-interactive-role': 'error',
// Custom, ~20 lines: error on a JSX <button> whose className has no `focus-visible:`
// and which is not <Button>. Ships in eslint-plugin-local or as a no-restricted-syntax:
'no-restricted-syntax': ['error', {
  selector: 'JSXOpeningElement[name.name="button"] > JSXAttribute[name.name="className"][value.type="Literal"][value.value!=/focus-visible/]',
  message: 'Raw <button> without a focus ring. Use <Button> from @/components/ui/button.',
}],
```

**D. CI wiring** — add to `.github/workflows/ci.yml` in the `build` job, before `npm run build`:

```yaml
      - run: npm run lint
      - run: npm run lint:design      # scripts/check-design-tokens.mjs
```

**E. Two Jest guards** (cheap, catch the silent-failure traps that no linter sees):
- Assert `globals.css` declares the same custom-property set inside `:root` and
  `[data-theme='dark']` — a token defined in one and not the other is invisible until dark mode.
- Assert every class listed in `ALLOW`/whitelist actually exists in `globals.css` or
  `tailwind.config.ts` (kills orphan classes when a component class is renamed).

### Phased cleanup order

| Phase | Work | Codemod-able? | Unblocks |
|---|---|---|---|
| **0** | Delete dead CSS (`.panel`, `.text-gradient`, `.helper-text`, `.page-soft-bg`, `.surface-card--static`, 3 `form-*`, `navbar-brand`, accordion keyframes+animations) and `@radix-ui/react-popover`… then re-add popover as a *used* primitive | pure delete | shrinks the surface everything else must respect |
| **1** | Land `check-design-tokens.mjs` + eslint-plugin-tailwindcss at **baseline** counts. Nothing goes red; new violations do | n/a | stops the bleeding immediately |
| **2** | Add `--card-border` token; delete all 51 `dark:border-white/10` + 7 `dark:bg-card` | `sed` + one CSS edit | removes 58 utilities, makes rule 2 enforceable |
| **3** | Type-scale codemod: `text-[0.6875rem]`→`text-label`, `text-[0.8125rem]`→`text-body-sm`, raise 24 sub-floor sizes | 100% mechanical | flip `no-arbitrary-value` to error for `text-` |
| **4** | z-ladder codemod: `z-10`→`z-raised`, `z-20`→`z-sticky`, `z-50`/`z-[55]`/`z-[60]`→`z-nav`/`z-panel`; reconcile navbar vs docked | mostly mechanical, needs one design decision | flip `raw-z` to error |
| **5** | **Landing migration** (the big one): 245 palette literals → tone tokens using the `categories.ts:104-107` map; delete every `dark:` twin; fix `landing/CLAUDE.md` § Color first | ~80% mechanical | flip `palette-literal` + `dark-variant` to error |
| **6** | Card unification: `Card` → `cn('surface-card')`; codemod the 28 exact hand-rolls; review the 47 near-matches | half mechanical | one card string app-wide |
| **7** | `.nav-pill` focus ring (1 edit); counsellor `<button>` → `<Button>` (101 sites, 56 files) | manual, high value | flip the focus-ring rule to error |
| **8** | `categories.ts` emits `BadgeVariant`; codemod 44 pills → `<Badge>`; same for the other 6 tone tables | manual | deletes ~400 lines of class-string tables |
| **9** | Absorb the 5 hand-rolled dialogs into `Dialog` + new `variant`; add `Popover`, `Switch`, `Checkbox`, `Textarea`; port the 9 hand-wired controls | manual | closes the a11y gap |

---

## Effort

| # | Finding | Size | Risk | Note |
|---|---|---|---|---|
| CRIT-1 | No enforcement (lint + CI + script) | **M** | **Low** | Additive; baseline mode means zero red on day one |
| HIGH-2 | Landing island: 245 literals, 90 `dark:`, 24 sub-floor sizes | **XL** | **Medium** | Visual regression on the marketing page; needs screenshot diffing. Fix `landing/CLAUDE.md` **first** or it regrows |
| HIGH-3 | Three card systems (102 / 7 / 75) | **L** | **Medium** | `overflow-hidden` + padding differ between `surface-card` and the hand-rolls — expect layout shifts |
| HIGH-4 | `Badge` at 2 uses; 44 pills; dual tone vocabulary | **L** | **Low** | `badge.tsx:14` says the geometry is already pixel-identical |
| HIGH-5 | 148 raw `<button>` with no focus ring (42 files) | **L** | **Low** | Purely additive a11y win. `.nav-pill` edit alone is **S** and fixes 13 |
| HIGH-6 | 5 hand-rolled modals, no focus trap | **L** | **Medium** | Behavioural: scroll-lock and return-focus semantics change |
| HIGH-7 | z-ladder bypassed 92 vs 52; live overlaps | **M** | **Medium** | Stacking bugs are invisible until two overlays coexist — test navbar × chat × modal × toast |
| MED-8 | `--card-border` missing → 51 `dark:border-white/10` | **S** | **Low** | Highest value/effort ratio in the audit |
| MED-9 | Type scale half-migrated (59 raw named-step values) | **S** | **Low** | Pure `sed`; `lib/utils.ts:26` already made it safe |
| MED-10 | `Tooltip` dead; 138 `title=`, 5 CSS tooltips | **M** | **Low** | Only the 5 chart tooltips are urgent |
| MED-11 | Three input treatments; `form-*` layer near-dead | **M** | **Low** | Ships the `--input` 3:1 contrast fix to 70 controls that never got it |
| MED-12 | `cva` stops at `ui/`; 7 class-string tables (665 lines) | **L** | **Medium** | Touches 38-consumer `categories.ts`; do after HIGH-4 |
| MED-13 | 25 template-literal classNames | **S** | **Low** | Mechanical `cn()` wrap |
| LOW-14 | Dead CSS × 10 + unused `@radix-ui/react-popover` | **S** | **Low** | Verified 0 call sites each |
| LOW-15 | `PageHero` bypassed by 16/46 routes; `Shell` 0 uses | **M** | **Low** | Decide whether `shell.tsx` is dead before migrating |
| LOW-16 | 154 arbitrary sizes, 19 bare `rounded`, 46 `tracking-[` | **M** | **Low** | Largely absorbed by phase 1's `no-arbitrary-value` |
