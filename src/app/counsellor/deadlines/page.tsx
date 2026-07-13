import { PageHero } from '@/components/layout/page-hero';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { loadCohort, deriveAllDeadlines } from '@/lib/counsellor/data';
import { DeadlineMonitor } from '../_components/deadline-monitor';
import { AnimatedSection } from '@/components/layout/animated-section';

export const dynamic = 'force-dynamic';

export default async function CounsellorDeadlinesPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const cohort = await loadCohort(supabase, { excludeId: user?.id });
  const allDeadlines = deriveAllDeadlines(cohort);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekCutoff = new Date(today); weekCutoff.setDate(weekCutoff.getDate() + 7);
  const monthCutoff = new Date(today); monthCutoff.setDate(monthCutoff.getDate() + 30);
  const overdue = allDeadlines.filter((d) => new Date(d.date) < today).length;
  const thisWeek = allDeadlines.filter((d) => {
    const date = new Date(d.date);
    return date >= today && date <= weekCutoff;
  }).length;
  const thisMonth = allDeadlines.filter((d) => {
    const date = new Date(d.date);
    return date >= today && date <= monthCutoff;
  }).length;

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Counsellor"
        accent="Deadlines"
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
