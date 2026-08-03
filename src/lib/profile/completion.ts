import { ESSENTIAL_STEP_KEYS, type StepCompletionMap } from './steps';

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
/**
 * Both booster steps write into this one table, so the columns have to be
 * split by which step owns them — see `buildStepCompletion` for why row
 * existence alone stopped being a usable signal.
 */
type LifestyleRow = {
  // Step 4 — activities & ambitions.
  leadership_roles?: string[] | null;
  commitment_level?: string | null;
  key_activities?: string[] | null;
  extracurricular_interests?: string[] | null;
  // Step 5 — lifestyle preferences. All three are single-valued columns, NOT
  // arrays — the wizard holds `desired_location_type` as an array in form state
  // and narrows it on save, which is why the persist layer casts it. Typing it
  // as an array here compiled against the form's shape and failed against every
  // real caller.
  //
  // Column names below are the COLUMNS (schema.sql:138-140). Their enum TYPES are
  // named differently — `location_type` and `campus_size_preference` — and
  // confusing the two sends you looking for columns that do not exist.
  teaching_style?: string | null;
  desired_location_type?: string | null;
  campus_size?: string | null;
} | null;

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
  lifestyle:
    'extracurricular_interests,leadership_roles,commitment_level,key_activities,teaching_style,desired_location_type,campus_size'
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
  // ── The two booster steps ────────────────────────────────────────────────
  //
  // These used to be `Boolean(lifestyle)` — "the row exists, so the step was
  // done". That held only while both steps were MANDATORY, because the only way
  // to get a lifestyle row was to walk through them.
  //
  // The 2026-08-03 re-tiering broke that assumption. "Skip for now" submits with
  // steps 4-5 empty, and `writeStudentIntake` upserts the lifestyle row
  // regardless (which it must — `runMatching` needs that row to exist). So a
  // student who skipped got an all-null row, and row-existence reported BOTH
  // steps complete: the dashboard showed them 100%, the progress card fired its
  // completion confetti, and the checklist item nudging them to add the extras
  // ticked itself. The deferral was silently erased instead of deferred.
  //
  // So: check CONTENT, not existence. Any answer in the step counts, because
  // every field in both steps is genuinely optional and demanding a specific one
  // would be arbitrary.
  //
  // These mirror the wizard's own sidebar rules (StudentIntakeForm's
  // `stepCompletion` 4 and 5) deliberately — before this, the sidebar checked
  // content while the dashboard checked existence, so the same profile was
  // "3/5 complete" in one place and "5/5" in the other.
  activities_ambitions: Boolean(
    (lifestyle?.leadership_roles ?? []).length > 0 ||
      lifestyle?.commitment_level ||
      (lifestyle?.key_activities ?? []).length > 0 ||
      (lifestyle?.extracurricular_interests ?? []).length > 0
  ),
  lifestyle_preferences: Boolean(
    lifestyle?.teaching_style || lifestyle?.desired_location_type || lifestyle?.campus_size
  )
});

/**
 * Every step done, boosters included. This is the "100%" the dashboard shows
 * and the bar the profile page celebrates — it is NOT the entry gate.
 */
export const isProfileComplete = (records: ProfileRecordGroup): boolean => {
  const completion = buildStepCompletion(records);
  return Object.values(completion).every(Boolean);
};

/**
 * The entry gate: enough profile for `runMatching` to return something.
 *
 * `middleware.ts` redirects on THIS, not on `isProfileComplete`. The difference
 * is the two booster steps, whose own completion rule is "a lifestyle row
 * exists" — see the header of `./steps.ts` for why gating on those was wrong.
 *
 * Deliberately derived from `ESSENTIAL_STEP_KEYS` rather than listing the three
 * keys here. Re-tiering a step in `steps.ts` must move the gate with it; a
 * duplicate list is exactly how `COMPLETION_COLUMNS` above came to exist.
 */
export const isProfileEssentialComplete = (records: ProfileRecordGroup): boolean => {
  const completion = buildStepCompletion(records);
  return ESSENTIAL_STEP_KEYS.every((key) => completion[key]);
};
