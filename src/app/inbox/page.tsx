import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { DashboardShell } from '@/components/layout/shell';
import { PageHero } from '@/components/layout/page-hero';
import { InboxList } from './_components/inbox-list';

export const metadata: Metadata = {
  title: 'Inbox'
};

export const dynamic = 'force-dynamic';

export default async function InboxPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <DashboardShell>
      <PageHero
        tone="student"
        eyebrow="Conversations"
        title="Inbox"
        description="Every message between you and your counsellor lives here."
      />
      <InboxList profileId={user.id} />
    </DashboardShell>
  );
}
