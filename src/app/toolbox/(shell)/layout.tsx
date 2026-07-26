import type { ReactNode } from 'react';
import { DashboardShell } from '@/components/layout/shell';
import { SectionNav } from '@/components/layout/section-nav';
import { TOOLBOX_SECTION_ITEMS } from '@/components/layout/navigation';

/**
 * Owns the shell for the four toolbox routes that live inside it — the hub, Chances,
 * Requirements and Timeline. A layout is NOT re-mounted when you move between the
 * routes it covers, which is what lets the section nav's `layoutId` indicator slide:
 * framer needs the outgoing and incoming pill in the same commit. Rendered per-page it
 * remounted every time, leaving the indicator correct-but-inert. It also fixes a real
 * inconsistency: the hub was the one route that rendered no nav, so the bar vanished
 * as you entered the hub and reappeared as you left it — while `Hub` was listed in
 * `TOOLBOX_SECTION_ITEMS` the whole time.
 *
 * ── Why this is a `(shell)` ROUTE GROUP and not `toolbox/layout.tsx` ─────────
 * `/toolbox/essay-workshop` is a deliberate escape: it renders `fixed inset-0 z-50`
 * (essay-workshop.tsx) as a full-viewport workspace, and mounting the sidebar, navbar
 * and mobile nav behind an opaque overlay is waste at best. A layout cannot be opted
 * out of by a child, so the only way to give four siblings a shared layout while
 * excluding the fifth is a route group. Route groups are invisible in the URL, so
 * every path here is unchanged — `(shell)/chances/page.tsx` still serves
 * `/toolbox/chances`.
 *
 * The auth guard stays in `toolbox/layout.tsx` one level up, so it still covers the
 * essay workshop too. `toolbox/error.tsx` likewise stays outside this group so it
 * keeps catching errors from every toolbox route.
 *
 * The nav goes through the `nav` slot rather than `children`: children are wrapped in
 * a pathname-keyed transition inside the shell, so anything passed as a child remounts
 * on every navigation — the exact thing this is here to avoid.
 */
export default function ToolboxShellLayout({ children }: { children: ReactNode }) {
  return (
    <DashboardShell nav={<SectionNav items={TOOLBOX_SECTION_ITEMS} />}>
      {children}
    </DashboardShell>
  );
}
