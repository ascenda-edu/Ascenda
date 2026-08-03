/**
 * The declarative authorisation layer: `can(identity, action, resource?)`.
 *
 * WHY THIS EXISTS
 * ---------------
 * There was no `can()`, no route→role map, no guard HOC and no policy module
 * (docs/audit/11-security-authz.md §1.4). Authorisation was five hand-copied
 * `profile?.role !== 'admin'` checks with two different failure modes, three
 * calls into `canActAsCounsellor`, and ~43 sites of `if (!user)` —
 * authentication masquerading as authorisation. A new route was secure only if
 * its author remembered a convention that did not exist (finding F9).
 *
 * THE ACTION SET IS DERIVED, NOT INVENTED
 * ---------------------------------------
 * Every action below is something the app already does today, and every one
 * maps to a guard that already exists:
 *
 *   portal:admin       ← `profile?.role !== 'admin'` × 5
 *                        (admin/page.tsx, admin/simulation/page.tsx, and the
 *                         three /api/admin routes)
 *   catalogue:write    ← the admin check on /api/admin/import + the
 *                        `programs`/`universities`/`cities` admin write policy
 *                        (20260719120000)
 *   portal:counsellor  ← src/app/counsellor/layout.tsx
 *   portal:parent      ← src/app/parent/layout.tsx
 *   portal:student     ← the ~20 `if (!user) redirect('/login')` student pages
 *   student:read       ← `canActAsCounsellor` on the counsellor read paths
 *   student:note       ← /api/counsellor/notes  → assertCounsellorMayActOnStudent
 *   student:message    ← the help-request / message_student write paths
 *                        → assertCounsellorMayActOnStudent
 *
 * Nothing else. Adding an action means a guard exists that it describes.
 *
 * AGREEMENT WITH src/lib/api/guards.ts IS A HARD REQUIREMENT
 * ----------------------------------------------------------
 * `actsAsCounsellor()` below is a third statement of one rule that already
 * exists twice:
 *
 *   SQL   public.can_act_as_counsellor() = is_counsellor() or is_demo_account()
 *   app   src/lib/api/guards.ts `canActAsCounsellor`
 *   here  `actsAsCounsellor`
 *
 * It is stated a third time rather than called, because `canActAsCounsellor`
 * takes a `SupabaseClient` + `User` and re-queries `profiles` for a role this
 * module has already resolved through `getIdentity()`. Routing every policy
 * check back through it would reintroduce exactly the per-guard round trip
 * `getIdentity`'s `cache()` exists to remove. The two are pinned together by
 * `__tests__/auth/policy.test.ts`, which runs the real `canActAsCounsellor`
 * against a stub client and asserts both answers agree for a counsellor, an
 * admin, a student and the demo account. If you change one, change the other
 * and the SQL in the same commit — the test will tell you if you did not.
 *
 * The SUBJECT half is NOT restated: it delegates to `isActionableStudent`, the
 * same function `assertCounsellorMayActOnStudent` calls.
 *
 * SERVER ONLY. Same guard as `identity.ts` — see its header.
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isActionableStudent } from '@/lib/api/guards';
import { isDemoUser } from '@/lib/demo/demo-profile';
import type { Identity, Role } from '@/lib/auth/identity';

if (typeof window !== 'undefined') {
  throw new Error('@/lib/auth/policy is server-only');
}

/* -------------------------------------------------------------------------- */
/* actions                                                                     */
/* -------------------------------------------------------------------------- */

export type Action =
  | 'portal:student'
  | 'portal:counsellor'
  | 'portal:parent'
  | 'portal:admin'
  | 'student:read'
  | 'student:note'
  | 'student:message'
  | 'catalogue:write';

/** Actions that name a specific student and therefore REQUIRE a resource. */
const SUBJECT_SCOPED: ReadonlySet<Action> = new Set<Action>([
  'student:read',
  'student:note',
  'student:message'
]);

/** Everything `can_act_as_counsellor()` unlocks. Kept as one list so the demo-account and role paths cannot drift. */
const COUNSELLOR_ACTIONS: readonly Action[] = [
  'portal:counsellor',
  'student:read',
  'student:note',
  'student:message'
];

const ROLE_ACTIONS: Record<Role, readonly Action[]> = {
  // `student:read` looks surprising here and is not a widening: it is
  // subject-scoped, so it still has to clear `mayActOnStudent`, which for a
  // plain student passes ONLY on their own id. It is what lets a student page
  // ask `can(identity, 'student:read', { studentId })` and get the right answer
  // instead of having to special-case self-access at every call site. Note the
  // asymmetry with `student:note` / `student:message`, which are deliberately
  // absent: nobody writes a counsellor note about themselves.
  student: ['portal:student', 'student:read'],
  counsellor: ['portal:student', ...COUNSELLOR_ACTIONS],
  admin: [
    'portal:student',
    'portal:parent',
    'portal:admin',
    'catalogue:write',
    ...COUNSELLOR_ACTIONS
  ]
};

/* -------------------------------------------------------------------------- */
/* the demo posture — the ONE line to flip                                     */
/* -------------------------------------------------------------------------- */

/**
 * ⚑ THE SINGLE LINE TO FLIP WHEN THE COUNSELLOR MIGRATION LANDS.
 *
 * `supabase/migrations/20260801120000_close_counsellor_access.sql`
 * is written but NOT applied. It rewrites `can_act_as_counsellor()` from
 * `auth.uid() is not null` back to `is_counsellor() or is_demo_account()`.
 *
 * Until it is applied, /counsellor is deliberately open to every signed-in user
 * so anyone can walk through both sides of the product — the posture documented
 * at `src/app/counsellor/layout.tsx` and in the migration's own header. Closing
 * it in the app alone would only half-close it (RLS would still return every
 * student's row to a direct PostgREST call) while breaking the demo, so app and
 * DB must move together.
 *
 * When that migration is applied, change this constant to `false` and nothing
 * else. `/counsellor` then answers `portal:counsellor` from `ROLE_ACTIONS`
 * alone, which is `is_counsellor() or is_demo_account()` — the same rule as the
 * SQL and as `guards.ts`.
 *
 * SCOPE NOTE, and it is the reason this is a portal-only override: it opens the
 * PORTAL, not the DATA. `student:read` / `student:note` / `student:message`
 * never consult this flag — they go through `actsAsCounsellor()`, which already
 * mirrors `guards.ts` exactly. So a student who walks into /counsellor today
 * sees the operational chrome, and every guarded write still refuses them.
 */
export const COUNSELLOR_PORTAL_OPEN_TO_ALL = true;

/**
 * The same posture for `/parent`, and a materially weaker reason to hurry.
 *
 * `/parent` is auth-only today for the same demo reason, but unlike
 * `/counsellor` its DATA is genuinely scoped: every parent page resolves
 * `guardian_links` through `resolveParentContext()` and renders
 * `NoLinkedChildren` when the account has no links — never the cohort. So an
 * uninvited visitor reaches an empty shell rather than another family's record.
 *
 * Flip to `false` once real guardian accounts exist and carry
 * `profiles.role = 'parent'`. NOTE: `'parent'` is not currently a value of the
 * `profiles.role` enum (`'student' | 'counsellor' | 'admin'`), so flipping this
 * before that role exists would lock EVERY non-admin out of /parent, including
 * the demo. Add the role first.
 */
export const PARENT_PORTAL_OPEN_TO_ALL = true;

/* -------------------------------------------------------------------------- */
/* the counsellor test                                                         */
/* -------------------------------------------------------------------------- */

/**
 * In-app mirror of `public.can_act_as_counsellor()` — `is_counsellor() or
 * is_demo_account()`.
 *
 *   is_counsellor()   → profiles.role in ('counsellor', 'admin')
 *   is_demo_account() → the JWT email claim matches the demo address
 *
 * Synchronous, because `getIdentity()` has already paid for the role lookup
 * that `guards.ts:canActAsCounsellor` performs per call.
 */
export const actsAsCounsellor = (identity: Identity): boolean =>
  identity.role === 'counsellor' || identity.role === 'admin' || isDemoUser(identity.email);

/* -------------------------------------------------------------------------- */
/* the subject rule                                                            */
/* -------------------------------------------------------------------------- */

/**
 * May `identity` act on the record belonging to `studentId`?
 *
 * Delegates to `isActionableStudent` — the same function
 * `assertCounsellorMayActOnStudent` uses — so the REST routes, the assistant's
 * write tools and this policy layer all apply one rule.
 *
 * ⚠️ LIMITED UNTIL `counsellor_assignments` LANDS. Being a counsellor is
 * necessary but not sufficient; a counsellor should only act on students they
 * are responsible for. That relationship does not exist as data yet — "cohort"
 * is an email-suffix filter in application code
 * (`src/lib/counsellor/data.ts`), which is not something authorisation can rest
 * on, and which the student can rewrite themselves because they own the email
 * column. So the per-student half currently degrades to "the target is a real
 * student profile", exactly as `assertCounsellorMayActOnStudent` documents.
 *
 * `supabase/migrations/20260801122000_counsellor_assignments.sql` creates the
 * edge (written, NOT applied). THIS FUNCTION IS THE SEAM WHERE IT PLUGS IN:
 * when the table exists, add the membership check here —
 *
 *     const { data } = await supabase
 *       .from('counsellor_assignments')
 *       .select('id')
 *       .eq('counsellor_profile_id', identity.userId)
 *       .eq('student_profile_id', studentId)
 *       .eq('status', 'active')
 *       .maybeSingle();
 *     if (!data) return false;
 *
 * — and every `can(..., { studentId })` caller is scoped at once, rather than
 * re-auditing every route. The matching change on the route-handler side is the
 * identical addition inside `assertCounsellorMayActOnStudent`; both must land
 * together, and both are one function.
 */
const mayActOnStudent = async (identity: Identity, studentId: string): Promise<boolean> => {
  // Your own record is always in scope.
  if (identity.userId === studentId) return true;

  // Admin is unconditional — mirrors `auth_role() = 'admin'` in the policies.
  if (identity.role === 'admin') return true;

  if (!actsAsCounsellor(identity)) return false;

  const supabase = await createServerSupabaseClient();
  return isActionableStudent(supabase, studentId);
};

/* -------------------------------------------------------------------------- */
/* can()                                                                       */
/* -------------------------------------------------------------------------- */

export interface Resource {
  studentId: string;
}

/**
 * The coarse grant set for an identity, BEFORE any demo-posture override.
 *
 * Exported so the posture flags are testable: `roleGrants(student)` is what
 * `can()` will fall back to the moment `COUNSELLOR_PORTAL_OPEN_TO_ALL` /
 * `PARENT_PORTAL_OPEN_TO_ALL` are set to `false`, so a test can assert the
 * closed answer today without waiting for the flip.
 */
export const roleGrants = (identity: Identity): ReadonlySet<Action> => {
  const granted = new Set<Action>(ROLE_ACTIONS[identity.role]);
  // The demo-account limb of can_act_as_counsellor(): an account whose role is
  // 'student' but whose email is the demo address still acts as a counsellor.
  if (actsAsCounsellor(identity)) {
    for (const action of COUNSELLOR_ACTIONS) granted.add(action);
  }
  return granted;
};

/**
 * The one authorisation question in the app.
 *
 * Fails closed in every direction: an action outside the caller's grant set is
 * refused, and a subject-scoped action called WITHOUT a resource is refused
 * outright rather than silently answering the coarse question. That last rule
 * is deliberate — the class of bug this layer exists to prevent is a route that
 * checks "is the caller a counsellor" and forgets "…of THIS student"
 * (findings F2, F3, F6 were all exactly that).
 */
export const can = async (
  identity: Identity,
  action: Action,
  resource?: Resource
): Promise<boolean> => {
  const granted = roleGrants(identity);

  if (SUBJECT_SCOPED.has(action)) {
    // A subject-scoped action with no subject is a bug at the call site, not a
    // permission to be granted.
    if (!resource) return false;
    if (!granted.has(action)) return false;
    return mayActOnStudent(identity, resource.studentId);
  }

  if (action === 'portal:counsellor' && COUNSELLOR_PORTAL_OPEN_TO_ALL) return true;
  if (action === 'portal:parent' && PARENT_PORTAL_OPEN_TO_ALL) return true;

  return granted.has(action);
};

/* -------------------------------------------------------------------------- */
/* route → action                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The ONLY place a URL prefix maps to a permission.
 *
 * Longest prefix wins, so `/counsellor/students` resolves through
 * `/counsellor`. Middleware may consult this for coarse, fast rejection and
 * better UX; the page or handler re-check is the real boundary, for the reason
 * `src/app/admin/layout.tsx` sets out — a layout does not re-run on client-side
 * navigation.
 */
export const ROUTE_POLICY: ReadonlyArray<readonly [string, Action]> = [
  ['/admin', 'portal:admin'],
  ['/counsellor', 'portal:counsellor'],
  ['/parent', 'portal:parent'],
  ['/dashboard', 'portal:student'],
  ['/matches', 'portal:student'],
  ['/applications', 'portal:student'],
  ['/university-search', 'portal:student'],
  ['/course', 'portal:student'],
  ['/shortlist', 'portal:student'],
  ['/scholarships', 'portal:student'],
  ['/toolbox', 'portal:student'],
  ['/profile', 'portal:student'],
  ['/inbox', 'portal:student'],
  ['/assistant', 'portal:student'],
  ['/role-select', 'portal:student']
];

/** The action a pathname requires, or `null` if the prefix is unprotected. */
export const actionForPath = (pathname: string): Action | null => {
  let best: readonly [string, Action] | null = null;
  for (const entry of ROUTE_POLICY) {
    const [prefix] = entry;
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      if (!best || prefix.length > best[0].length) best = entry;
    }
  }
  return best ? best[1] : null;
};
