import type { Metadata } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  loadCohort,
  deriveCohortStats,
  deriveUpcomingDeadlines,
  deriveRecentActivity,
  deriveFieldDistribution,
  deriveAtRiskAlerts,
} from '@/lib/counsellor/data';
import { DashboardClient } from './_dashboard-client';
import { AscendiCoachMount } from '@/components/onboarding/ascendi-coach-mount';

export const metadata: Metadata = { title: 'Overview · Counsellor' };
export const dynamic = 'force-dynamic';

// Re-exported for student-roster.tsx and the students page client, which import
// this type from '../page'.
export type { DashboardFilter } from './_dashboard-client';

export default async function CounsellorOverviewPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const students = await loadCohort(supabase, { excludeId: user?.id });

  // Mounted here rather than in `counsellor/layout.tsx`: the layout also covers the
  // nine sub-routes (inbox, students, analytics…), none of which carries this tour's
  // anchors, and tours resolve on exact routes so only `/counsellor` has one.
  return (
    <>
      <DashboardClient
        students={students}
        stats={deriveCohortStats(students)}
        upcomingDeadlines={deriveUpcomingDeadlines(students, 7)}
        recentActivity={deriveRecentActivity(students)}
        fieldDistribution={deriveFieldDistribution(students)}
        atRiskAlerts={deriveAtRiskAlerts(students)}
      />
      <AscendiCoachMount />
    </>
  );
}
