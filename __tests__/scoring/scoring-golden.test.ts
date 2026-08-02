/**
 * ════════════════════════════════════════════════════════════════════════════
 *  SCORING GOLDEN-FILE BASELINE  —  captures CURRENT behaviour, bugs included
 * ════════════════════════════════════════════════════════════════════════════
 *
 * WHAT THIS IS
 * ------------
 * A frozen snapshot of everything `scoreStudentProfile` currently produces
 * across the A-level, IB and ACT credential paths, plus a machine-checkable
 * monotonicity report over the A-level grade domain.
 *
 * It existed first so that the phase which repaired the real correctness bugs in
 * `src/lib/scoring/student_scoring.ts` produced a reviewable diff of scores
 * instead of an invisible behavioural change. See `docs/audit/05-domain-logic.md`
 * findings F-01 (A-level signature table) and F-04 (ACT rigour). **Both are now
 * FIXED**, and these files record the repaired behaviour.
 *
 * DO NOT "CORRECT" A VALUE BECAUSE IT LOOKS WRONG. Some of these numbers still
 * capture behaviour the audit flagged and nobody has decided to change — those
 * are listed in each file's `_known_bugs` block. That block is a DESCRIPTION of
 * the values beside it, and descriptions rot: it claimed "rigour 0" on a row
 * reading `"rigour_score": 13` for as long as the fix had been in. When the two
 * disagree, THE VALUES ARE THE FACT. Correct the prose — and correct it HERE,
 * since the headers are generated from the literals below and editing the JSON
 * is undone by the next regeneration.
 *
 * REGENERATING IS A DELIBERATE ACT
 * --------------------------------
 *     npm run test:golden           # verify against the committed baseline
 *     npm run test:golden:update    # REWRITE the baseline
 *
 * `test:golden:update` must never be run casually. Regenerate only when you
 * have intentionally changed scoring behaviour, and then READ THE DIFF —
 * `git diff __tests__/scoring/golden/` is the change review. In particular
 * `a-level-monotonicity.golden.json` is the acceptance criterion for the F-01
 * fix: after the repair its `violation_count` must be 0.
 *
 * DETERMINISM
 * -----------
 * No clock, no RNG, no I/O beyond reading/writing the golden files themselves.
 * `scoreStudentProfile` and `calculateActivitiesScore` are pure. (The one
 * impure thing in the scoring package — `mapIntakeRowsToPayload`'s
 * `new Date().getFullYear()` in `student_score_loader.ts:69`, audit F-16 — is
 * NOT on this path: payloads here are constructed literally, never mapped from
 * DB rows.) Enumeration order is fixed by explicit nested loops, and every
 * serialiser writes stable key order, so two runs are byte-identical.
 *
 * REACHING THE A-LEVEL SCORER
 * ---------------------------
 * `calculateALevelProfileScore` is module-private (`student_scoring.ts`).
 * It is reached through the public `scoreStudentProfile`, using payloads that
 * vary ONLY in `academic_input.a_level_predicted_grades`; every other scoring
 * component is pinned to a constant, so `breakdown.academic_performance` is the
 * private function's return value verbatim.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { scoreStudentProfile, type StudentScoreResult } from '@/lib/scoring/student_scoring';
import type {
  IntendedCluster,
  StudentProfilePayload,
  StudentSubject
} from '@/lib/profile/intake-types';

import { amara, marcus, priya, wei } from '../scoring_validation/phase1_profiles';

// ── Golden-file plumbing ─────────────────────────────────────────────────────

const GOLDEN_DIR = join(__dirname, 'golden');
const UPDATE = ['1', 'true'].includes((process.env.UPDATE_GOLDEN ?? '').trim().toLowerCase());

/** Recursively sort object keys so serialisation is order-independent. */
const stableKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableKeys);
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) out[key] = stableKeys(source[key]);
    return out;
  }
  return value;
};

/**
 * Tabular golden: a metadata header followed by ONE RECORD PER LINE.
 * Record key order is the literal insertion order used by the generators —
 * chosen for readability, and stable because the generators are.
 */
const serializeTable = (
  meta: Record<string, unknown>,
  rowsKey: string,
  rows: readonly unknown[]
): string => {
  const head = Object.entries(meta)
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v, null, 2).split('\n').join('\n  ')},`)
    .join('\n');
  const body = rows.map((row) => `    ${JSON.stringify(row)}`).join(',\n');
  return `{\n${head}\n  ${JSON.stringify(rowsKey)}: [\n${body}\n  ]\n}\n`;
};

/** Nested golden (full score results): pretty-printed, keys sorted throughout. */
const serializeTree = (value: unknown): string => `${JSON.stringify(stableKeys(value), null, 2)}\n`;

/**
 * Compare `actual` against the committed file, or rewrite it under
 * UPDATE_GOLDEN=1. Byte-exact comparison — formatting is part of the contract,
 * because the diff is the review artefact.
 */
const assertGolden = (fileName: string, actual: string): void => {
  const path = join(GOLDEN_DIR, fileName);
  if (UPDATE) {
    mkdirSync(GOLDEN_DIR, { recursive: true });
    writeFileSync(path, actual, 'utf8');
    return;
  }
  if (!existsSync(path)) {
    throw new Error(
      `Missing golden file ${fileName}. Generate it deliberately with \`npm run test:golden:update\`, then review the diff.`
    );
  }
  const expected = readFileSync(path, 'utf8');
  if (expected !== actual) {
    // Surface the first differing line — full-file diffs of a 500-row table are unreadable.
    const a = actual.split('\n');
    const e = expected.split('\n');
    const i = a.findIndex((line, idx) => line !== e[idx]);
    throw new Error(
      [
        `Golden mismatch in ${fileName} (first difference at line ${i + 1}):`,
        `  committed: ${e[i] ?? '<end of file>'}`,
        `  current:   ${a[i] ?? '<end of file>'}`,
        '',
        'Scoring behaviour changed. If that was intentional, run',
        '  npm run test:golden:update',
        'and review `git diff __tests__/scoring/golden/` as part of the change.'
      ].join('\n')
    );
  }
};

// ── Payload construction ─────────────────────────────────────────────────────

const PERSONAL: StudentProfilePayload['personal_information'] = {
  first_name: 'Golden',
  last_name: 'Fixture',
  email: 'golden@fixture.invalid',
  phone: null,
  nationality: 'British',
  age: 17,
  gender: null,
  resident_country: 'United Kingdom',
  current_location_city: 'London',
  time_zone: 'Europe/London'
};

const NEUTRAL_LIFESTYLE: StudentProfilePayload['lifestyle_preference'] = {
  teaching_style: null,
  desired_location_type: null,
  campus_size: null,
  extracurricular_interests: [],
  other_extracurriculars: null,
  leadership_roles: [],
  commitment_level: null,
  key_activities: [],
  sat_score: null,
  act_score: null,
  intl_experience: [],
  work_experience: null,
  work_experience_summary: null,
  ambition_statement: null,
  epq_subject: null,
  epq_title: null
};

/**
 * The "envelope": a constant, maximal non-academic contribution used by the
 * *contextual* rows so `student_band` actually varies with the academic
 * component (isolated rows top out at 80/200 and are `Weak` throughout).
 * `commitment: exceptional` (15) + a notable leadership role (5) = 20, the
 * activities cap; `english_required: false` awards a flat 18.
 */
const ENVELOPE_LIFESTYLE: StudentProfilePayload['lifestyle_preference'] = {
  ...NEUTRAL_LIFESTYLE,
  commitment_level: 'exceptional',
  leadership_roles: ['Head Boy / Girl']
};

const NEUTRAL_ACADEMIC: StudentProfilePayload['academic_input'] = {
  programme_type: 'A_LEVEL',
  school_name: 'Golden School',
  school_country: 'United Kingdom',
  school_city: 'London',
  school_type: 'international_school',
  language_of_instruction: 'english',
  graduation_year: 2026,
  desired_start_date: null,
  intended_clusters: [],
  secondary_clusters: [],
  career_aspiration: null,
  subject_list: [],
  ib_total_points: null,
  ib_core_points: null,
  ib_tok_grade: null,
  ib_ee_grade: null,
  ib_math_pathway: null,
  ee_subject: null,
  ee_title: null,
  ee_summary: null,
  a_level_predicted_grades: null,
  english_required: null,
  english_test_type: 'NONE',
  english_status: 'missing',
  english_score_overall: null,
  admissions_tests: []
};

const makePayload = (
  academic: Partial<StudentProfilePayload['academic_input']>,
  lifestyle: StudentProfilePayload['lifestyle_preference'] = NEUTRAL_LIFESTYLE,
  activitiesList: StudentProfilePayload['activities_list'] = []
): StudentProfilePayload => ({
  personal_information: PERSONAL,
  academic_input: { ...NEUTRAL_ACADEMIC, ...academic },
  lifestyle_preference: lifestyle,
  activities_list: activitiesList
});

// ════════════════════════════════════════════════════════════════════════════
//  TASK A — all 84 three-grade A-level signatures (7 grades incl. U)
// ════════════════════════════════════════════════════════════════════════════

/** Descending strength order — the same order `mapAlevelGradeToRank` imposes. */
// `U` (ungraded) IS a legal grade: it is offered by the intake form's
// A_LEVEL_GRADES, permitted by StudentProfilePayload, accepted by the zod schema
// and ranked by mapAlevelGradeToRank. Omitting it here is why this harness
// reported 13/13 green while all 28 U-bearing signatures were falling through
// the scoring table to `?? 0` — scoring BELOW the catch-all they replaced.
//
// An enumeration that does not span the real domain cannot see a missing row,
// only a wrong one. Keep this list identical to src/lib/profile/intake-options.ts.
const A_LEVEL_GRADES = ['A*', 'A', 'B', 'C', 'D', 'E', 'U'] as const;
type ALevelGrade = (typeof A_LEVEL_GRADES)[number];

/** Higher = stronger. Index into A_LEVEL_GRADES, inverted. */
const gradeRank = (grade: ALevelGrade): number => A_LEVEL_GRADES.length - A_LEVEL_GRADES.indexOf(grade);

/**
 * All 84 = C(7+3-1, 3) multisets of size 3, emitted already sorted
 * strongest-first so `join('')` reproduces the scorer's own signature string.
 */
const threeGradeSignatures = (): ALevelGrade[][] => {
  const out: ALevelGrade[][] = [];
  for (let i = 0; i < A_LEVEL_GRADES.length; i += 1) {
    for (let j = i; j < A_LEVEL_GRADES.length; j += 1) {
      for (let k = j; k < A_LEVEL_GRADES.length; k += 1) {
        out.push([A_LEVEL_GRADES[i], A_LEVEL_GRADES[j], A_LEVEL_GRADES[k]]);
      }
    }
  }
  return out;
};

/** Constant-in-grades A-level subject set: grades are null, so key_subject_grades is 0. */
const A_LEVEL_ENVELOPE_SUBJECTS: StudentSubject[] = [
  { subject_name: 'English Literature', level: 'A_LEVEL', grade_value: null },
  { subject_name: 'History', level: 'A_LEVEL', grade_value: null },
  { subject_name: 'Government and Politics', level: 'A_LEVEL', grade_value: null }
];

const aLevelPredicted = (grades: readonly ALevelGrade[]) =>
  Object.fromEntries(
    grades.map((grade, index) => [`Subject ${index + 1}`, grade])
  ) as NonNullable<StudentProfilePayload['academic_input']['a_level_predicted_grades']>;

type SignatureRow = {
  signature: string;
  grades: ALevelGrade[];
  rank_vector: number[];
  academic_performance: number;
  isolated_total_score: number;
  isolated_band: string;
  contextual_total_score: number;
  contextual_band: string;
};

const buildSignatureRows = (): SignatureRow[] =>
  threeGradeSignatures().map((grades) => {
    // Isolated: every non-academic component pinned to 0, so
    // total_score === academic_performance === calculateALevelProfileScore(...).
    const isolated = scoreStudentProfile(
      makePayload({ programme_type: 'A_LEVEL', a_level_predicted_grades: aLevelPredicted(grades) })
    );
    // Contextual: identical grades inside a constant non-academic envelope, so
    // `student_band` becomes reachable and moves only with the academic term.
    const contextual = scoreStudentProfile(
      makePayload(
        {
          programme_type: 'A_LEVEL',
          intended_clusters: ['law'],
          subject_list: A_LEVEL_ENVELOPE_SUBJECTS,
          a_level_predicted_grades: aLevelPredicted(grades),
          english_required: false
        },
        ENVELOPE_LIFESTYLE
      )
    );
    return {
      signature: grades.join(''),
      grades: [...grades],
      rank_vector: grades.map(gradeRank),
      academic_performance: isolated.breakdown.academic_performance,
      isolated_total_score: isolated.total_score,
      isolated_band: isolated.student_band,
      contextual_total_score: contextual.total_score,
      contextual_band: contextual.student_band
    };
  });

/**
 * 1- and 2-grade signatures — the region the 3-grade enumeration above cannot
 * see, and where audit finding D-01 lived.
 *
 * `calculateALevelProfileScore` reads `a_level_predicted_grades` only when it
 * holds three or more entries; with fewer it falls through to `subject_list`.
 * So a partial profile has to be expressed as subjects, not predicted grades,
 * or the branch under test never runs.
 */
const partialSignatures = (): ALevelGrade[][] => {
  const out: ALevelGrade[][] = [];
  for (let i = 0; i < A_LEVEL_GRADES.length; i += 1) {
    out.push([A_LEVEL_GRADES[i]]);
    for (let j = i; j < A_LEVEL_GRADES.length; j += 1) {
      out.push([A_LEVEL_GRADES[i], A_LEVEL_GRADES[j]]);
    }
  }
  return out;
};

const aLevelSubjects = (grades: readonly ALevelGrade[]) =>
  grades.map((grade, index) => ({
    subject_name: `Subject ${index + 1}`,
    level: 'A_LEVEL' as const,
    grade_value: grade
  }));

const buildPartialSignatureRows = (): SignatureRow[] =>
  partialSignatures().map((grades) => {
    const isolated = scoreStudentProfile(
      makePayload({ programme_type: 'A_LEVEL', subject_list: aLevelSubjects(grades) })
    );
    const contextual = scoreStudentProfile(
      makePayload(
        {
          programme_type: 'A_LEVEL',
          intended_clusters: ['law'],
          subject_list: aLevelSubjects(grades),
          english_required: false
        },
        ENVELOPE_LIFESTYLE
      )
    );
    return {
      signature: grades.join(''),
      grades: [...grades],
      rank_vector: grades.map(gradeRank),
      academic_performance: isolated.breakdown.academic_performance,
      isolated_total_score: isolated.total_score,
      isolated_band: isolated.student_band,
      contextual_total_score: contextual.total_score,
      contextual_band: contextual.student_band
    };
  });

type ViolationRow = {
  dominant: string;
  dominated: string;
  dominant_score: number;
  dominated_score: number;
  deficit: number;
};

/** X dominates Y iff, position by position on the sorted vectors, X >= Y and X !== Y. */
const dominates = (x: readonly number[], y: readonly number[]): boolean => {
  let strict = false;
  for (let i = 0; i < x.length; i += 1) {
    if (x[i] < y[i]) return false;
    if (x[i] > y[i]) strict = true;
  }
  return strict;
};

const buildMonotonicity = (rows: readonly SignatureRow[]) => {
  const violations: ViolationRow[] = [];
  let pairsChecked = 0;
  for (const x of rows) {
    for (const y of rows) {
      if (!dominates(x.rank_vector, y.rank_vector)) continue;
      pairsChecked += 1;
      if (x.academic_performance < y.academic_performance) {
        violations.push({
          dominant: x.signature,
          dominated: y.signature,
          dominant_score: x.academic_performance,
          dominated_score: y.academic_performance,
          deficit: y.academic_performance - x.academic_performance
        });
      }
    }
  }
  return { pairsChecked, violations };
};

// ════════════════════════════════════════════════════════════════════════════
//  TASK B — IB and ACT
// ════════════════════════════════════════════════════════════════════════════

/**
 * What the IB path actually branches on (read from `student_scoring.ts`):
 *   • `calculateIbTotalScore(ib_total_points + ib_core_points)` — an 11-step
 *     table with breakpoints at 24/27/29/31/33/35/37/39/41/43 (`:435-448`).
 *     Note `if (!totalPoints) return 0` makes an effective total of 0 fall in
 *     the same bucket as null.
 *   • `calculateIbHlStrength(subjects)` — HL subjects only, grade→{20,16,12,6,0},
 *     top 3, `sum / 60 * 16` (`:542-562`).
 *   • `calculateEeRelevance(clusters[0], payload)` — keyword match over
 *     ee_subject/ee_title/ee_summary: direct 10, related 5, else 0 (`:564-577`).
 *   • rigour reads `level === 'HL'`; key subject grades read GRADE_POINTS_IB
 *     (7→5, 6→4, 5→3, 4→2, anything else → 0).
 * Nothing else on the IB path is credential-sensitive.
 */
const IB_ENVELOPE_SUBJECTS: StudentSubject[] = [
  { subject_name: 'Biology', level: 'HL', grade_value: 6 },
  { subject_name: 'Chemistry', level: 'HL', grade_value: 6 },
  { subject_name: 'Mathematics', level: 'HL', grade_value: 6 },
  { subject_name: 'English Literature', level: 'SL', grade_value: 5 },
  { subject_name: 'History', level: 'SL', grade_value: 5 },
  { subject_name: 'Spanish', level: 'SL', grade_value: 5 }
];

type IbTotalRow = {
  ib_total_points: number | null;
  ib_core_points: number | null;
  effective_total: number | null;
  academic_performance: number;
  isolated_total_score: number;
  isolated_band: string;
  contextual_total_score: number;
  contextual_band: string;
};

const buildIbTotalRows = (): IbTotalRow[] => {
  const rows: IbTotalRow[] = [];
  const push = (subjectSum: number | null, core: number | null) => {
    const isolated = scoreStudentProfile(
      makePayload({ programme_type: 'IB', ib_total_points: subjectSum, ib_core_points: core })
    );
    const contextual = scoreStudentProfile(
      makePayload(
        {
          programme_type: 'IB',
          intended_clusters: ['life_sciences_biochem'],
          subject_list: IB_ENVELOPE_SUBJECTS,
          ib_total_points: subjectSum,
          ib_core_points: core,
          english_required: false
        },
        ENVELOPE_LIFESTYLE
      )
    );
    rows.push({
      ib_total_points: subjectSum,
      ib_core_points: core,
      effective_total: subjectSum === null && core === null ? null : (subjectSum ?? 0) + (core ?? 0),
      academic_performance: isolated.breakdown.academic_performance,
      isolated_total_score: isolated.total_score,
      isolated_band: isolated.student_band,
      contextual_total_score: contextual.total_score,
      contextual_band: contextual.student_band
    });
  };

  // Null / zero edges first, then the full /42 subject sum × /3 core grid.
  push(null, null);
  push(null, 3);
  push(0, 0);
  push(24, null);
  for (let subjectSum = 20; subjectSum <= 42; subjectSum += 1) {
    for (let core = 0; core <= 3; core += 1) push(subjectSum, core);
  }
  // Out-of-contract /45-scale rows (audit F-13): total_points already includes core.
  push(45, 0);
  push(45, 3);
  return rows;
};

type IbHlRow = {
  hl_grades: number[];
  ib_hl_strength: number;
  rigour_score: number;
  total_score: number;
  band: string;
};

/** Fixed subject NAMES (so rigour is constant) with varying HL grades. */
const HL_SLOT_NAMES = ['Biology', 'History', 'Geography'] as const;

const buildIbHlRows = (): IbHlRow[] => {
  const rows: IbHlRow[] = [];
  const push = (grades: readonly number[]) => {
    const subjects: StudentSubject[] = grades.map((grade, index) => ({
      subject_name: HL_SLOT_NAMES[index % HL_SLOT_NAMES.length],
      level: 'HL',
      grade_value: grade
    }));
    const result = scoreStudentProfile(makePayload({ programme_type: 'IB', subject_list: subjects }));
    rows.push({
      hl_grades: [...grades],
      ib_hl_strength: result.breakdown.ib_hl_strength,
      rigour_score: result.breakdown.rigour_score,
      total_score: result.total_score,
      band: result.student_band
    });
  };

  // All 84 = C(7+3-1, 3) three-HL grade multisets over 7…1, strongest first.
  for (let a = 7; a >= 1; a -= 1) {
    for (let b = a; b >= 1; b -= 1) {
      for (let c = b; c >= 1; c -= 1) push([a, b, c]);
    }
  }
  // HL-count variants — `calculateIbHlStrength` slices the top 3.
  push([]);
  push([7]);
  push([7, 7]);
  push([7, 7, 7, 7]);
  push([4, 4, 4, 7]);
  return rows;
};

type IbEeRow = {
  cluster: IntendedCluster;
  ee_subject: string | null;
  ee_title: string | null;
  ee_summary: string | null;
  ee_relevance_bonus: number;
};

const buildIbEeRows = (): IbEeRow[] => {
  const cases: Array<[IntendedCluster, string | null, string | null, string | null]> = [
    ['medicine_dentistry', 'Biology', 'Clinical anatomy of the knee', null], // direct
    ['medicine_dentistry', 'Chemistry', 'Reaction kinetics', null], // related
    ['medicine_dentistry', 'Art', 'Colour theory', null], // none
    ['medicine_dentistry', null, null, null], // no EE content at all
    ['computer_science', null, null, 'A study of machine learning pipelines'], // direct via summary
    ['creative', 'Visual Arts', null, null], // 'art' substring → direct
    ['law', 'History', 'Constitutional change', null] // direct ('constitutional')
  ];
  return cases.map(([cluster, subject, title, summary]) => {
    const result = scoreStudentProfile(
      makePayload({
        programme_type: 'IB',
        intended_clusters: [cluster],
        ee_subject: subject,
        ee_title: title,
        ee_summary: summary
      })
    );
    return {
      cluster,
      ee_subject: subject,
      ee_title: title,
      ee_summary: summary,
      ee_relevance_bonus: result.breakdown.ee_relevance_bonus
    };
  });
};

/**
 * ACT. `calculateActScore` (`student_scoring.ts`) reads
 * `lifestyle_preference.act_score`, NOT anything on academic_input, and
 * `if (!actScore) return 0` puts composite 0 in the same bucket as null. That
 * one is still open.
 *
 * AUDIT F-04, NOW FIXED: the sweep rows carry three A-level-shaped subjects,
 * exactly what `StudentIntakeForm` emits for an ACT student. `rigour_score` used
 * to be 0 in every single row, because `calculateRigourScore` filtered on
 * `level === 'AP'` for ACT and nothing emits AP; it is 13 in every row now. The
 * `act_rigour_paths` table below pins the two levels to the same score so the
 * counterfactual cannot drift away from reality again.
 */
const ACT_FORM_SUBJECTS: StudentSubject[] = [
  { subject_name: 'Mathematics', level: 'A_LEVEL', grade_value: 'A' },
  { subject_name: 'Computer Science', level: 'A_LEVEL', grade_value: 'A' },
  { subject_name: 'Physics', level: 'A_LEVEL', grade_value: 'A' }
];

type ActRow = {
  act_composite: number | null;
  academic_performance: number;
  rigour_score: number;
  isolated_total_score: number;
  isolated_band: string;
  contextual_total_score: number;
  contextual_band: string;
};

const buildActRows = (): ActRow[] => {
  const rows: ActRow[] = [];
  const push = (composite: number | null) => {
    const isolated = scoreStudentProfile(
      makePayload({ programme_type: 'ACT', subject_list: ACT_FORM_SUBJECTS }, {
        ...NEUTRAL_LIFESTYLE,
        act_score: composite
      })
    );
    const contextual = scoreStudentProfile(
      makePayload(
        {
          programme_type: 'ACT',
          intended_clusters: ['computer_science'],
          subject_list: ACT_FORM_SUBJECTS,
          english_required: false
        },
        { ...ENVELOPE_LIFESTYLE, act_score: composite }
      )
    );
    rows.push({
      act_composite: composite,
      academic_performance: isolated.breakdown.academic_performance,
      rigour_score: isolated.breakdown.rigour_score,
      isolated_total_score: isolated.total_score,
      isolated_band: isolated.student_band,
      contextual_total_score: contextual.total_score,
      contextual_band: contextual.student_band
    });
  };
  push(null);
  for (let composite = 0; composite <= 36; composite += 1) push(composite);
  return rows;
};

type ActRigourRow = {
  case: string;
  subject_level: string | null;
  rigour_score: number;
  academic_performance: number;
  total_score: number;
  note: string;
};

const buildActRigourRows = (): ActRigourRow[] => {
  const at = (level: StudentSubject['level'] | null, name: string, note: string): ActRigourRow => {
    const subjects: StudentSubject[] =
      level === null
        ? []
        : ACT_FORM_SUBJECTS.map((subject) => ({ ...subject, level }));
    const result = scoreStudentProfile(
      makePayload({ programme_type: 'ACT', subject_list: subjects }, { ...NEUTRAL_LIFESTYLE, act_score: 32 })
    );
    return {
      case: name,
      subject_level: level,
      rigour_score: result.breakdown.rigour_score,
      academic_performance: result.breakdown.academic_performance,
      total_score: result.total_score,
      note
    };
  };
  return [
    at('A_LEVEL', 'act_subjects_as_the_form_emits_them', 'what every real ACT student gets; scored 0 before the F-04 fix, must now equal the AP row'),
    at('AP', 'act_subjects_at_AP_level', 'the level RigourTable.ACT was written for; nothing in the app emits it, so this row is the counterfactual the A_LEVEL row must match'),
    at('HL', 'act_subjects_at_HL_level', 'not emitted for ACT; recorded for completeness'),
    at(null, 'act_no_subjects', 'baseline')
  ];
};

// ════════════════════════════════════════════════════════════════════════════
//  TASK C — end-to-end student profiles
// ════════════════════════════════════════════════════════════════════════════

const subjects = (...entries: Array<[string, StudentSubject['level'], number | string | null]>) =>
  entries.map(([subject_name, level, grade_value]) => ({ subject_name, level, grade_value }));

const RICH_LIFESTYLE: StudentProfilePayload['lifestyle_preference'] = {
  ...NEUTRAL_LIFESTYLE,
  commitment_level: 'deep',
  leadership_roles: ['Prefect'],
  key_activities: ['Debate / Model UN', 'Community service', 'Sport (competitive)'],
  intl_experience: ['Study abroad'],
  work_experience: true,
  work_experience_summary: 'Two-week placement at a regional firm'
};

type NamedProfile = { name: string; note: string; profile: StudentProfilePayload };

const PROFILES: NamedProfile[] = [
  // ── Reused verbatim from the existing phase-1 fixture set ──────────────────
  { name: '01_wei_ib_medicine_ceiling', note: 'reused from __tests__/scoring_validation/phase1_profiles.ts', profile: wei },
  { name: '02_amara_alevel_law_rounded', note: 'reused from phase1_profiles.ts', profile: amara },
  { name: '03_marcus_alevel_cs_weak_grades', note: 'reused from phase1_profiles.ts', profile: marcus },
  { name: '04_priya_ib_business_borderline', note: 'reused from phase1_profiles.ts', profile: priya },

  // ── IB high / mid / low ───────────────────────────────────────────────────
  {
    name: '05_ib_high_engineering',
    note: 'IB 42+3, three 7s at HL, strong EE, native English',
    profile: makePayload(
      {
        programme_type: 'IB',
        intended_clusters: ['engineering'],
        secondary_clusters: ['maths'],
        subject_list: subjects(
          ['Mathematics', 'HL', 7],
          ['Physics', 'HL', 7],
          ['Chemistry', 'HL', 7],
          ['English Literature', 'SL', 6],
          ['Economics', 'SL', 6],
          ['French', 'SL', 6]
        ),
        ib_total_points: 42,
        ib_core_points: 3,
        ee_subject: 'Physics',
        ee_title: 'Mechanical resonance in cantilever design',
        ee_summary: 'An engineering investigation into damping.',
        english_required: false,
        english_test_type: 'WAIVER',
        english_status: 'met'
      },
      RICH_LIFESTYLE
    )
  },
  {
    name: '06_ib_mid_humanities',
    note: 'IB 32+1, mixed HL grades, IELTS 7.0',
    profile: makePayload(
      {
        programme_type: 'IB',
        intended_clusters: ['humanities'],
        subject_list: subjects(
          ['History', 'HL', 6],
          ['English Literature', 'HL', 5],
          ['Geography', 'HL', 5],
          ['Mathematics', 'SL', 4],
          ['Biology', 'SL', 5],
          ['German', 'SL', 5]
        ),
        ib_total_points: 32,
        ib_core_points: 1,
        ee_subject: 'History',
        ee_title: 'Post-war reconstruction',
        english_required: true,
        english_test_type: 'IELTS',
        english_status: 'met',
        english_score_overall: 7
      },
      RICH_LIFESTYLE
    )
  },
  {
    name: '07_ib_low_creative',
    note: 'IB 25+0, HL 4s, no English evidence — should carry a readiness flag',
    profile: makePayload({
      programme_type: 'IB',
      intended_clusters: ['creative'],
      subject_list: subjects(
        ['Art and Design', 'HL', 4],
        ['English Literature', 'HL', 4],
        ['Psychology', 'HL', 4],
        ['Mathematics', 'SL', 3],
        ['Biology', 'SL', 4],
        ['Spanish', 'SL', 4]
      ),
      ib_total_points: 25,
      ib_core_points: 0,
      english_required: true,
      english_test_type: 'IELTS',
      english_status: 'missing'
    })
  },

  // ── A-level high / mid / low ──────────────────────────────────────────────
  {
    name: '08_alevel_high_law',
    note: 'A*A*A, Oxford-tier LNAT, EPQ on a legal topic',
    profile: makePayload(
      {
        programme_type: 'A_LEVEL',
        intended_clusters: ['law'],
        subject_list: subjects(
          ['History', 'A_LEVEL', 'A*'],
          ['English Literature', 'A_LEVEL', 'A*'],
          ['Government and Politics', 'A_LEVEL', 'A']
        ),
        a_level_predicted_grades: { History: 'A*', 'English Literature': 'A*', 'Government and Politics': 'A' },
        english_required: false,
        english_test_type: 'WAIVER',
        english_status: 'met',
        admissions_tests: [{ test_type: 'LNAT', status: 'taken', score_numeric: 32, percentile: null }]
      },
      { ...RICH_LIFESTYLE, epq_subject: 'Law', epq_title: 'Constitutional reform after devolution' }
    )
  },
  {
    name: '09_alevel_mid_economics',
    note: 'ABB with a TMUA gap — expect admissions_test_missing:TMUA',
    profile: makePayload(
      {
        programme_type: 'A_LEVEL',
        intended_clusters: ['economics_quant'],
        subject_list: subjects(
          ['Mathematics', 'A_LEVEL', 'A'],
          ['Economics', 'A_LEVEL', 'B'],
          ['Geography', 'A_LEVEL', 'B']
        ),
        a_level_predicted_grades: { Mathematics: 'A', Economics: 'B', Geography: 'B' },
        english_required: true,
        english_test_type: 'IELTS',
        english_status: 'met',
        english_score_overall: 7
      },
      RICH_LIFESTYLE
    )
  },
  {
    name: '10_alevel_low_business',
    note: 'DDE — one of only two signatures that legitimately score 8; it used to reach that value through a catch-all rather than a calibrated entry',
    profile: makePayload({
      programme_type: 'A_LEVEL',
      intended_clusters: ['business_non_quant'],
      subject_list: subjects(
        ['Business', 'A_LEVEL', 'D'],
        ['Economics', 'A_LEVEL', 'D'],
        ['Media Studies', 'A_LEVEL', 'E']
      ),
      a_level_predicted_grades: { Business: 'D', Economics: 'D', 'Media Studies': 'E' },
      english_required: true,
      english_test_type: 'IELTS',
      english_status: 'missing'
    })
  },

  // ── The A-level paths F-01 broke, kept as its regression test ─────────────
  {
    name: '11_alevel_bug_A_star_A_star_D',
    note: 'F-01 regression guard: A*A*D scored the catch-all 8 — below DDD (10) and far below ABD (40), both of which it strictly dominates. Now 67.',
    profile: makePayload(
      {
        programme_type: 'A_LEVEL',
        intended_clusters: ['engineering'],
        subject_list: subjects(
          ['Mathematics', 'A_LEVEL', 'A*'],
          ['Physics', 'A_LEVEL', 'A*'],
          ['Chemistry', 'A_LEVEL', 'D']
        ),
        a_level_predicted_grades: { Mathematics: 'A*', Physics: 'A*', Chemistry: 'D' },
        english_required: false,
        english_test_type: 'WAIVER',
        english_status: 'met'
      },
      RICH_LIFESTYLE
    )
  },
  {
    name: '12_alevel_bug_AAD_vs_BBC',
    note: 'F-01 regression guard: AAD scored 8 while the weaker BBC scored 36. Now 46.',
    profile: makePayload(
      {
        programme_type: 'A_LEVEL',
        intended_clusters: ['computer_science'],
        subject_list: subjects(
          ['Mathematics', 'A_LEVEL', 'A'],
          ['Computer Science', 'A_LEVEL', 'A'],
          ['Physics', 'A_LEVEL', 'D']
        ),
        a_level_predicted_grades: { Mathematics: 'A', 'Computer Science': 'A', Physics: 'D' },
        english_required: false,
        english_test_type: 'WAIVER',
        english_status: 'met'
      },
      RICH_LIFESTYLE
    )
  },

  // ── ACT ───────────────────────────────────────────────────────────────────
  {
    name: '13_act_strong_cs',
    note: 'F-04 regression guard: ACT 34 with A_LEVEL-shaped subjects — rigour_score was 0, now 13',
    profile: makePayload(
      {
        programme_type: 'ACT',
        intended_clusters: ['computer_science'],
        subject_list: subjects(
          ['Mathematics', 'A_LEVEL', 'A'],
          ['Computer Science', 'A_LEVEL', 'A'],
          ['Physics', 'A_LEVEL', 'B']
        ),
        english_required: false,
        english_test_type: 'WAIVER',
        english_status: 'met'
      },
      { ...RICH_LIFESTYLE, act_score: 34 }
    )
  },
  {
    name: '14_act_low_business',
    note: 'ACT 19, no leadership, unmet English',
    profile: makePayload(
      {
        programme_type: 'ACT',
        intended_clusters: ['business_non_quant'],
        subject_list: subjects(['Business', 'A_LEVEL', 'C'], ['Economics', 'A_LEVEL', 'C']),
        english_required: true,
        english_test_type: 'TOEFL',
        english_status: 'missing'
      },
      { ...NEUTRAL_LIFESTYLE, act_score: 19 }
    )
  },
  {
    name: '15_ib_with_stronger_act_best_of',
    note: 'IB 32+1 (academic 42) alongside ACT 35 (75) — the Math.max "best of" path wins',
    profile: makePayload(
      {
        programme_type: 'IB',
        intended_clusters: ['economics_quant'],
        subject_list: subjects(
          ['Mathematics', 'HL', 6],
          ['Economics', 'HL', 5],
          ['History', 'HL', 5],
          ['English Literature', 'SL', 5],
          ['Physics', 'SL', 5],
          ['Mandarin', 'SL', 5]
        ),
        ib_total_points: 32,
        ib_core_points: 1,
        english_required: false,
        english_test_type: 'WAIVER',
        english_status: 'met'
      },
      { ...RICH_LIFESTYLE, act_score: 35 }
    )
  },

  // ── Missing-data / unknown-state profiles ─────────────────────────────────
  {
    name: '16_empty_everything',
    note: 'null scores, no subjects, no clusters, no tests — the floor',
    profile: makePayload({})
  },
  {
    name: '17_clusters_but_no_subjects',
    note: 'medicine + engineering intent with an empty subject list — expect two eligibility flags',
    profile: makePayload({
      programme_type: 'A_LEVEL',
      intended_clusters: ['medicine_dentistry', 'engineering'],
      subject_list: []
    })
  },
  {
    name: '18_subjects_but_no_grades',
    note: 'A-level subjects present with empty-string grades; predicted-grades map is null',
    profile: makePayload({
      programme_type: 'A_LEVEL',
      intended_clusters: ['life_sciences_biochem'],
      subject_list: subjects(
        ['Biology', 'A_LEVEL', ''],
        ['Chemistry', 'A_LEVEL', ''],
        ['Mathematics', 'A_LEVEL', '']
      ),
      a_level_predicted_grades: null
    })
  },
  {
    name: '19_unknown_english_status',
    note: '"Not sure" → english_required null with a booked test: no flag, and tests_and_english scores 0',
    profile: makePayload(
      {
        programme_type: 'A_LEVEL',
        intended_clusters: ['humanities'],
        subject_list: subjects(
          ['History', 'A_LEVEL', 'B'],
          ['English Literature', 'A_LEVEL', 'B'],
          ['Geography', 'A_LEVEL', 'C']
        ),
        a_level_predicted_grades: { History: 'B', 'English Literature': 'B', Geography: 'C' },
        english_required: null,
        english_test_type: 'NONE',
        english_status: 'booked',
        english_score_overall: null
      },
      RICH_LIFESTYLE
    )
  },
  {
    name: '20_medicine_max_activities_ucat_gap',
    note: 'IB 40+3, activities cap exercised via the structured activities_list, UCAT missing',
    profile: makePayload(
      {
        programme_type: 'IB',
        intended_clusters: ['medicine_dentistry'],
        subject_list: subjects(
          ['Biology', 'HL', 7],
          ['Chemistry', 'HL', 7],
          ['Mathematics', 'HL', 6],
          ['English Literature', 'SL', 6],
          ['Psychology', 'SL', 6],
          ['French', 'SL', 5]
        ),
        ib_total_points: 40,
        ib_core_points: 3,
        ee_subject: 'Biology',
        ee_title: 'Anatomy of the cardiac cycle',
        english_required: true,
        english_test_type: 'IELTS',
        english_status: 'exceptional',
        english_score_overall: 8.5,
        admissions_tests: []
      },
      {
        ...RICH_LIFESTYLE,
        commitment_level: 'exceptional',
        leadership_roles: ['Club Founder', 'Prefect'],
        intl_experience: ['International competition']
      },
      [
        { category: 'Research', level: 'International', duration: '3–4 years', highlight: 'Clinical anatomy study', sort_order: 0 },
        { category: 'Volunteering', level: 'National', duration: '1–2 years', highlight: 'Hospital ward volunteer', sort_order: 1 },
        { category: 'Sport', level: 'Regional', duration: '5+ years', highlight: null, sort_order: 2 },
        { category: 'Music', level: 'School', duration: '5+ years', highlight: null, sort_order: 3 },
        { category: 'Debate', level: 'Regional', duration: '1–2 years', highlight: null, sort_order: 4 }
      ]
    )
  }
];

type ProfileRecord = {
  name: string;
  note: string;
  result: StudentScoreResult;
};

const buildProfileRecords = (): ProfileRecord[] =>
  PROFILES.map(({ name, note, profile }) => ({ name, note, result: scoreStudentProfile(profile) }));

// ════════════════════════════════════════════════════════════════════════════
//  Suites
// ════════════════════════════════════════════════════════════════════════════

const REGEN_NOTE =
  'Generated by __tests__/scoring/scoring-golden.test.ts. Regenerating is a DELIBERATE act: run `npm run test:golden:update` only when scoring behaviour was changed on purpose, then review `git diff __tests__/scoring/golden/` as part of that change.';

describe('golden — A-level grade signatures (task A)', () => {
  const rows = buildSignatureRows();

  it('enumerates exactly 84 distinct three-grade signatures', () => {
    expect(rows).toHaveLength(84);
    expect(new Set(rows.map((row) => row.signature)).size).toBe(84);
  });

  it('matches the committed signature baseline', () => {
    assertGolden(
      'a-level-signatures.golden.json',
      serializeTable(
        {
          _readme: REGEN_NOTE,
          _source: 'scoreStudentProfile → (private) calculateALevelProfileScore, src/lib/scoring/student_scoring.ts',
          _method:
            'Payloads vary ONLY in academic_input.a_level_predicted_grades. On the isolated rows every other component is pinned to 0, so isolated_total_score === academic_performance. Contextual rows add a constant non-academic envelope (law cluster, ungraded A-level subjects, english_required=false, activities capped at 20) so student_band is reachable.',
          _known_bugs: [
            'F-01 is FIXED. A_LEVEL_SIGNATURE_SCORE is now a complete table over all 84 signatures (U is a grade, so the domain is 84, not the 56 the first attempt assumed). Nothing here falls to a catch-all: the two rows scoring 8, CEE and DDE, are calibrated entries. a-level-monotonicity.golden.json records violation_count 0 over all 2,436 dominance-comparable pairs.',
            'Ties remain, and are permitted: the scale is compressed at the bottom, where EEE, DEE and UUU all sit at 5. Only a strictly better profile scoring strictly worse is a defect.'
          ],
          _columns: [
            'signature',
            'grades',
            'rank_vector (mapAlevelGradeToRank: A*=7, A=6, B=5, C=4, D=3, E=2, U=1; sorted strongest-first)',
            'academic_performance',
            'isolated_total_score',
            'isolated_band',
            'contextual_total_score',
            'contextual_band'
          ],
          signature_count: rows.length
        },
        'signatures',
        rows
      )
    );
  });

  it('matches the committed monotonicity report', () => {
    const { pairsChecked, violations } = buildMonotonicity(rows);
    assertGolden(
      'a-level-monotonicity.golden.json',
      serializeTable(
        {
          _readme: REGEN_NOTE,
          _acceptance_criterion:
            'THIS FILE IS THE ACCEPTANCE TEST FOR THE F-01 FIX. After calculateALevelProfileScore is repaired, violation_count MUST be 0 and the violations array MUST be empty. Any other change to this file needs an explanation in the PR.',
          _definition:
            'X dominates Y iff, comparing the two signatures position-by-position after sorting strongest-first, every grade of X is at least as strong as the corresponding grade of Y and at least one is strictly stronger. A violation is a dominating pair where score(X) < score(Y).',
          pairs_checked: pairsChecked,
          pairs_holding: pairsChecked - violations.length,
          violation_count: violations.length
        },
        'violations',
        violations
      )
    );
  });

  /* ── the partial branch (audit D-01) ───────────────────────────────────────
   *
   * The enumeration above only ever built 3-grade signatures, so the 1- and
   * 2-grade branch of `calculateALevelProfileScore` was structurally invisible
   * to the golden harness — the same blindness that hid the U-grade regression
   * from the very suite written to catch it.
   *
   * It contained 95 strict inversions. The rule was literally
   * `if (sorted.join('').includes('E')) return 5; return 0;` — an `E` was the
   * only grade worth anything, so `A*A*` scored 0 while `A*E` scored 5.
   *
   * Dominance is compared WITHIN an arity. A 2-grade profile against a 3-grade
   * one is genuinely a different shape, and the old code comment was right
   * about that much; it was wrong that the same-shape pairs were also excused.
   */
  describe('partial profiles — one or two A-levels entered', () => {
    const partialRows = buildPartialSignatureRows();
    const byArity = [1, 2].map((n) => partialRows.filter((r) => r.grades.length === n));

    it.each([
      ['one A-level', 0],
      ['two A-levels', 1]
    ])('has no dominance inversion among %s', (_label, index) => {
      const { violations } = buildMonotonicity(byArity[index]);
      expect(violations).toEqual([]);
    });

    it('scores a stronger partial above a weaker one — the D-01 worked examples', () => {
      const score = (signature: string) =>
        partialRows.find((row) => row.signature === signature)?.academic_performance;

      // Each of these was inverted: the left-hand side scored 0, the right 5.
      expect(score('A*A*')!).toBeGreaterThan(score('A*E')!);
      expect(score('A*A*')!).toBeGreaterThan(score('EE')!);
      expect(score('AA')!).toBeGreaterThan(score('AE')!);
      expect(score('BB')!).toBeGreaterThan(score('BE')!);
      expect(score('A*')!).toBeGreaterThan(score('E')!);
    });

    it('entering a third subject never lowers the score', () => {
      // The completion incentive. A 2-grade profile must not outscore the same
      // two grades plus a third, for ANY third grade — otherwise a student is
      // punished for finishing data entry. Signatures are compared after the
      // same descending sort the scorer applies.
      const full = buildSignatureRows();
      const scoreOf = (grades: ALevelGrade[]) => {
        const key = [...grades].sort((a, b) => gradeRank(b) - gradeRank(a)).join('');
        return full.find((f) => f.signature === key)?.academic_performance;
      };

      for (const p of partialRows.filter((r) => r.grades.length === 2)) {
        for (const third of A_LEVEL_GRADES) {
          const completed = scoreOf([...(p.grades as ALevelGrade[]), third]);
          if (completed === undefined) continue;
          expect({
            partial: p.signature,
            third,
            partialScore: p.academic_performance,
            completedScore: completed
          }).toMatchObject({ partialScore: expect.any(Number) });
          expect(p.academic_performance).toBeLessThanOrEqual(completed);
        }
      }
    });
  });

  it('has repaired the inversions recorded by the audit (F-01)', () => {
    const score = (signature: string) =>
      rows.find((row) => row.signature === signature)?.academic_performance;

    // These nine were the audit's worked examples (05-domain-logic.md, F-01).
    // Six of them scored the catch-all 8 while strictly WEAKER signatures scored
    // 10-40. This test used to assert the broken values, to pin the bug down; it
    // now asserts the repair, so a regression re-breaks the build.
    //
    // The three originally-tabulated values are unchanged — the fix preserved
    // every one of the 25 calibrated entries and only filled the 30 gaps.
    expect(score('DDD')).toBe(10);
    expect(score('ABD')).toBe(40);
    expect(score('BBC')).toBe(36);
    expect(score('CCD')).toBe(16);
    expect(score('CCC')).toBe(24);

    // Previously 8, now placed inside the range dominance permits.
    expect(score('A*A*D')).toBe(67);
    expect(score('AAD')).toBe(46);
    expect(score('ACC')).toBe(38);
    expect(score('BBD')).toBe(31);

    // The property that actually matters, stated directly: each repaired
    // signature now outscores every signature it strictly dominates.
    expect(score('A*A*D')!).toBeGreaterThan(score('DDD')!);
    expect(score('A*A*D')!).toBeGreaterThan(score('ABD')!);
    expect(score('AAD')!).toBeGreaterThan(score('DDD')!);
    expect(score('ACC')!).toBeGreaterThan(score('CCC')!);
    expect(score('BBD')!).toBeGreaterThan(score('CCD')!);
  });
});

describe('golden — IB (task B)', () => {
  it('matches the committed IB total-points baseline', () => {
    const rows = buildIbTotalRows();
    assertGolden(
      'ib-total-points.golden.json',
      serializeTable(
        {
          _readme: REGEN_NOTE,
          _source: 'calculateIbTotalScore, src/lib/scoring/student_scoring.ts',
          _method:
            'effective_total = (ib_total_points ?? 0) + (ib_core_points ?? 0) — the /42 subject sum plus /3 core, per the wizard contract. Sweeps subject sums 20–42 × core 0–3 plus null/zero edges and two out-of-contract /45-scale rows. Contextual rows add a constant envelope (life_sciences cluster, three HL 6s, english_required=false, activities capped) so student_band is reachable.',
          _known_bugs: [
            'STILL OPEN — F-13: nothing enforces the /42 contract. The two ib_total_points=45 rows show the double-count — 45+3 is treated as 48 and clamps to the top band.',
            'STILL OPEN: calculateIbTotalScore uses `if (!totalPoints) return 0`, so an effective total of 0 is indistinguishable from null.'
          ],
          row_count: rows.length
        },
        'rows',
        rows
      )
    );
  });

  it('matches the committed IB HL-strength baseline', () => {
    const rows = buildIbHlRows();
    expect(rows.filter((row) => row.hl_grades.length === 3)).toHaveLength(84);
    assertGolden(
      'ib-hl-strength.golden.json',
      serializeTable(
        {
          _readme: REGEN_NOTE,
          _source: 'calculateIbHlStrength, src/lib/scoring/student_scoring.ts',
          _method:
            'All 84 three-HL-subject grade multisets over 7…1, then HL-count variants (0, 1, 2 and 4 HLs) to exercise the top-3 slice. Subject NAMES are held constant so rigour_score does not move with the grades. ib_total_points is null throughout, so academic_performance is 0 and total_score = ib_hl_strength + rigour_score, each rounded separately (audit F-09).',
          row_count: rows.length
        },
        'rows',
        rows
      )
    );
  });

  it('matches the committed IB EE-relevance baseline', () => {
    const rows = buildIbEeRows();
    assertGolden(
      'ib-ee-relevance.golden.json',
      serializeTable(
        {
          _readme: REGEN_NOTE,
          _source: 'calculateEeRelevance, src/lib/scoring/student_scoring.ts',
          _method:
            'Keyword match over ee_subject + ee_title + ee_summary against EE_RELEVANCE_RULES[clusters[0]]: direct 10, related 5, else 0. Substring matching is naive — "Visual Arts" matches the "art" keyword.',
          row_count: rows.length
        },
        'rows',
        rows
      )
    );
  });
});

describe('golden — ACT (task B)', () => {
  it('matches the committed ACT composite baseline', () => {
    const rows = buildActRows();
    assertGolden(
      'act-composite.golden.json',
      serializeTable(
        {
          _readme: REGEN_NOTE,
          _source: 'calculateActScore, src/lib/scoring/student_scoring.ts',
          _method:
            'Composite swept null and 0–36, read from lifestyle_preference.act_score. Every row carries the three A_LEVEL-shaped subjects the intake form actually emits for an ACT student.',
          _known_bugs: [
            'F-04 is FIXED. rigour_score is 13 in every row, not 0. calculateRigourScore used to filter ACT students on `level === "AP"` while StudentIntakeForm only ever emits A_LEVEL, so the filter matched nothing and up to 15 of 200 points were unreachable for every ACT student; it now accepts both levels, which also heals the rows already in the database.',
            'STILL OPEN: calculateActScore uses `if (!actScore) return 0`, so composite 0 is indistinguishable from null — the act_composite:null and act_composite:0 rows are identical.'
          ],
          row_count: rows.length
        },
        'rows',
        rows
      )
    );
  });

  it('matches the committed ACT rigour-path baseline (F-04)', () => {
    const rows = buildActRigourRows();
    // This used to assert the BUG: the level the intake form actually emits
    // (`A_LEVEL`) scored 0, while the level `RigourTable.ACT` was written for
    // (`AP`) scored 13 — and nothing in the app can produce `AP`, so every real
    // ACT student silently lost up to 15 of 200 points, about one band.
    //
    // `calculateRigourScore` now accepts both for ACT, which is what heals the
    // rows already in the database; fixing only the form would have left every
    // existing ACT student at 0. The two paths must now agree.
    const asEmitted = rows.find((row) => row.subject_level === 'A_LEVEL');
    const asIntended = rows.find((row) => row.subject_level === 'AP');
    expect(asEmitted?.rigour_score).toBeGreaterThan(0);
    expect(asIntended?.rigour_score).toBeGreaterThan(0);
    expect(asEmitted?.rigour_score).toBe(asIntended?.rigour_score);
    // HL is still not an ACT level, so it correctly contributes nothing.
    expect(rows.find((row) => row.subject_level === 'HL')?.rigour_score).toBe(0);
    assertGolden(
      'act-rigour-paths.golden.json',
      serializeTable(
        {
          _readme: REGEN_NOTE,
          _source: 'calculateRigourScore, src/lib/scoring/student_scoring.ts',
          _method:
            'One ACT student (composite 32) scored four times with the same three subjects at different `level` values. Both A_LEVEL and AP now reach RigourTable.ACT; HL does not, and is recorded to show that.',
          _known_bugs: ['F-04 is FIXED, and this table is its regression test: the A_LEVEL row (what every real ACT student gets) and the AP row (what RigourTable.ACT was written for) both score 13. They used to read 0 and 13. If they diverge again, every real ACT student silently loses about a band.'],
          row_count: rows.length
        },
        'rows',
        rows
      )
    );
  });
});

describe('golden — end-to-end student profiles (task C)', () => {
  const records = buildProfileRecords();

  it('covers 20 profiles spanning every credential path and the known-buggy ones', () => {
    expect(records).toHaveLength(20);
    expect(new Set(records.map((record) => record.name)).size).toBe(20);
  });

  it('matches the committed profile baseline', () => {
    assertGolden(
      'student-profiles.golden.json',
      serializeTree({
        _readme: REGEN_NOTE,
        _source: 'scoreStudentProfile, src/lib/scoring/student_scoring.ts',
        _method:
          'Full StudentScoreResult per profile — total_score, student_band, every breakdown component, the activities sub-breakdown, and both flag arrays. Profiles 01–04 are reused verbatim from __tests__/scoring_validation/phase1_profiles.ts. Object keys are sorted recursively; flag arrays keep their production order because that order is itself behaviour.',
        _known_bugs: [
          'F-01 is FIXED. Profiles 11 and 12 (A*A*D and AAD) now score academic_performance 67 and 46; they scored the catch-all 8 before, below signatures they strictly dominate.',
          'F-04 is FIXED. Profile 13 (ACT 34) now has rigour_score 13; it was 0.',
          'STILL OPEN — F-09: breakdown components are each rounded separately and need not sum to total_score.',
          'STILL OPEN — F-10: tests_and_english takes Math.max over LNAT/UCAT/English rather than summing, so English evidence is invisible whenever an admissions test scores higher.'
        ],
        profile_count: records.length,
        profiles: records
      })
    );
  });
});

describe('golden — determinism', () => {
  it('produces byte-identical output across repeated generation', () => {
    const once = serializeTable({}, 'signatures', buildSignatureRows());
    const twice = serializeTable({}, 'signatures', buildSignatureRows());
    expect(twice).toBe(once);

    const profilesOnce = serializeTree(buildProfileRecords());
    const profilesTwice = serializeTree(buildProfileRecords());
    expect(profilesTwice).toBe(profilesOnce);
  });

  it('scores are invariant to the order the fixtures are evaluated in', () => {
    const forward = PROFILES.map(({ profile }) => scoreStudentProfile(profile).total_score);
    const backward = [...PROFILES].reverse().map(({ profile }) => scoreStudentProfile(profile).total_score);
    expect([...backward].reverse()).toEqual(forward);
  });
});
