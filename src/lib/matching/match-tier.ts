export type MatchTier = 'Reach' | 'Match' | 'Safe';

/**
 * Score → tier thresholds.
 *
 * ── What this governs, precisely ────────────────────────────────────────────
 * This is the ONLY rule that turns a 0-100 score into a `MatchTier`, and every
 * `MatchTier` in the app now comes from it. An earlier version of this comment
 * claimed "there are no others"; that was false when it was written — two more
 * implementations were live at the time (see "What was found afterwards"
 * below). It is true now, and `__tests__/tiering/tier-rule-singularity.test.ts`
 * reads the source tree to keep it true: a fourth implementation, or a stray
 * `>= 80` / `>= 60` tier literal outside this file, fails that suite.
 *
 * What this deliberately does NOT govern:
 *   - `EnrichedCourseRecord.course_tier` (1-5, lib/tiering/course_tiering) — a
 *     catalogue-quality band. Numeric, unrelated vocabulary, no overlap.
 *   - `RankedCourseMatch.admission_band` (lib/matching/matching_engine) — an
 *     admission-difficulty band computed from the IB-points gap, used to
 *     EXCLUDE ineligible courses and to balance which courses get selected.
 *     It was called `tier_fit` and it used to be mapped straight onto
 *     `MatchTier`; it is renamed and no longer produces a tier. See below.
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
 * ── What was found afterwards (docs/audit/review/02-domain.md) ──────────────
 * Consolidating three implementations and then asserting "there are no others"
 * without reading the tree left two more standing:
 *
 *   1. `matching_engine.classify` → `assignTierFromFit` (service.ts). This
 *      thresholded an IB-POINTS GAP, not a 0-100 score, and it produced the
 *      tier for every freshly-computed /matches row. `assignTierFromFit` is
 *      deleted: /matches now derives its tier from the same number it prints on
 *      the card. `classify` survives as an eligibility/selection rule under a
 *      name that no longer says "tier".
 *   2. A percentile REASSIGNMENT in service.ts: when one band held >75% of the
 *      results, tiers were rewritten by rank (top 35% → Safe) and then
 *      persisted. This is what let a 41%-chance programme carry a Safe badge
 *      and an 87% one carry Reach. Deleted — the per-band selection caps above
 *      it already guarantee a spread of programmes, and a label that contradicts
 *      the number beside it is worse than a lopsided distribution.
 *
 * ── Which numbers won, and what moves ───────────────────────────────────────
 * 80/60 — the rule the codebase already called canonical. It is also the
 * conservative choice: the expensive error here is telling a student a reach
 * school is "Safe", not the reverse. Under 70/50 a score of 70-79 read as Safe;
 * it now reads as Match. Counsellor dashboards and /matches will show fewer
 * Safes. That is the fix, not a regression.
 *
 * `lib/theme/fit-score.ts` bands the score COLOUR from these same constants, so
 * the badge colour and the tier pill change at the same score. They used to
 * change at 75 and 80 respectively, which put a green "strong" ring next to an
 * amber "Match" pill for every score in 75-79.
 *
 * ── The stored tier is a rebuild window, and it closes by itself ────────────
 * `student_matches.breakdown.tier` is persisted and preferred over
 * recomputation (`service.ts` cached path, `counsellor/data.ts:136`,
 * `lib/data/applications.ts` `loadTierByProgram`). `loadTierByProgram` itself
 * has no recompute path, so a row written under the old 70/50 rule serves its
 * old tier on /applications, the parent progress board and the cost explorer —
 * beside the freshly-computed tier in search.
 *
 * CORRECTION (audit finding D-04). An earlier version of this comment said that
 * lasted "FOREVER" because "nothing rebuilds it", and proposed a production
 * backfill on that premise. Both claims are wrong. `service.ts:912` DELETEs
 * every `student_matches` row for the profile and reinserts the freshly-scored
 * set whenever a recompute runs, and recompute is gated on
 * `PROGRAM_CACHE_TTL_MS` = 24h (`service.ts:41,327`) — the very table
 * `loadTierByProgram` reads. So a stale tier survives at most one TTL after the
 * student's next visit, and the disagreement is self-healing.
 *
 * Do NOT run a backfill migration for this. It would be a write across every
 * student's match cache to fix something that expires within a day on its own,
 * and the version of it that used to be proposed here hardcoded the 80/60
 * thresholds a fourth time — the exact drift this module exists to prevent.
 *
 * What is worth knowing: for a student who does not return within the TTL,
 * /applications and search WILL disagree for any row scored 60-79 written
 * before this change. That is a display inconsistency with a known expiry, not
 * a data defect.
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
