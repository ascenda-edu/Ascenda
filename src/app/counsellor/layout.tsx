import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/layout/shell';
import { SectionNav } from '@/components/layout/section-nav';
import { COUNSELLOR_SECTION_ITEMS } from '@/components/layout/navigation';
import { requireIdentity } from '@/lib/auth/identity';
import { can } from '@/lib/auth/policy';

/**
 * WHO MAY BE HERE — decided in ONE place, and the answer has not changed.
 *
 * This layout used to check authentication only (`if (!user) redirect`), which
 * is finding F5 in docs/audit/11-security-authz.md: ten role-privileged routes
 * behind a guard that asks nothing about the role. It now asks the policy
 * layer, `can(identity, 'portal:counsellor')`.
 *
 * The counsellor surface is still deliberately open to every signed-in user, so
 * anyone can walk through both sides of the product. Nothing about who reaches
 * /counsellor changes with this commit; what changes is that the decision moved
 * out of this file and into `@/lib/auth/policy`, where flipping it is one
 * constant instead of a hunt through ten routes.
 *
 * ⚑ TO CLOSE IT: apply
 * `supabase/migrations/20260801120000_close_counsellor_access_and_split_write_policies.sql`
 * (written, not applied — and read its own prerequisite header first) and set
 * `COUNSELLOR_PORTAL_OPEN_TO_ALL = false` in `src/lib/auth/policy.ts`. App and
 * DB must move together: closing this layout alone still leaves RLS returning
 * every student's row to a direct PostgREST call.
 *
 * NOTE ON LAYOUTS AS BOUNDARIES: a layout does not re-run on client-side
 * navigation, so this is early rejection and correct chrome, not the boundary —
 * `src/app/admin/layout.tsx` argues this properly. When the flag flips, the
 * pages under this segment need their own `can()` call too.
 */
export default async function CounsellorLayout({ children }: { children: ReactNode }) {
  const identity = await requireIdentity();

  if (!(await can(identity, 'portal:counsellor'))) {
    redirect('/dashboard');
  }

  // SectionNav lives HERE, not in each page. A layout is not re-mounted when you
  // navigate between the routes it covers, so the nav's `layoutId` indicator now has
  // the outgoing and incoming pill in the same commit and can actually slide between
  // them. Rendered per-page it remounted on every navigation, which left the indicator
  // correct-but-inert.
  // Passed via the `nav` slot, NOT as a child: children go inside a pathname-keyed
  // transition wrapper and would remount on every navigation.
  //
  // Two routes gain a nav row they didn't render before: `/counsellor/assistant` and
  // `/counsellor/students/[id]` (a layout can't be opted out of). Both read correctly —
  // `Overview` is `exact: true` so nothing is falsely active on /assistant, and the
  // detail page's `Students` pill stays lit while its breadcrumbs carry the deeper
  // position.
  return (
    <DashboardShell role={identity.role} nav={<SectionNav items={COUNSELLOR_SECTION_ITEMS} />}>
      {children}
    </DashboardShell>
  );
}
