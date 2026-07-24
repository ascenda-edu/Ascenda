import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/layout/shell';
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

  return <DashboardShell>{children}</DashboardShell>;
}
