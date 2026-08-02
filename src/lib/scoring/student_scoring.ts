import type {
  AdmissionsTestType,
  IntendedCluster,
  ProgrammeType,
  StudentAdmissionsTest,
  StudentProfilePayload,
  StudentSubject
} from '@/lib/profile/intake-types';
import { calculateActivitiesScore, type ActivitiesBreakdown } from './activities_scoring';

type SubjectRule = {
  subject: string;
  substitutes?: string[];
};

type RequiredSubjectsRule = {
  required: SubjectRule[];
};

export type ScoreBreakdown = {
  eligibility: {
    required_subjects_met: Record<IntendedCluster, boolean>;
  };
  preferred_subjects_alignment: number;
  rigour_score: number;
  key_subject_grades: number;
  academic_performance: number;
  ib_hl_strength: number;
  ee_relevance_bonus: number;      // IB only — Extended Essay relevance
  a_level_project_bonus: number;   // A-level only — work/project summary relevance (max 5)
  tests_and_english: number;
  activities: ActivitiesBreakdown;
  total_score: number;
  student_band: StudentBand;
};

export type StudentBand = 'Exceptional' | 'Very strong' | 'Strong' | 'Solid' | 'Borderline' | 'Weak';

export type StudentScoreResult = {
  total_score: number;
  student_band: StudentBand;
  breakdown: ScoreBreakdown;
  eligibility_flags: string[];
  readiness_flags: string[];
};

const normalizeSubject = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\s+/g, ' ');

const SUBJECT_ALIASES: Record<string, string> = {
  maths: 'mathematics',
  math: 'mathematics',
  'further maths': 'further mathematics',
  'english lit': 'english literature',
  'english language': 'english language',
  'computer science': 'computer science',
  'design technology': 'design technology',
  'government and politics': 'government and politics',
  politics: 'government and politics',
  economics: 'economics',
  biology: 'biology',
  chemistry: 'chemistry',
  physics: 'physics'
};

const canonicalSubject = (value: string) => {
  const normalized = normalizeSubject(value);
  return SUBJECT_ALIASES[normalized] ?? normalized;
};

const mapSubjectSet = (subjects: StudentSubject[]) =>
  new Set(subjects.map((subject) => canonicalSubject(subject.subject_name)));

export const RequiredSubjectsRules: Record<IntendedCluster, RequiredSubjectsRule> = {
  computer_science: {
    required: [
      { subject: 'mathematics', substitutes: ['further mathematics'] }
    ]
  },
  maths: {
    required: [{ subject: 'mathematics' }]
  },
  engineering: {
    required: [
      { subject: 'mathematics', substitutes: ['further mathematics'] },
      { subject: 'physics' }
    ]
  },
  life_sciences_biochem: {
    required: [
      { subject: 'biology' },
      { subject: 'chemistry' }
    ]
  },
  medicine_dentistry: {
    required: [
      { subject: 'biology' },
      { subject: 'chemistry' }
    ]
  },
  economics_quant: {
    required: [{ subject: 'mathematics', substitutes: ['further mathematics'] }]
  },
  business_non_quant: {
    required: []
  },
  law: {
    required: [{ subject: 'english literature', substitutes: ['history', 'government and politics'] }]
  },
  humanities: {
    required: [{ subject: 'history', substitutes: ['english literature', 'geography'] }]
  },
  creative: {
    required: [{ subject: 'art and design', substitutes: ['design technology'] }]
  }
};

export const PreferredSubjectsRules: Record<IntendedCluster, { preferred: SubjectRule[] }> = {
  computer_science: {
    preferred: [
      { subject: 'mathematics', substitutes: ['further mathematics'] },
      { subject: 'computer science', substitutes: ['physics'] },
      { subject: 'further mathematics', substitutes: ['economics'] }
    ]
  },
  maths: {
    preferred: [
      { subject: 'mathematics' },
      { subject: 'further mathematics', substitutes: ['physics'] }
    ]
  },
  engineering: {
    preferred: [
      { subject: 'mathematics', substitutes: ['further mathematics'] },
      { subject: 'physics', substitutes: ['chemistry'] },
      { subject: 'design technology', substitutes: ['computer science'] }
    ]
  },
  life_sciences_biochem: {
    preferred: [
      { subject: 'biology' },
      { subject: 'chemistry' },
      { subject: 'mathematics', substitutes: ['physics'] }
    ]
  },
  medicine_dentistry: {
    preferred: [
      { subject: 'biology' },
      { subject: 'chemistry' },
      { subject: 'mathematics', substitutes: ['physics'] }
    ]
  },
  economics_quant: {
    preferred: [
      { subject: 'mathematics', substitutes: ['further mathematics'] },
      { subject: 'economics', substitutes: ['business'] }
    ]
  },
  business_non_quant: {
    preferred: [
      { subject: 'business', substitutes: ['economics'] },
      { subject: 'mathematics', substitutes: ['accounting'] }
    ]
  },
  law: {
    preferred: [
      { subject: 'english literature', substitutes: ['history'] },
      { subject: 'government and politics', substitutes: ['history'] }
    ]
  },
  humanities: {
    preferred: [
      { subject: 'history' },
      { subject: 'english literature', substitutes: ['philosophy'] },
      { subject: 'geography', substitutes: ['sociology'] }
    ]
  },
  creative: {
    preferred: [
      { subject: 'art and design' },
      { subject: 'design technology', substitutes: ['media studies'] }
    ]
  }
};

export const KeySubjectsRules: Record<IntendedCluster, string[]> = {
  computer_science: ['mathematics', 'computer science'],
  maths: ['mathematics', 'further mathematics'],
  engineering: ['mathematics', 'physics'],
  life_sciences_biochem: ['biology', 'chemistry'],
  medicine_dentistry: ['biology', 'chemistry'],
  economics_quant: ['mathematics', 'economics'],
  business_non_quant: ['business', 'economics'],
  law: ['english literature', 'history'],
  humanities: ['history', 'english literature'],
  creative: ['art and design', 'design technology']
};

export const RigourTable: Record<ProgrammeType, Record<string, 'HIGH' | 'MEDIUM' | 'LOW'>> = {
  // ACT students use AP-level subjects graded with letter grades —
  // same rigour mapping as A-level since subject difficulty is comparable.
  ACT: {
    mathematics: 'HIGH',
    'further mathematics': 'HIGH',
    'calculus': 'HIGH',
    'statistics': 'HIGH',
    physics: 'HIGH',
    chemistry: 'HIGH',
    biology: 'MEDIUM',
    'computer science': 'MEDIUM',
    economics: 'MEDIUM',
    history: 'MEDIUM',
    'english literature': 'MEDIUM',
    'english language': 'MEDIUM',
    geography: 'MEDIUM',
    business: 'LOW',
    'art and design': 'LOW'
  },
  IB: {
    mathematics: 'HIGH',
    'further mathematics': 'HIGH',
    physics: 'HIGH',
    chemistry: 'HIGH',
    biology: 'MEDIUM',
    'computer science': 'MEDIUM',
    economics: 'MEDIUM',
    history: 'MEDIUM',
    'english literature': 'MEDIUM',
    geography: 'MEDIUM',
    business: 'LOW',
    'art and design': 'LOW'
  },
  A_LEVEL: {
    mathematics: 'HIGH',
    'further mathematics': 'HIGH',
    physics: 'HIGH',
    chemistry: 'HIGH',
    biology: 'MEDIUM',
    'computer science': 'MEDIUM',
    economics: 'MEDIUM',
    history: 'MEDIUM',
    'english literature': 'MEDIUM',
    geography: 'MEDIUM',
    business: 'LOW',
    'art and design': 'LOW'
  }
};

const EE_RELEVANCE_RULES: Record<IntendedCluster, { direct: string[]; related: string[] }> = {
  computer_science: {
    direct: ['computer', 'computing', 'software', 'programming', 'ai', 'machine learning', 'data'],
    related: ['maths', 'mathematics', 'physics', 'engineering']
  },
  maths: {
    direct: ['maths', 'mathematics', 'algebra', 'calculus', 'statistics'],
    related: ['physics', 'economics']
  },
  engineering: {
    direct: ['engineering', 'mechanical', 'electrical', 'civil', 'design'],
    related: ['physics', 'mathematics', 'materials']
  },
  life_sciences_biochem: {
    direct: ['biology', 'biochem', 'biochemistry', 'genetics', 'molecular'],
    related: ['chemistry', 'medicine']
  },
  medicine_dentistry: {
    direct: ['medicine', 'medical', 'dentistry', 'clinical', 'anatomy'],
    related: ['biology', 'chemistry']
  },
  economics_quant: {
    direct: ['economics', 'finance', 'markets', 'econometrics'],
    related: ['mathematics', 'statistics']
  },
  business_non_quant: {
    direct: ['business', 'management', 'marketing', 'entrepreneur'],
    related: ['economics']
  },
  law: {
    direct: ['law', 'legal', 'justice', 'criminal', 'constitutional'],
    related: ['history', 'politics']
  },
  humanities: {
    direct: ['history', 'philosophy', 'literature', 'culture'],
    related: ['politics', 'sociology']
  },
  creative: {
    direct: ['art', 'design', 'music', 'creative', 'media'],
    related: ['architecture', 'theatre']
  }
};

const ADMISSIONS_TEST_REQUIREMENTS: Record<IntendedCluster, AdmissionsTestType[]> = {
  law: ['LNAT'],
  medicine_dentistry: ['UCAT'],
  computer_science: [],
  maths: [],
  engineering: [],
  life_sciences_biochem: [],
  economics_quant: ['TMUA'],
  business_non_quant: [],
  humanities: [],
  creative: []
};

const GRADE_POINTS_IB: Record<number, number> = {
  7: 5,
  6: 4,
  5: 3,
  4: 2
};

const GRADE_POINTS_ALEVEL: Record<string, number> = {
  'A*': 5,
  A: 4,
  B: 3,
  C: 2,
  D: 1,
  E: 1,
  U: 0
};

const RIGOUR_POINTS: Record<'HIGH' | 'MEDIUM' | 'LOW', number> = {
  HIGH: 5,
  MEDIUM: 3,
  LOW: 1
};

const mapAlevelGradeToRank = (grade: string) => {
  const order = ['U', 'E', 'D', 'C', 'B', 'A', 'A*'];
  const index = order.indexOf(grade);
  return index === -1 ? 0 : index + 1;
};

const calculateEligibility = (subjects: StudentSubject[], clusters: IntendedCluster[]) => {
  const subjectSet = mapSubjectSet(subjects);
  const requiredMet: Record<IntendedCluster, boolean> = {} as Record<IntendedCluster, boolean>;
  const eligibilityFlags: string[] = [];

  clusters.forEach((cluster) => {
    const rule = RequiredSubjectsRules[cluster];
    if (!rule || rule.required.length === 0) {
      requiredMet[cluster] = true;
      return;
    }

    const clusterMet = rule.required.every((required) => {
      const canonical = canonicalSubject(required.subject);
      if (subjectSet.has(canonical)) return true;
      const substitutes = (required.substitutes ?? []).map(canonicalSubject);
      return substitutes.some((sub) => subjectSet.has(sub));
    });

    requiredMet[cluster] = clusterMet;
    if (!clusterMet) {
      eligibilityFlags.push(`required_subjects_missing:${cluster}`);
    }
  });

  return { requiredMet, eligibilityFlags };
};

const calculatePreferredAlignment = (subjects: StudentSubject[], clusters: IntendedCluster[]) => {
  const subjectSet = mapSubjectSet(subjects);
  const clusterScores = clusters.map((cluster) => {
    const rule = PreferredSubjectsRules[cluster];
    if (!rule) return 0;
    const points = rule.preferred.map((item) => {
      const canonical = canonicalSubject(item.subject);
      if (subjectSet.has(canonical)) return 5;
      const substitutes = (item.substitutes ?? []).map(canonicalSubject);
      return substitutes.some((sub) => subjectSet.has(sub)) ? 3 : 0;
    });
    if (points.length === 0) return 0;
    const average = points.reduce<number>((sum, value) => sum + value, 0) / points.length;
    return average * 4;
  });
  return clusterScores.length ? Math.max(...clusterScores) : 0;
};

const calculateRigourScore = (programmeType: ProgrammeType, subjects: StudentSubject[]) => {
  const rigourMap = RigourTable[programmeType] ?? RigourTable['A_LEVEL'];
  const relevantSubjects =
    programmeType === 'IB'
      ? subjects.filter((subject) => subject.level === 'HL')
      : programmeType === 'ACT'
        // Accept A_LEVEL as well as AP. `AP` is legal in the DB enum, the domain
        // type and the zod schema — but NOTHING writes it: the intake form offers
        // only `A_LEVEL` for every non-IB student, and both the empty-row default
        // and the read-side hydration fall back to `A_LEVEL` too. So this filter
        // matched nothing for every real ACT student, `relevantSubjects` was
        // empty, and rigour returned 0 — costing up to 15 of 200 points, roughly
        // a band, while `RigourTable.ACT` sat unused as dead config.
        //
        // Accepting both is what heals the rows already in the database; fixing
        // the form alone would leave every existing ACT student at 0. The rigour
        // mapping is documented as identical to A-level's, so widening the filter
        // changes which rows are considered, not how they are scored.
        ? subjects.filter((subject) => subject.level === 'AP' || subject.level === 'A_LEVEL')
        : subjects.filter((subject) => subject.level === 'A_LEVEL');
  if (relevantSubjects.length === 0) return 0;

  const subjectPoints = relevantSubjects
    .map((subject) => {
      const key = canonicalSubject(subject.subject_name);
      const rigour = rigourMap[key] ?? 'MEDIUM';
      return RIGOUR_POINTS[rigour];
    })
    .sort((a, b) => b - a);

  const slice = subjectPoints.slice(0, 3);
  const average = slice.reduce((sum, value) => sum + value, 0) / slice.length;
  return average * 3;
};

const calculateKeySubjectGrades = (
  programmeType: ProgrammeType,
  subjects: StudentSubject[],
  clusters: IntendedCluster[]
) => {
  const subjectMap = new Map(subjects.map((subject) => [canonicalSubject(subject.subject_name), subject.grade_value]));
  const clusterScores = clusters.map((cluster) => {
    const keySubjects = KeySubjectsRules[cluster] ?? [];
    const points = keySubjects
      .map((subjectName) => {
        const grade = subjectMap.get(canonicalSubject(subjectName));
        if (grade === null || grade === undefined) return null;
        if (programmeType === 'IB') {
          const numeric = typeof grade === 'number' ? grade : Number(grade);
          return GRADE_POINTS_IB[numeric] ?? 0;
        }
        // A_LEVEL and ACT both use letter-grade strings
        const stringGrade = String(grade).toUpperCase();
        return GRADE_POINTS_ALEVEL[stringGrade] ?? 0;
      })
      .filter((value): value is number => value !== null);
    if (!points.length) return 0;
    const average = points.reduce((sum, value) => sum + value, 0) / points.length;
    return average * 2;
  });
  return clusterScores.length ? Math.max(...clusterScores) : 0;
};

const calculateIbTotalScore = (totalPoints: number | null) => {
  if (!totalPoints) return 0;
  if (totalPoints <= 24) return 0;
  if (totalPoints <= 27) return 10;
  if (totalPoints <= 29) return 20;
  if (totalPoints <= 31) return 32;
  if (totalPoints <= 33) return 42;
  if (totalPoints <= 35) return 52;
  if (totalPoints <= 37) return 60;
  if (totalPoints <= 39) return 68;
  if (totalPoints <= 41) return 74;
  if (totalPoints <= 43) return 78;
  return 80;
};

/**
 * ACT Composite → academic_performance score (0–80 scale).
 *
 * Calibrated to align with the IB and A-level tables:
 *   ACT 36      ≈ IB 43+ / A*A*A*   → 80
 *   ACT 34-35   ≈ IB 41-42 / A*AA   → 75
 *   ACT 32-33   ≈ IB 38-40 / A*AA   → 68
 *   ACT 30-31   ≈ IB 35-37 / AAB    → 58
 *   ACT 27-29   ≈ IB 32-34 / ABB    → 48
 *   ACT 24-26   ≈ IB 30-31 / BBB    → 38
 *   ACT 21-23   ≈ IB 27-29 / BBC    → 28
 *   ACT 18-20   ≈ IB 24-26 / BCC    → 18
 *   ACT < 18                        →  8
 *
 * Sources: MIT (mid-50% ACT 34-36), NYU Stern (~35), UMich (~32),
 *          McGill (~32), published middle-50% admit data 2024.
 */
export const calculateActScore = (actScore: number | null): number => {
  if (!actScore) return 0;
  if (actScore >= 36) return 80;
  if (actScore >= 34) return 75;
  if (actScore >= 32) return 68;
  if (actScore >= 30) return 58;
  if (actScore >= 27) return 48;
  if (actScore >= 24) return 38;
  if (actScore >= 21) return 28;
  if (actScore >= 18) return 18;
  return 8;
};

/**
 * Every three-grade A-level signature → `academic_performance` contribution
 * (0–80), keyed by the grades sorted best-first.
 *
 * ── Why this is a complete table rather than an if-chain ────────────────────
 * It used to be 26 `if (signature === …)` branches with `return 8` as a
 * catch-all. Over the six PASSING grades that is 56 signatures, so 30 of them
 * hit the catch-all, producing 34 strict-dominance inversions: `A*A*D` scored 8
 * while `DDD` scored 10 and `ABD` scored 40. `AAD`, `ACC`, `ACD` and `BBD` are
 * among the most common real results in the UK, so the students in the hole were
 * disproportionately those with one weak subject beside strong ones — exactly the
 * profile that most needs accurate matching. The wrong value was then persisted
 * to `student_scores`.
 *
 * ── `U` IS A GRADE. The domain is 84 signatures, not 56. ────────────────────
 * A first version of this table covered only A*–E and was described here as
 * "exhaustive". It was not: `U` (ungraded) is offered by the intake form
 * (`A_LEVEL_GRADES`), permitted by `StudentProfilePayload`, accepted by the zod
 * schema, and ranked by `mapAlevelGradeToRank` — so all 28 `U`-bearing
 * signatures missed the table and fell to `?? 0`, scoring BELOW the catch-all 8
 * they replaced. `A*A*U` scored 0, under `EEE`'s 5.
 *
 * That regression is worth remembering: it was introduced by a fix for the same
 * class of bug, it passed every gate, and the exhaustive dominance check could
 * not see it — a missing ROW is not an inversion between rows. The domain was
 * assumed rather than read off the type.
 *
 * ── How the fills were derived ──────────────────────────────────────────────
 * The originally-listed values were checked and found internally monotonic — the
 * calibration was sound, only the gaps were broken. Every original value is
 * preserved EXACTLY, and so is every value from the six-grade pass, so no score
 * moves twice.
 *
 * Gaps are filled by fitting a position-weighted grade score (1.2 : 1 : 0.8 over
 * the sorted grades) to the original values, interpolating, then clamping into
 * the range dominance permits — at least the best signature it beats, at most the
 * worst that beats it.
 *
 * HONEST CAVEAT ON THAT WEIGHTING. An earlier version of this comment claimed
 * 1.2:1:0.8 "reproduces the original table most closely (fit error 22.0 vs 36.7
 * equal-weight and 55.0 for 3:2:1)". That claim does not hold: the metric behind
 * it is degenerate under ties, and equal weighting scores better under every
 * tie-robust measure (OLS residuals, RMSE, rank discordance). The weighting is a
 * REASONABLE choice, not a demonstrably optimal one. It is kept because the
 * values it produced are monotone, tariff-consistent and already shipped —
 * re-deriving them would move student scores a second time for no proven gain.
 * If these are ever recalibrated, do it against admissions data, not curve-fit.
 *
 * ── What is actually verified ───────────────────────────────────────────────
 * Across all 84 × 84 ordered pairs there are zero STRICT dominance inversions.
 * Some dominance-comparable pairs TIE (the scale is compressed at the bottom:
 * `EEE`, `DEE` and `UUU` all sit at 5). Ties are permitted; a strictly better
 * profile scoring strictly worse is not. `__tests__/scoring/` asserts this and
 * `a-level-monotonicity.golden.json` must stay at zero.
 *
 * Grades beyond the top three are ignored (`.slice(0, 3)`), matching UK offer
 * convention.
 */
const A_LEVEL_SIGNATURE_SCORE: Readonly<Record<string, number>> = {
  'A*A*A*': 80, 'A*A*A': 80, 'A*A*B': 78, 'A*AA': 76, 'A*A*C': 74,
  AAA: 70, 'A*AB': 68, 'A*A*D': 67, 'A*AC': 64, 'A*BB': 60,
  AAB: 60, 'A*A*E': 57, 'A*AD': 55, 'A*BC': 52, 'A*A*U': 52,
  ABB: 52, AAC: 50, 'A*AE': 50, 'A*BD': 48, AAD: 46,
  ABC: 46, 'A*AU': 45, 'A*CC': 44, 'A*BE': 44, BBB: 44,
  AAE: 40, ABD: 40, ACC: 38, 'A*BU': 36, BBC: 36,
  AAU: 34, ABE: 34, BBD: 31, BCC: 30, 'A*CD': 28,
  'A*CE': 28, 'A*DD': 28, ACD: 28, 'A*CU': 28, 'A*DE': 28,
  ABU: 28, ACE: 27, ADD: 25, BBE: 25, 'A*DU': 24,
  'A*EE': 24, ACU: 24, CCC: 24, BBU: 22, ADE: 22,
  BCD: 20, BCE: 20, BDD: 18, 'A*EU': 16, CCD: 16,
  ADU: 16, BCU: 15, AEE: 15, BDE: 14, CCE: 14,
  'A*UU': 13, CDD: 13, AEU: 13, BDU: 12, CCU: 12,
  BEE: 12, CDE: 11, AUU: 10, DDD: 10, BEU: 9,
  CDU: 9, CEE: 8, DDE: 8, BUU: 7, CEU: 6,
  DDU: 6, DEE: 5, CUU: 5, DEU: 5, EEE: 5,
  DUU: 5, EEU: 5, EUU: 5, UUU: 5
};

const calculateALevelProfileScore = (academic_input: StudentProfilePayload['academic_input']) => {
  const grades = academic_input.a_level_predicted_grades;
  const subjects = academic_input.subject_list;

  let gradeValues: string[] = [];

  if (grades && Object.keys(grades).length >= 3) {
    gradeValues = Object.values(grades).filter(Boolean);
  } else {
    gradeValues = subjects
      .filter((s) => s.level === 'A_LEVEL')
      .map((s) => (typeof s.grade_value === 'string' ? s.grade_value : ''))
      .filter(Boolean);
  }

  if (gradeValues.length === 0) return 0;

  // A partial profile (one or two A-levels entered) is scored by padding the
  // missing entries with `U` and reading the SAME signature table as a complete
  // one. Every U-bearing signature already exists in it, so this invents no new
  // numbers and cannot drift from the calibrated set — which is the whole point,
  // given how much of this codebase's history is one concept declared twice.
  //
  // AUDIT FINDING D-01. This branch used to read, in full:
  //
  //     if (sorted.join('').includes('E')) return 5;
  //     return 0;
  //
  // An `E` was the only grade worth anything, so `A*A*` scored 0 while `A*E`
  // scored 5 — 95 strict dominance inversions. The comment here claimed that was
  // "not a dominance inversion" because it compared different profile shapes.
  // It was wrong: 90 of those pairs are the same shape as each other. The golden
  // harness enumerated only 3-grade signatures, so it could not see this region
  // at all — the same structural blindness that hid the U-grade regression from
  // the suite written to catch that bug class. `scoring-golden.test.ts` now
  // enumerates 1- and 2-grade signatures and checks dominance within each arity.
  //
  // Treating an unentered subject as `U` is deliberately the pessimistic reading:
  // it keeps the completion incentive pointing the right way, since adding any
  // third grade can only raise the score (also pinned by that suite).
  const sorted = gradeValues
    .map((grade) => grade.toUpperCase())
    .sort((a, b) => mapAlevelGradeToRank(b) - mapAlevelGradeToRank(a))
    .slice(0, 3);

  while (sorted.length < 3) sorted.push('U');

  return A_LEVEL_SIGNATURE_SCORE[sorted.join('')] ?? 0;
};

const calculateIbHlStrength = (subjects: StudentSubject[]) => {
  const hlScores = subjects
    .filter((subject) => subject.level === 'HL')
    .map((subject) => (typeof subject.grade_value === 'number' ? subject.grade_value : Number(subject.grade_value)))
    .filter((value) => Number.isFinite(value))
    .map((value) => {
      if (value >= 7) return 20;
      if (value === 6) return 16;
      if (value === 5) return 12;
      if (value === 4) return 6;
      return 0;
    })
    .sort((a, b) => b - a)
    .slice(0, 3);
  if (!hlScores.length) return 0;
  const sum = hlScores.reduce<number>((total, value) => total + value, 0);
  // Max 16 pts — differentiates within IB without systematically outscoring
  // equivalent A-level grades (calibrated so IB 44 stays Exceptional but
  // IB 36 doesn't beat A*A*A A-level).
  return (sum / 60) * 16;
};

const calculateEeRelevance = (cluster: IntendedCluster | null, payload: StudentProfilePayload) => {
  if (!cluster) return 0;
  const rule = EE_RELEVANCE_RULES[cluster];
  if (!rule) return 0;
  const content = [payload.academic_input.ee_subject, payload.academic_input.ee_title, payload.academic_input.ee_summary]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (!content) return 0;
  const hasDirect = rule.direct.some((keyword) => content.includes(keyword));
  if (hasDirect) return 10;
  const hasRelated = rule.related.some((keyword) => content.includes(keyword));
  return hasRelated ? 5 : 0;
};

/**
 * A-level equivalent of the EE relevance bonus.
 * Checks the student's work_experience_summary for cluster-relevant keywords.
 * Capped at 5 pts (vs IB EE's 10) — A-level projects are self-directed but
 * less formally structured than a supervised 4,000-word EE.
 */
const calculateALevelProjectBonus = (
  cluster: IntendedCluster | null,
  payload: StudentProfilePayload
): number => {
  if (!cluster) return 0;
  const rule = EE_RELEVANCE_RULES[cluster];
  if (!rule) return 0;

  // Check EPQ first (more academically rigorous than work experience summary)
  const epqContent = [payload.lifestyle_preference.epq_subject, payload.lifestyle_preference.epq_title]
    .filter(Boolean).join(' ').toLowerCase();
  if (epqContent) {
    if (rule.direct.some((kw) => epqContent.includes(kw))) return 5;
    if (rule.related.some((kw) => epqContent.includes(kw))) return 3;
  }

  // Fall back to work experience / activity highlight summary
  const highlights = (payload.activities_list ?? [])
    .map((a) => a.highlight ?? '')
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const summary = payload.lifestyle_preference.work_experience_summary ?? '';
  const content = (highlights + ' ' + summary).trim().toLowerCase();
  if (!content) return 0;
  if (rule.direct.some((kw) => content.includes(kw))) return 5;
  if (rule.related.some((kw) => content.includes(kw))) return 3;
  return 0;
};

const calculateTestsAndEnglish = (
  clusters: IntendedCluster[],
  admissionsTests: StudentAdmissionsTest[],
  englishRequired: boolean | null,
  englishStatus: string,
  englishTestType: string,
  englishScore: number | null
) => {
  const readinessFlags: string[] = [];
  const eligibilityFlags: string[] = [];

  if (englishRequired === true && ['missing', 'failed'].includes(englishStatus)) {
    readinessFlags.push('english_test_missing');
  }

  const requiredTests = new Set(
    clusters.flatMap((cluster) => ADMISSIONS_TEST_REQUIREMENTS[cluster] ?? [])
  );
  requiredTests.forEach((testType) => {
    const test = admissionsTests.find((entry) => entry.test_type === testType);
    if (!test || test.status === 'missing') {
      eligibilityFlags.push(`admissions_test_missing:${testType}`);
    }
  });

  const testScores: number[] = [];

  // LNAT — scored on raw score (0-42 scale).
  // Thresholds calibrated against published offer-holder averages:
  //   Oxford avg ~31, UCL avg ~29, King's ~27-29, Bristol/Nottingham ~25.
  const lnat = admissionsTests.find((test) => test.test_type === 'LNAT');
  if (lnat?.score_numeric !== null && lnat?.score_numeric !== undefined) {
    const score = lnat.score_numeric;
    if (score <= 19) testScores.push(0);       // below average
    else if (score <= 23) testScores.push(5);  // average (~50th pct)
    else if (score <= 26) testScores.push(9);  // above average (Bristol tier)
    else if (score <= 29) testScores.push(13); // good (King's/UCL tier)
    else if (score <= 31) testScores.push(17); // very good (UCL/Oxford borderline)
    else testScores.push(20);                  // exceptional (Oxford tier)
  }

  // UCAT — scored on percentile rank (consistent with LNAT tier spacing).
  const ucat = admissionsTests.find((test) => test.test_type === 'UCAT');
  if (ucat?.percentile !== null && ucat?.percentile !== undefined) {
    const percentile = ucat.percentile;
    if (percentile < 50) testScores.push(0);
    else if (percentile < 70) testScores.push(8);
    else if (percentile < 80) testScores.push(12);
    else if (percentile < 90) testScores.push(16);
    else testScores.push(20);
  }

  // English proficiency.
  // Native speakers (english_required = false) are implicitly proficient —
  // award equivalent to 'exceptional' so they aren't penalised vs. IELTS takers.
  if (englishRequired === false) {
    testScores.push(18);
  } else {
    if (englishStatus === 'met') {
      testScores.push(12);
    } else if (englishStatus === 'exceeds') {
      testScores.push(16);
    } else if (englishStatus === 'exceptional') {
      testScores.push(18);
    } else if (englishTestType === 'IELTS' && typeof englishScore === 'number') {
      if (englishScore >= 8) testScores.push(18);
      else if (englishScore >= 7.5) testScores.push(16);
      else if (englishScore >= 6.5) testScores.push(12);
    }
  }

  const score = testScores.length ? Math.max(...testScores) : 0;

  return { score, readinessFlags, eligibilityFlags };
};

const mapBand = (score: number): StudentBand => {
  if (score >= 168) return 'Exceptional'; // lowered from 170 — buffer for edge cases
  if (score >= 150) return 'Very strong';
  if (score >= 130) return 'Strong';
  if (score >= 110) return 'Solid';
  if (score >= 90) return 'Borderline';
  return 'Weak';
};

export const scoreStudentProfile = (payload: StudentProfilePayload): StudentScoreResult => {
  const { academic_input } = payload;
  const programmeType = academic_input.programme_type;
  const subjects = academic_input.subject_list;
  const clusters = academic_input.intended_clusters;

  const eligibility = calculateEligibility(subjects, clusters);
  const preferredAlignment = calculatePreferredAlignment(subjects, clusters);
  const rigourScore = calculateRigourScore(programmeType, subjects);
  const keySubjectGrades = calculateKeySubjectGrades(programmeType, subjects, clusters);

  // ── Academic performance: primary credential + optional "best of" ACT ──
  //
  // Strategy:
  //   • ACT students     → ACT score is the primary credential
  //   • IB / A-level     → use IB or A-level score as primary
  //   • Any pathway      → if an ACT score is also present in lifestyle_preference,
  //                        take the MAX so students applying to both UK & US aren't
  //                        penalised for having a strong ACT alongside their IB/A-level.
  const actScoreInLifestyle = payload.lifestyle_preference.act_score;
  const actEquivalent = calculateActScore(actScoreInLifestyle);

  const primaryAcademicScore =
    programmeType === 'ACT'
      ? actEquivalent
      : programmeType === 'IB'
      // Include core points (EE + TOK, max 3) in total — wizard stores subject sum only
      ? calculateIbTotalScore(
          (academic_input.ib_total_points ?? 0) + (academic_input.ib_core_points ?? 0)
        )
      : calculateALevelProfileScore(academic_input);

  // For IB / A-level profiles that also have an ACT score, take the better result.
  const academicPerformance =
    programmeType !== 'ACT' && actScoreInLifestyle
      ? Math.max(primaryAcademicScore, actEquivalent)
      : primaryAcademicScore;

  const ibHlStrength = programmeType === 'IB' ? calculateIbHlStrength(subjects) : 0;
  const eeRelevanceBonus =
    programmeType === 'IB' && clusters.length > 0 ? calculateEeRelevance(clusters[0], payload) : 0;
  // Project bonus applies to A-level and ACT students (both can have EPQ / AP research)
  const aLevelProjectBonus =
    (programmeType === 'A_LEVEL' || programmeType === 'ACT') && clusters.length > 0
      ? calculateALevelProjectBonus(clusters[0], payload)
      : 0;

  const testsAndEnglish = calculateTestsAndEnglish(
    clusters,
    academic_input.admissions_tests,
    academic_input.english_required,
    academic_input.english_status,
    academic_input.english_test_type,
    academic_input.english_score_overall
  );

  const activitiesBreakdown = calculateActivitiesScore(payload.lifestyle_preference, payload.activities_list);

  const totalRaw =
    preferredAlignment +
    rigourScore +
    keySubjectGrades +
    academicPerformance +
    ibHlStrength +
    eeRelevanceBonus +
    aLevelProjectBonus +
    testsAndEnglish.score +
    activitiesBreakdown.total;
  const totalScore = Math.min(200, Math.round(totalRaw));
  const band = mapBand(totalScore);

  const breakdown: ScoreBreakdown = {
    eligibility: {
      required_subjects_met: eligibility.requiredMet
    },
    preferred_subjects_alignment: Math.round(preferredAlignment),
    rigour_score: Math.round(rigourScore),
    key_subject_grades: Math.round(keySubjectGrades),
    academic_performance: Math.round(academicPerformance),
    ib_hl_strength: Math.round(ibHlStrength),
    ee_relevance_bonus: Math.round(eeRelevanceBonus),
    a_level_project_bonus: Math.round(aLevelProjectBonus),
    tests_and_english: Math.round(testsAndEnglish.score),
    activities: activitiesBreakdown,
    total_score: totalScore,
    student_band: band
  };

  return {
    total_score: totalScore,
    student_band: band,
    breakdown,
    eligibility_flags: [...eligibility.eligibilityFlags, ...testsAndEnglish.eligibilityFlags],
    readiness_flags: testsAndEnglish.readinessFlags
  };
};
