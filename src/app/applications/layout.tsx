import type { ReactNode } from 'react';
import { DashboardShell } from '@/components/layout/shell';
import { SectionNav } from '@/components/layout/section-nav';
import { PLANNER_SECTION_ITEMS } from '@/components/layout/navigation';

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
 */
export default function ApplicationsLayout({ children }: { children: ReactNode }) {
  return (
    <DashboardShell nav={<SectionNav items={PLANNER_SECTION_ITEMS} />}>
      {children}
    </DashboardShell>
  );
}
