import type { Metadata } from 'next';
import { PageHero } from '@/components/layout/page-hero';
import { SectionNav } from '@/components/layout/section-nav';
import { PARENT_SECTION_ITEMS } from '@/components/layout/navigation';
import { AnimatedSection } from '@/components/layout/animated-section';
import { loadChildThread } from '@/lib/parent/data';
import { resolveParentContext } from '../_lib/context';
import { ChildSwitcher } from '../_components/child-switcher';
import { NoLinkedChildren } from '../_components/no-linked-children';
import { ParentThreadPanel } from './_parent-thread';

export const metadata: Metadata = { title: 'Messages · Parent' };
export const dynamic = 'force-dynamic';

export default async function ParentMessagesPage() {
  const { supabase, linkedChildren, activeChild } = await resolveParentContext();

  if (!activeChild) {
    return (
      <div className="space-y-6">
        <SectionNav items={PARENT_SECTION_ITEMS} />
        <PageHero
          tone="student"
          eyebrow="Parent"
          title="Messages"
          description="A direct line to the counsellor guiding your child's applications."
          stats={[
            { label: 'Messages', value: '0', detail: 'No linked student' },
            { label: 'Status', value: '—', detail: '' },
          ]}
        />
        <NoLinkedChildren />
      </div>
    );
  }

  const thread = await loadChildThread(supabase, activeChild.profileId);
  const unread = thread
    ? thread.messages.filter((m) => m.sender === 'counsellor' && !m.read).length
    : 0;

  return (
    <div className="space-y-6">
      <SectionNav items={PARENT_SECTION_ITEMS} />

      <PageHero
        tone="student"
        eyebrow="Parent"
        title="Talk to the counsellor"
        description={`Questions about ${activeChild.firstName}'s options, deadlines, or costs — the counsellor usually replies same-day.`}
        highlight={unread > 0 ? `${unread} new repl${unread === 1 ? 'y' : 'ies'}` : 'Direct line'}
        stats={[
          { label: 'Messages', value: `${thread?.messages.length ?? 0}`, detail: 'In this thread' },
          {
            label: 'Status',
            value: thread ? (thread.status === 'needs-response' ? 'Awaiting reply' : thread.status === 'resolved' ? 'Resolved' : 'Active') : '—',
            detail: thread ? 'Conversation state' : 'No thread yet',
          },
        ]}
        actions={<ChildSwitcher linkedChildren={linkedChildren} activeChildId={activeChild.profileId} />}
      />

      <AnimatedSection>
        <ParentThreadPanel thread={thread} childFirstName={activeChild.firstName} />
      </AnimatedSection>
    </div>
  );
}
