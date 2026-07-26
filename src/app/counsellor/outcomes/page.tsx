import type { Metadata } from 'next';
import { PageHero } from '@/components/layout/page-hero';
import { SectionNav } from '@/components/layout/section-nav';
import { COUNSELLOR_SECTION_ITEMS } from '@/components/layout/navigation';
import { OutcomeDashboard } from '../_components/outcome-dashboard';
import { AnimatedSection } from '@/components/layout/animated-section';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { loadOutcomes, deriveOutcomeStats } from '@/lib/counsellor/data';

export const metadata: Metadata = { title: 'Outcomes · Counsellor' };
export const dynamic = 'force-dynamic';

export default async function CounsellorOutcomesPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const outcomes = await loadOutcomes(supabase, { excludeId: user?.id });
  const stats = deriveOutcomeStats(outcomes);

  return (
    <div className="space-y-6">
      <SectionNav items={COUNSELLOR_SECTION_ITEMS} />
      <PageHero
        eyebrow="Counsellor"
        title="Outcome tracking"
        description="Acceptances, rejections, waitlists, and pending responses across the cohort."
        stats={[
          { label: 'Total', value: String(stats.total), detail: 'Applications tracked' },
          { label: 'Acceptance', value: `${stats.acceptanceRate}%`, detail: 'Of decided applications' },
          { label: 'Pending', value: String(stats.pending), detail: 'Awaiting decisions' },
        ]}
      />
      <AnimatedSection>
        <OutcomeDashboard outcomes={outcomes} stats={stats} />
      </AnimatedSection>
    </div>
  );
}
