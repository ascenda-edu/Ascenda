import type { ReactNode } from 'react';
import { DashboardShell } from '@/components/layout/shell';
import { SectionNav } from '@/components/layout/section-nav';
import { PLANNER_SECTION_ITEMS } from '@/components/layout/navigation';
import { getIdentity } from '@/lib/auth/identity';

/**
 * Owns the shell for the three planner routes (/applications, /tasks, /documents) so
 * the chrome survives navigation between them. A layout is NOT re-mounted when you
 * move between the routes it covers, which is what lets the section nav's `layoutId`
 * indicator slide: framer needs the outgoing and incoming pill in the same commit.
 * Rendered per-page — as all three did, in four separate places counting this page's
 * two return paths — it remounted every time, leaving the indicator correct-but-inert.
 *
 * The nav goes through the `nav` slot rather than `children`: children are wrapped in
 * a pathname-keyed transition inside the shell, so anything passed as a child remounts
 * on every navigation, which is the exact thing this is here to avoid.
 *
 * The `redirect('/login')` guards stay in the pages. A Next layout does not re-run on
 * client-side navigation, so it is not a place to enforce access; this is chrome only.
 *
 * `getIdentity()` below is chrome too, and is NOT a guard — it is the nullable read,
 * deliberately, feeding the shell's `role` so the four nav components stop
 * re-deriving it in the browser (docs/audit/11-security-authz.md F8). Memoised per
 * request by React `cache()`, so it costs nothing once the pages under here move to
 * the same seam.
 */
export default async function ApplicationsLayout({ children }: { children: ReactNode }) {
  const identity = await getIdentity();

  return (
    <DashboardShell role={identity?.role ?? null} nav={<SectionNav items={PLANNER_SECTION_ITEMS} />}>
      {children}
    </DashboardShell>
  );
}
