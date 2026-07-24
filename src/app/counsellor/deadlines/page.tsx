import type { Metadata } from 'next';
import { PageHero } from '@/components/layout/page-hero';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { loadCohort, deriveAllDeadlines } from '@/lib/counsellor/data';
import { DeadlineMonitor } from '../_components/deadline-monitor';
import { AnimatedSection } from '@/components/layout/animated-section';

export const metadata: Metadata = { title: 'Deadlines · Counsellor' };
export const dynamic = 'force-dynamic';

export default async function CounsellorDeadlinesPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const cohort = await loadCohort(supabase, { excludeId: user?.id });
  const allDeadlines = deriveAllDeadlines(cohort);

  // Reuse the daysUntil already computed in data.ts (parsed as LOCAL dates) so
  // these hero tiles agree with the DeadlineMonitor grouping below.
  const overdue = allDeadlines.filter((d) => d.daysUntil < 0).length;
  const thisWeek = allDeadlines.filter((d) => d.daysUntil >= 0 && d.daysUntil <= 7).length;
  const thisMonth = allDeadlines.filter((d) => d.daysUntil >= 0 && d.daysUntil <= 30).length;

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Counsellor"
        highlight={`${allDeadlines.length} total`}
        title="Deadline monitor"
        description="Every upcoming submission across the cohort, grouped by urgency. Open Applications for per-student status."
        stats={[
          { label: 'Total', value: String(allDeadlines.length), detail: 'All tracked deadlines' },
          { label: 'Overdue', value: String(overdue), detail: 'Require immediate action' },
          { label: 'This week', value: String(thisWeek), detail: 'Due in ≤7 days' },
          { label: 'This month', value: String(thisMonth), detail: 'Due in ≤30 days' }
        ]}
      />
      <AnimatedSection>
        <DeadlineMonitor deadlines={allDeadlines} />
      </AnimatedSection>
    </div>
  );
}
