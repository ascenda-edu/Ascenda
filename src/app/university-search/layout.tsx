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

  // The nav goes through the `nav` slot, not `children`: children render inside a
  // pathname-keyed transition wrapper, so a nav passed there remounts on every
  // navigation and its sliding indicator can never animate.
  //
  // `space-y-8` is kept on the children wrapper rather than dropped, so the spacing
  // between this section's own blocks is unchanged. (It's deliberately looser than the
  // app's space-y-6 default here.)
  return (
    <DashboardShell nav={<UniversitySearchNav />}>
      <div className="space-y-8">{children}</div>
    </DashboardShell>
  );
}
