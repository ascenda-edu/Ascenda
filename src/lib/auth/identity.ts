/**
 * The single server-side answer to "who is making this request, and what are they".
 *
 * WHY THIS EXISTS
 * ---------------
 * `supabase.auth.getUser()` appears in 56 files and `redirect('/login')` in 20
 * (docs/audit/01-architecture.md A5). Nine independent implementations of
 * "resolve the current user and their role" were counted
 * (docs/audit/11-security-authz.md §1.3), and NONE of the non-admin ones
 * resolved the role at all. The one good pattern in the repo —
 * `src/app/parent/_lib/context.ts` — is the model this module generalises: one
 * seam that returns the caller plus everything downstream needs to scope, so a
 * page cannot forget half of it.
 *
 * PER-REQUEST MEMOISATION IS THE POINT
 * ------------------------------------
 * `getIdentity` is wrapped in React's `cache()`. Two things follow, and both
 * matter:
 *
 *   1. Cost. `auth.getUser()` is not a local JWT decode — it round-trips to the
 *      Supabase auth server to verify the token. A page that renders a layout,
 *      a shell and three server components previously paid for that call once
 *      per copy of the guard. Through `cache()` the whole render tree pays for
 *      it once, no matter how many callers ask. There were ZERO `cache()` calls
 *      in this repo before this module; the 48 inlined `auth.getUser()` calls
 *      under `src/app/` are the single largest avoidable TTFB cost in the app.
 *
 *   2. Consistency. Every caller in one request observes the SAME identity.
 *      Two guards that independently re-derive the role can, in principle,
 *      disagree — e.g. across a token refresh mid-render. One memoised value
 *      cannot.
 *
 * `cache()` is scoped to a single server request; it is NOT a cross-request
 * cache and never leaks one user's identity to another. Outside a React render
 * scope (a plain unit test, say) React's `cache` degrades to calling straight
 * through — see `__tests__/auth/identity-cache.test.ts`, which installs a real
 * memo to prove the wrapper is still in place.
 *
 * SERVER ONLY
 * -----------
 * The `server-only` package is NOT a dependency of this repo and this module is
 * not permitted to add one, so the guard is the runtime `typeof window` throw
 * used by `src/lib/supabase/service.ts:11` and `src/lib/env.ts:442` — the same
 * pattern, for the same reason. If `server-only` is ever installed, replace the
 * throw below with a top-level `import 'server-only'` and the enforcement
 * becomes a build error instead of a runtime one.
 *
 * The role is resolved ONLY here, ONLY from `profiles.role`. Never from
 * `sessionStorage`, never from a request body, never from a cookie. The client
 * consumes it as a value passed down from the server
 * (`src/lib/auth/role-context.tsx`).
 */

import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logger } from '@/lib/observability/logger';

// Defence in depth: identity resolution must never run in a browser bundle.
// Same guard, same reason as lib/supabase/service.ts:11 and lib/env.ts:442.
if (typeof window !== 'undefined') {
  throw new Error(
    '@/lib/auth/identity is server-only — a client component must receive the role as a prop (see @/lib/auth/role-context)'
  );
}

/** The closed set of `profiles.role` values. */
export const ROLES = ['student', 'counsellor', 'admin'] as const;

export type Role = (typeof ROLES)[number];

export interface Identity {
  userId: string;
  /** From the verified JWT claim, not from `student_personal_information`. */
  email: string | null;
  role: Role;
}

/**
 * Coerce a raw `profiles.role` value to the closed union.
 *
 * Fail CLOSED: an unknown, null or unreadable role is `'student'` — the least
 * privileged value — never `'admin'` and never `'counsellor'`. A profile row
 * that cannot be read must not silently grant anything.
 */
export const parseRole = (raw: unknown): Role =>
  (ROLES as readonly string[]).includes(raw as string) ? (raw as Role) : 'student';

/**
 * Resolve the caller once per request.
 *
 * Returns `null` for an anonymous request — it does NOT redirect, so it is safe
 * to call from a surface that has an anonymous rendering (a public page, a
 * route handler that answers 401 rather than 302). Use `requireIdentity()` when
 * absence is an error.
 */
export const getIdentity = cache(async (): Promise<Identity | null> => {
  const supabase = await createServerSupabaseClient();

  // getUser(), never getSession(): getSession() only decodes the cookie and
  // will happily return a forged payload. getUser() verifies with the auth
  // server. Same choice middleware makes (src/middleware.ts).
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  // Bind and LOG the error. `parseRole(undefined)` already fails closed to
  // 'student', so an unreadable profile cannot escalate — but silence here means
  // a dropped RLS policy or a database outage presents as "everyone is suddenly a
  // student", locking every counsellor and admin out of their own portal with
  // nothing to grep for. This is the same discarded-error shape that
  // src/app/api/admin/admin-guard.ts exists to prevent; it was left here.
  //
  // Deliberately NOT thrown: identity resolution runs in layouts on every
  // authenticated route, and turning a transient read failure into a site-wide
  // error page is worse than degrading to least privilege. Loud, not fatal.
  if (error) {
    logger.error('Failed to read profiles.role; falling back to least privilege', error, {
      userId: user.id
    });
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    role: parseRole(data?.role)
  };
});

/**
 * The caller, or a redirect to `/login`.
 *
 * The 20 hand-copied `if (!user) redirect('/login')` sites collapse to this.
 * `redirect()` throws, so control never returns to the caller on the anonymous
 * path and the return type is honestly non-nullable.
 */
export const requireIdentity = async (): Promise<Identity> => {
  const identity = await getIdentity();
  if (!identity) redirect('/login');
  return identity;
};

/**
 * The caller, provided their role is one of `roles`.
 *
 * Anonymous ⇒ `/login`. Signed in with the wrong role ⇒ `/dashboard`, which is
 * the fallback the two existing admin guards already use
 * (`src/app/admin/page.tsx`). Deliberately a redirect and not a 404: the user
 * is legitimately signed in, they simply landed somewhere that is not theirs.
 *
 * NOTE ON LAYOUTS. A Next layout is not re-executed on client-side navigation,
 * so a guard placed in a layout is chrome-deep, not a boundary —
 * `src/app/admin/layout.tsx` documents this correctly and deliberately keeps
 * its role check in the pages. Use `requireRole` on the thing being protected;
 * a layout-level call is defence in depth and early UX, not the boundary.
 */
export const requireRole = async (...roles: Role[]): Promise<Identity> => {
  const identity = await requireIdentity();
  if (!roles.includes(identity.role)) redirect('/dashboard');
  return identity;
};
