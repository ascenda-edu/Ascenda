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

// Steps 4 & 5 are optional
export const validateStep4 = (): IntakeErrors => ({});
export const validateStep5 = (): IntakeErrors => ({});

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
