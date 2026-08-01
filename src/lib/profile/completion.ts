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

/**
 * The exact columns `buildStepCompletion` reads. **Select these, not a
 * hand-written subset.**
 *
 * This exists because a caller wrote its own narrow column list and left out
 * `english_status`. That column is half of the `academic_details` rule below:
 * answering "Not sure" to the English question sets `english_required` to null,
 * so `english_status` is the only remaining evidence the step was completed.
 * Selecting the subset silently changed the ANSWER rather than failing.
 *
 * The caller was `middleware.ts`, so the effect was that any student who
 * answered "Not sure" was redirected to the wizard from every protected route —
 * and the result was cached in a cookie for 12 hours — while their dashboard,
 * reading the same function over a `select('*')`, showed the profile 100%
 * complete.
 *
 * A column list is part of a query's meaning, not an optimisation. Exporting it
 * from beside the rule that consumes it is what makes the two impossible to
 * drift apart.
 */
export const COMPLETION_COLUMNS = {
  personal: 'first_name,last_name,email,nationality,resident_country',
  academicInput:
    'programme_type,school_name,school_country,graduation_year,intended_clusters,english_required,english_status',
  lifestyle: 'extracurricular_interests'
} as const;

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
