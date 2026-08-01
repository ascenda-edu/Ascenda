/**
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │  UNIT TESTS — src/lib/profile/intake-logic.ts                             │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * `toPayload` / `fromPayload` were `buildPayload` (StudentIntakeForm :1088) and
 * `applyPayload` (:719) until they were lifted out of the component unchanged.
 * The characterization suite
 * (`__tests__/profile/intake-form/intake-form.characterization.test.tsx`) still
 * covers them end-to-end through the DOM; this file covers the same functions
 * DIRECTLY, which is both ~200× faster and able to reach normalisation branches
 * the wizard UI cannot produce (an ACT programme type, a payload with 9 subject
 * rows, a legacy `london` location).
 *
 * These are unit tests, not characterization tests: they assert what the
 * normalisation SHOULD do and are safe to update if the rule deliberately
 * changes. The round-trip block at the bottom is the exception — it mirrors the
 * fixed-point contract the characterization suite depends on, so a failure there
 * means hydrate-then-submit has started losing data.
 */

import {
  buildInitialFormState, computeIbSubjectSum, formatNationalities, fromPayload,
  parseNumber, shouldShowAdmissionsTests, shouldShowEnglishScore, toPayload,
  type IntakeFormState
} from '@/lib/profile/intake-logic';
import type { StudentProfilePayload } from '@/lib/profile/intake-types';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** A complete form state with the named slices overridden. */
const stateWith = (patch: Partial<IntakeFormState>): IntakeFormState => ({
  ...buildInitialFormState(),
  ...patch
});

const subject = (subject_name: string, level: 'HL' | 'SL' | 'A_LEVEL' | 'AP', grade_value: string) =>
  ({ subject_name, level, grade_value });

const activityRow = (patch: Partial<{ localId: string; category: string; level: string; duration: string; highlight: string }> = {}) => ({
  localId: 'row', category: '', level: '', duration: '', highlight: '', ...patch
});

// ─────────────────────────────────────────────────────────────────────────────
describe('parseNumber', () => {
  it.each([
    ['', null],
    ['   ', null],
    ['0', 0],
    ['7', 7],
    ['7.5', 7.5],
    ['  12  ', 12],
    ['-3', -3],
    ['1e3', 1000]
  ])('parses %j as %p', (input, expected) => {
    expect(parseNumber(input)).toBe(expected);
  });

  it('returns null for anything non-finite rather than NaN or Infinity', () => {
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('Infinity')).toBeNull();
    expect(parseNumber('-Infinity')).toBeNull();
    expect(parseNumber('12px')).toBeNull();
  });
});

describe('formatNationalities', () => {
  it('trims each entry, drops blanks, and preserves order', () => {
    expect(formatNationalities([' Nigeria ', '', '  ', 'United Kingdom'])).toEqual(['Nigeria', 'United Kingdom']);
  });

  it("collapses the wizard's one-empty-row initial state to nothing", () => {
    expect(formatNationalities([''])).toEqual([]);
  });

  it('keeps duplicates — de-duping is not its job', () => {
    expect(formatNationalities(['France', 'France'])).toEqual(['France', 'France']);
  });
});

describe('computeIbSubjectSum', () => {
  it('is null off the IB path', () => {
    const subjects = [subject('Mathematics', 'A_LEVEL', '7')];
    expect(computeIbSubjectSum('A_LEVEL', subjects)).toBeNull();
    expect(computeIbSubjectSum('ACT', subjects)).toBeNull();
    expect(computeIbSubjectSum('', subjects)).toBeNull();
  });

  it('sums the numeric grades', () => {
    expect(computeIbSubjectSum('IB', [
      subject('Mathematics', 'HL', '7'),
      subject('Economics', 'HL', '6'),
      subject('Physics', 'SL', '5')
    ])).toBe(18);
  });

  it('ignores blank rows and grades outside 1–7', () => {
    expect(computeIbSubjectSum('IB', [
      subject('Mathematics', 'HL', '7'),
      subject('', 'HL', ''),
      subject('Physics', 'HL', '0'),
      subject('Chemistry', 'HL', '8'),
      subject('History', 'SL', 'A')
    ])).toBe(7);
  });

  it('is 0, not null, for an IB student who has entered no grades', () => {
    expect(computeIbSubjectSum('IB', [])).toBe(0);
  });
});

describe('shouldShowEnglishScore', () => {
  it('is true only for a scored test on a non-waived path', () => {
    expect(shouldShowEnglishScore('yes', 'IELTS')).toBe(true);
    expect(shouldShowEnglishScore('not_sure', 'TOEFL')).toBe(true);
    expect(shouldShowEnglishScore('', 'DUOLINGO')).toBe(true);
  });

  it('is false when English is not required, whatever the test type says', () => {
    expect(shouldShowEnglishScore('no', 'IELTS')).toBe(false);
    expect(shouldShowEnglishScore('no', 'WAIVER')).toBe(false);
  });

  it('is false for the unscored test types', () => {
    expect(shouldShowEnglishScore('yes', 'WAIVER')).toBe(false);
    expect(shouldShowEnglishScore('yes', 'NONE')).toBe(false);
  });
});

describe('shouldShowAdmissionsTests', () => {
  it('is true for the six clusters that imply an entrance test', () => {
    for (const cluster of ['law', 'medicine_dentistry', 'maths', 'engineering', 'computer_science', 'economics_quant'] as const) {
      expect(shouldShowAdmissionsTests([cluster], [])).toBe(true);
    }
  });

  it('is false for a cluster with no admissions test and no rows', () => {
    expect(shouldShowAdmissionsTests(['creative'], [])).toBe(false);
    expect(shouldShowAdmissionsTests([], [])).toBe(false);
  });

  it('stays true once a row exists, so a student can never lose entered rows', () => {
    expect(shouldShowAdmissionsTests(['creative'], [
      { test_type: 'LNAT', status: 'booked', score_numeric: '', percentile: '' }
    ])).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('fromPayload — hydration', () => {
  const base = (): StudentProfilePayload => ({
    personal_information: {
      first_name: 'Amara', last_name: 'Okonkwo', email: 'a@b.example', phone: null,
      nationality: 'Nigeria, United Kingdom', age: 17, gender: 'female',
      resident_country: 'Thailand', current_location_city: 'Bangkok', time_zone: 'Asia/Bangkok'
    },
    academic_input: {
      programme_type: 'IB', school_name: 'BIS', school_country: 'Thailand', school_city: null,
      school_type: 'international_school', language_of_instruction: null, graduation_year: 2027,
      desired_start_date: null, intended_clusters: [], secondary_clusters: [], career_aspiration: null,
      subject_list: [], ib_total_points: 41, ib_core_points: 2, ib_tok_grade: 'A', ib_ee_grade: 'B',
      ib_math_pathway: 'AA_HL', ee_subject: null, ee_title: null, ee_summary: null,
      a_level_predicted_grades: null, english_required: null, english_test_type: 'NONE',
      english_status: 'missing', english_score_overall: null, admissions_tests: []
    },
    lifestyle_preference: {
      teaching_style: null, desired_location_type: null, campus_size: null,
      extracurricular_interests: [], other_extracurriculars: null, leadership_roles: [],
      commitment_level: null, key_activities: [], sat_score: null, act_score: null,
      intl_experience: [], work_experience: null, work_experience_summary: null,
      ambition_statement: null, epq_subject: null, epq_title: null
    },
    activities_list: []
  });

  it('splits the comma-joined nationality string back into rows', () => {
    expect(fromPayload(base()).nationalities).toEqual(['Nigeria', 'United Kingdom']);
  });

  it('falls back to one empty row when no nationality was stored', () => {
    const p = base();
    p.personal_information.nationality = '';
    expect(fromPayload(p).nationalities).toEqual(['']);
  });

  it('stringifies every numeric field, because the inputs are text', () => {
    const p = base();
    p.personal_information.age = 0;
    p.academic_input.english_score_overall = 7.5;
    p.lifestyle_preference.sat_score = 1480;
    const state = fromPayload(p);
    expect(state.personalInfo.age).toBe('0');
    expect(state.academicInput.graduation_year).toBe('2027');
    expect(state.academicInput.ib_core_points).toBe('2');
    expect(state.englishScoreOverall).toBe('7.5');
    expect(state.activities.sat_score).toBe('1480');
  });

  it("migrates the legacy 'london' location value to 'capital_city'", () => {
    const p = base();
    p.lifestyle_preference.desired_location_type = 'london, coastal';
    expect(fromPayload(p).lifestylePreference.desired_location_type).toEqual(['capital_city', 'coastal']);
  });

  it('maps english_required true/false/null onto the three-way radio', () => {
    const yes = base(); yes.academic_input.english_required = true;
    const no = base(); no.academic_input.english_required = false;
    expect(fromPayload(yes).englishRequired).toBe('yes');
    expect(fromPayload(no).englishRequired).toBe('no');
    expect(fromPayload(base()).englishRequired).toBe('not_sure');
  });

  describe('subject rows', () => {
    it('pads an IB profile out to six rows, capping Higher Level at three', () => {
      const p = base();
      p.academic_input.subject_list = [
        { subject_name: 'Mathematics', level: 'HL', grade_value: 7 },
        { subject_name: 'Physics', level: 'HL', grade_value: 6 }
      ];
      const rows = fromPayload(p).subjects;
      expect(rows).toHaveLength(6);
      expect(rows.filter((r) => r.level === 'HL')).toHaveLength(3);
      expect(rows.filter((r) => r.level === 'SL')).toHaveLength(3);
      // The two real rows survive untouched; the padding is blank.
      expect(rows.slice(2).every((r) => r.subject_name === '' && r.grade_value === '')).toBe(true);
    });

    it('pads an A-Level profile to three rows', () => {
      const p = base();
      p.academic_input.programme_type = 'A_LEVEL';
      p.academic_input.subject_list = [{ subject_name: 'Mathematics', level: 'A_LEVEL', grade_value: 'A*' }];
      const rows = fromPayload(p).subjects;
      expect(rows).toHaveLength(3);
      expect(rows.every((r) => r.level === 'A_LEVEL')).toBe(true);
    });

    it('truncates to the programme ceiling — 4 for A-Level, 6 for IB', () => {
      const aLevel = base();
      aLevel.academic_input.programme_type = 'A_LEVEL';
      aLevel.academic_input.subject_list = Array.from({ length: 9 }, (_, i) => ({
        subject_name: `S${i}`, level: 'A_LEVEL' as const, grade_value: 'A'
      }));
      expect(fromPayload(aLevel).subjects).toHaveLength(4);

      const ib = base();
      ib.academic_input.subject_list = Array.from({ length: 9 }, (_, i) => ({
        subject_name: `S${i}`, level: 'SL' as const, grade_value: 5
      }));
      expect(fromPayload(ib).subjects).toHaveLength(6);
    });

    it('stringifies numeric IB grades', () => {
      const p = base();
      p.academic_input.subject_list = [{ subject_name: 'Mathematics', level: 'HL', grade_value: 7 }];
      expect(fromPayload(p).subjects[0].grade_value).toBe('7');
    });
  });

  it('reuses a stored activity id as the row key, and mints one only when absent', () => {
    const p = base();
    p.activities_list = [
      { id: 'db-uuid', category: 'Sport', level: 'National', duration: '1–2 years', highlight: null, sort_order: 0 },
      { category: 'Music', level: null, duration: null, highlight: 'Grade 8', sort_order: 1 }
    ];
    const rows = fromPayload(p, () => 'minted').activityRows;
    expect(rows.map((r) => r.localId)).toEqual(['db-uuid', 'minted']);
    expect(rows[1]).toEqual({ localId: 'minted', category: 'Music', level: '', duration: '', highlight: 'Grade 8' });
  });

  it('never returns null or undefined into a text input', () => {
    const state = fromPayload(base());
    const flat = [
      ...Object.values(state.personalInfo),
      ...Object.values(state.academicInput),
      ...Object.values(state.lifestylePreference)
    ];
    expect(flat.some((v) => v === null || v === undefined)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('toPayload — normalisation', () => {
  it('recomputes ib_total_points from the subject rows, ignoring the stored total', () => {
    const state = stateWith({
      programmeType: 'IB',
      academicInput: { ...buildInitialFormState().academicInput, ib_total_points: '45' },
      subjects: [
        subject('Mathematics', 'HL', '7'),
        subject('Economics', 'HL', '6'),
        subject('Physics', 'SL', '5')
      ]
    });
    expect(toPayload(state).academic_input.ib_total_points).toBe(18);
  });

  it('nulls every IB-only field off the IB path', () => {
    const filledIb = {
      ...buildInitialFormState().academicInput,
      ib_core_points: '3', ib_tok_grade: 'A', ib_ee_grade: 'B', ib_math_pathway: 'AA_HL',
      ee_subject: 'Economics', ee_title: 'T', ee_summary: 'S'
    };
    const ai = toPayload(stateWith({ programmeType: 'A_LEVEL', academicInput: filledIb })).academic_input;
    expect(ai.ib_total_points).toBeNull();
    expect(ai.ib_core_points).toBeNull();
    expect(ai.ib_tok_grade).toBeNull();
    expect(ai.ib_ee_grade).toBeNull();
    expect(ai.ib_math_pathway).toBeNull();
    expect(ai.ee_subject).toBeNull();
    expect(ai.ee_title).toBeNull();
    expect(ai.ee_summary).toBeNull();
  });

  it('derives a_level_predicted_grades from the rows, and only on the A-Level path', () => {
    const subjects = [
      subject('Mathematics', 'A_LEVEL', 'A*'),
      subject('Physics', 'A_LEVEL', 'A'),
      subject('', 'A_LEVEL', 'B')          // no name — excluded
    ];
    expect(toPayload(stateWith({ programmeType: 'A_LEVEL', subjects })).academic_input.a_level_predicted_grades)
      .toEqual({ Mathematics: 'A*', Physics: 'A' });
    expect(toPayload(stateWith({ programmeType: 'IB', subjects })).academic_input.a_level_predicted_grades)
      .toBeNull();
  });

  it('keeps EPQ for A-Level and ACT students and nulls it for IB', () => {
    const activities = { ...buildInitialFormState().activities, epq_subject: ' Physics ', epq_title: ' Tokamaks ' };
    expect(toPayload(stateWith({ programmeType: 'A_LEVEL', activities })).lifestyle_preference)
      .toMatchObject({ epq_subject: 'Physics', epq_title: 'Tokamaks' });
    expect(toPayload(stateWith({ programmeType: 'ACT', activities })).lifestyle_preference)
      .toMatchObject({ epq_subject: 'Physics', epq_title: 'Tokamaks' });
    expect(toPayload(stateWith({ programmeType: 'IB', activities })).lifestyle_preference)
      .toMatchObject({ epq_subject: null, epq_title: null });
  });

  describe('activities', () => {
    it('drops rows with no category and renumbers sort_order from zero', () => {
      const activityRows = [
        activityRow({ localId: 'a', category: '' }),
        activityRow({ localId: 'b', category: 'Sport', level: 'National', duration: '1–2 years', highlight: ' Captain ' }),
        activityRow({ localId: 'c', category: '' }),
        activityRow({ localId: 'd', category: 'Music' })
      ];
      expect(toPayload(stateWith({ activityRows })).activities_list).toEqual([
        { category: 'Sport', level: 'National', duration: '1–2 years', highlight: 'Captain', sort_order: 0 },
        { category: 'Music', level: null, duration: null, highlight: null, sort_order: 1 }
      ]);
    });

    it('derives key_activities from the distinct row categories', () => {
      const activityRows = [
        activityRow({ localId: 'a', category: 'Sport' }),
        activityRow({ localId: 'b', category: 'Sport' }),
        activityRow({ localId: 'c', category: 'Music' })
      ];
      expect(toPayload(stateWith({ activityRows })).lifestyle_preference.key_activities)
        .toEqual(['Sport', 'Music']);
    });

    it('falls back to the legacy key_activities list when there are no rows', () => {
      const activities = { ...buildInitialFormState().activities, key_activities: ['Legacy'] };
      expect(toPayload(stateWith({ activities, activityRows: [] })).lifestyle_preference.key_activities)
        .toEqual(['Legacy']);
    });

    it('sets intl_experience from any National-or-above row, else keeps the stored list', () => {
      const activities = { ...buildInitialFormState().activities, intl_experience: ['Exchange programme'] };
      const national = [activityRow({ category: 'Sport', level: 'National' })];
      const school = [activityRow({ category: 'Sport', level: 'School' })];
      expect(toPayload(stateWith({ activities, activityRows: national })).lifestyle_preference.intl_experience)
        .toEqual(['International competition']);
      expect(toPayload(stateWith({ activities, activityRows: school })).lifestyle_preference.intl_experience)
        .toEqual(['Exchange programme']);
    });
  });

  describe('admissions tests', () => {
    it('drops the NONE sentinel row', () => {
      const admissionsTests = [
        { test_type: 'NONE' as const, status: 'missing' as const, score_numeric: '', percentile: '' }
      ];
      expect(toPayload(stateWith({ admissionsTests })).academic_input.admissions_tests).toEqual([]);
    });

    it("defaults an unset status to 'missing' and parses the numbers", () => {
      const admissionsTests = [
        { test_type: 'LNAT' as const, status: '' as const, score_numeric: '24.5', percentile: '' }
      ];
      expect(toPayload(stateWith({ admissionsTests })).academic_input.admissions_tests).toEqual([
        { test_type: 'LNAT', status: 'missing', score_numeric: 24.5, percentile: null }
      ]);
    });
  });

  it('joins the location multi-select with commas, or nulls it when empty', () => {
    const lifestylePreference = {
      ...buildInitialFormState().lifestylePreference,
      desired_location_type: ['capital_city', 'major_city']
    };
    expect(toPayload(stateWith({ lifestylePreference })).lifestyle_preference.desired_location_type)
      .toBe('capital_city,major_city');
    expect(toPayload(stateWith({})).lifestyle_preference.desired_location_type).toBeNull();
  });

  it('only submits an English score when the chosen test actually has one', () => {
    const scored = stateWith({ englishRequired: 'yes', englishTestType: 'IELTS', englishScoreOverall: '7.5' });
    const waived = stateWith({ englishRequired: 'no', englishTestType: 'WAIVER', englishScoreOverall: '7.5' });
    expect(toPayload(scored).academic_input.english_score_overall).toBe(7.5);
    expect(toPayload(waived).academic_input.english_score_overall).toBeNull();
  });

  it('trims free text and turns the now-empty strings into null', () => {
    const personalInfo = {
      ...buildInitialFormState().personalInfo,
      first_name: '  Amara  ', last_name: 'Okonkwo', email: ' a@b.example ',
      resident_country: ' Thailand ', current_location_city: '   ', time_zone: '  '
    };
    const pi = toPayload(stateWith({ personalInfo })).personal_information;
    expect(pi).toMatchObject({
      first_name: 'Amara',
      email: 'a@b.example',
      resident_country: 'Thailand',
      current_location_city: null,
      time_zone: null
    });
  });

  it('always writes phone and language_of_instruction as null — the wizard collects neither', () => {
    const payload = toPayload(stateWith({}));
    expect(payload.personal_information.phone).toBeNull();
    expect(payload.academic_input.language_of_instruction).toBeNull();
  });

  it('joins nationalities with ", " for storage', () => {
    expect(toPayload(stateWith({ nationalities: [' Nigeria ', '', 'United Kingdom'] })).personal_information.nationality)
      .toBe('Nigeria, United Kingdom');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
/**
 * Fixed points. `toPayload(fromPayload(p))` must equal `p` for a payload that
 * already satisfies every derivation rule — this is what makes "open a saved
 * profile, submit without editing" lossless, and it is the contract the
 * characterization suite's hydration tests lean on.
 */
describe('round trip', () => {
  const IB_PAYLOAD: StudentProfilePayload = {
    personal_information: {
      first_name: 'Amara', last_name: 'Okonkwo', email: 'amara@school.example', phone: null,
      nationality: 'Nigeria, United Kingdom', age: 17, gender: 'female',
      resident_country: 'Thailand', current_location_city: 'Bangkok', time_zone: 'Asia/Bangkok'
    },
    academic_input: {
      programme_type: 'IB', school_name: 'Bangkok International School',
      school_country: 'Thailand', school_city: 'Bangkok', school_type: 'international_school',
      language_of_instruction: null, graduation_year: 2027, desired_start_date: '2027-09-01',
      intended_clusters: ['economics_quant'], secondary_clusters: ['maths', 'business_non_quant'],
      career_aspiration: 'Economist',
      subject_list: [
        { subject_name: 'Mathematics', level: 'HL', grade_value: 7 },
        { subject_name: 'Economics', level: 'HL', grade_value: 6 },
        { subject_name: 'Physics', level: 'HL', grade_value: 6 },
        { subject_name: 'English Literature', level: 'SL', grade_value: 6 },
        { subject_name: 'History', level: 'SL', grade_value: 5 },
        { subject_name: 'Modern Languages', level: 'SL', grade_value: 5 }
      ],
      ib_total_points: 35, ib_core_points: 2, ib_tok_grade: 'A', ib_ee_grade: 'B',
      ib_math_pathway: 'AA_HL', ee_subject: 'Economics', ee_title: 'Microfinance and poverty',
      ee_summary: 'A short study of microfinance in West Africa.',
      a_level_predicted_grades: null, english_required: true, english_test_type: 'IELTS',
      english_status: 'booked', english_score_overall: 7.5,
      admissions_tests: [{ test_type: 'TMUA', status: 'booked', score_numeric: null, percentile: null }]
    },
    lifestyle_preference: {
      teaching_style: 'academic', desired_location_type: 'capital_city,major_city',
      campus_size: 'large', extracurricular_interests: ['Debate / public speaking', 'Volunteering'],
      other_extracurriculars: 'Chess club', leadership_roles: ['Class President'],
      commitment_level: 'deep', key_activities: ['Debate / Model UN', 'Community Service'],
      sat_score: 1480, act_score: null, intl_experience: ['International competition'],
      work_experience: true, work_experience_summary: 'Summer internship at a bank.',
      ambition_statement: 'I want to read economics and work in development finance.',
      epq_subject: null, epq_title: null
    },
    activities_list: [
      { category: 'Debate / Model UN', level: 'International', duration: '3–4 years', highlight: 'Best delegate, THIMUN', sort_order: 0 },
      { category: 'Community Service', level: 'School', duration: '1–2 years', highlight: null, sort_order: 1 }
    ]
  };

  const A_LEVEL_PAYLOAD: StudentProfilePayload = {
    personal_information: {
      first_name: 'Tom', last_name: 'Whitfield', email: 'tom@school.example', phone: null,
      nationality: 'United Kingdom', age: null, gender: null,
      resident_country: 'United Kingdom', current_location_city: null, time_zone: null
    },
    academic_input: {
      programme_type: 'A_LEVEL', school_name: 'Northgate Grammar',
      school_country: 'United Kingdom', school_city: null, school_type: 'state_public',
      language_of_instruction: null, graduation_year: 2026, desired_start_date: null,
      intended_clusters: ['engineering'], secondary_clusters: [], career_aspiration: null,
      subject_list: [
        { subject_name: 'Mathematics', level: 'A_LEVEL', grade_value: 'A*' },
        { subject_name: 'Physics', level: 'A_LEVEL', grade_value: 'A' },
        { subject_name: 'Chemistry', level: 'A_LEVEL', grade_value: 'B' }
      ],
      ib_total_points: null, ib_core_points: null, ib_tok_grade: null, ib_ee_grade: null,
      ib_math_pathway: null, ee_subject: null, ee_title: null, ee_summary: null,
      a_level_predicted_grades: { Mathematics: 'A*', Physics: 'A', Chemistry: 'B' },
      english_required: false, english_test_type: 'WAIVER', english_status: 'met',
      english_score_overall: null, admissions_tests: []
    },
    lifestyle_preference: {
      teaching_style: null, desired_location_type: null, campus_size: null,
      extracurricular_interests: [], other_extracurriculars: null, leadership_roles: [],
      commitment_level: null, key_activities: ['Coding / Hackathon'], sat_score: null,
      act_score: 32, intl_experience: ['Exchange programme'], work_experience: false,
      work_experience_summary: null, ambition_statement: null,
      epq_subject: 'Physics', epq_title: 'Tokamak confinement'
    },
    activities_list: []
  };

  it('is a fixed point on the IB path', () => {
    expect(toPayload(fromPayload(IB_PAYLOAD))).toEqual(IB_PAYLOAD);
  });

  it('is a fixed point on the A-Level path', () => {
    expect(toPayload(fromPayload(A_LEVEL_PAYLOAD))).toEqual(A_LEVEL_PAYLOAD);
  });

  it('does not mutate the payload it was handed', () => {
    const before = JSON.stringify(IB_PAYLOAD);
    toPayload(fromPayload(IB_PAYLOAD));
    expect(JSON.stringify(IB_PAYLOAD)).toBe(before);
  });

  it('is idempotent — a second pass changes nothing', () => {
    const once = toPayload(fromPayload(IB_PAYLOAD));
    expect(toPayload(fromPayload(once))).toEqual(once);
  });
});
