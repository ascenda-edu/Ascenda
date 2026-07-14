import type { Metadata } from 'next';
import { PageHero } from '@/components/layout/page-hero';
import { ParentPortal } from '../_components/parent-portal';
import { AnimatedSection } from '@/components/layout/animated-section';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { loadParentContacts, loadParentMessagesByContact } from '@/lib/counsellor/data';

export const metadata: Metadata = { title: 'Parents · Counsellor' };
export const dynamic = 'force-dynamic';

export default async function CounsellorParentsPage() {
  const supabase = createServerSupabaseClient();
  const [contacts, messagesByContact] = await Promise.all([
    loadParentContacts(supabase),
    loadParentMessagesByContact(supabase),
  ]);
  const needsResponse = contacts.filter((c) => c.status === 'needs-response').length;

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Counsellor"
        title="Parent communication"
        description="Counsellor-parent messaging with templates for common updates."
        stats={[
          { label: 'Parents', value: String(contacts.length), detail: 'In directory' },
          { label: 'Needs response', value: String(needsResponse), detail: 'Awaiting your reply' },
          { label: 'Active', value: String(contacts.filter((c) => c.status === 'active').length), detail: 'Ongoing conversations' },
        ]}
      />
      <AnimatedSection>
        <ParentPortal contacts={contacts} messagesByContact={messagesByContact} />
      </AnimatedSection>
    </div>
  );
}
