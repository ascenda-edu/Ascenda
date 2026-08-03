'use client';

/**
 * DEPRECATED SHIM — kept so nothing outside this refactor breaks.
 *
 * This hook used to BE the role: it read `sessionStorage['ascenda-session-role']`
 * / `localStorage['ascenda-role']` first and only then asked the database, via
 * `auth.getUser()` + a `profiles` query, in the browser. Four layout components
 * that render on every page each called it independently
 * (docs/audit/11-security-authz.md F8).
 *
 * The role is now resolved ONCE on the server (`@/lib/auth/identity`, memoised
 * per request) and handed to the client through `<RoleProvider>`. The
 * implementation moved to `@/lib/auth/role-context` — including the client
 * derivation, which survives only as a fallback for surfaces that do not yet
 * pass a server role.
 *
 * New code should call `useRole()` from `@/lib/auth/role-context` directly, and
 * must not treat either as an authorisation input: authorisation is
 * `can(identity, action, resource)` in `@/lib/auth/policy`, server-side.
 */

export { useRole as useUserRole, SESSION_ROLE_KEY, LOCAL_ROLE_KEY } from '@/lib/auth/role-context';
