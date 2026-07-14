import type { Metadata } from 'next';
import { PageHero } from '@/components/layout/page-hero';
import { AnimatedSection } from '@/components/layout/animated-section';
import { CounsellorInbox } from './_components/counsellor-inbox';

export const metadata: Metadata = { title: 'Inbox · Counsellor' };
export const dynamic = 'force-dynamic';

export default function CounsellorInboxPage() {
  return (
    <div className="space-y-6">
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
