import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { loadCohort, deriveCohortStats, deriveFieldDistribution } from '@/lib/counsellor/data';
import { AnalyticsClient } from '../_analytics-client';

export const metadata: Metadata = { title: 'Analytics · Counsellor' };
export const dynamic = 'force-dynamic';

export default async function CounsellorAnalyticsPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const students = await loadCohort(supabase, { excludeId: user?.id });

  return (
    <AnalyticsClient
      students={students}
      stats={deriveCohortStats(students)}
      fieldDistribution={deriveFieldDistribution(students)}
    />
  );
}
