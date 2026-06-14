import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/layout/shell';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isDemoUser } from '@/lib/demo/demo-profile';

export default async function CounsellorLayout({ children }: { children: ReactNode }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Counsellor area is role-gated; the demo account is exempt so a single
  // login can walk through both sides of the product.
  if (!isDemoUser(user.email)) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'counsellor' && profile?.role !== 'admin') {
      redirect('/dashboard');
    }
  }

  return <DashboardShell>{children}</DashboardShell>;
}
