import type { Metadata } from 'next';
import { ChancesClient } from '@/components/toolbox/chances-client';
import { DEMO_STUDENT_GRADES, DEMO_UNIVERSITY_CHANCES } from '@/lib/data/student-demo-data';

export const metadata: Metadata = { title: 'Chances calculator' };

export default function ChancesPage() {
  return (
    <>
      <ChancesClient grades={DEMO_STUDENT_GRADES} fallbackUniversities={DEMO_UNIVERSITY_CHANCES} />
    </>
  );
}
