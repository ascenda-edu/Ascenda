export type MatchTier = 'Reach' | 'Match' | 'Safe';

/**
 * Score → tier thresholds. **The** thresholds — there are no others.
 *
 * ── Why this moved here ─────────────────────────────────────────────────────
 * There were three live implementations of this rule and two different answers:
 *
 *   classifyFitTier (lib/theme/categories.ts)  safety >= 80, match >= 60
 *   lib/counsellor/data.ts                     Safe   >= 70, Match >= 50
 *   lib/matching/service.ts                    Safe   >= 70, Match >= 50
 *
 * so a programme scoring 75 was a **"Match" on search and a "Safe" on both the
 * counsellor dashboard and the student's own /matches page** — same programme,
 * same student, same moment.
 *
 * The comment at components/university-search/types.ts:36 declared
 * `classifyFitTier` the "single source of truth… so the results and shortlist
 * surfaces can never drift apart". It was accurate about the two surfaces it
 * named, and invisible to the two modules that never read it. A single source of
 * truth asserted in prose is not one; only a value other code must import is.
 *
 * ── Which numbers won, and what moves ───────────────────────────────────────
 * 80/60 — the rule the codebase already called canonical. It is also the
 * conservative choice: the expensive error here is telling a student a reach
 * school is "Safe", not the reverse. Under 70/50 a score of 70-79 read as Safe;
 * it now reads as Match. Counsellor dashboards and /matches will show fewer
 * Safes. That is the fix, not a regression.
 *
 * `student_matches.breakdown.tier` is persisted, and cached tiers are preferred
 * over recomputation by design, so rows written under the old rule keep their
 * old tier until the cache is rebuilt. Expect a window where stored and
 * freshly-computed tiers disagree for scores in the 70-79 band.
 *
 * These live beside the `MatchTier` type rather than in lib/theme/ because they
 * are a domain rule, not a presentation concern. `classifyFitTier` now derives
 * from this; the dependency runs domain → theme, never the reverse.
 */
export const TIER_THRESHOLDS = {
  /** >= this is a Safe bet. */
  safe: 80,
  /** >= this (and below `safe`) is a Match. */
  match: 60
} as const;

/**
 * Classify a 0-100 fit score.
 *
 * Returns `null` for a missing or non-numeric score so "we don't know this
 * programme's fit" stays distinguishable from "we know it is a Reach" — the
 * distinction the unscored-programme fix depends on. Callers needing a concrete
 * tier must decide what unknown means for them, rather than inheriting a `?? 0`
 * that silently reads as Reach.
 */
export const matchTierFromScore = (score?: number | null): MatchTier | null => {
  if (typeof score !== 'number' || Number.isNaN(score)) return null;
  if (score >= TIER_THRESHOLDS.safe) return 'Safe';
  if (score >= TIER_THRESHOLDS.match) return 'Match';
  return 'Reach';
};
