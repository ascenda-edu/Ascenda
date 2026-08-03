'use client';

/**
 * The client half of identity: the server-resolved role, handed down.
 *
 * WHY THIS EXISTS
 * ---------------
 * `useUserRole()` re-derived the role IN THE BROWSER with `auth.getUser()`
 * followed by a `profiles` query, and four layout components called it —
 * `navbar`, `sidebar`, `mobile-nav` and `side-switcher` — all of which render
 * on essentially every page. That is four client components racing to
 * rediscover a value the server already knew, twice each
 * (docs/audit/11-security-authz.md F8, docs/audit/01-architecture.md A5).
 *
 * Worse than the cost: the value it landed on was sourced from
 * `sessionStorage`/`localStorage` in preference to the database. A role claim
 * read out of attacker-writable storage is not a claim. The impact was bounded
 * — `/admin` and the three admin API routes all re-check server-side — but it
 * is the wrong shape, and it is the shape a future guard would copy.
 *
 * WHAT REPLACES IT
 * ----------------
 * The server resolves the role once (`@/lib/auth/identity`, memoised per
 * request by React `cache()`) and passes it to `<RoleProvider>` inside
 * `DashboardShell`. `useRole()` reads it out of context. No `auth.getUser()`,
 * no `profiles` query, no round trip, and the value is correct on the very
 * first paint instead of arriving a request or two later.
 *
 * THE DEMO ROLE SWITCHER STILL WINS
 * ---------------------------------
 * `/role-select` and the sidebar's `SideSwitcher` write
 * `sessionStorage['ascenda-session-role']` and navigate. That is a UI
 * PREFERENCE — "show me the product from this side" — not a security claim, and
 * the whole single-account demo depends on it. It is preserved, unchanged, and
 * it deliberately outranks the server value for what the NAV displays.
 *
 * That is safe precisely because nothing security-relevant reads this hook. The
 * two decisions it drives are cosmetic: whether the `Admin` nav item is listed
 * (`filterNavByRole`) and whether the portal switcher is shown
 * (`side-switcher`). Every real boundary — `/admin/page.tsx`, the three
 * `/api/admin/*` routes, and `can()` — resolves the role server-side from
 * `profiles` and cannot see this value at all.
 *
 * THE FALLBACK
 * ------------
 * When no `<RoleProvider>` supplies a role (a surface not yet migrated, or the
 * one `DashboardShell` mounted from a client component —
 * `src/app/appointment/page.tsx`), `useRole()` degrades to the original client
 * derivation so nav behaviour is unchanged there. Migrating a surface is one
 * line: resolve the identity in its layout/page and pass `role` to
 * `DashboardShell`. When every mount passes one, the fallback and its two
 * network calls can be deleted outright.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getBrowserSupabaseClient } from '@/lib/supabase/client';

/** Written by `/role-select` and `SideSwitcher`. A view preference, never a claim. */
export const SESSION_ROLE_KEY = 'ascenda-session-role';
/** Anti-flicker cache for the fallback path only. */
export const LOCAL_ROLE_KEY = 'ascenda-role';

/**
 * `undefined` = no provider in the tree (fall back to client derivation).
 * `null`      = a provider resolved the request as anonymous.
 */
const ServerRoleContext = createContext<string | null | undefined>(undefined);

/**
 * Publishes the server-resolved role to the client tree.
 *
 * `role` is `string | null | undefined` rather than the `Role` union on
 * purpose: this is presentation state, it crosses the server/client boundary as
 * a plain serialisable value, and `undefined` has to stay expressible so an
 * un-migrated mount is distinguishable from an anonymous one.
 */
export const RoleProvider = ({
  role,
  children
}: {
  role?: string | null;
  children: ReactNode;
}) => <ServerRoleContext.Provider value={role}>{children}</ServerRoleContext.Provider>;

/** Raw context read. `undefined` means "not provided". */
export const useServerRole = (): string | null | undefined => useContext(ServerRoleContext);

const readStorage = (store: 'session' | 'local', key: string): string | null => {
  try {
    return (store === 'session' ? window.sessionStorage : window.localStorage).getItem(key);
  } catch {
    // Storage throws in private mode / with cookies blocked. Absent is a fine answer.
    return null;
  }
};

const writeLocalRole = (role: string | null): void => {
  try {
    if (role) window.localStorage.setItem(LOCAL_ROLE_KEY, role);
    else window.localStorage.removeItem(LOCAL_ROLE_KEY);
  } catch {
    /* see readStorage */
  }
};

/**
 * The role the CHROME should render for.
 *
 * Precedence, highest first:
 *   1. `sessionStorage['ascenda-session-role']` — the demo role switcher.
 *   2. The server-resolved role from `<RoleProvider>`.
 *   3. Legacy client derivation (only when no provider is present).
 *
 * Not an authorisation input. See the module header.
 */
export const useRole = (): string | null => {
  const serverRole = useServerRole();
  const hasServerRole = serverRole !== undefined;

  // Seeded from the server value so the first client render matches the HTML
  // the server produced — no hydration mismatch, no nav flicker. Storage can
  // only be read after mount, so the override lands in the effect below.
  const [role, setRole] = useState<string | null>(hasServerRole ? (serverRole ?? null) : null);

  useEffect(() => {
    // 1. Demo role switcher. Wins outright — a demo user who flips to the
    //    counsellor side must keep seeing that side's chrome.
    const sessionRole = readStorage('session', SESSION_ROLE_KEY);
    if (sessionRole) {
      setRole(sessionRole);
      return;
    }

    // 2. Server-resolved. Nothing to fetch: the answer arrived with the HTML.
    if (hasServerRole) {
      setRole(serverRole ?? null);
      return;
    }

    // 3. Fallback for surfaces that do not yet pass a role. Two network calls,
    //    which is exactly what this module exists to remove — see the header.
    let cancelled = false;

    const cachedRole = readStorage('local', LOCAL_ROLE_KEY);
    if (cachedRole) setRole(cachedRole);

    const supabase = getBrowserSupabaseClient();
    supabase.auth
      .getUser()
      .then(({ data }) => {
        const userId = data?.user?.id;
        if (!userId) {
          if (!cancelled) setRole(null);
          return null;
        }
        return supabase.from('profiles').select('role').eq('id', userId).single();
      })
      .then((response) => {
        if (cancelled || !response || !('data' in response)) return;
        setRole(response.data?.role ?? null);
      })
      .catch(() => {
        if (!cancelled) setRole(null);
      });

    return () => {
      cancelled = true;
    };
  }, [hasServerRole, serverRole]);

  // Keep the anti-flicker cache warm for any mount still on the fallback path.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    writeLocalRole(role);
  }, [role]);

  return role;
};
