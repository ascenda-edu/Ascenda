// The parent slice's ONLY public entry point.
//
// Everything outside `src/features/parent/` — the /parent route files, the
// /api/parent handler, the chat context builder — imports from here and from
// nothing else. `.dependency-cruiser.cjs` enforces that (rule
// `feature-internals-are-private`); adding a deep import to
// `features/parent/api/...` fails `npm run lint:boundaries`.
//
// WHAT IS AND IS NOT HERE
// Types are exported wholesale: they are the contract of the loaders below,
// erase at compile time, and a consumer that cannot name a return type has to
// re-declare it — which is finding #9 in docs/audit/SYNTHESIS.md.
// Values are exported ONE AT A TIME, only when something outside the slice
// actually calls them. `buildDeadlinesIcs` and the currency helpers are
// deliberately absent: after the move their only callers are `ui/` modules
// inside this slice, so they are implementation detail. If a route ever needs
// one, adding it here is a deliberate, reviewable widening of the surface.
//
// ONE BARREL, NOT TWO
// This file re-exports `api/` (which reaches `next/headers` and the Supabase
// server client) alongside `ui/` client components. That is only safe because
// every client component in the parent portal lives INSIDE the slice and
// imports its neighbours relatively — a `'use client'` module outside the slice
// importing this barrel would pull `next/headers` into the browser bundle and
// fail the build. See README.md > "The barrel constraint".

// ── model: the domain contract ──────────────────────────────────────────────
export type {
  ChildApplication,
  ChildApplicationStatus,
  ChildDeadline,
  ChildOverview,
  ChildProfileStep,
  LinkedChild,
  MatchTier,
  ParentRelationship,
  ParentThread,
  ParentThreadMessage,
  ProgrammeCostLine,
} from './model/types';

// Read by the /parent route files (to set it) and by the chat routes (to read
// the active child out of the request), so it is public rather than internal.
export { ACTIVE_CHILD_COOKIE } from './model/active-child';

// GBP display formatting for server-rendered totals on /parent/finances. The
// home-currency conversion helpers stay internal — only `ui/cost-explorer`
// converts.
export { formatGbp } from './model/currency';

// ── api: server-only data access ────────────────────────────────────────────
// Not marked `import 'server-only'`: the package is not a dependency and this
// pass may not run `npm install`. See README.md > "Known gaps".
export { resolveParentContext, type ParentContext } from './api/context';
export {
  loadChildDeadlines,
  loadChildFinances,
  loadChildOverview,
  loadChildProgress,
  loadChildThread,
  loadLinkedChildren,
  pickActiveChild,
  resolveLinkedChildIds,
} from './api/data';

// ── ui: the components the /parent routes render ────────────────────────────
export { ChildSwitcher } from './ui/child-switcher';
export { CostExplorer } from './ui/cost-explorer';
export { DeadlineGroups } from './ui/deadline-groups';
export { NoLinkedChildren } from './ui/no-linked-children';
export { ParentThreadPanel } from './ui/parent-thread';
export { ProgressBoard } from './ui/progress-board';
