import type { ReactNode } from 'react';
import { DashboardShell } from '@/components/layout/shell';

/**
 * Same fix as `/course/[id]`: this route rendered its own `min-h-screen` wrapper
 * with a bare `<Navbar>`, which drops the sidebar, the mobile bottom nav, the
 * command palette and the chat widget that `DashboardShell` gives every other
 * logged-in page.
 *
 * The page body (`components/university-search/university-information.tsx`,
 * outside this pass's paths) still carries its own
 * `min-h-screen … pt-28 shell-gutter max-w-6xl` page chrome, so every caller in
 * this segment cancels it through the `className` seam the component already
 * exposes for exactly that — see `PAGE_BODY_IN_SHELL` in `page.tsx`. That
 * component should own content, not page chrome; noted rather than changed here.
 */
export default function UniversityPageLayout({ children }: { children: ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
