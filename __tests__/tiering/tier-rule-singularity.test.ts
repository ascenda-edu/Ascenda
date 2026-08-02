/**
 * There is one score→tier rule. This suite is what makes that sentence true
 * rather than merely asserted.
 *
 * `match-tier.ts` used to claim "there are no others" in a doc comment. Three
 * more implementations were live when it was written, and the fourth
 * (`components/toolbox/chances-calculator.tsx`) survived an adversarial review
 * that went looking for exactly this. A prose claim about the whole tree cannot
 * be checked by unit tests of one module, so these tests READ THE TREE.
 *
 * Two halves:
 *   1. Behaviour — every helper that turns a number into a tier, and every band
 *      keyed off the same number (the score COLOUR), agrees with the rule at
 *      every integer score. This catches a second copy that has drifted.
 *   2. Source — no file outside `match-tier.ts` decides a tier from a numeric
 *      literal, and every module that returns a tier imports the rule. This
 *      catches a second copy that has NOT yet drifted, which is the only moment
 *      it is cheap to remove.
 *
 * Both halves were confirmed to go red before being committed: reverting the
 * `chances-calculator` fix fails the source scan; moving the fit-score colour
 * band back to 75 fails the behaviour scan.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { matchTierFromScore, TIER_THRESHOLDS, type MatchTier } from '@/lib/matching/match-tier';
import { classifyFitTier } from '@/lib/theme/categories';
import { getFitScoreVisuals } from '@/lib/theme/fit-score';
import { matchesTierFilter, tierFromScore } from '@/components/university-search/types';
import { ALL_TIERS } from '@/lib/university-search/search-params';

const ROOT = join(__dirname, '..', '..');

/**
 * Comments are stripped before every source scan. Several of the files below
 * QUOTE the implementation they replaced, in a comment explaining why — which
 * is the documentation that should exist, and would otherwise trip the very
 * scan guarding against it coming back.
 */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const read = (path: string) => stripComments(readFileSync(join(ROOT, path), 'utf8'));

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
};

const rel = (file: string) => relative(ROOT, file).split(/[\\/]/).join('/');

/** Every shipped module plus the scripts that write tiers into the database. */
const SOURCE_FILES = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'scripts'))];

const SCORES = Array.from({ length: 101 }, (_, i) => i);

/* -------------------------------------------------------------------------- */
/* 1. The rule itself                                                          */
/* -------------------------------------------------------------------------- */

describe('matchTierFromScore', () => {
  it('cuts exactly at the published thresholds', () => {
    expect(TIER_THRESHOLDS).toEqual({ safe: 80, match: 60 });

    expect(matchTierFromScore(TIER_THRESHOLDS.safe)).toBe('Safe');
    expect(matchTierFromScore(TIER_THRESHOLDS.safe - 1)).toBe('Match');
    expect(matchTierFromScore(TIER_THRESHOLDS.match)).toBe('Match');
    expect(matchTierFromScore(TIER_THRESHOLDS.match - 1)).toBe('Reach');
    expect(matchTierFromScore(100)).toBe('Safe');
    expect(matchTierFromScore(0)).toBe('Reach');
  });

  it('keeps "unknown" distinguishable from "Reach"', () => {
    expect(matchTierFromScore(null)).toBeNull();
    expect(matchTierFromScore(undefined)).toBeNull();
    expect(matchTierFromScore(NaN)).toBeNull();
    // The point of the null: it is NOT the bottom tier.
    expect(matchTierFromScore(0)).toBe('Reach');
  });
});

/* -------------------------------------------------------------------------- */
/* 2. Everything derived from a score agrees with it                           */
/* -------------------------------------------------------------------------- */

describe('every score-keyed band agrees with the rule', () => {
  const FIT_TIER_OF: Record<MatchTier, string> = {
    Safe: 'safety',
    Match: 'match',
    Reach: 'reach'
  };

  it.each(SCORES)('score %i: classifyFitTier matches', (score) => {
    expect(classifyFitTier(score)).toBe(FIT_TIER_OF[matchTierFromScore(score)!]);
  });

  it.each(SCORES)('score %i: tierFromScore matches', (score) => {
    expect(tierFromScore(score)).toBe(matchTierFromScore(score));
  });

  /**
   * The score COLOUR is not a tier, but it is banded off the same number and
   * shown on the same card. It sat at 75/45 while the tier sat at 80/60, so
   * 75-79 rendered a green "strong" ring beside an amber "Match" pill and 60-74
   * a red "risk" ring beside that same pill. Colour and label must flip
   * together or the card contradicts itself.
   */
  const TONE_OF: Record<MatchTier, string> = {
    Safe: 'strong',
    Match: 'solid',
    Reach: 'risk'
  };

  it.each(SCORES)('score %i: the fit-score colour band matches', (score) => {
    expect(getFitScoreVisuals(score).tone).toBe(TONE_OF[matchTierFromScore(score)!]);
  });

  it('renders unknown as its own tone rather than the bottom one', () => {
    expect(getFitScoreVisuals(null).tone).toBe('unknown');
    expect(getFitScoreVisuals(null).value).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* 3. The tier facet does not fail open on an unscored programme               */
/* -------------------------------------------------------------------------- */

describe('matchesTierFilter', () => {
  it('filters scored programmes by the selection', () => {
    expect(matchesTierFilter('Reach', ['Reach'])).toBe(true);
    expect(matchesTierFilter('Safe', ['Reach'])).toBe(false);
    expect(matchesTierFilter('Match', ['Reach', 'Match'])).toBe(true);
  });

  it('excludes an unscored programme from a NARROWED selection', () => {
    // The regression: `result.tier ? includes(...) : true` let every unknown-fit
    // programme through "Reach only".
    expect(matchesTierFilter(null, ['Reach'])).toBe(false);
    expect(matchesTierFilter(null, ['Reach', 'Match'])).toBe(false);
    expect(matchesTierFilter(undefined, ['Safe'])).toBe(false);
  });

  it('shows an unscored programme when the facet narrows nothing', () => {
    // Hiding unscored programmes from a DEFAULT search would silently shrink a
    // 119k-row catalogue, which is the opposite failure.
    expect(matchesTierFilter(null, ALL_TIERS)).toBe(true);
    expect(matchesTierFilter(undefined, ALL_TIERS)).toBe(true);
  });

  it('excludes everything when the selection is empty', () => {
    expect(matchesTierFilter(null, [])).toBe(false);
    expect(matchesTierFilter('Safe', [])).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* 4. Source scan — no fifth implementation                                    */
/* -------------------------------------------------------------------------- */

describe('the rule is implemented once', () => {
  /**
   * A tier decided by a bare number: a comparison and a tier literal in the same
   * statement, in either order. This is the shape of every implementation found
   * so far — `matching_engine.classify`, the percentile reassignment, the
   * counsellor 70/50 chain, and `chances-calculator`'s `diff >= 5 → 'safety'`.
   *
   * `match-tier.ts` itself does not match: it compares against
   * `TIER_THRESHOLDS.safe`, not a literal. There is no allowlist.
   */
  const TIER_FROM_LITERAL = [
    /(?:>=|>|<=|<)\s*\d{1,3}[^\n]{0,60}?['"](?:Safe|Match|Reach|safety)['"]/g,
    /['"](?:Safe|Match|Reach|safety)['"][^\n]{0,60}?(?:>=|>|<=|<)\s*\d{1,3}/g
  ];

  it('no file decides a tier from a numeric literal', () => {
    const offenders: string[] = [];
    for (const file of SOURCE_FILES) {
      const source = stripComments(readFileSync(file, 'utf8'));
      for (const pattern of TIER_FROM_LITERAL) {
        for (const match of source.matchAll(pattern)) {
          offenders.push(`${rel(file)}: ${match[0].replace(/\s+/g, ' ')}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('scans a real tree (guards against the scan silently finding no files)', () => {
    expect(SOURCE_FILES.length).toBeGreaterThan(200);
    expect(SOURCE_FILES.map(rel)).toContain('src/lib/matching/match-tier.ts');
  });

  /**
   * Modules that declare a function returning a tier. Each must import the rule,
   * except the three that derive a tier from something other than a number — and
   * those are re-checked above by the numeric scan.
   */
  const NON_NUMERIC_TIER_SOURCES = new Set([
    // parses `?tiers=` out of a URL
    'src/lib/university-search/search-params.ts',
    // reads the tier string already stored in student_matches.breakdown
    'src/lib/data/applications.ts',
    // maps an existing tier onto the presentation vocabulary
    'src/components/assistant/widgets/matches-widget.tsx'
  ]);

  const DECLARES_TIER_FN = /\)\s*:\s*(?:MatchTier|FitTier)(?:\s*\|\s*null)?\s*(?:=>|\{)/;

  it('every module that returns a tier imports the rule', () => {
    const offenders: string[] = [];
    for (const file of SOURCE_FILES) {
      const path = rel(file);
      if (path === 'src/lib/matching/match-tier.ts') continue;
      const source = stripComments(readFileSync(file, 'utf8'));
      if (!DECLARES_TIER_FN.test(source)) continue;
      if (NON_NUMERIC_TIER_SOURCES.has(path)) continue;
      const importsRule = /matchTierFromScore|classifyFitTier|tierFromScore/.test(source);
      if (!importsRule) offenders.push(path);
    }
    expect(offenders).toEqual([]);
  });

  it('the two implementations removed from lib/matching are gone', () => {
    const service = read('src/lib/matching/service.ts');
    // The IB-gap → MatchTier map.
    expect(service).not.toMatch(/assignTierFromFit/);
    // The percentile reassignment: `pct < 0.35 ? 'Safe' : …`, which overwrote a
    // computed tier by RANK and then persisted it.
    expect(service).not.toMatch(/dominantTierPct|pct\s*<\s*0\.35/);
    // …and the fresh path derives the tier from the score it publishes.
    expect(service).toMatch(/matchTierFromScore\(match\.chance_percent\)/);
  });

  it('the engine no longer names anything "tier_fit" or produces a MatchTier', () => {
    const engine = read('src/lib/matching/matching_engine.ts');
    expect(engine).not.toMatch(/tier_fit/);
    expect(engine).not.toMatch(/MatchTier/);
    // It still carries the admission-difficulty band under its own name.
    expect(engine).toMatch(/admission_band/);
  });
});

/* -------------------------------------------------------------------------- */
/* 5. Seeded tiers obey the rule                                               */
/* -------------------------------------------------------------------------- */

describe('the seed scripts store tiers that agree with the rule', () => {
  /**
   * Seeded rows go straight into `student_matches.breakdown.tier`, which every
   * read path PREFERS over recomputation. A seeded row that disagrees with the
   * rule is indistinguishable from a real row that disagrees with it — it hides
   * the exact contradiction it should expose. Both files shipped tiers that
   * contradicted 80/60 (and the Match rows in `seed-demo-user` contradicted the
   * older 70/50 rule too).
   */
  it('seed-demo-user pairs every tier with a consistent score', () => {
    const source = read('scripts/seed-demo-user.ts');
    const pairs = [...source.matchAll(/tier:\s*'(Reach|Match|Safe)',\s*score:\s*(\d+),/g)];
    expect(pairs).toHaveLength(9);
    for (const [, tier, score] of pairs) {
      expect({ tier, score }).toEqual({ tier: matchTierFromScore(Number(score)), score });
    }
  });

  it('seed-students keeps every random score band inside its tier', () => {
    const source = read('scripts/seed-students.ts');
    const bands = [
      ...source.matchAll(
        /tier:\s*'(Reach|Match|Safe)',\s*score:\s*(\d+)\s*\+\s*Math\.floor\(Math\.random\(\)\s*\*\s*(\d+)\)/g
      )
    ];
    expect(bands).toHaveLength(6);
    for (const [, tier, base, span] of bands) {
      const low = Number(base);
      const high = Number(base) + Number(span) - 1; // Math.random() < 1
      expect({ tier, low: matchTierFromScore(low), high: matchTierFromScore(high) }).toEqual({
        tier,
        low: tier,
        high: tier
      });
    }
  });
});
