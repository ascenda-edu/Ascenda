import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/layout/shell';
import { SectionNav } from '@/components/layout/section-nav';
import { PARENT_SECTION_ITEMS } from '@/components/layout/navigation';
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

  // SectionNav lives HERE, not in each page. A layout is not re-mounted when you
  // navigate between the routes it covers, so the nav's `layoutId` indicator now has
  // the outgoing and incoming pill in the same commit and can actually slide between
  // them. Rendered per-page it remounted on every navigation, which left the indicator
  // correct-but-inert. All five parent routes rendered it already, so this changes
  // nothing about what appears — only how long it lives.
  // Passed via the `nav` slot, NOT as a child: children go inside a pathname-keyed
  // transition wrapper and would remount on every navigation.
  return (
    <DashboardShell role={identity.role} nav={<SectionNav items={PARENT_SECTION_ITEMS} />}>
      {children}
    </DashboardShell>
  );
}
