/**
 * The intake wizard's steps, and — since 2026-08-03 — which of them are allowed
 * to stand between a new student and the product.
 *
 * WHY TIERS EXIST
 * ---------------
 * All five steps used to be mandatory: `middleware.ts` bounced a student to
 * `/profile/wizard` from every protected route until `isProfileComplete` was
 * true, and that required all five. So the first thing a new user met was a
 * five-screen form — including six subject grades — before they had seen a
 * single university. Nothing in the product was reachable until it was done.
 *
 * Three of the five are load-bearing, and three is not a number chosen for
 * comfort. `runMatching` (src/lib/matching/service.ts:292-303) returns zero
 * matches and a `missingSections` list unless it finds an `academic_input` row,
 * at least one `student_subjects` row, and a `student_lifestyle_preference`
 * row. Those come from steps 1-3. Skip any of them and the app has literally
 * nothing to show, so gating on them buys the user something.
 *
 * The other two do not clear that bar. Every field in `activities_ambitions` and
 * `lifestyle_preferences` is optional, and `runMatching` reads none of them — they
 * refine ranking, they do not enable it. Holding the whole app hostage to a step
 * that no query depends on was the bug.
 *
 * Both steps USED to resolve to `Boolean(lifestyle)` in `buildStepCompletion` —
 * "the row exists, so the step is done" — which held only while they were
 * mandatory. Tiering them broke it, because "skip for now" writes the row empty.
 * They now check CONTENT instead; see the long comment on those two keys in
 * `./completion.ts`. Do not reason about the tiers from the old rule: it is the
 * reason the dashboard once showed a student who had skipped both steps as 100%
 * complete.
 *
 * So: ESSENTIAL steps gate, BOOSTER steps are offered and can be deferred.
 *
 * THE COUPLING THAT WILL BITE YOU
 * -------------------------------
 * Matching needs the lifestyle ROW even though it needs none of its FIELDS.
 * Deferring the boosters therefore has to still create that row, or the student
 * clears the gate and lands on an empty matches page — the exact opposite of
 * the point.
 *
 * Today that holds for free: `writeStudentIntake`
 * (src/lib/profile/persist-intake.ts:139) upserts `student_lifestyle_preference`
 * unconditionally, from a payload the wizard always builds whether or not steps
 * 4-5 were filled in. So "skip the extras and submit" writes an all-null
 * lifestyle row and matching finds what it needs.
 *
 * It holds for free, which means nothing enforces it. If that upsert ever
 * becomes conditional on the lifestyle fields being non-empty, skipping the
 * boosters starts producing students who pass this gate and see zero matches.
 * `__tests__/onboarding/tiering.test.ts` is the guard — see its section 3.
 */

export const PROFILE_STEPS = [
  {
    key: 'personal_information',
    title: 'Personal info',
    description: 'Share contact details so we can personalise guidance.',
    tier: 'essential'
  },
  {
    key: 'academic_input',
    title: 'Your studies',
    description: 'Outline your school details and intended subject areas.',
    tier: 'essential'
  },
  {
    key: 'academic_details',
    title: 'Grades & tests',
    description: 'Add subjects, grades, and test information.',
    tier: 'essential'
  },
  {
    key: 'activities_ambitions',
    title: 'Activities',
    description: 'Tell us about extracurriculars and what drives you.',
    tier: 'booster'
  },
  {
    key: 'lifestyle_preferences',
    title: 'Lifestyle',
    description: 'Tell us how you want to study and live.',
    tier: 'booster'
  }
] as const;

export type StepKey = (typeof PROFILE_STEPS)[number]['key'];

/**
 * `essential` — matching cannot run without it, so it gates entry.
 * `booster`   — improves ranking only; offered, never enforced.
 */
export type StepTier = (typeof PROFILE_STEPS)[number]['tier'];

export type StepCompletionMap = Record<StepKey, boolean>;

export const STEP_ORDER: StepKey[] = PROFILE_STEPS.map((step) => step.key);

export const ESSENTIAL_STEP_KEYS: StepKey[] = PROFILE_STEPS.filter((step) => step.tier === 'essential').map(
  (step) => step.key
);

export const BOOSTER_STEP_KEYS: StepKey[] = PROFILE_STEPS.filter((step) => step.tier === 'booster').map(
  (step) => step.key
);

/** 1-based index of the first booster step — the wizard's "skip from here" boundary. */
export const FIRST_BOOSTER_STEP_INDEX = PROFILE_STEPS.findIndex((step) => step.tier === 'booster') + 1;

export const isBoosterStep = (key: string): boolean => (BOOSTER_STEP_KEYS as string[]).includes(key);
