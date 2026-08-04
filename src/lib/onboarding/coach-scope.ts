import type { Role } from '@/lib/auth/identity';

/**
 * Who gets the coach panel, and in which mode.
 *
 * WHY THIS IS ITS OWN MODULE AND NOT PART OF `coach-panel.tsx`
 * ----------------------------------------------------------
 * Because it is called from a SERVER component, and `coach-panel.tsx` is
 * `'use client'`. Next's flight loader replaces every named export of a
 * `'use client'` module with a throwing `registerClientReference` stub in the
 * server graph — so a server component that *calls* one does not get the
 * function, it gets:
 *
 *   Attempted to call resolveCoachPanelScope() from the server but
 *   resolveCoachPanelScope is on the client.
 *
 * That shipped in the first cut of this feature and took down every
 * authenticated route in the app — `AscendiCoachMount` renders on ten of them.
 * A `'use client'` module can be *rendered* as a component from the server, or
 * handed props; it cannot have its functions invoked. Splitting the decision into
 * this plain module is what makes the server side legal.
 *
 * IT IS ALSO WHY EVERY GATE WENT GREEN ON A BROKEN COMMIT
 * ------------------------------------------------------
 * `tsc` cannot see the RSC boundary — the type system knows nothing about
 * `'use client'`. Jest imports the module under jsdom, where it is ordinary code.
 * `next build` only compiles; the routes are dynamic, so nothing executes the
 * mount at build time. Loading one page was the only thing that would have caught
 * it, and `coach-panel.test.ts` now pins the structural invariant instead: this
 * file must never gain a `'use client'` directive.
 *
 * Keep this module free of React and of client-only imports. The `Role` import is
 * type-only and erased at compile (`verbatimModuleSyntax`), which matters:
 * `@/lib/auth/identity` throws on purpose if it ever reaches a browser bundle.
 */

export type CoachPanelScope =
  /** Local dev: everyone, and the reset button is live. */
  | 'development'
  /** Production admin: run and preview only. */
  | 'admin';

/**
 * `null` means no panel.
 *
 * Called from `ascendi-coach-mount.tsx`, a server component that holds the
 * verified `profiles.role`, so the answer is settled before render and a
 * student's HTML never contains the panel — as opposed to shipping it to
 * everyone behind a client-side role check, which a devtools console undoes.
 *
 * Fails OPEN on an unrecognised `NODE_ENV` (anything that is not exactly
 * `production` counts as development). In practice there is no such case —
 * `next build`, `next start` and Vercel preview deployments all set
 * `production` — so this is a defensive default, not a supported mode.
 */
export const resolveCoachPanelScope = (role: Role): CoachPanelScope | null => {
  if (process.env.NODE_ENV !== 'production') return 'development';
  return role === 'admin' ? 'admin' : null;
};
