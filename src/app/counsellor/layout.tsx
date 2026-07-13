import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/layout/shell';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// The counsellor area is open to every signed-in user so anyone can walk
// through both sides of the product (matching the 20260712130000 migration,
// which opened can_act_as_counsellor() the same way). Restore the
// profiles.role check here to re-restrict.
export default async function CounsellorLayout({ children }: { children: ReactNode }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return <DashboardShell>{children}</DashboardShell>;
}
