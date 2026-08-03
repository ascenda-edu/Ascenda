import type { MatchTier } from '@/lib/matching/match-tier';
import { classifyFitTier } from '@/lib/theme/categories';
import { ALL_TIERS } from '@/lib/university-search/search-params';

export type ProgramSearchResult = {
  id: string;
  universityName: string;
  programName: string;
  location: string;
  /** University country — drives the flag emoji on result cards */
  country?: string | null;
  logoUrl?: string | null;
  fitScore?: number | null;
  tier?: MatchTier | null;
  highlights: string[];
  /** Clean, display-ready duration label (e.g. "3 years", "18 months"); null when unparseable */
  durationLabel: string | null;
  /** Title-cased study level (e.g. "Bachelor"); null when absent */
  levelLabel: string | null;
  /** Formatted tuition (e.g. "£24,500/yr" or "≈£20k–35k/yr"); null when unknown */
  tuitionLabel: string | null;
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

// The score→tier thresholds live in `lib/matching/match-tier.ts`, NOT here and
// NOT in `classifyFitTier`. This comment used to name `classifyFitTier` the
// single source of truth and restate its numbers; that was already stale when
// the rule moved, and restating thresholds in prose is how the codebase ended up
// with three disagreeing copies of them in the first place. `classifyFitTier` is
// now only the domain→presentation vocabulary map, and this function just walks
// it back to the domain names.
const FIT_TIER_TO_MATCH_TIER = {
  safety: 'Safe',
  match: 'Match',
  reach: 'Reach'
} as const;

export const tierFromScore = (score?: number | null): MatchTier | null => {
  const fitTier = classifyFitTier(score);
  return fitTier ? FIT_TIER_TO_MATCH_TIER[fitTier] : null;
};

/**
 * Does a result survive the tier facet?
 *
 * `null` means the programme has no fit score — `course_scoring_v1` had no row
 * for it, or the scoring call failed. It is NOT a tier, and it must not behave
 * like one.
 *
 * The predicate used to be `result.tier ? selected.includes(result.tier) : true`,
 * which let every unscored programme pass EVERY selection: narrowing to "Reach
 * only" returned the Reach programmes plus every unknown-fit programme on the
 * page. That was the fail-open half of the unscored-programme change — before it,
 * unscored rows took a ~90 fallback score and filtered (wrongly, but closed).
 *
 * The decision recorded here: an active tier narrowing is a statement about fit,
 * and we do not know these programmes' fit, so they are excluded from it. When
 * the facet is not narrowing anything (every tier selected — the default), they
 * are shown, because hiding unscored programmes from an unfiltered search would
 * silently shrink the catalogue.
 */
export const matchesTierFilter = (
  tier: MatchTier | null | undefined,
  selected: readonly MatchTier[]
): boolean => {
  if (tier) return selected.includes(tier);
  return selected.length === ALL_TIERS.length;
};
