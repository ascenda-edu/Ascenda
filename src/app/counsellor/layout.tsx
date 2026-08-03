import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/layout/shell';
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
 * `supabase/migrations/20260801120000_close_counsellor_access.sql`
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

  // NO SectionNav here, deliberately. On the student side the top bar shows one pill
  // per *segment* and a section nav is the second level inside it (Explore → Search /
  // Matches / Shortlist). The counsellor portal has no such split: `filterNavByRole`
  // replaces the entire top bar with the nine counsellor destinations (grouped into
  // one "Applications" dropdown by `COUNSELLOR_TOP_NAV`), and the sidebar and mobile
  // nav list the same nine flat. A section nav here was a second bar repeating the
  // first, so it's gone — nothing became unreachable.
  return <DashboardShell role={identity.role}>{children}</DashboardShell>;
}
