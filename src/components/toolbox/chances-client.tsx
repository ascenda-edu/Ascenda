'use client';

import { useMemo } from 'react';
import { PageHero } from '@/components/layout/page-hero';
import { ChancesCalculator } from '@/components/toolbox/chances-calculator';
import { useShortlist } from '@/components/university-search/shortlist-store';
import type { DemoStudentGrades, UniversityChance } from '@/lib/data/student-demo-data';

interface ChancesClientProps {
  grades: DemoStudentGrades;
  fallbackUniversities: UniversityChance[];
}

const FLAGS_BY_COUNTRY: Record<string, string> = {
  UK: '🇬🇧',
  'United Kingdom': '🇬🇧',
  USA: '🇺🇸',
  'United States': '🇺🇸',
  Canada: '🇨🇦',
  Australia: '🇦🇺',
  Singapore: '🇸🇬',
  Switzerland: '🇨🇭',
  Netherlands: '🇳🇱',
  Germany: '🇩🇪',
  France: '🇫🇷',
  Ireland: '🇮🇪',
  'Hong Kong': '🇭🇰'
};

const inferCountry = (location?: string) => {
  if (!location) return null;
  const trimmed = location.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(',').map((p) => p.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? trimmed;
};

const inferFlag = (country?: string | null) => {
  if (!country) return '🎓';
  return FLAGS_BY_COUNTRY[country] ?? '🎓';
};

const FUTURE_DEADLINE = () => {
  const d = new Date();
  d.setDate(d.getDate() + 60);
  return d.toISOString().slice(0, 10);
};

export function ChancesClient({ grades, fallbackUniversities }: ChancesClientProps) {
  const { items, ready } = useShortlist();

  const universities: UniversityChance[] = useMemo(() => {
    if (!ready || items.length === 0) return fallbackUniversities;

    return items.map((item) => {
      const country = inferCountry(item.location) ?? 'Global';
      const fitScore = typeof item.fitScore === 'number' ? item.fitScore : null;
      const minimumScore = fitScore !== null
        ? Math.max(24, Math.min(45, Math.round(grades.predicted - (fitScore - 60) / 5)))
        : Math.max(28, grades.predicted - 4);

      return {
        id: item.id,
        university: item.name,
        programme: item.program ?? 'Programme',
        country,
        flagEmoji: inferFlag(country),
        typicalOffer: fitScore !== null ? `${minimumScore}+ points (est.)` : 'See course page',
        minimumScore,
        deadline: item.due ?? FUTURE_DEADLINE()
      } satisfies UniversityChance;
    });
  }, [ready, items, fallbackUniversities, grades.predicted]);

  const reach = universities.filter((u) => grades.predicted - u.minimumScore < 1).length;
  const safety = universities.filter((u) => grades.predicted - u.minimumScore >= 5).length;

  const usingShortlist = ready && items.length > 0;

  return (
    <>
      <PageHero
        tone="student"
        eyebrow="Chances calculator"
        title="Where do you stand?"
        description={
          usingShortlist
            ? 'Showing chances for the universities you\'ve shortlisted. Override your score to explore different scenarios.'
            : 'See how your predicted grades stack up. Add programs to your shortlist to make this view personal.'
        }
        highlight={usingShortlist ? `${universities.length} from shortlist` : 'Demo mode'}
        stats={[
          { label: 'Universities', value: String(universities.length), detail: usingShortlist ? 'On your shortlist' : 'Demo cohort' },
          { label: 'Predicted', value: String(grades.predicted), detail: `${grades.system} points` },
          { label: 'Safety', value: String(safety), detail: reach > 0 ? `${reach} reach` : 'All within range' }
        ]}
      />
      <ChancesCalculator grades={grades} universities={universities} />
    </>
  );
}
