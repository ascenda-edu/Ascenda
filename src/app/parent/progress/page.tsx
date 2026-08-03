import type { Metadata } from 'next';
import { PageHero } from '@/components/layout/page-hero';
import { AnimatedSection } from '@/components/layout/animated-section';
import {
  ChildSwitcher,
  NoLinkedChildren,
  ProgressBoard,
  loadChildProgress,
  resolveParentContext,
} from '@/features/parent';

export const metadata: Metadata = { title: 'Progress · Parent' };
export const dynamic = 'force-dynamic';

export default async function ParentProgressPage() {
  const { supabase, linkedChildren, activeChild } = await resolveParentContext();

  if (!activeChild) {
    return (
      <div className="space-y-6">
        <PageHero
          tone="student"
          eyebrow="Parent"
          title="Application progress"
          description="Each application's stage, fit, and remaining work — read-only."
          stats={[
            { label: 'Applications', value: '0', detail: 'No linked student' },
            { label: 'Submitted', value: '—', detail: '' },
            { label: 'Tasks open', value: '—', detail: '' },
          ]}
        />
        <NoLinkedChildren />
      </div>
    );
  }

  const applications = await loadChildProgress(supabase, activeChild.profileId);
  const submitted = applications.filter(
    (a) => a.status === 'submitted' || a.status === 'decision' || a.status === 'enrolled'
  ).length;
  const tasksOpen = applications.reduce((sum, a) => sum + a.tasksOpen, 0);

  return (
    <div className="space-y-6">

      <PageHero
        tone="student"
        eyebrow="Parent"
        title={`${activeChild.firstName}'s applications`}
        description="Each application's stage, fit, and remaining work — read-only, so nothing here changes their plans."
        highlight={submitted > 0 ? `${submitted} submitted` : 'In progress'}
        stats={[
          { label: 'Tracked', value: `${applications.length}`, detail: 'Applications' },
          { label: 'Submitted', value: `${submitted}`, detail: 'Awaiting decision' },
          { label: 'Tasks open', value: `${tasksOpen}`, detail: 'Across all applications' },
        ]}
        actions={<ChildSwitcher linkedChildren={linkedChildren} activeChildId={activeChild.profileId} />}
      />

      <AnimatedSection>
        <ProgressBoard applications={applications} childFirstName={activeChild.firstName} />
      </AnimatedSection>
    </div>
  );
}
