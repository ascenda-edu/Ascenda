import { studentProfilePayloadSchema, formatIntakeIssues } from '@/lib/profile/intake-schema';
import type { StudentProfilePayload } from '@/lib/profile/intake-types';

/**
 * A payload with every optional/nullable field populated — the "maximal" case.
 */
const fullPayload = (): StudentProfilePayload => ({
  personal_information: {
    first_name: 'Amara',
    last_name: 'Okonkwo',
    email: 'amara.okonkwo@example.com',
    phone: '+44 7700 900123',
    nationality: 'Nigerian, British',
    age: 17,
    gender: 'female',
    resident_country: 'United Kingdom',
    current_location_city: 'London',
    time_zone: 'Europe/London'
  },
  academic_input: {
    programme_type: 'IB',
    school_name: 'Dulwich College International',
    school_country: 'United Kingdom',
    school_city: 'London',
    school_type: 'international_school',
    language_of_instruction: 'english',
    graduation_year: 2027,
    desired_start_date: '2027-09',
    intended_clusters: ['medicine_dentistry', 'life_sciences_biochem'],
    secondary_clusters: ['economics_quant'],
    career_aspiration: 'Clinical research in paediatric oncology.',
    subject_list: [
      { subject_name: 'Biology', level: 'HL', grade_value: 7 },
      { subject_name: 'Chemistry', level: 'HL', grade_value: 6 },
      { subject_name: 'Mathematics AA', level: 'HL', grade_value: 6 },
      { subject_name: 'English A: Lang & Lit', level: 'SL', grade_value: 6 },
      { subject_name: 'Spanish B', level: 'SL', grade_value: 5 },
      { subject_name: 'Psychology', level: 'SL', grade_value: 6 }
    ],
    ib_total_points: 36,
    ib_core_points: 2,
    ib_tok_grade: 'B',
    ib_ee_grade: 'A',
    ib_math_pathway: 'AA_HL',
    ee_subject: 'Biology',
    ee_title: 'Antibiotic resistance in soil bacteria',
    ee_summary: 'An investigation into resistance gene transfer under varying pH.',
    a_level_predicted_grades: null,
    english_required: true,
    english_test_type: 'IELTS',
    english_status: 'met',
    english_score_overall: 7.5,
    admissions_tests: [
      { test_type: 'UCAT', status: 'taken', score_numeric: 2790, percentile: 82 },
      { test_type: 'TSA', status: 'booked', score_numeric: null, percentile: null }
    ]
  },
  lifestyle_preference: {
    teaching_style: 'academic',
    desired_location_type: 'city,suburban',
    campus_size: 'medium',
    extracurricular_interests: ['Volunteering', 'Debate / public speaking'],
    other_extracurriculars: 'Hospital shadowing',
    leadership_roles: ['Prefect', 'Club Founder'],
    commitment_level: 'deep',
    key_activities: ['Community Service', 'Science Competition'],
    sat_score: 1480,
    act_score: 33,
    intl_experience: ['International competition'],
    work_experience: true,
    work_experience_summary: 'Two weeks shadowing at a district general hospital.',
    ambition_statement: 'To close paediatric care gaps in West Africa.',
    epq_subject: null,
    epq_title: null
  },
  activities_list: [
    {
      category: 'Community Service',
      level: 'National',
      duration: '3–4 years',
      highlight: 'Founded a 40-volunteer tutoring scheme.',
      sort_order: 0
    },
    {
      id: 'existing-row-uuid',
      category: 'Science Competition',
      level: 'International',
      duration: '1–2 years',
      highlight: null,
      sort_order: 1
    }
  ]
});

/**
 * The other extreme: every nullable field null, every optional array empty.
 * Only the fields the intake form hard-requires carry a value.
 */
const minimalPayload = (): StudentProfilePayload => ({
  personal_information: {
    first_name: 'Sam',
    last_name: 'Lee',
    email: 's@e.co',
    phone: null,
    nationality: 'Singaporean',
    age: null,
    gender: null,
    resident_country: 'Singapore',
    current_location_city: null,
    time_zone: null
  },
  academic_input: {
    programme_type: 'A_LEVEL',
    school_name: 'Raffles Institution',
    school_country: 'Singapore',
    school_city: null,
    school_type: null,
    language_of_instruction: null,
    graduation_year: 2026,
    desired_start_date: null,
    intended_clusters: ['law'],
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
  },
  lifestyle_preference: {
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
  },
  activities_list: []
});

/**
 * Reproduces exactly what `buildPayload` in
 * `src/app/profile/_components/StudentIntakeForm.tsx` (~line 1088) emits for an
 * IB student who fills the wizard normally. Notably: `phone` is ALWAYS null,
 * `language_of_instruction` is ALWAYS null, `a_level_predicted_grades` is null
 * for IB, IB grades are NUMBERS, the epq_* fields are nulled for IB, and
 * `desired_location_type` is a comma-joined string built from a multi-select.
 */
const formPayloadIB = (): StudentProfilePayload => ({
  personal_information: {
    first_name: 'Priya',
    last_name: 'Raman',
    email: 'priya.raman@example.com',
    phone: null, // buildPayload hard-codes null
    nationality: 'Indian, Canadian', // formattedNationalities.join(', ')
    age: 17, // parseNumber('17')
    gender: 'prefer_not_to_say',
    resident_country: 'United Arab Emirates',
    current_location_city: 'Dubai',
    time_zone: 'Asia/Dubai'
  },
  academic_input: {
    programme_type: 'IB',
    school_name: 'Dubai International Academy',
    school_country: 'United Arab Emirates',
    school_city: 'Dubai',
    school_type: 'international_school',
    language_of_instruction: null, // buildPayload hard-codes null
    graduation_year: 2027, // Number('2027')
    desired_start_date: '2027-09-01',
    intended_clusters: ['computer_science', 'maths'],
    secondary_clusters: ['engineering'],
    career_aspiration: 'Machine learning research',
    subject_list: [
      { subject_name: 'Mathematics AA', level: 'HL', grade_value: 7 },
      { subject_name: 'Physics', level: 'HL', grade_value: 6 },
      { subject_name: 'Computer Science', level: 'HL', grade_value: 7 },
      { subject_name: 'English A: Literature', level: 'SL', grade_value: 5 },
      { subject_name: 'Hindi B', level: 'SL', grade_value: 6 },
      { subject_name: 'Economics', level: 'SL', grade_value: 6 }
    ],
    ib_total_points: 37, // ibSubjectSum
    ib_core_points: 3,
    ib_tok_grade: 'A',
    ib_ee_grade: 'B',
    ib_math_pathway: 'AA_HL',
    ee_subject: 'Computer Science',
    ee_title: 'Transformer attention on low-resource languages',
    ee_summary: 'Compares attention head pruning strategies.',
    a_level_predicted_grades: null, // null unless programmeType === 'A_LEVEL'
    english_required: true, // englishRequired === 'yes'
    english_test_type: 'TOEFL',
    english_status: 'exceeds',
    english_score_overall: 112, // showEnglishScore === true
    admissions_tests: [
      // NONE rows are filtered out by buildPayload before submit
      { test_type: 'MAT', status: 'booked', score_numeric: null, percentile: null }
    ]
  },
  lifestyle_preference: {
    teaching_style: 'mixed',
    desired_location_type: 'city,coastal', // arr.join(',')
    campus_size: 'large',
    extracurricular_interests: ['Gaming / esports', 'Student societies'],
    other_extracurriculars: null, // '' → null
    leadership_roles: ['Team Captain'],
    commitment_level: 'moderate',
    // Derived from activityRows categories (deduped) when rows exist
    key_activities: ['Coding / Hackathon', 'Academic Competition'],
    sat_score: null, // '' → parseNumber → null
    act_score: null,
    intl_experience: ['International competition'], // derived from a National/International row
    work_experience: null, // untouched tri-state stays null
    work_experience_summary: null,
    ambition_statement: 'Build tooling that makes research reproducible.',
    epq_subject: null, // nulled for IB
    epq_title: null
  },
  activities_list: [
    {
      category: 'Coding / Hackathon',
      level: 'International',
      duration: '1–2 years', // EN DASH, matching ACTIVITY_DURATIONS
      highlight: 'Won a 300-team regional hackathon.',
      sort_order: 0
    },
    {
      category: 'Academic Competition',
      level: 'National',
      duration: '3–4 years',
      highlight: null, // '' → null
      sort_order: 1
    }
  ]
});

/**
 * The same, for an A-level student: grade_value is a STRING, and
 * `a_level_predicted_grades` is the Object.fromEntries map buildPayload derives
 * from the subject rows. EPQ fields survive for A_LEVEL; IB fields are nulled.
 */
const formPayloadALevel = (): StudentProfilePayload => ({
  personal_information: {
    first_name: 'Tom',
    last_name: 'Whitfield',
    email: 'tom.whitfield@example.com',
    phone: null,
    nationality: 'British',
    age: 18,
    gender: 'male',
    resident_country: 'United Kingdom',
    current_location_city: 'Leeds',
    time_zone: 'Europe/London'
  },
  academic_input: {
    programme_type: 'A_LEVEL',
    school_name: 'Leeds Grammar School',
    school_country: 'United Kingdom',
    school_city: 'Leeds',
    school_type: 'local_private',
    language_of_instruction: null,
    graduation_year: 2026,
    desired_start_date: null, // '' → null
    intended_clusters: ['law'],
    secondary_clusters: [],
    career_aspiration: null,
    subject_list: [
      { subject_name: 'History', level: 'A_LEVEL', grade_value: 'A*' },
      { subject_name: 'English Literature', level: 'A_LEVEL', grade_value: 'A' },
      { subject_name: 'Politics', level: 'A_LEVEL', grade_value: 'B' }
    ],
    ib_total_points: null, // nulled for non-IB
    ib_core_points: null,
    ib_tok_grade: null,
    ib_ee_grade: null,
    ib_math_pathway: null,
    ee_subject: null,
    ee_title: null,
    ee_summary: null,
    a_level_predicted_grades: {
      History: 'A*',
      'English Literature': 'A',
      Politics: 'B'
    },
    english_required: false, // englishRequired === 'no'
    english_test_type: 'NONE',
    english_status: 'missing',
    english_score_overall: null, // showEnglishScore === false
    admissions_tests: [
      { test_type: 'LNAT', status: 'taken', score_numeric: 27, percentile: 74 }
    ]
  },
  lifestyle_preference: {
    teaching_style: 'academic',
    desired_location_type: null, // empty multi-select → null
    campus_size: 'no_preference',
    extracurricular_interests: ['Debate / public speaking'],
    other_extracurriculars: null,
    leadership_roles: ['None'],
    commitment_level: 'light',
    key_activities: [], // no activity rows and none picked in step 4
    sat_score: null,
    act_score: null,
    intl_experience: [],
    work_experience: false,
    work_experience_summary: null,
    ambition_statement: null,
    epq_subject: 'Politics', // kept for A_LEVEL
    epq_title: 'Devolution and the future of the UK constitution'
  },
  activities_list: []
});

describe('studentProfilePayloadSchema', () => {
  it('accepts a fully-populated payload', () => {
    const result = studentProfilePayloadSchema.safeParse(fullPayload());
    expect(result.success).toBe(true);
  });

  it('accepts a minimal payload (all nullables null, all optional arrays empty)', () => {
    const result = studentProfilePayloadSchema.safeParse(minimalPayload());
    expect(result.success).toBe(true);
  });

  it('accepts what the real intake form builds for an IB student', () => {
    const result = studentProfilePayloadSchema.safeParse(formPayloadIB());
    if (!result.success) throw new Error(formatIntakeIssues(result.error));
    expect(result.success).toBe(true);
    expect(result.data).toEqual(formPayloadIB());
  });

  it('accepts what the real intake form builds for an A-level student', () => {
    const result = studentProfilePayloadSchema.safeParse(formPayloadALevel());
    if (!result.success) throw new Error(formatIntakeIssues(result.error));
    expect(result.success).toBe(true);
    expect(result.data).toEqual(formPayloadALevel());
  });

  it('preserves explicit nulls rather than coercing them away', () => {
    const result = studentProfilePayloadSchema.safeParse(minimalPayload());
    if (!result.success) throw new Error(formatIntakeIssues(result.error));
    expect(result.data.personal_information.phone).toBeNull();
    expect(result.data.academic_input.desired_start_date).toBeNull();
    expect(result.data.lifestyle_preference.work_experience).toBeNull();
  });

  it('rejects a missing required field', () => {
    const payload = fullPayload() as Record<string, any>;
    delete payload.academic_input.graduation_year;
    const result = studentProfilePayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(formatIntakeIssues(result.error)).toContain('academic_input.graduation_year');
  });

  it('rejects a missing required top-level section', () => {
    const payload = fullPayload() as Record<string, any>;
    delete payload.lifestyle_preference;
    expect(studentProfilePayloadSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects an undefined where the type says null (nullable is not optional)', () => {
    const payload = fullPayload() as Record<string, any>;
    payload.personal_information.phone = undefined;
    expect(studentProfilePayloadSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects a wrong-typed field', () => {
    const payload = fullPayload() as Record<string, any>;
    payload.academic_input.graduation_year = '2027';
    const result = studentProfilePayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(formatIntakeIssues(result.error)).toContain('academic_input.graduation_year');
  });

  it('rejects a value outside an enum', () => {
    const payload = fullPayload() as Record<string, any>;
    payload.academic_input.programme_type = 'GCSE';
    expect(studentProfilePayloadSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects a malformed email', () => {
    const payload = fullPayload() as Record<string, any>;
    payload.personal_information.email = 'not-an-email';
    expect(studentProfilePayloadSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects an over-long array', () => {
    const payload = fullPayload();
    payload.academic_input.subject_list = Array.from({ length: 200 }, () => ({
      subject_name: 'Biology',
      level: 'HL' as const,
      grade_value: 7
    }));
    const result = studentProfilePayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(formatIntakeIssues(result.error)).toContain('academic_input.subject_list');
  });

  it('rejects an over-long activities_list', () => {
    const payload = fullPayload();
    payload.activities_list = Array.from({ length: 500 }, (_, i) => ({
      category: 'Sport',
      level: null,
      duration: null,
      highlight: null,
      sort_order: i
    }));
    expect(studentProfilePayloadSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects an over-long string', () => {
    const payload = fullPayload();
    payload.personal_information.first_name = 'a'.repeat(5000);
    const result = studentProfilePayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(formatIntakeIssues(result.error)).toContain('personal_information.first_name');
  });

  it('rejects out-of-range numerics', () => {
    const tooManyPoints = fullPayload();
    tooManyPoints.academic_input.ib_total_points = 99;
    expect(studentProfilePayloadSchema.safeParse(tooManyPoints).success).toBe(false);

    const impossibleYear = fullPayload();
    impossibleYear.academic_input.graduation_year = 999999;
    expect(studentProfilePayloadSchema.safeParse(impossibleYear).success).toBe(false);

    const infinitePercentile = fullPayload() as Record<string, any>;
    infinitePercentile.academic_input.admissions_tests[0].percentile = Infinity;
    expect(studentProfilePayloadSchema.safeParse(infinitePercentile).success).toBe(false);
  });

  it('strips unknown keys instead of persisting them', () => {
    const payload = fullPayload() as Record<string, any>;
    payload.personal_information.is_admin = true;
    payload.injected_table = { drop: 'everything' };
    const result = studentProfilePayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).not.toHaveProperty('injected_table');
    expect(result.data.personal_information).not.toHaveProperty('is_admin');
  });

  it('rejects a non-object payload', () => {
    expect(studentProfilePayloadSchema.safeParse(null).success).toBe(false);
    expect(studentProfilePayloadSchema.safeParse('nope').success).toBe(false);
    expect(studentProfilePayloadSchema.safeParse([]).success).toBe(false);
  });
});

describe('formatIntakeIssues', () => {
  it('reports field paths without leaking submitted values', () => {
    const payload = fullPayload() as Record<string, any>;
    payload.personal_information.email = 'sensitive-but-invalid';
    const result = studentProfilePayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (result.success) return;
    const message = formatIntakeIssues(result.error);
    expect(message).toContain('personal_information.email');
    expect(message).not.toContain('sensitive-but-invalid');
  });
});
