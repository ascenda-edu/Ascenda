import type { Metadata } from 'next';
import { requireIdentity } from '@/lib/auth/identity';
import { DashboardShell } from '@/components/layout/shell';
import { AssistantWorkspace } from '@/components/assistant/assistant-workspace';

export const metadata: Metadata = { title: 'Assistant' };
export const dynamic = 'force-dynamic';

export default async function AssistantPage() {
  // One memoised identity lookup for the whole request (@/lib/auth/identity):
  // replaces the copy-pasted getUser()+redirect guard and yields the role the
  // shell needs, so the browser stops re-deriving it.
  const identity = await requireIdentity();

  return (
    <DashboardShell role={identity.role}>
      <AssistantWorkspace mode="student" userId={identity.userId} />
    </DashboardShell>
  );
}
