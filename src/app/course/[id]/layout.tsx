import type { ReactNode } from 'react';
import { DashboardShell } from '@/components/layout/shell';

/**
 * `/course/[id]` is a logged-in student page and belongs in the app shell like
 * every other one. It used to render its own `min-h-screen` wrapper with a bare
 * `<Navbar>` inside `CoursePageClient`, which silently dropped four things
 * `DashboardShell` provides everywhere else — the sidebar, the mobile bottom
 * nav, the command palette and the Ascendi chat widget — and gave the page a
 * `max-w-6xl` gutter that didn't line up with the shell's
 * `max-w-[120rem]` + `shell-gutter`.
 *
 * It's a layout rather than a wrapper inside `page.tsx` so `loading.tsx` and
 * `error.tsx` render inside the shell too; nested inside `page.tsx` they would
 * each have replaced the whole chrome.
 */
export default function CourseLayout({ children }: { children: ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
