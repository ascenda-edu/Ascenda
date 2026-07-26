import type { ReactNode } from 'react';
import { DashboardShell } from '@/components/layout/shell';
import { SectionNav } from '@/components/layout/section-nav';
import { ADMIN_SECTION_ITEMS } from '@/components/layout/navigation';

/**
 * Owns the shell for both admin routes so the chrome survives navigation between
 * them. A layout is NOT re-mounted when you move between the routes it covers, which
 * is what lets the section nav's `layoutId` indicator slide: framer needs the
 * outgoing and incoming pill in the same commit. Rendered per-page (as both admin
 * pages did) it remounted every time, leaving the indicator correct-but-inert.
 *
 * The nav goes through the `nav` slot rather than `children`: children are wrapped in
 * a pathname-keyed transition inside the shell, so anything passed as a child
 * remounts on every navigation — the exact thing this is here to avoid.
 *
 * NOTE ON THE ROLE GUARD: the `profile.role !== 'admin'` check deliberately stays in
 * page.tsx / simulation/page.tsx and is NOT hoisted here. A Next layout does not
 * re-run on client-side navigation, so it is not a reliable authorisation boundary —
 * the guard has to live on the thing being protected. This layout is chrome only.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <DashboardShell nav={<SectionNav items={ADMIN_SECTION_ITEMS} />}>
      {children}
    </DashboardShell>
  );
}
