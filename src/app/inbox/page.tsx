import type { Metadata } from 'next';
import { requireIdentity } from '@/lib/auth/identity';
import { DashboardShell } from '@/components/layout/shell';
import { PageHero } from '@/components/layout/page-hero';
import { InboxList } from './_components/inbox-list';
import { AscendiCoachMount } from '@/components/onboarding/ascendi-coach-mount';

export const metadata: Metadata = {
  title: 'Inbox'
};

export const dynamic = 'force-dynamic';

export default async function InboxPage() {
  // One memoised identity lookup for the whole request (@/lib/auth/identity):
  // replaces the copy-pasted getUser()+redirect guard and yields the role the
  // shell needs, so the browser stops re-deriving it.
  const identity = await requireIdentity();

  return (
    <DashboardShell role={identity.role}>
      <PageHero
        tone="student"
        eyebrow="Conversations"
        title="Inbox"
        description="Every message between you and your counsellor lives here."
      />
      <div data-tour="inbox-list">
        <InboxList profileId={identity.userId} />
      </div>
      <AscendiCoachMount />
    </DashboardShell>
  );
}
