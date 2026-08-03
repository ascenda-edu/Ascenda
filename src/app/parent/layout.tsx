import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/layout/shell';
import { requireIdentity } from '@/lib/auth/identity';
import { can } from '@/lib/auth/policy';

/**
 * Same move as the counsellor layout: authentication-only became a policy
 * question (docs/audit/11-security-authz.md F5), with the current answer
 * preserved exactly.
 *
 * /parent stays open to any signed-in user in the single-account demo —
 * `PARENT_PORTAL_OPEN_TO_ALL` in `@/lib/auth/policy` — but unlike /counsellor
 * the data behind it is genuinely scoped: every page resolves `guardian_links`
 * through `resolveParentContext()` and renders an empty state when the account
 * has no linked children, never the cohort. An uninvited visitor gets an empty
 * shell.
 */
export default async function ParentLayout({ children }: { children: ReactNode }) {
  const identity = await requireIdentity();

  if (!(await can(identity, 'portal:parent'))) {
    redirect('/dashboard');
  }

  // NO SectionNav here, deliberately — same reasoning as `counsellor/layout.tsx`.
  // `filterNavByRole` swaps the whole top bar to the parent destinations on /parent
  // routes, so a section nav underneath was a second bar listing the same links.
  return <DashboardShell role={identity.role}>{children}</DashboardShell>;
}
