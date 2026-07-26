type FitScoreTone = 'strong' | 'solid' | 'risk' | 'unknown';

// Status scale, so it uses the tone tokens. The previous classes had no `dark:`
// variants at all (emerald-700 on emerald-50), which made every fit-score badge
// unreadable on a dark card; the tokens flip themselves, so none are needed.
const FIT_SCORE_BUCKETS: { min: number; badge: string; text: string; tone: FitScoreTone }[] = [
  { min: 75, badge: 'text-success ring-success/25 bg-success-subtle', text: 'text-success', tone: 'strong' },
  { min: 45, badge: 'text-warning ring-warning/25 bg-warning-subtle', text: 'text-warning', tone: 'solid' },
  { min: 0, badge: 'text-danger ring-danger/25 bg-danger-subtle', text: 'text-danger', tone: 'risk' }
];

export const normalizeFitScore = (score?: number | null) => {
  if (typeof score !== 'number' || Number.isNaN(score)) return null;
  const clamped = Math.min(100, Math.max(0, Math.round(score)));
  return clamped;
};

export const getFitScoreVisuals = (score?: number | null) => {
  const normalized = normalizeFitScore(score);
  if (normalized === null) {
    return {
      value: null,
      badgeClass: 'text-muted-foreground ring-border bg-muted',
      textClass: 'text-muted-foreground',
      tone: 'unknown' as FitScoreTone
    };
  }

  const bucket = FIT_SCORE_BUCKETS.find((entry) => normalized >= entry.min) ?? FIT_SCORE_BUCKETS[FIT_SCORE_BUCKETS.length - 1];

  return {
    value: normalized,
    badgeClass: bucket.badge,
    textClass: bucket.text,
    tone: bucket.tone
  };
};

export type FitScoreVisuals = ReturnType<typeof getFitScoreVisuals>;
