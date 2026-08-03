import { TIER_THRESHOLDS } from '@/lib/matching/match-tier';

type FitScoreTone = 'strong' | 'solid' | 'risk' | 'unknown';

// Status scale, so it uses the tone tokens. The previous classes had no `dark:`
// variants at all (emerald-700 on emerald-50), which made every fit-score badge
// unreadable on a dark card; the tokens flip themselves, so none are needed.
//
// The BOUNDARIES are `TIER_THRESHOLDS`, imported rather than restated. They used
// to be 75/45 while the tier boundary was 80/60, which put a green "strong" ring
// on the same card as an amber "Match" pill for every score in 75-79, and a red
// "risk" ring next to a "Match" pill for every score in 60-74 — the colour said
// one thing and the label said another. Green now starts exactly where "Safe"
// does and amber exactly where "Match" does. Restating the numbers here is what
// created the mismatch; importing them is what stops it recurring.
const FIT_SCORE_BUCKETS: { min: number; badge: string; text: string; tone: FitScoreTone }[] = [
  { min: TIER_THRESHOLDS.safe, badge: 'text-success ring-success/25 bg-success-subtle', text: 'text-success', tone: 'strong' },
  { min: TIER_THRESHOLDS.match, badge: 'text-warning ring-warning/25 bg-warning-subtle', text: 'text-warning', tone: 'solid' },
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
      // No score is genuinely no status, so the text stays muted — but the surface
      // takes the app's neutral pill tint rather than `bg-muted` + a `ring-border`
      // hairline, which read as a broken badge sitting beside three tinted ones.
      badgeClass: 'text-muted-foreground ring-primary/15 bg-primary/8',
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
