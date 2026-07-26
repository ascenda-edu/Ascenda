import type { Metadata } from 'next';
import { PageHero } from '@/components/layout/page-hero';
import { ApplicationOverview } from '../_components/application-overview';
import { AnimatedSection } from '@/components/layout/animated-section';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { loadCohort, deriveApplicationsWithPlatform } from '@/lib/counsellor/data';

export const metadata: Metadata = { title: 'Applications · Counsellor' };
export const dynamic = 'force-dynamic';

export default async function CounsellorApplicationsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const cohort = await loadCohort(supabase, { excludeId: user?.id });
  const allApps = deriveApplicationsWithPlatform(cohort);
  const submitted = allApps.filter((a) => a.status === 'submitted').length;
  const planning = allApps.filter((a) => a.status === 'planning' || a.status === 'in_progress').length;

  return (
    <div className="space-y-6">
      <PageHero
          tone="counsellor"
        eyebrow="Counsellor"
        title="Application overview"
        description="Every student's applications across platforms — kanban or list, with filters. For deadline-only triage, see Deadlines."
        stats={[
          { label: 'Total', value: String(allApps.length), detail: 'Applications' },
          { label: 'Submitted', value: String(submitted), detail: 'Sent to universities' },
          { label: 'In progress', value: String(planning), detail: 'Still being prepared' },
        ]}
      />
      <AnimatedSection>
        <ApplicationOverview apps={allApps} />
      </AnimatedSection>
    </div>
  );
}
