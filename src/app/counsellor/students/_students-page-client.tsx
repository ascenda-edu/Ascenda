'use client';

import { useState } from 'react';
import type { CounsellorStudent } from '@/lib/counsellor/types';
import { StudentRoster } from '../_components/student-roster';
import type { DashboardFilter } from '../page';

interface StudentsPageClientProps {
  students: CounsellorStudent[];
  initialStage?: string;
  initialTier?: string;
  initialProgramme?: string;
  initialField?: string;
  initialFlagFilter?: 'flagged';
}

export function StudentsPageClient({
  students,
  initialStage,
  initialTier,
  initialProgramme,
  initialField,
  initialFlagFilter,
}: StudentsPageClientProps) {
  const [filter, setFilter] = useState<DashboardFilter>(() => {
    if (initialStage) return { type: 'stage', value: initialStage };
    if (initialTier) return { type: 'tier', value: initialTier };
    return { type: null, value: null };
  });

  return (
    <StudentRoster
      students={students}
      externalFilter={filter}
      onClearExternalFilter={() => setFilter({ type: null, value: null })}
      initialProgramme={initialProgramme as 'IB' | 'A_LEVEL' | undefined}
      initialField={initialField}
      initialFlagFilter={initialFlagFilter}
    />
  );
}
