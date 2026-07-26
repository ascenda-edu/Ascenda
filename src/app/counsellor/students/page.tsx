import type { Metadata } from 'next';
import { PageHero } from '@/components/layout/page-hero';
import { SectionNav } from '@/components/layout/section-nav';
import { COUNSELLOR_SECTION_ITEMS } from '@/components/layout/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { loadCohort, deriveCohortStats } from '@/lib/counsellor/data';
import { StudentsPageClient } from './_students-page-client';

export const metadata: Metadata = { title: 'Students · Counsellor' };
export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ stage?: string; tier?: string; programme?: string; field?: string; filter?: string }>;
}

export default async function CounsellorStudentsPage(props: Props) {
  const searchParams = await props.searchParams;
  const params = searchParams;
  const supabase = await createServerSupabaseClient();
  // Unlike the analytics/overview pages, this roster does NOT exclude the current
  // user: in the single-account demo that keeps the demo student (greg) in the
  // list so the counsellor can open his card and message him, and the message
  // lands on the student side the demo browses. In production the counsellor is a
  // separate (non-student) account, so this is a no-op there.
  const students = await loadCohort(supabase);
  const stats = deriveCohortStats(students);
  const flagged = students.filter((s) => s.flags.length > 0).length;
  const complete = students.filter((s) => s.profile.completionPct === 100).length;

  return (
    <div className="space-y-6">
      <SectionNav items={COUNSELLOR_SECTION_ITEMS} />
      <PageHero
        eyebrow="Counsellor"
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
