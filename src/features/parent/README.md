# `features/parent` — the pilot feature slice

The first slice migrated to the shape in [`docs/audit/SYNTHESIS.md` §6.1](../../../docs/audit/SYNTHESIS.md)
and [`01-architecture.md`](../../../docs/audit/01-architecture.md) rules R2/R3/R4/R9.
It exists to be copied. Read this before starting a second one.

```
src/features/parent/
  api/       server-only data access — Supabase, cookies(), redirect()
    data.ts        guardian_links scoping + the five child loaders
    context.ts     resolveParentContext(): auth + linked children, once per request
  model/     pure domain: types and total functions. No I/O, no React, no next/*
    types.ts         the contract every layer above speaks
    active-child.ts  the active-child cookie name
    currency.ts      GBP -> home-currency display
    ics.ts           deadline .ics export
  ui/        every component the portal renders (all 6, client and server)
  index.ts   the ONLY public entry point
```

`src/app/parent/` keeps `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx` and
nothing else. Routing lives in `app/`; everything else moved here.

## The boundary

Enforced by `npm run lint:boundaries`, not by convention — five rules in
[`.dependency-cruiser.cjs`](../../../.dependency-cruiser.cjs), all written
generically over `src/features/<slice>/` so a second slice inherits them the
moment its directory exists:

| Rule | What it forbids |
|---|---|
| `feature-internals-are-private` | anything outside `src/features/` importing `features/*/{api,model,ui,hooks}/**` |
| `feature-crosses-slice-via-index` | slice X reaching into slice Y's internals |
| `feature-not-to-app` | the slice importing anything under `src/app/` |
| `feature-model-is-pure` | `model/` importing `api/` or `ui/` |
| `feature-model-imports-no-framework` | `model/` importing React, `next/*` or `@supabase/*` |

Each one was verified to actually fire against a deliberately-broken probe file
before being committed. A boundary rule that has never failed is a rule you do
not know you have.

## What `index.ts` exposes, and why

**Types: all of them.** They erase at compile time and they are the signature of
the loaders below. A consumer that cannot name a return type re-declares it —
that is finding #9 in the audit (~40 drifted local status tables), reproduced in
miniature.

**Values: one at a time, only when something outside the slice calls it.**
The five `loadChild*` loaders, `resolveParentContext`, `resolveLinkedChildIds`,
`loadLinkedChildren`/`pickActiveChild` (the chat context builder), `formatGbp`,
`ACTIVE_CHILD_COOKIE`, and the six components the routes render.

Deliberately **not** exported: `buildDeadlinesIcs`, `HOME_CURRENCIES`,
`convertFromGbp`, `formatWithHomeCurrency`, `formatHomeOnly`,
`isHomeCurrencyCode`, `HOME_CURRENCY_STORAGE_KEY`, `DEFAULT_HOME_CURRENCY`.
After the move their only callers are `ui/` modules *inside* the slice, so they
are implementation detail. Adding one to `index.ts` later is a deliberate,
reviewable widening of the surface — which is the entire point of having one.

## The barrel constraint

**This is the rule that shapes the tree, and the one a second slice will get
wrong.**

`index.ts` re-exports `api/context.ts`, which imports `next/headers`. Any
`'use client'` module that imports the barrel therefore pulls `next/headers`
into the browser bundle and fails the build.

So **every client component in the portal has to live inside the slice**, where
it imports its neighbours relatively (`../model/currency`) and never touches the
barrel. That is why `_cost-explorer.tsx`, `_deadline-groups.tsx`,
`_progress-board.tsx` and `_parent-thread.tsx` moved out of their route folders
into `ui/` even though each is used by exactly one route: the alternative was
either a deep import (which `feature-internals-are-private` forbids) or a second
public entry point (which defeats "the ONLY public entry point").

One barrel per slice, with server modules in it, forces `app/` to be routing
only. That is a feature, but it means the migration is all-or-nothing per slice
— you cannot move `api/` first and leave the components behind.

### The barrel costs ~40 kB per route. Measure before you copy this.

Every route that imports the barrel loads **every** client component in the
slice, whether it renders it or not. Measured with `npm run check:bundle`,
gzipped First Load JS, before and after this move:

| Route | before | after | Δ |
|---|---|---|---|
| `/parent` | 154 | 201 | **+47** |
| `/parent/messages` | 153 | 197 | **+44** |
| `/parent/progress` | 155 | 197 | **+42** |
| `/parent/deadlines` | 156 | 197 | **+41** |
| `/parent/finances` | 194 | 197 | +3 |

All five converge on the union of the slice's UI. `/parent/messages` renders a
message thread and now ships `framer-motion` (from `deadline-groups`,
`progress-board`, `cost-explorer`) and `@radix-ui/react-select` (from
`cost-explorer`) to do it. `/parent/finances` barely moves because it already
paid for both.

**This is structural, not a tuning problem.** Adding `"sideEffects": ["*.css"]`
to `package.json` and rebuilding changes the numbers by **zero** — the App
Router's client-reference plugin emits a client chunk for every `'use client'`
module reachable from a server entry, and webpack's `usedExports` analysis runs
too late to remove it. There is no barrel configuration that avoids this.

The parent routes absorbed it because they had 55–95 kB of headroom against the
250 kB default budget. **A slice whose routes do not have that headroom cannot
use a single re-exporting barrel** — check `npm run check:bundle --report`
against the target slice's routes *before* starting, not after.

## Known gaps

- **No `import 'server-only'` in `api/`.** Rule R10 wants it; the package is not
  a dependency and this pass could not run `npm install`. Add it with the
  dependency, then encode R10 in `.dependency-cruiser.cjs`.
- **`model/types.ts` imports `MatchTier` from `@/lib/counsellor/types`** and
  re-exports it. Genuinely shared vocabulary, not parent's to own. It belongs in
  `shared/` (or `features/matching/model/`) once one exists; until then the
  type-only edge is harmless and visible.
- **Type-aware ESLint no longer covers `api/data.ts`.** `eslint.config.mjs`
  scopes `no-floating-promises` / `no-misused-promises` /
  `switch-exhaustiveness-check` / `await-thenable` to `src/lib/**`,
  `src/app/api/**`, `src/middleware.ts`, `src/app/**/actions.ts` — all
  *path* globs. Moving a server module out of `src/lib/` silently drops it out of
  the strongest lint the repo has. **Add `src/features/**/*.ts` to that `files`
  array in the same PR as the next slice**, or the fence you gain costs you a
  gate you already had.

## Copying this for a second slice

1. `git mv` every file, one command, so the diff reads as renames. Do not
   create-and-delete; a 25-file rename diff is reviewable and a 25-file rewrite
   is not.
2. Move the client components too, in the same pass — see "The barrel
   constraint".
3. Write `index.ts` last, from the compiler errors. `npx tsc --noEmit` tells you
   the true public surface; guessing it up front over-exports.
4. Add nothing to `.dependency-cruiser.cjs` — the five rules are generic. Just
   run `npm run lint:boundaries` and expect zero new errors.
5. Widen the ESLint `files` glob (see "Known gaps").
