import type { Metadata } from 'next';
import { DashboardShell } from '@/components/layout/shell';
import { PageHero } from '@/components/layout/page-hero';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { ScholarshipExplorer } from '@/components/scholarships/scholarship-explorer';
import type { Scholarship } from '@/components/scholarships/types';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getIdentity } from '@/lib/auth/identity';
import { AscendiCoachMount } from '@/components/onboarding/ascendi-coach-mount';

export const metadata: Metadata = {
  title: 'Scholarships'
};

// Illustrative examples shown until a live scholarships feed is connected.
// These are intentionally generic and carry no outbound links — they exist so
// the filtering/search tools are explorable, not as real awards to chase.
const sampleScholarships: Scholarship[] = [
  {
    id: 'sample-merit',
    name: 'Example Merit Fellowship',
    country: 'United States',
    region: 'North America',
    level: 'Undergraduate',
    amount: 40000,
    currency: 'USD',
    deadline: '2026-10-01',
    category: 'Merit',
    url: null
  },
  {
    id: 'sample-regional',
    name: 'Example Regional Leaders Award',
    country: 'Singapore',
    region: 'Asia',
    level: 'Undergraduate',
    amount: 25000,
    currency: 'USD',
    deadline: '2027-01-15',
    category: 'Regional',
    url: null
  },
  {
    id: 'sample-stem',
    name: 'Example Women in STEM Grant',
    country: 'Canada',
    region: 'North America',
    level: 'Graduate',
    amount: 30000,
    currency: 'USD',
    deadline: '2026-11-20',
    category: 'STEM',
    url: null
  }
];

export default async function ScholarshipsPage() {
  // Chrome only — not a guard (middleware already gates /scholarships). It feeds
  // the shell's `role` so the nav stops re-deriving it in the browser, and is
  // memoised per request by React `cache()`.
  const identity = await getIdentity();
  const supabase = await createServerSupabaseClient();
  // `scholarships` is not yet a real table — this query returns nothing today and
  // the page falls back to sample data (clearly labelled below). When a live feed
  // is added, real rows flow straight through this mapping.
  const { data } = await supabase.from('scholarships' as never).select('*').order('deadline', { ascending: true });
  const usingLiveData = Boolean(data && data.length > 0);

  const scholarships: Scholarship[] =
    usingLiveData
      ? (data as Record<string, unknown>[]).map((item, index: number) => ({
        id: (item.id as string) ?? (item.slug as string) ?? `scholarship-${index}`,
        name: (item.name as string) ?? 'Scholarship',
        country: (item.country as string) ?? (item.region as string) ?? 'Global',
        region: (item.region as string) ?? null,
        level: (item.level as string) ?? (item.eligibility_level as string) ?? 'Any level',
        category: (item.category as string) ?? (item.type as string) ?? 'General',
        amount: typeof item.amount === 'number' ? item.amount : Number(item.amount) || null,
        currency: (item.currency as string) ?? 'USD',
        deadline: (item.deadline as string) ?? (item.deadline_date as string) ?? null,
        url: (item.url as string) ?? (item.website as string) ?? null
      }))
      : sampleScholarships;

  const heroStats = [
    { label: 'Tracked scholarships', value: `${scholarships.length}`, detail: 'Active' },
    {
      label: 'Avg award',
      value: scholarships.length
        ? `$${Math.round(
            scholarships.reduce((sum, item) => sum + (item.amount ?? 0), 0) / scholarships.length
          ).toLocaleString('en-US')} USD`
        : '—',
      detail: 'Per program'
    },
    { label: 'Regions', value: `${new Set(scholarships.map((item) => item.country ?? 'Global')).size}`, detail: 'Covered' }
  ];

  return (
    <DashboardShell role={identity?.role ?? null}>
      <PageHero
        tone="student"
        eyebrow="Scholarships"
        title="Find money for school"
        description="Filter by country, level, and award size. Save the ones worth chasing and we'll add them to your plan."
        highlight={usingLiveData ? 'Live listings' : 'Sample listings'}
        stats={heroStats}
        breadcrumbs={<Breadcrumbs />}
      />
      {!usingLiveData ? (
        <div className="rounded-2xl border border-warning/25 bg-warning-subtle px-5 py-4 text-sm text-warning">
          <span className="font-semibold">Sample data.</span> We haven&apos;t connected a live scholarships feed
          yet, so these are illustrative examples to explore the search and filters — not real awards. Real listings
          will appear here automatically once the feed is live.
        </div>
      ) : null}
      <div data-tour="scholarship-explorer">
        <ScholarshipExplorer scholarships={scholarships} />
      </div>
      <AscendiCoachMount />
    </DashboardShell>
  );
}
