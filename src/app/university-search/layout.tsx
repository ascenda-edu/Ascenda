import type { ReactNode } from 'react';
import { DashboardShell } from '@/components/layout/shell';
import { UniversitySearchNav } from '@/components/university-search/nav';
import { requireIdentity } from '@/lib/auth/identity';

export default async function UniversitySearchLayout({ children }: { children: ReactNode }) {
  // One memoised identity lookup for the whole request (@/lib/auth/identity):
  // replaces the copy-pasted getUser()+redirect guard and yields the role the
  // shell needs, so the browser stops re-deriving it.
  const identity = await requireIdentity();

  // The nav goes through the `nav` slot, not `children`: children render inside a
  // pathname-keyed transition wrapper, so a nav passed there remounts on every
  // navigation and its sliding indicator can never animate.
  //
  // `space-y-8` is kept on the children wrapper rather than dropped, so the spacing
  // between this section's own blocks is unchanged. (It's deliberately looser than the
  // app's space-y-6 default here.)
  return (
    <DashboardShell role={identity.role} nav={<UniversitySearchNav />}>
      <div className="space-y-8">{children}</div>
    </DashboardShell>
  );
}
