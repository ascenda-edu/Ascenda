/**
 * Pure form-state ↔ payload logic for the student intake wizard.
 *
 * MOVED VERBATIM out of `src/app/profile/_components/StudentIntakeForm.tsx`:
 *   - `toPayload`   was the component's `buildPayload` useCallback
 *   - `fromPayload` was the body of its `applyPayload` useCallback, with every
 *     `setX(v)` replaced by a field on the returned object
 *
 * Nothing here touches React, the DOM or storage. `fromPayload` is the only
 * export that is not referentially transparent, and only because a payload
 * activity without an `id` gets a random `localId` — inject `makeLocalId` to
 * make it deterministic in a test.
 *
 * This is a MOVE, not a rewrite: the normalisation quirks below are load-bearing
 * and are pinned by `__tests__/profile/intake-form/intake-form.characterization.test.tsx`.
 */

import {
  buildDefaultSubjects, buildNextSubject, getMaxSubjects,
  type ActivityRowState, type AdmissionsRowState, type EnglishRequiredState, type SubjectRowState
} from '@/lib/profile/intake-options';
import type {
  AdmissionsStatus, EnglishStatus, EnglishTestType, IntendedCluster,
  ProgrammeType, StudentAdmissionsTest, StudentProfilePayload, StudentSubject
} from '@/lib/profile/intake-types';

// ─── Form state ──────────────────────────────────────────────────────────────

export const buildInitialPersonalInfo = () => ({
  first_name: '', last_name: '', email: '', age: '', gender: '',
  resident_country: '', current_location_city: '', time_zone: '',
});

export const buildInitialAcademicInput = () => ({
  school_name: '', school_country: '', school_city: '', school_type: '',
  graduation_year: '', desired_start_date: '',
  intended_clusters: [] as IntendedCluster[], secondary_clusters: [] as IntendedCluster[],
  career_aspiration: '',
  ib_total_points: '', ib_core_points: '', ib_tok_grade: '', ib_ee_grade: '', ib_math_pathway: '',
  ee_subject: '', ee_title: '', ee_summary: '',
});

export const buildInitialLifestylePreference = () => ({
  teaching_style: '', desired_location_type: [] as string[], campus_size: '',
  extracurricular_interests: [] as string[], other_extracurriculars: '',
});

export const buildInitialActivities = () => ({
  leadership_roles: [] as string[],
  commitment_level: '',
  key_activities: [] as string[],
  sat_score: '',
  act_score: '',
  intl_experience: [] as string[],
  work_experience: null as boolean | null,
  work_experience_summary: '',
  ambition_statement: '',
  epq_subject: '',
  epq_title: '',
});

export type IntakePersonalInfoState = ReturnType<typeof buildInitialPersonalInfo>;
export type IntakeAcademicInputState = ReturnType<typeof buildInitialAcademicInput>;
export type IntakeLifestyleState = ReturnType<typeof buildInitialLifestylePreference>;
export type IntakeActivitiesState = ReturnType<typeof buildInitialActivities>;

/**
 * Everything the wizard collects, as the component holds it: strings for every
 * numeric field (they come from `<input>`s), `''` for "not chosen yet".
 * This is exactly the set of `useState` slices the form persists to its draft.
 */
export type IntakeFormState = {
  programmeType: ProgrammeType | '';
  nationalities: string[];
  subjects: SubjectRowState[];
  admissionsTests: AdmissionsRowState[];
  englishRequired: EnglishRequiredState;
  englishTestType: EnglishTestType;
  englishStatus: EnglishStatus;
  englishScoreOverall: string;
  personalInfo: IntakePersonalInfoState;
  academicInput: IntakeAcademicInputState;
  lifestylePreference: IntakeLifestyleState;
  activities: IntakeActivitiesState;
  activityRows: ActivityRowState[];
};

/** The wizard's state at mount, before hydration — mirrors the `useState` initialisers. */
export const buildInitialFormState = (): IntakeFormState => ({
  programmeType: '',
  nationalities: [''],
  subjects: buildDefaultSubjects(''),
  admissionsTests: [],
  englishRequired: '',
  englishTestType: 'NONE',
  englishStatus: 'missing',
  englishScoreOverall: '',
  personalInfo: buildInitialPersonalInfo(),
  academicInput: buildInitialAcademicInput(),
  lifestylePreference: buildInitialLifestylePreference(),
  activities: buildInitialActivities(),
  activityRows: [],
});

// ─── Derived values ──────────────────────────────────────────────────────────

/** `''`/whitespace → null; anything non-finite (NaN, ±Infinity) → null. */
export const parseNumber = (v: string): number | null => {
  if (!v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Trimmed, blank-dropped nationality list — the payload joins these with ', '. */
export const formatNationalities = (nationalities: string[]): string[] =>
  nationalities.map((n) => n.trim()).filter(Boolean);

/** Dynamic IB total from subject grades (sum of numeric grades 1–7). Null off the IB path. */
export const computeIbSubjectSum = (
  programmeType: ProgrammeType | '',
  subjects: SubjectRowState[]
): number | null => {
  if (programmeType !== 'IB') return null;
  return subjects.reduce((acc, s) => {
    const g = parseNumber(s.grade_value);
    return g !== null && g >= 1 && g <= 7 ? acc + g : acc;
  }, 0);
};

export const shouldShowEnglishScore = (
  englishRequired: EnglishRequiredState,
  englishTestType: EnglishTestType
): boolean => englishRequired !== 'no' && ['IELTS', 'TOEFL', 'DUOLINGO'].includes(englishTestType);

export const shouldShowAdmissionsTests = (
  intendedClusters: IntendedCluster[],
  admissionsTests: AdmissionsRowState[]
): boolean =>
  intendedClusters.some((c) =>
    ['law', 'medicine_dentistry', 'maths', 'engineering', 'computer_science', 'economics_quant'].includes(c)
  ) || admissionsTests.length > 0;

// ─── Form state → payload ────────────────────────────────────────────────────

export const toPayload = (state: IntakeFormState): StudentProfilePayload => {
  const {
    subjects, programmeType, admissionsTests, personalInfo, nationalities,
    academicInput, englishRequired, englishTestType, englishStatus,
    englishScoreOverall, lifestylePreference, activities, activityRows,
  } = state;

  const formattedNationalities = formatNationalities(nationalities);
  const ibSubjectSum = computeIbSubjectSum(programmeType, subjects);
  const showEnglishScore = shouldShowEnglishScore(englishRequired, englishTestType);

  const subjectList: StudentSubject[] = subjects.map((s) => ({
    subject_name: s.subject_name.trim(),
    level: s.level,
    grade_value: programmeType === 'IB'
      ? parseNumber(s.grade_value)
      : s.grade_value.trim() ? s.grade_value.trim() : null,
  }));

  const aLevelPredicted = programmeType === 'A_LEVEL'
    ? Object.fromEntries(
      subjectList
        .filter((s) => typeof s.grade_value === 'string' && s.subject_name)
        .map((s) => [s.subject_name, s.grade_value as 'A*' | 'A' | 'B' | 'C' | 'D' | 'E' | 'U'])
    )
    : null;

  const admissionsPayload: StudentAdmissionsTest[] = admissionsTests
    .filter((t) => t.test_type !== 'NONE')
    .map((t) => ({
      test_type: t.test_type,
      status: (t.status || 'missing') as AdmissionsStatus,
      score_numeric: parseNumber(t.score_numeric),
      percentile: parseNumber(t.percentile),
    }));

  return {
    personal_information: {
      first_name: personalInfo.first_name.trim(),
      last_name: personalInfo.last_name.trim(),
      email: personalInfo.email.trim(),
      phone: null,
      nationality: formattedNationalities.join(', '),
      age: parseNumber(personalInfo.age),
      gender: personalInfo.gender ? (personalInfo.gender as StudentProfilePayload['personal_information']['gender']) : null,
      resident_country: personalInfo.resident_country.trim(),
      current_location_city: personalInfo.current_location_city.trim() || null,
      time_zone: personalInfo.time_zone.trim() || null,
    },
    academic_input: {
      programme_type: programmeType as ProgrammeType,
      school_name: academicInput.school_name.trim(),
      school_country: academicInput.school_country.trim(),
      school_city: academicInput.school_city.trim() || null,
      school_type: academicInput.school_type ? (academicInput.school_type as StudentProfilePayload['academic_input']['school_type']) : null,
      language_of_instruction: null,
      graduation_year: Number(academicInput.graduation_year),
      desired_start_date: academicInput.desired_start_date || null,
      intended_clusters: academicInput.intended_clusters,
      secondary_clusters: academicInput.secondary_clusters,
      career_aspiration: academicInput.career_aspiration.trim() || null,
      subject_list: subjectList,
      ib_total_points: programmeType === 'IB' ? ibSubjectSum : null,
      ib_core_points: programmeType === 'IB' ? parseNumber(academicInput.ib_core_points) : null,
      ib_tok_grade: programmeType === 'IB' && academicInput.ib_tok_grade
        ? (academicInput.ib_tok_grade as StudentProfilePayload['academic_input']['ib_tok_grade']) : null,
      ib_ee_grade: programmeType === 'IB' && academicInput.ib_ee_grade
        ? (academicInput.ib_ee_grade as StudentProfilePayload['academic_input']['ib_ee_grade']) : null,
      ib_math_pathway: programmeType === 'IB' && academicInput.ib_math_pathway
        ? (academicInput.ib_math_pathway as StudentProfilePayload['academic_input']['ib_math_pathway']) : null,
      ee_subject: programmeType === 'IB' ? academicInput.ee_subject.trim() || null : null,
      ee_title: programmeType === 'IB' ? academicInput.ee_title.trim() || null : null,
      ee_summary: programmeType === 'IB' ? academicInput.ee_summary.trim() || null : null,
      a_level_predicted_grades: aLevelPredicted,
      english_required: englishRequired === 'yes' ? true : englishRequired === 'no' ? false : null,
      english_test_type: englishTestType,
      english_status: englishStatus,
      english_score_overall: showEnglishScore ? parseNumber(englishScoreOverall) : null,
      admissions_tests: admissionsPayload,
    },
    lifestyle_preference: {
      teaching_style: lifestylePreference.teaching_style ? (lifestylePreference.teaching_style as StudentProfilePayload['lifestyle_preference']['teaching_style']) : null,
      desired_location_type: (() => {
        const arr = lifestylePreference.desired_location_type;
        if (!arr || arr.length === 0) return null;
        // Store comma-separated; scoring treats multi-select same as no_preference
        return arr.join(',') as StudentProfilePayload['lifestyle_preference']['desired_location_type'];
      })(),
      campus_size: lifestylePreference.campus_size ? (lifestylePreference.campus_size as StudentProfilePayload['lifestyle_preference']['campus_size']) : null,
      extracurricular_interests: lifestylePreference.extracurricular_interests,
      other_extracurriculars: lifestylePreference.other_extracurriculars.trim() || null,
      leadership_roles: activities.leadership_roles,
      commitment_level: activities.commitment_level || null,
      // Derive legacy key_activities from structured rows for backward-compat scoring
      key_activities: activityRows.length > 0
        ? [...new Set(activityRows.map((r) => r.category).filter(Boolean))]
        : activities.key_activities,
      sat_score: parseNumber(activities.sat_score),
      act_score: parseNumber(activities.act_score),
      // Derive intl_experience from activity levels for backward-compat scoring
      intl_experience: activityRows.some((r) => r.level === 'National' || r.level === 'International')
        ? ['International competition']
        : activities.intl_experience,
      work_experience: activities.work_experience,
      work_experience_summary: activities.work_experience_summary.trim() || null,
      ambition_statement: activities.ambition_statement.trim() || null,
      epq_subject: (programmeType === 'A_LEVEL' || programmeType === 'ACT')
        ? activities.epq_subject.trim() || null : null,
      epq_title: (programmeType === 'A_LEVEL' || programmeType === 'ACT')
        ? activities.epq_title.trim() || null : null,
    } as StudentProfilePayload['lifestyle_preference'],
    activities_list: activityRows
      .filter((r) => r.category)
      .map((r, i) => ({
        category: r.category,
        level: (r.level || null) as any,
        duration: (r.duration || null) as any,
        highlight: r.highlight.trim() || null,
        sort_order: i,
      })),
  };
};

// ─── Payload → form state ────────────────────────────────────────────────────

const randomLocalId = () => Math.random().toString(36).slice(2);

/**
 * Hydrate the wizard from a saved profile.
 *
 * `makeLocalId` exists only so tests can be deterministic: it is used for
 * activity rows the payload stored without an `id`, and the value never reaches
 * the submitted payload.
 */
export const fromPayload = (
  payload: StudentProfilePayload,
  makeLocalId: () => string = randomLocalId
): IntakeFormState => {
  const { personal_information: pi, academic_input: ai, lifestyle_preference: lp } = payload;

  const programmeType: ProgrammeType | '' = ai.programme_type ?? '';

  const subjects: SubjectRowState[] = (() => {
    const prog = programmeType;
    const max = getMaxSubjects(prog);
    const minRows = prog === 'IB' ? 6 : 3;
    const base = ai.subject_list ?? [];
    const mapped: SubjectRowState[] = base.slice(0, max).map((s) => ({
      subject_name: s.subject_name ?? '',
      level: s.level ?? (prog === 'IB' ? 'HL' : 'A_LEVEL'),
      grade_value: typeof s.grade_value === 'number' ? String(s.grade_value) : s.grade_value ?? '',
    }));
    while (mapped.length < minRows) mapped.push(buildNextSubject(prog, mapped));
    return mapped;
  })();

  const storedLoc = lp.desired_location_type ?? '';
  // Migrate legacy 'london' → 'capital_city'; split comma-sep multi-select
  const locArray = storedLoc
    ? storedLoc.split(',').map((s) => s.trim() === 'london' ? 'capital_city' : s.trim()).filter(Boolean)
    : [];

  return {
    programmeType,
    personalInfo: {
      first_name: pi.first_name ?? '', last_name: pi.last_name ?? '', email: pi.email ?? '',
      age: pi.age !== null && pi.age !== undefined ? String(pi.age) : '',
      gender: pi.gender ?? '', resident_country: pi.resident_country ?? '',
      current_location_city: pi.current_location_city ?? '', time_zone: pi.time_zone ?? '',
    },
    nationalities: pi.nationality
      ? pi.nationality.split(',').map((s) => s.trim()).filter(Boolean)
      : [''],
    academicInput: {
      school_name: ai.school_name ?? '', school_country: ai.school_country ?? '',
      school_city: ai.school_city ?? '', school_type: ai.school_type ?? '',
      graduation_year: ai.graduation_year ? String(ai.graduation_year) : '',
      desired_start_date: ai.desired_start_date ?? '',
      intended_clusters: ai.intended_clusters ?? [], secondary_clusters: ai.secondary_clusters ?? [],
      career_aspiration: ai.career_aspiration ?? '',
      ib_total_points: ai.ib_total_points !== null && ai.ib_total_points !== undefined ? String(ai.ib_total_points) : '',
      ib_core_points: ai.ib_core_points !== null && ai.ib_core_points !== undefined ? String(ai.ib_core_points) : '',
      ib_tok_grade: ai.ib_tok_grade ?? '', ib_ee_grade: ai.ib_ee_grade ?? '',
      ib_math_pathway: ai.ib_math_pathway ?? '',
      ee_subject: ai.ee_subject ?? '', ee_title: ai.ee_title ?? '', ee_summary: ai.ee_summary ?? '',
    },
    subjects,
    admissionsTests: (ai.admissions_tests ?? []).map((t) => ({
      test_type: t.test_type, status: t.status,
      score_numeric: t.score_numeric !== null && t.score_numeric !== undefined ? String(t.score_numeric) : '',
      percentile: t.percentile !== null && t.percentile !== undefined ? String(t.percentile) : '',
    })),
    englishRequired:
      ai.english_required === true ? 'yes' : ai.english_required === false ? 'no' : 'not_sure',
    englishTestType: ai.english_test_type ?? 'NONE',
    englishStatus: ai.english_status ?? 'missing',
    englishScoreOverall:
      ai.english_score_overall !== null && ai.english_score_overall !== undefined ? String(ai.english_score_overall) : '',
    lifestylePreference: {
      teaching_style: lp.teaching_style ?? '',
      desired_location_type: locArray,
      campus_size: lp.campus_size ?? '',
      extracurricular_interests: lp.extracurricular_interests ?? [],
      other_extracurriculars: lp.other_extracurriculars ?? '',
    },
    activities: {
      leadership_roles: lp.leadership_roles ?? [],
      commitment_level: lp.commitment_level ?? '',
      key_activities: lp.key_activities ?? [],
      sat_score: lp.sat_score !== null && lp.sat_score !== undefined ? String(lp.sat_score) : '',
      act_score: lp.act_score !== null && lp.act_score !== undefined ? String(lp.act_score) : '',
      intl_experience: lp.intl_experience ?? [],
      work_experience: lp.work_experience ?? null,
      work_experience_summary: lp.work_experience_summary ?? '',
      ambition_statement: lp.ambition_statement ?? '',
      epq_subject: lp.epq_subject ?? '',
      epq_title: lp.epq_title ?? '',
    },
    activityRows: (payload.activities_list ?? []).map((a) => ({
      localId: a.id ?? makeLocalId(),
      category: a.category ?? '',
      level: a.level ?? '',
      duration: a.duration ?? '',
      highlight: a.highlight ?? '',
    })),
  };
};
