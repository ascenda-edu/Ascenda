import type { MatchTier } from '@/lib/matching/match-tier';
import { classifyFitTier } from '@/lib/theme/categories';

export type ProgramSearchResult = {
  id: string;
  universityName: string;
  programName: string;
  location: string;
  logoUrl?: string | null;
  fitScore?: number | null;
  tier?: MatchTier | null;
  highlights: string[];
  acceptanceRate?: number | null;
  duration?: string | null;
  durationYears?: number | null;
  tuition?: number | null;
  currency?: string | null;
  intlTuitionLow?: number | null;
  intlTuitionHigh?: number | null;
  language?: string | null;
  requiresTest?: boolean | null;
  universityId?: string;
  studyLevel?: string | null;
  campus?: string | null;
  startMonth?: string | null;
  ucasCode?: string | null;
};

// Single source of truth for score→tier thresholds lives in
// `classifyFitTier` (lib/theme/categories.ts): safety ≥ 80, match ≥ 60, else reach.
// Delegate here so the results and shortlist surfaces can never drift apart.
const FIT_TIER_TO_MATCH_TIER = {
  safety: 'Safe',
  match: 'Match',
  reach: 'Reach'
} as const;

export const tierFromScore = (score?: number | null): MatchTier | null => {
  const fitTier = classifyFitTier(score);
  return fitTier ? FIT_TIER_TO_MATCH_TIER[fitTier] : null;
};
