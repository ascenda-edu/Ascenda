import { PageHero } from '@/components/layout/page-hero';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { loadCohort, deriveCohortStats } from '@/lib/counsellor/data';
import { StudentsPageClient } from './_students-page-client';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ stage?: string; tier?: string; programme?: string; field?: string; filter?: string }>;
}

export default async function CounsellorStudentsPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const students = await loadCohort(supabase, { excludeId: user?.id });
  const stats = deriveCohortStats(students);
  const flagged = students.filter((s) => s.flags.length > 0).length;
  const complete = students.filter((s) => s.profile.completionPct === 100).length;

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Counsellor"
        accent="Cohort"
        highlight={`${stats.total} students`}
        title="Student roster"
        description="Search, filter, and open any student to see their profile, matches, and applications."
        stats={[
          { label: 'Total', value: String(stats.total), detail: 'In this cohort' },
          { label: 'Profile complete', value: String(complete), detail: `${stats.total ? Math.round((complete / stats.total) * 100) : 0}% of cohort` },
          { label: 'Need attention', value: String(flagged), detail: 'Have active flags' },
          { label: 'Avg completion', value: `${stats.avgCompletion}%`, detail: 'Across all students' }
        ]}
      />
      <StudentsPageClient
        students={students}
        initialStage={params.stage}
        initialTier={params.tier}
        initialProgramme={params.programme}
        initialField={params.field}
        initialFlagFilter={params.filter === 'flagged' ? 'flagged' : undefined}
      />
    </div>
  );
}
