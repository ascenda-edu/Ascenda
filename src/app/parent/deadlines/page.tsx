import type { Metadata } from 'next';
import { PageHero } from '@/components/layout/page-hero';
import { AnimatedSection } from '@/components/layout/animated-section';
import { parseLocalDate } from '@/lib/utils/dates';
import {
  ChildSwitcher,
  DeadlineGroups,
  NoLinkedChildren,
  loadChildDeadlines,
  resolveParentContext,
} from '@/features/parent';

export const metadata: Metadata = { title: 'Deadlines · Parent' };
export const dynamic = 'force-dynamic';

const shortDateFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

export default async function ParentDeadlinesPage() {
  const { supabase, linkedChildren, activeChild } = await resolveParentContext();

  if (!activeChild) {
    return (
      <div className="space-y-6">
        <PageHero
          tone="student"
          eyebrow="Parent"
          title="Deadlines"
          description="Every application deadline, grouped by urgency."
          stats={[
            { label: 'Upcoming', value: '0', detail: 'No linked student' },
            { label: 'This week', value: '—', detail: '' },
            { label: 'Next up', value: '—', detail: '' },
          ]}
        />
        <NoLinkedChildren />
      </div>
    );
  }

  const deadlines = await loadChildDeadlines(supabase, activeChild.profileId);
  const upcoming = deadlines.filter((d) => d.daysUntil >= 0);
  const thisWeek = upcoming.filter((d) => d.daysUntil <= 7).length;
  const next = upcoming[0] ?? null;

  return (
    <div className="space-y-6">

      <PageHero
        tone="student"
        eyebrow="Parent"
        title={`${activeChild.firstName}'s deadlines`}
        description="Dates shown for your timezone won't drift — deadlines are pinned to their calendar day."
        highlight={thisWeek > 0 ? `${thisWeek} this week` : 'No immediate pressure'}
        stats={[
          { label: 'Upcoming', value: `${upcoming.length}`, detail: 'Across all applications' },
          { label: 'This week', value: `${thisWeek}`, detail: 'Within 7 days' },
          {
            label: 'Next up',
            value: next ? shortDateFormatter.format(parseLocalDate(next.date)) : '—',
            detail: next ? next.university : 'Nothing scheduled',
          },
        ]}
        actions={<ChildSwitcher linkedChildren={linkedChildren} activeChildId={activeChild.profileId} />}
      />

      <AnimatedSection>
        <DeadlineGroups deadlines={deadlines} childName={activeChild.name} />
      </AnimatedSection>
    </div>
  );
}
