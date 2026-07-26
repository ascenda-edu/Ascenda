import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/layout/shell';
import { SectionNav } from '@/components/layout/section-nav';
import { PARENT_SECTION_ITEMS } from '@/components/layout/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// Auth-gated like the counsellor area (any signed-in user can enter in the
// single-account demo). What a parent can SEE is scoped separately: every
// page resolves guardian_links via resolveLinkedChildIds() and renders an
// empty state when the account has no linked children — never the cohort.
export default async function ParentLayout({ children }: { children: ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
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
    <DashboardShell nav={<SectionNav items={PARENT_SECTION_ITEMS} />}>
      {children}
    </DashboardShell>
  );
}
