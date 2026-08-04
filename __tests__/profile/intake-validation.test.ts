/**
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │  UNIT TESTS — src/lib/profile/intake-validation.ts                        │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * The five step validators, lifted unchanged out of StudentIntakeForm
 * (:1208-1278). Driving them through the DOM costs a full render plus a step
 * transition per case; here each case is a plain function call, so the awkward
 * combinations — an IB student with 7 filled rows, a grade of `Infinity`, an
 * A-Level student over the 4-subject ceiling — are cheap enough to actually
 * cover.
 *
 * Two things are asserted deliberately and are NOT incidental:
 *   1. the exact error KEYS, because `focusFirstError` matches them against
 *      `data-field` attributes in the JSX — a renamed key silently stops
 *      scrolling the student to the broken field;
 *   2. the exact error COPY, because the characterization suite reads it off
 *      the screen.
 */

import { buildInitialFormState, toPayload, type IntakeFormState } from '@/lib/profile/intake-logic';
import {
  validateStep, validateStep1, validateStep2, validateStep3, validateStep4, validateStep5,
  validatePayload,
  stepForFieldKey
} from '@/lib/profile/intake-validation';

const stateWith = (patch: Partial<IntakeFormState>): IntakeFormState => ({
  ...buildInitialFormState(),
  ...patch
});

const subject = (subject_name: string, level: 'HL' | 'SL' | 'A_LEVEL' | 'AP', grade_value: string) =>
  ({ subject_name, level, grade_value });

/** A step-1 state that passes, so each test can break exactly one thing. */
const validStep1 = (): IntakeFormState => stateWith({
  nationalities: ['Nigeria'],
  personalInfo: {
    ...buildInitialFormState().personalInfo,
    first_name: 'Amara', last_name: 'Okonkwo', email: 'amara@school.example',
    resident_country: 'Thailand'
  }
});

/** A step-2 state that passes. */
const validStep2 = (): IntakeFormState => stateWith({
  programmeType: 'IB',
  academicInput: {
    ...buildInitialFormState().academicInput,
    school_name: 'BIS', school_country: 'Thailand', graduation_year: '2027',
    intended_clusters: ['economics_quant']
  }
});

/** Six named IB subjects, 3 HL / 3 SL, all graded in range. */
const validIbSubjects = () => [
  subject('Mathematics', 'HL', '7'),
  subject('Economics', 'HL', '6'),
  subject('Physics', 'HL', '6'),
  subject('English Literature', 'SL', '6'),
  subject('History', 'SL', '5'),
  subject('Modern Languages', 'SL', '5')
];

/** A step-3 state that passes on the IB path. */
const validStep3IB = (): IntakeFormState => stateWith({
  programmeType: 'IB',
  subjects: validIbSubjects(),
  englishRequired: 'yes',
  englishTestType: 'IELTS',
  englishStatus: 'booked',
  academicInput: { ...buildInitialFormState().academicInput, ib_math_pathway: 'AA_HL' }
});

// ─────────────────────────────────────────────────────────────────────────────
describe('validateStep1 — personal information', () => {
  it('passes a complete step', () => {
    expect(validateStep1(validStep1())).toEqual({});
  });

  it('requires first name, last name, email, a nationality and a country of residence', () => {
    expect(validateStep1(buildInitialFormState())).toEqual({
      'personal_information.first_name': 'First name is required.',
      'personal_information.last_name': 'Last name is required.',
      'personal_information.email': 'Email is required.',
      'personal_information.nationality': 'Add at least one nationality.',
      'personal_information.resident_country': 'Country of residence is required.'
    });
  });

  it('treats whitespace-only input as empty', () => {
    const state = validStep1();
    state.personalInfo = { ...state.personalInfo, first_name: '   ', resident_country: '\t' };
    expect(Object.keys(validateStep1(state)).sort()).toEqual([
      'personal_information.first_name',
      'personal_information.resident_country'
    ]);
  });

  it('counts a nationality row of only spaces as no nationality at all', () => {
    expect(validateStep1(stateWith({ ...validStep1(), nationalities: ['  ', ''] })))
      .toMatchObject({ 'personal_information.nationality': 'Add at least one nationality.' });
  });

  describe('email', () => {
    const withEmail = (email: string) => {
      const state = validStep1();
      state.personalInfo = { ...state.personalInfo, email };
      return validateStep1(state)['personal_information.email'];
    };

    it.each([
      'a@b.co',
      'first.last@school.example',
      'a+tag@sub.domain.org'
    ])('accepts %s', (email) => {
      expect(withEmail(email)).toBeUndefined();
    });

    it.each([
      'no-at-sign',
      'no@tld',
      '@school.example',
      'two@@at.example',
      'spaces in@school.example',
      'user@school .example'
    ])('rejects %j with "Enter a valid email."', (email) => {
      expect(withEmail(email)).toBe('Enter a valid email.');
    });

    it('trims before testing, so a padded address is valid', () => {
      expect(withEmail('  amara@school.example  ')).toBeUndefined();
    });

    it('reports "Email is required." rather than the format message when blank', () => {
      expect(withEmail('   ')).toBe('Email is required.');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('validateStep2 — studies', () => {
  it('passes a complete step', () => {
    expect(validateStep2(validStep2())).toEqual({});
  });

  it('requires a programme, school name, school country, graduation year and one cluster', () => {
    expect(validateStep2(buildInitialFormState())).toEqual({
      'academic_input.programme_type': 'Select IB or A-levels.',
      'academic_input.school_name': 'School name is required.',
      'academic_input.school_country': 'School country is required.',
      'academic_input.graduation_year': 'Graduation year is required.',
      'academic_input.intended_clusters': 'Select at least one subject area.'
    });
  });

  it('does not require secondary clusters or a career aspiration', () => {
    const state = validStep2();
    state.academicInput = { ...state.academicInput, secondary_clusters: [], career_aspiration: '' };
    expect(validateStep2(state)).toEqual({});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('validateStep3 — grades & tests', () => {
  it('passes a complete IB step', () => {
    expect(validateStep3(validStep3IB())).toEqual({});
  });

  describe('IB subject rules', () => {
    it('requires exactly six named subjects', () => {
      const state = validStep3IB();
      state.subjects = [...validIbSubjects().slice(0, 5), subject('', 'SL', '')];
      const e = validateStep3(state);
      expect(e['academic_input.subject_list']).toBe('IB requires exactly 6 subjects.');
    });

    it('flags a seventh filled subject too — the rule is exactly six, not at least six', () => {
      const state = validStep3IB();
      state.subjects = [...validIbSubjects(), subject('Chemistry', 'SL', '5')];
      expect(validateStep3(state)['academic_input.subject_list']).toBe('IB requires exactly 6 subjects.');
    });

    it('requires exactly three Higher Level subjects', () => {
      const state = validStep3IB();
      state.subjects = validIbSubjects().map((s, i) => i < 4 ? { ...s, level: 'HL' as const } : s);
      expect(validateStep3(state)['academic_input.subject_list.hl']).toBe('IB requires 3 Higher Level subjects.');
    });

    it.each(['0', '8', '-1', 'A', 'Infinity'])('rejects the grade %j as out of the 1–7 range', (grade) => {
      const state = validStep3IB();
      state.subjects = validIbSubjects().map((s, i) => i === 0 ? { ...s, grade_value: grade } : s);
      expect(validateStep3(state)['academic_input.subject_list.0.grade_value']).toBe('1–7 only.');
    });

    it('reports the missing-grade message, not the range message, for a blank grade', () => {
      const state = validStep3IB();
      state.subjects = validIbSubjects().map((s, i) => i === 2 ? { ...s, grade_value: '  ' } : s);
      expect(validateStep3(state)['academic_input.subject_list.2.grade_value']).toBe('Grade is required.');
    });

    it('keys row errors by index so focusFirstError can find the right row', () => {
      const state = validStep3IB();
      state.subjects = validIbSubjects().map((s, i) => i === 4 ? subject('', 'SL', '') : s);
      const e = validateStep3(state);
      expect(e['academic_input.subject_list.4.subject_name']).toBe('Subject is required.');
      expect(e['academic_input.subject_list.4.grade_value']).toBe('Grade is required.');
      expect(e['academic_input.subject_list.3.subject_name']).toBeUndefined();
    });
  });

  describe('A-Level subject rules', () => {
    const aLevelState = (subjects: ReturnType<typeof subject>[]): IntakeFormState => stateWith({
      programmeType: 'A_LEVEL',
      subjects,
      englishRequired: 'no'
    });

    it('requires at least three subjects', () => {
      const e = validateStep3(aLevelState([
        subject('Mathematics', 'A_LEVEL', 'A*'),
        subject('Physics', 'A_LEVEL', 'A')
      ]));
      expect(e['academic_input.subject_list']).toBe('A-levels require at least 3 subjects.');
    });

    it('caps at four, and the message quotes the same ceiling the Add button uses', () => {
      const e = validateStep3(aLevelState([
        subject('Mathematics', 'A_LEVEL', 'A*'),
        subject('Physics', 'A_LEVEL', 'A'),
        subject('Chemistry', 'A_LEVEL', 'B'),
        subject('Biology', 'A_LEVEL', 'B'),
        subject('History', 'A_LEVEL', 'C')
      ]));
      expect(e['academic_input.subject_list']).toBe('A-levels are limited to 4 subjects.');
    });

    it('accepts letter grades — the 1–7 range check is IB-only', () => {
      expect(validateStep3(aLevelState([
        subject('Mathematics', 'A_LEVEL', 'A*'),
        subject('Physics', 'A_LEVEL', 'A'),
        subject('Chemistry', 'A_LEVEL', 'U')
      ]))).toEqual({});
    });

    it('does not ask an A-Level student for a maths pathway', () => {
      const e = validateStep3(aLevelState([
        subject('Mathematics', 'A_LEVEL', 'A*'),
        subject('Physics', 'A_LEVEL', 'A'),
        subject('Chemistry', 'A_LEVEL', 'B')
      ]));
      expect(e['academic_input.ib_math_pathway']).toBeUndefined();
    });
  });

  describe('IB-only academic fields', () => {
    it('requires a maths pathway', () => {
      const state = validStep3IB();
      state.academicInput = { ...state.academicInput, ib_math_pathway: '' };
      expect(validateStep3(state)['academic_input.ib_math_pathway']).toBe('Maths pathway required.');
    });

    it.each(['-1', '4'])('rejects core points of %j', (cp) => {
      const state = validStep3IB();
      state.academicInput = { ...state.academicInput, ib_core_points: cp };
      expect(validateStep3(state)['academic_input.ib_core_points']).toBe('0–3 only.');
    });

    it.each(['', '0', '3'])('accepts core points of %j', (cp) => {
      const state = validStep3IB();
      state.academicInput = { ...state.academicInput, ib_core_points: cp };
      expect(validateStep3(state)['academic_input.ib_core_points']).toBeUndefined();
    });

    it('caps the extended-essay summary at 350 characters', () => {
      const state = validStep3IB();
      state.academicInput = { ...state.academicInput, ee_summary: 'x'.repeat(351) };
      expect(validateStep3(state)['academic_input.ee_summary']).toBe('Under 350 characters.');

      state.academicInput = { ...state.academicInput, ee_summary: 'x'.repeat(350) };
      expect(validateStep3(state)['academic_input.ee_summary']).toBeUndefined();
    });

    it('routes the EE and EPQ keys to step 3, where their fields actually are', () => {
      // Regression: these fell through to the general `academic_input.` prefix and
      // mapped to step 2. `validateStep3` is what emits them and the fields render
      // on step 3, so the wizard's blur and live-clear passes both skipped them and
      // a payload rejection would have bounced to a step without the field.
      expect(stepForFieldKey('academic_input.ee_summary')).toBe(3);
      expect(stepForFieldKey('academic_input.ee_subject')).toBe(3);
      expect(stepForFieldKey('academic_input.ee_title')).toBe(3);
      expect(stepForFieldKey('academic_input.epq_subject')).toBe(3);
      // Unchanged neighbours, so the added prefixes cannot have over-reached.
      expect(stepForFieldKey('academic_input.school_name')).toBe(2);
      expect(stepForFieldKey('academic_input.a_level_predicted_grades')).toBe(2);
      expect(stepForFieldKey('academic_input.subject_list.0.grade_value')).toBe(3);
      expect(stepForFieldKey('personal_information.email')).toBe(1);
      expect(stepForFieldKey('lifestyle_preference.sat_score')).toBe(4);
    });
  });

  describe('English', () => {
    it('requires an answer to "is English required?"', () => {
      const state = validStep3IB();
      state.englishRequired = '';
      expect(validateStep3(state)['academic_input.english_required']).toBe('Select an option.');
    });

    it('stops asking for a test type and status once English is not required', () => {
      const state = validStep3IB();
      state.englishRequired = 'no';
      state.englishTestType = '' as never;
      state.englishStatus = '' as never;
      const e = validateStep3(state);
      expect(e['academic_input.english_test_type']).toBeUndefined();
      expect(e['academic_input.english_status']).toBeUndefined();
    });

    it('asks for a test type and status on the "not sure" path', () => {
      const state = validStep3IB();
      state.englishRequired = 'not_sure';
      state.englishTestType = '' as never;
      state.englishStatus = '' as never;
      const e = validateStep3(state);
      expect(e['academic_input.english_test_type']).toBe('Select a test type.');
      expect(e['academic_input.english_status']).toBe('Select a status.');
    });
  });

  describe('admissions tests', () => {
    it('requires a status for every real row, keyed by index', () => {
      const state = validStep3IB();
      state.admissionsTests = [
        { test_type: 'LNAT', status: 'booked', score_numeric: '', percentile: '' },
        { test_type: 'UCAT', status: '', score_numeric: '', percentile: '' }
      ];
      const e = validateStep3(state);
      expect(e['academic_input.admissions_tests.1.status']).toBe('Select a status.');
      expect(e['academic_input.admissions_tests.0.status']).toBeUndefined();
    });

    it('exempts the NONE sentinel row', () => {
      const state = validStep3IB();
      state.admissionsTests = [{ test_type: 'NONE', status: '', score_numeric: '', percentile: '' }];
      expect(validateStep3(state)).toEqual({});
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('validateStep4 / validateStep5 — optional steps', () => {
  it('never block', () => {
    expect(validateStep4()).toEqual({});
    expect(validateStep5()).toEqual({});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('validateStep — dispatch', () => {
  it('routes each step at its own validator', () => {
    const empty = buildInitialFormState();
    expect(validateStep(1, empty)).toEqual(validateStep1(empty));
    expect(validateStep(2, empty)).toEqual(validateStep2(empty));
    expect(validateStep(3, empty)).toEqual(validateStep3(empty));
    expect(validateStep(4, empty)).toEqual({});
    expect(validateStep(5, empty)).toEqual({});
  });

  it('lets the Review step through — it re-runs 1–3 at submit instead', () => {
    expect(validateStep(6, buildInitialFormState())).toEqual({});
  });

  it('returns no errors for an out-of-range step rather than throwing', () => {
    expect(validateStep(0, buildInitialFormState())).toEqual({});
    expect(validateStep(99, buildInitialFormState())).toEqual({});
  });
});

/* ── the wizard must not accept what the save endpoint rejects (A2) ──────────
 *
 * Audit finding A2. `handleFinalSubmit` ran only `validateStep1/2/3`;
 * `validateStep4` returned `{}` unconditionally, so nothing checked the step-4
 * fields client-side. The native `max={1600}` on the SAT input never fires
 * either: step 4 is unmounted by the time the user submits from the review
 * step, and every Next button is `type="button"`, so the browser never runs
 * constraint validation on the form.
 *
 * The result: a student types SAT 1650, sails through the wizard, and the whole
 * six-table save is rejected by `studentProfilePayloadSchema` with
 * "Some of your answers could not be saved: lifestyle preference." — naming a
 * step they cannot map to the field they got wrong. All of it saved on
 * origin/main. It passed 1,541 green tests.
 *
 * The fix validates the built payload against THE SAME schema the server uses,
 * rather than adding a fourth hand-written bounds list that can drift from it.
 * That is the point: one declaration, not two.
 */
describe('validatePayload — the client checks what the server will check', () => {
  // Build through the real `toPayload`, not a hand-rolled literal: the point of
  // this suite is that the client and the server agree, and a fixture invented
  // here would be testing the fixture rather than the agreement.
  const validPayload = () => {
    const state: IntakeFormState = {
      ...validStep1(),
      ...validStep2(),
      ...validStep3IB(),
      personalInfo: validStep1().personalInfo,
      nationalities: validStep1().nationalities,
      // step 3's academicInput is built off the INITIAL state, so spreading it
      // after step 2's would blank the school fields. Step 2 wins; step 3
      // contributes only the one field it actually sets.
      academicInput: { ...validStep2().academicInput, ib_math_pathway: 'AA_HL' as const }
    };
    return toPayload(state) as unknown as Record<string, Record<string, unknown>>;
  };

  it('rejects an out-of-range SAT score, keyed to the field the user can find', () => {
    const payload = validPayload();
    payload.lifestyle_preference.sat_score = 1650;

    const errors = validatePayload(payload);

    expect(errors['lifestyle_preference.sat_score']).toBeDefined();
  });

  it('rejects an over-long free-text answer', () => {
    const payload = validPayload();
    payload.lifestyle_preference.ambition_statement = 'x'.repeat(4001);

    const errors = validatePayload(payload);

    expect(errors['lifestyle_preference.ambition_statement']).toBeDefined();
  });

  it('accepts a payload the server would accept', () => {
    const payload = validPayload();
    payload.lifestyle_preference.sat_score = 1450;

    expect(validatePayload(payload)).toEqual({});
  });
});
