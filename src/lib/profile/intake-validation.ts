/**
 * The intake wizard's five step validators, as pure functions.
 *
 * MOVED VERBATIM out of `src/app/profile/_components/StudentIntakeForm.tsx`
 * (`validateStep1` … `validateStep5` + `validateSubjects`). Behaviour is
 * byte-identical, including the email regex and every message string —
 * `__tests__/profile/intake-form/intake-form.characterization.test.tsx` asserts
 * the exact copy.
 *
 * The return shape is a flat `Record<dottedPath, message>`; the dotted paths are
 * the same strings the form hangs off `data-field` attributes, which is how
 * `focusFirstError` finds the offending node.
 */

import { formatNationalities, parseNumber, type IntakeFormState } from '@/lib/profile/intake-logic';
import { getMaxSubjects } from '@/lib/profile/intake-options';
import { studentProfilePayloadSchema } from '@/lib/profile/intake-schema';

export type IntakeErrors = Record<string, string>;

export const validateStep1 = (state: IntakeFormState): IntakeErrors => {
  const { personalInfo, nationalities } = state;
  const formattedNationalities = formatNationalities(nationalities);
  const e: IntakeErrors = {};
  if (!personalInfo.first_name.trim()) e['personal_information.first_name'] = 'First name is required.';
  if (!personalInfo.last_name.trim()) e['personal_information.last_name'] = 'Last name is required.';
  if (!personalInfo.email.trim()) e['personal_information.email'] = 'Email is required.';
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(personalInfo.email.trim()))
    e['personal_information.email'] = 'Enter a valid email.';
  if (!formattedNationalities.length) e['personal_information.nationality'] = 'Add at least one nationality.';
  if (!personalInfo.resident_country.trim()) e['personal_information.resident_country'] = 'Country of residence is required.';
  return e;
};

export const validateStep2 = (state: IntakeFormState): IntakeErrors => {
  const { programmeType, academicInput } = state;
  const e: IntakeErrors = {};
  if (!programmeType) e['academic_input.programme_type'] = 'Select IB or A-levels.';
  if (!academicInput.school_name.trim()) e['academic_input.school_name'] = 'School name is required.';
  if (!academicInput.school_country.trim()) e['academic_input.school_country'] = 'School country is required.';
  if (!academicInput.graduation_year) e['academic_input.graduation_year'] = 'Graduation year is required.';
  if (!academicInput.intended_clusters.length) e['academic_input.intended_clusters'] = 'Select at least one subject area.';
  return e;
};

/** Mutates `e` in place, exactly as the component's version did. */
export const validateSubjects = (state: IntakeFormState, e: IntakeErrors): void => {
  const { subjects, programmeType } = state;
  const filled = subjects.filter((s) => s.subject_name.trim());
  if (programmeType === 'IB') {
    if (filled.length !== 6) e['academic_input.subject_list'] = 'IB requires exactly 6 subjects.';
    if (filled.filter((s) => s.level === 'HL').length !== 3)
      e['academic_input.subject_list.hl'] = 'IB requires 3 Higher Level subjects.';
  }
  if (programmeType === 'A_LEVEL') {
    const max = getMaxSubjects('A_LEVEL');
    if (filled.length < 3) e['academic_input.subject_list'] = 'A-levels require at least 3 subjects.';
    // Keep the ceiling tied to getMaxSubjects — the Add button and the section hint both
    // use it, and this message used to claim 6 while the UI capped the rows at 4.
    else if (filled.length > max) e['academic_input.subject_list'] = `A-levels are limited to ${max} subjects.`;
  }
  subjects.forEach((s, i) => {
    if (!s.subject_name.trim()) e[`academic_input.subject_list.${i}.subject_name`] = 'Subject is required.';
    if (!s.grade_value.trim()) e[`academic_input.subject_list.${i}.grade_value`] = 'Grade is required.';
    else if (programmeType === 'IB') {
      const g = parseNumber(s.grade_value);
      if (g === null || g < 1 || g > 7) e[`academic_input.subject_list.${i}.grade_value`] = '1–7 only.';
    }
  });
};

export const validateStep3 = (state: IntakeFormState): IntakeErrors => {
  const { programmeType, academicInput, englishRequired, englishTestType, englishStatus, admissionsTests } = state;
  const e: IntakeErrors = {};
  validateSubjects(state, e);
  if (programmeType === 'IB') {
    if (!academicInput.ib_math_pathway) e['academic_input.ib_math_pathway'] = 'Maths pathway required.';
    const cp = parseNumber(academicInput.ib_core_points);
    if (cp !== null && (cp < 0 || cp > 3)) e['academic_input.ib_core_points'] = '0–3 only.';
    if (academicInput.ee_summary && academicInput.ee_summary.length > 350)
      e['academic_input.ee_summary'] = 'Under 350 characters.';
  }
  if (!englishRequired) e['academic_input.english_required'] = 'Select an option.';
  if (englishRequired !== 'no') {
    if (!englishTestType) e['academic_input.english_test_type'] = 'Select a test type.';
    if (!englishStatus) e['academic_input.english_status'] = 'Select a status.';
  }
  admissionsTests.forEach((t, i) => {
    if (t.test_type === 'NONE') return;
    if (!t.status) e[`academic_input.admissions_tests.${i}.status`] = 'Select a status.';
  });
  return e;
};

// Steps 4 & 5 have no *required* fields, so there is nothing to block a step
// transition on. That is NOT the same as "nothing on these steps can be
// invalid" — see `validatePayload`, which is what the final submit uses.
export const validateStep4 = (): IntakeErrors => ({});
export const validateStep5 = (): IntakeErrors => ({});

/**
 * The last check before the save, run against **the same schema the server
 * validates with** — `studentProfilePayloadSchema`, the one
 * `saveStudentIntake` parses the payload with.
 *
 * WHY THIS EXISTS (audit finding A2)
 * ----------------------------------
 * `handleFinalSubmit` ran `validateStep1/2/3` and nothing else, and steps 4–5
 * return `{}` unconditionally — so no client-side check ever looked at the
 * step-4 fields. The `max={1600}` on the SAT input does not save you either:
 * the user submits from the review step, by which time step 4 is unmounted, and
 * every Next button is `type="button"`, so the browser never runs constraint
 * validation over the form.
 *
 * A student typing SAT `1650` therefore passed the whole wizard and had the
 * entire six-table save rejected with *"Some of your answers could not be
 * saved: lifestyle preference."* — a step name, not a field they could find.
 * Same for `career_aspiration`, `ambition_statement` and
 * `work_experience_summary` past 4,000 characters, none of which carry a
 * `maxLength`. All of it saved on `origin/main`.
 *
 * This deliberately reuses the schema rather than restating its bounds. A
 * fourth hand-written list of maxima is exactly the "one concept declared
 * twice" pattern that produced most of this codebase's defects: the copies
 * drift, and the drift is invisible until a user hits it.
 */
export const validatePayload = (payload: unknown): IntakeErrors => {
  const result = studentProfilePayloadSchema.safeParse(payload);
  if (result.success) return {};

  const errors: IntakeErrors = {};
  for (const issue of result.error.issues) {
    // zod's path is the payload path, which is already the dotted form the
    // wizard hangs off `data-field` — so `focusFirstError` can scroll to it.
    const key = issue.path.join('.');
    // First message per field: later issues on the same path are usually a
    // less specific restatement of the first.
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return errors;
};

/**
 * Which wizard step owns a given payload field, so a failed `validatePayload`
 * can put the student in front of the field rather than on the review page
 * reading a message about a step name.
 *
 * Order matters: the subject/test keys are checked before the general
 * `academic_input.` prefix, because they live on step 3 while the rest of
 * `academic_input` is step 2.
 */
export const stepForFieldKey = (key: string): number => {
  if (key.startsWith('personal_information.')) return 1;
  if (
    key.startsWith('academic_input.subject_list') ||
    key.startsWith('academic_input.admissions_tests') ||
    key.startsWith('academic_input.english') ||
    key.startsWith('academic_input.ib_') ||
    // `ee_subject` / `ee_title` / `ee_summary`: emitted by validateStep3 and
    // rendered on step 3, but they used to fall through to the general
    // `academic_input.` prefix below and map to 2. Consequences, all real: the
    // live-clear pass never fired for them (2 !== 3), so a trimmed 351-character
    // EE summary kept showing "Under 350 characters."; blur validation skipped
    // them entirely; and a payload rejection would have bounced to step 2, where
    // the field does not exist.
    key.startsWith('academic_input.ee_') ||
    key.startsWith('academic_input.epq_')
  ) {
    return 3;
  }
  if (key.startsWith('academic_input.')) return 2;
  // `lifestyle_preference` is split across TWO steps: steps 4 and 5 both persist
  // into that one row. Sending all of it to 4 meant a rejection on, say,
  // `other_extracurriculars` bounced the student to Activities — a step that does
  // not contain the field. These five render on step 5.
  if (
    key.startsWith('lifestyle_preference.teaching_style') ||
    key.startsWith('lifestyle_preference.desired_location_type') ||
    key.startsWith('lifestyle_preference.campus_size') ||
    key.startsWith('lifestyle_preference.extracurricular_interests') ||
    key.startsWith('lifestyle_preference.other_extracurriculars')
  ) {
    return 5;
  }
  // Everything else the payload schema can still reject — SAT/ACT, the free-text
  // ambition and work-experience answers, the activity rows — is step 4.
  return 4;
};

/** Dispatch for the wizard's "can I leave this step?" check. Step 6 (Review) never blocks. */
export const validateStep = (step: number, state: IntakeFormState): IntakeErrors => {
  switch (step) {
    case 1: return validateStep1(state);
    case 2: return validateStep2(state);
    case 3: return validateStep3(state);
    case 4: return validateStep4();
    case 5: return validateStep5();
    default: return {};
  }
};
