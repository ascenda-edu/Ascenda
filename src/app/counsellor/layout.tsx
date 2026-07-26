import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/layout/shell';
import { SectionNav } from '@/components/layout/section-nav';
import { COUNSELLOR_SECTION_ITEMS } from '@/components/layout/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// The counsellor area is open to every signed-in user so anyone can walk
// through both sides of the product (matching the 20260712130000 migration,
// which opened can_act_as_counsellor() the same way). Restore the
// profiles.role check here to re-restrict.
export default async function CounsellorLayout({ children }: { children: ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
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
    <DashboardShell nav={<SectionNav items={COUNSELLOR_SECTION_ITEMS} />}>
      {children}
    </DashboardShell>
  );
}
