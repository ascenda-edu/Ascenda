import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { DashboardShell } from '@/components/layout/shell';
import { UniversitySearchNav } from '@/components/university-search/nav';

export default async function UniversitySearchLayout({ children }: { children: ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <DashboardShell>
      <div className="space-y-8">
        <UniversitySearchNav />
        {children}
      </div>
    </DashboardShell>
  );
}
