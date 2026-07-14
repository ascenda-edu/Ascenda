import { type StepCompletionMap } from './steps';

type PersonalRow = {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  nationality?: string | null;
  resident_country?: string | null;
} | null;
type AcademicInputRow = {
  programme_type?: string | null;
  school_name?: string | null;
  school_country?: string | null;
  graduation_year?: number | null;
  intended_clusters?: string[] | null;
  english_required?: boolean | null;
  english_status?: string | null;
} | null;
type LifestyleRow = { extracurricular_interests?: string[] | null } | null;

export interface ProfileRecordGroup {
  personal: PersonalRow;
  academicInput: AcademicInputRow;
  subjectCount: number;
  lifestyle: LifestyleRow;
}

export const buildStepCompletion = ({
  personal,
  academicInput,
  subjectCount,
  lifestyle
}: ProfileRecordGroup): StepCompletionMap => ({
  personal_information: Boolean(
    personal?.first_name && personal?.last_name && personal?.email && personal?.nationality && personal?.resident_country
  ),
  academic_input: Boolean(
    academicInput?.programme_type &&
      academicInput?.school_name &&
      academicInput?.school_country &&
      academicInput?.graduation_year &&
      (academicInput?.intended_clusters ?? []).length > 0
  ),
  // Step 3 is complete once subjects exist and the student has answered the
  // English question. "Not sure" maps english_required → null (same as never
  // answered), so also accept a persisted english_status, which is always set
  // when step 3 is submitted — otherwise "Not sure" caps the profile at 80%.
  academic_details: Boolean(
    subjectCount > 0 &&
      ((academicInput?.english_required !== null && academicInput?.english_required !== undefined) ||
        Boolean(academicInput?.english_status))
  ),
  // Activities step is always considered "touched" once lifestyle row exists (all optional)
  activities_ambitions: Boolean(lifestyle),
  lifestyle_preferences: Boolean(lifestyle)
});

export const isProfileComplete = (records: ProfileRecordGroup): boolean => {
  const completion = buildStepCompletion(records);
  return Object.values(completion).every(Boolean);
};
