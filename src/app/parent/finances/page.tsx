import type { Metadata } from 'next';
import { PageHero } from '@/components/layout/page-hero';
import { AnimatedSection } from '@/components/layout/animated-section';
import {
  ChildSwitcher,
  CostExplorer,
  NoLinkedChildren,
  formatGbp,
  loadChildFinances,
  resolveParentContext,
} from '@/features/parent';

export const metadata: Metadata = { title: 'Finances · Parent' };
export const dynamic = 'force-dynamic';

export default async function ParentFinancesPage() {
  const { supabase, linkedChildren, activeChild } = await resolveParentContext();

  if (!activeChild) {
    return (
      <div className="space-y-6">
        <PageHero
          tone="student"
          eyebrow="Parent"
          title="Costs & value"
          description="Tuition, living costs, and graduate outcomes for every programme in play."
          stats={[
            { label: 'Programmes', value: '0', detail: 'No linked student' },
            { label: 'Tuition range', value: '—', detail: '' },
            { label: 'Outcomes', value: '—', detail: '' },
          ]}
        />
        <NoLinkedChildren />
      </div>
    );
  }

  const costLines = await loadChildFinances(supabase, activeChild.profileId);
  const tuitions = costLines
    .map((line) => line.tuitionGbp)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  const tuitionRange =
    tuitions.length === 0
      ? '—'
      : tuitions.length === 1
        ? formatGbp(tuitions[0])
        : `${formatGbp(tuitions[0])}–${formatGbp(tuitions[tuitions.length - 1])}`;
  const salaries = costLines
    .map((line) => line.startingSalaryGbp)
    .filter((v): v is number => v !== null);
  const avgSalary =
    salaries.length > 0 ? formatGbp(salaries.reduce((sum, v) => sum + v, 0) / salaries.length) : '—';

  return (
    <div className="space-y-6">

      <PageHero
        tone="student"
        eyebrow="Parent"
        title="What it costs, what it returns"
        description={`Tuition, living costs, and graduate outcomes for every programme ${activeChild.firstName} is applying to — in your home currency.`}
        highlight={costLines.length > 0 ? `${costLines.length} programme${costLines.length === 1 ? '' : 's'} in play` : 'No applications yet'}
        stats={[
          { label: 'Programmes', value: `${costLines.length}`, detail: 'From tracked applications' },
          { label: 'Tuition / year', value: tuitionRange, detail: 'International rate, GBP' },
          { label: 'Avg starting salary', value: avgSalary, detail: 'Graduate outcome, GBP' },
        ]}
        actions={<ChildSwitcher linkedChildren={linkedChildren} activeChildId={activeChild.profileId} />}
      />

      <AnimatedSection>
        <CostExplorer costLines={costLines} childFirstName={activeChild.firstName} />
      </AnimatedSection>
    </div>
  );
}
