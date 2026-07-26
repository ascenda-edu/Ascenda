import type { Metadata } from 'next';
import { PageHero } from '@/components/layout/page-hero';
import { AnimatedSection } from '@/components/layout/animated-section';
import { SectionNav } from '@/components/layout/section-nav';
import { COUNSELLOR_SECTION_ITEMS } from '@/components/layout/navigation';
import { CounsellorInbox } from './_components/counsellor-inbox';

export const metadata: Metadata = { title: 'Inbox · Counsellor' };
export const dynamic = 'force-dynamic';

export default function CounsellorInboxPage() {
  return (
    <div className="space-y-6">
      <SectionNav items={COUNSELLOR_SECTION_ITEMS} />
      <PageHero
        eyebrow="Counsellor"
        title="Inbox"
        description="Every conversation with your students — help requests, replies and check-ins."
      />
      <AnimatedSection>
        <CounsellorInbox />
      </AnimatedSection>
    </div>
  );
}
