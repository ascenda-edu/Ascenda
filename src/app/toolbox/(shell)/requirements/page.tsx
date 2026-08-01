import type { Metadata } from 'next';
import { PageHero } from '@/components/layout/page-hero';
import { RequirementsChecker } from '@/components/toolbox/requirements-checker';
import { DEMO_REQUIREMENTS } from '@/lib/data/student-demo-data';

export const metadata: Metadata = { title: 'Requirements' };

export default async function RequirementsPage() {

  const avgProgress = Math.round(DEMO_REQUIREMENTS.reduce((sum, r) => sum + r.progress, 0) / DEMO_REQUIREMENTS.length);
  const complete = DEMO_REQUIREMENTS.filter((r) => r.progress === 100).length;

  return (
    <>
      <PageHero
        tone="student"
        eyebrow="Requirements"
        title="What each uni actually wants"
        description="Subjects, exams, interviews, docs, essays — see exactly what you need for every uni on your list."
        stats={[
          { label: 'Universities', value: String(DEMO_REQUIREMENTS.length), detail: 'Being tracked' },
          { label: 'Readiness', value: `${avgProgress}%`, detail: 'Average progress' },
          { label: 'Complete', value: String(complete), detail: `of ${DEMO_REQUIREMENTS.length} universities` },
        ]}
      />
      <RequirementsChecker matrix={DEMO_REQUIREMENTS} />
    </>
  );
}
