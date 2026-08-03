/**
 * Ascenda Scoring Batch Runner
 * ─────────────────────────────
 * Scores every profile in the provided batch and prints a structured report.
 *
 * Usage (ts-node):
 *   npx ts-node -e "require('./dist/__tests__/scoring_validation/batch_runner')"
 *
 * Or as a Jest test: npm test -- batch_runner
 *
 * OUTPUT IS OFF BY DEFAULT. Every line below goes through `report()` from
 * `__tests__/helpers/report.ts`, which only prints when VERBOSE_SCORING=1 (or
 * VERBOSE_TESTS=1) is set — otherwise this report buries the whole test run:
 *
 *   VERBOSE_SCORING=1 npm test -- scoring_validation
 *
 * Running this file directly turns the flag on for you (see the bottom).
 *
 * The report shows, for each profile:
 *  - Score breakdown (each component)
 *  - Activities breakdown (new)
 *  - Band result + delta if activities removed
 *  - Tier-fit against a set of representative real programmes
 */

import { scoreStudentProfile } from '../../src/lib/scoring/student_scoring';
import { rankCourseMatches } from '../../src/lib/matching/matching_engine';
import { ACTIVITIES_WEIGHTS } from '../../src/lib/scoring/activities_scoring';
import type { StudentProfilePayload } from '../../src/lib/profile/intake-types';
import type { EnrichedCourseRecord } from '../../src/lib/tiering/course_tiering';
import { PHASE1_PROFILES } from './phase1_profiles';
import { report, setVerbose } from '../helpers/report';

// ── Representative programme catalogue ───────────────────────────────────────
// A curated cross-cluster set of real programmes at different tiers.
// Covers Medicine, Law, CS, Engineering, Business across tiers 1-5.

const CATALOGUE: Partial<EnrichedCourseRecord>[] = [
  // Medicine — tier 1
  { university: 'University of Oxford', course: 'Medicine (BM BCh)', ucas_code: 'A100', course_tier: 1, min_ib_score: 39, min_a_level_score: 'A*AA', admission_test: 'UCAT', english_score_requirement: '7.5', total_course_score: 99, university_score: 99, yearly_international_tuition_fee_gbp: 48000 },
  { university: 'Imperial College London', course: 'Medicine (MBBS)', ucas_code: 'A100', course_tier: 1, min_ib_score: 38, min_a_level_score: 'A*AA', admission_test: 'UCAT', english_score_requirement: '7.0', total_course_score: 96, university_score: 97, yearly_international_tuition_fee_gbp: 45000 },
  { university: 'University of Manchester', course: 'Medicine (MBChB)', ucas_code: 'A106', course_tier: 2, min_ib_score: 37, min_a_level_score: 'AAA', admission_test: 'UCAT', english_score_requirement: '7.0', total_course_score: 90, university_score: 90, yearly_international_tuition_fee_gbp: 38000 },
  { university: 'University of Nottingham', course: 'Medicine (BMedSci)', ucas_code: 'A100', course_tier: 3, min_ib_score: 36, min_a_level_score: 'AAA', admission_test: 'UCAT', english_score_requirement: '7.0', total_course_score: 84, university_score: 85, yearly_international_tuition_fee_gbp: 36000 },
  { university: 'University of Plymouth', course: 'Medicine (BMBS)', ucas_code: 'A100', course_tier: 4, min_ib_score: 34, min_a_level_score: 'AAB', admission_test: 'UCAT', english_score_requirement: '7.0', total_course_score: 72, university_score: 75, yearly_international_tuition_fee_gbp: 32000 },

  // Law — tier 1-5
  { university: 'University of Oxford', course: 'Law (Jurisprudence)', ucas_code: 'M100', course_tier: 1, min_ib_score: 40, min_a_level_score: 'A*AA', admission_test: 'LNAT', english_score_requirement: '7.5', total_course_score: 99, university_score: 99, yearly_international_tuition_fee_gbp: 28000 },
  { university: 'UCL', course: 'Law (LLB)', ucas_code: 'M100', course_tier: 1, min_ib_score: 38, min_a_level_score: 'A*AA', admission_test: 'LNAT', english_score_requirement: '7.5', total_course_score: 94, university_score: 96, yearly_international_tuition_fee_gbp: 27000 },
  { university: 'University of Exeter', course: 'Law (LLB)', ucas_code: 'M100', course_tier: 2, min_ib_score: 36, min_a_level_score: 'AAB', admission_test: 'LNAT', english_score_requirement: '7.0', total_course_score: 86, university_score: 88, yearly_international_tuition_fee_gbp: 22000 },
  { university: 'University of York', course: 'Law (LLB)', ucas_code: 'M100', course_tier: 3, min_ib_score: 34, min_a_level_score: 'ABB', admission_test: null, english_score_requirement: '6.5', total_course_score: 80, university_score: 82, yearly_international_tuition_fee_gbp: 20000 },
  { university: 'University of Hertfordshire', course: 'Law (LLB)', ucas_code: 'M100', course_tier: 4, min_ib_score: 28, min_a_level_score: 'BBC', admission_test: null, english_score_requirement: '6.0', total_course_score: 65, university_score: 68, yearly_international_tuition_fee_gbp: 15000 },

  // Computer Science — tier 1-5
  { university: 'University of Cambridge', course: 'Computer Science (BA)', ucas_code: 'G400', course_tier: 1, min_ib_score: 40, min_a_level_score: 'A*A*A', admission_test: null, english_score_requirement: '7.5', total_course_score: 99, university_score: 99, yearly_international_tuition_fee_gbp: 35000 },
  { university: 'University of Edinburgh', course: 'Computer Science (BSc)', ucas_code: 'G400', course_tier: 2, min_ib_score: 37, min_a_level_score: 'AAA', admission_test: null, english_score_requirement: '6.5', total_course_score: 88, university_score: 90, yearly_international_tuition_fee_gbp: 26000 },
  { university: 'University of Bristol', course: 'Computer Science (BSc)', ucas_code: 'G400', course_tier: 2, min_ib_score: 36, min_a_level_score: 'AAB', admission_test: null, english_score_requirement: '6.5', total_course_score: 86, university_score: 87, yearly_international_tuition_fee_gbp: 24000 },
  { university: 'University of Glasgow', course: 'Computing Science (BSc)', ucas_code: 'G400', course_tier: 3, min_ib_score: 34, min_a_level_score: 'ABB', admission_test: null, english_score_requirement: '6.5', total_course_score: 80, university_score: 82, yearly_international_tuition_fee_gbp: 23000 },
  { university: 'Coventry University', course: 'Computer Science (BSc)', ucas_code: 'G400', course_tier: 4, min_ib_score: 28, min_a_level_score: 'BCC', admission_test: null, english_score_requirement: '6.0', total_course_score: 62, university_score: 65, yearly_international_tuition_fee_gbp: 16000 },
  { university: 'University of Wolverhampton', course: 'Computer Science (BSc)', ucas_code: 'G400', course_tier: 5, min_ib_score: 24, min_a_level_score: 'CCC', admission_test: null, english_score_requirement: '6.0', total_course_score: 50, university_score: 55, yearly_international_tuition_fee_gbp: 14000 },

  // Business — tier 1-5
  { university: 'London School of Economics', course: 'Management (BSc)', ucas_code: 'N200', course_tier: 1, min_ib_score: 38, min_a_level_score: 'A*AA', admission_test: null, english_score_requirement: '7.0', total_course_score: 96, university_score: 97, yearly_international_tuition_fee_gbp: 30000 },
  { university: 'University of Warwick', course: 'Business (BSc)', ucas_code: 'N100', course_tier: 1, min_ib_score: 38, min_a_level_score: 'A*AA', admission_test: null, english_score_requirement: '7.0', total_course_score: 93, university_score: 94, yearly_international_tuition_fee_gbp: 28000 },
  { university: 'University of Bath', course: 'Business Administration (BSc)', ucas_code: 'N100', course_tier: 2, min_ib_score: 36, min_a_level_score: 'AAA', admission_test: null, english_score_requirement: '6.5', total_course_score: 88, university_score: 89, yearly_international_tuition_fee_gbp: 25000 },
  { university: 'University of Surrey', course: 'Business Management (BSc)', ucas_code: 'N100', course_tier: 3, min_ib_score: 33, min_a_level_score: 'ABB', admission_test: null, english_score_requirement: '6.5', total_course_score: 79, university_score: 80, yearly_international_tuition_fee_gbp: 21000 },
  { university: 'University of Hertfordshire', course: 'Business Management (BSc)', ucas_code: 'N100', course_tier: 4, min_ib_score: 28, min_a_level_score: 'BBC', admission_test: null, english_score_requirement: '6.0', total_course_score: 63, university_score: 65, yearly_international_tuition_fee_gbp: 15000 },
];

// ── Report helpers ────────────────────────────────────────────────────────────

const BAND_EMOJI: Record<string, string> = {
  'Exceptional': '🏆',
  'Very strong': '⭐',
  'Strong': '✅',
  'Solid': '🟡',
  'Borderline': '🟠',
  'Weak': '🔴',
};

const pad = (s: string, len: number) => s.padEnd(len, ' ').slice(0, len);

function printHeader(label: string) {
  const line = '═'.repeat(80);
  report(`\n${line}`);
  report(`  ${label}`);
  report(line);
}

function printBreakdown(profile: StudentProfilePayload) {
  const result = scoreStudentProfile(profile);
  const b = result.breakdown;
  const emoji = BAND_EMOJI[result.student_band] ?? '❓';

  // Score without activities (for delta comparison)
  const withoutActivities = result.total_score - b.activities.total;

  report(`\n  Band: ${emoji} ${result.student_band}   (score: ${result.total_score}/200)`);
  report(`  Activities added: +${b.activities.total} pts  (base without activities: ${withoutActivities})`);
  report(`\n  Score breakdown:`);
  report(`    Academic performance .......... ${b.academic_performance}`);
  report(`    IB HL strength ................ ${b.ib_hl_strength}`);
  report(`    Preferred subject alignment ... ${b.preferred_subjects_alignment}`);
  report(`    Key subject grades ............ ${b.key_subject_grades}`);
  report(`    Subject rigour ................ ${b.rigour_score}`);
  report(`    EE relevance bonus ............ ${b.ee_relevance_bonus}`);
  report(`    Tests & English ............... ${b.tests_and_english}`);
  report(`    ─────────────────────────────── ──`);
  report(`    Activities total .............. +${b.activities.total}`);
  report(`      └ commitment (${profile.lifestyle_preference.commitment_level ?? 'none'}) .. ${b.activities.commitment}`);
  report(`      └ leadership ................ ${b.activities.leadership}`);
  report(`      └ key activities (${(profile.lifestyle_preference.key_activities ?? []).length}) .... ${b.activities.key_activities}`);
  report(`      └ intl experience ........... ${b.activities.intl_experience}`);
  report(`      └ work experience ........... ${b.activities.work_experience}`);

  if (result.eligibility_flags.length > 0)
    report(`\n  ⚠ Eligibility flags: ${result.eligibility_flags.join(', ')}`);
  if (result.readiness_flags.length > 0)
    report(`  ⚠ Readiness flags:   ${result.readiness_flags.join(', ')}`);

  return result;
}

function printMatches(profile: StudentProfilePayload, result: ReturnType<typeof scoreStudentProfile>) {
  const matches = rankCourseMatches(profile, result, CATALOGUE as EnrichedCourseRecord[]);

  const reach   = matches.filter(m => !m.excluded && m.admission_band === 'Reach');
  const target  = matches.filter(m => !m.excluded && m.admission_band === 'Target');
  const safety  = matches.filter(m => !m.excluded && m.admission_band === 'Safety');

  const printRow = (m: (typeof matches)[0]) =>
    report(`    ${pad(m.university, 35)} ${pad(m.course.slice(0, 30), 30)} ${m.chance_percent}%`);

  report('\n  Programme matches:');

  if (reach.length > 0) {
    report('  🔺 Reach');
    reach.slice(0, 3).forEach(printRow);
  }
  if (target.length > 0) {
    report('  🎯 Target');
    target.slice(0, 3).forEach(printRow);
  }
  if (safety.length > 0) {
    report('  🛡  Safety');
    safety.slice(0, 3).forEach(printRow);
  }
  if (reach.length + target.length + safety.length === 0) {
    report('  (no matches in current catalogue for this cluster)');
  }
}

// ── Runner ────────────────────────────────────────────────────────────────────

export type BatchSummaryRow = { label: string; band: string; score: number; actBoost: number };

/**
 * Returns the summary rows as well as printing them.
 *
 * It used to return `void`, which left its only caller — the "Full batch report"
 * test — with nothing to assert but `expect(true).toBe(true)`. A test that
 * cannot fail is worse than no test: it inflates the count with a false green.
 * Handing the rows back lets that test check the report against the scorer.
 */
export function runBatch(
  batch: Array<{ label: string; profile: StudentProfilePayload }>,
  title = 'Scoring Batch Run'
): BatchSummaryRow[] {
  report(`\n${'▓'.repeat(80)}`);
  report(`  ASCENDA SCORING VALIDATOR — ${title}`);
  report(`  Weights: commitment max=${ACTIVITIES_WEIGHTS.commitment['exceptional']}  cap=${ACTIVITIES_WEIGHTS.max_total}`);
  report(`${'▓'.repeat(80)}`);

  const summary: BatchSummaryRow[] = [];

  batch.forEach(({ label, profile }) => {
    printHeader(label);
    const result = printBreakdown(profile);
    printMatches(profile, result);
    summary.push({
      label,
      band: result.student_band,
      score: result.total_score,
      actBoost: result.breakdown.activities.total,
    });
  });

  // Summary table
  report(`\n\n${'─'.repeat(80)}`);
  report('  SUMMARY TABLE');
  report(`${'─'.repeat(80)}`);
  report(`  ${'Profile'.padEnd(45)} ${'Band'.padEnd(14)} ${'Score'.padEnd(7)} ${'Activity+'.padEnd(9)}`);
  report(`  ${'─'.repeat(45)} ${'─'.repeat(14)} ${'─'.repeat(7)} ${'─'.repeat(9)}`);
  summary.forEach(({ label, band, score, actBoost }) => {
    const e = BAND_EMOJI[band] ?? '?';
    report(`  ${pad(label, 45)} ${e} ${pad(band, 12)} ${String(score).padEnd(7)} +${actBoost}`);
  });
  report('');

  return summary;
}

// ── Direct execution ──────────────────────────────────────────────────────────

if (require.main === module) {
  // Printing the report IS the point when this file is executed as a script,
  // so switch diagnostics on rather than emitting nothing at all.
  setVerbose(true);
  runBatch(PHASE1_PROFILES, 'Phase 1 — 4 Synthetic Profiles');
}
