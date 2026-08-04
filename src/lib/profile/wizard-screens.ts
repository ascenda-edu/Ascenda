/**
 * The intake wizard's SCREENS — what the student pages through — as distinct from
 * `PROFILE_STEPS`, which is what the database and the entry gate reason about.
 *
 * ── WHY THE TWO ARE SEPARATE ─────────────────────────────────────────────────
 * `./steps.ts` defines five SECTIONS (`StepKey`), and a great deal depends on
 * them: `completion.ts`, `middleware.ts`'s gate, `isProfileEssentialComplete`,
 * `lib/chat/context.ts`, `features/parent/api/data.ts`, the dashboard's percentage
 * and `__tests__/onboarding/tiering.test.ts`. Those five are a schema-and-product
 * fact and they are NOT changing.
 *
 * What changed is the ORDER AND GRANULARITY the student meets them in. The wizard
 * used to open on eight fields of paperwork (name, email, nationality, age…) and
 * put "what do you want to study?" on screen two, behind them. It also put 21
 * controls on one screen. So the screens now:
 *
 *   1. lead with the aspirational question, which is what the student came for;
 *   2. split the old grades-and-tests screen in two;
 *   3. demote the admin to fifth, where momentum already exists.
 *
 * Several screens therefore share a section (subject_area + school are both
 * `academic_input`; grades + tests are both `academic_details`). That is the
 * decoupling: adding a screen costs nothing outside this file, because completion
 * still counts sections.
 *
 * ── WHY `prefixes` EXISTS, AND WHY IT IS NOT OPTIONAL ────────────────────────
 * The step↔field mapping used to be positional integers restated in three places:
 * a switch in `validateStep`, a hand-ordered prefix ladder in `stepForFieldKey`,
 * and the order of `PROFILE_STEPS`. The comments in `intake-validation.ts` record
 * two user-visible bugs that came out of exactly that duplication:
 *
 *   - `academic_input.ee_*` fell through to the general `academic_input.` branch
 *     and mapped to the studies step, so a payload rejection bounced the student
 *     to a screen that does not contain the field, blur validation skipped it, and
 *     the live-clear pass never fired for it;
 *   - `lifestyle_preference` was sent wholesale to the activities step even though
 *     five of its columns render on the lifestyle step.
 *
 * Both were the same failure: the mapping was implied by ordering rather than
 * declared. Here each screen DECLARES the payload paths it owns, `stepForFieldKey`
 * resolves by longest match, and
 * `__tests__/profile/wizard-screens.test.ts` asserts that every field the payload
 * schema can reject is claimed by exactly one screen. A new field cannot be added
 * without either claiming it or turning that test red.
 */

import { PROFILE_STEPS, type StepKey } from './steps';

const REVIEW_SCREEN_KEY = 'review';

export type ScreenTier = 'essential' | 'booster' | 'review';

export interface WizardScreen {
  /** The `?step=` value. Public and deep-linkable — do not rename casually. */
  key: string;
  /** Which `PROFILE_STEPS` section this screen writes into; `null` for Review. */
  section: StepKey | null;
  /** Short label for the rail. NOT the question — the rail is a map, not a heading. */
  railLabel: string;
  /** Small caps line above the question. */
  eyebrow: string;
  /** The question, rendered at hero scale as the screen's `<h2>`. */
  question: string;
  /** One or two lines under it. Says why the answer is worth giving. */
  subtitle: string;
  /**
   * Payload paths this screen owns, for `stepForFieldKey`. Resolution is by
   * LONGEST match, so `academic_input.subject_list` beats `academic_input.`.
   */
  prefixes: readonly string[];
}

/**
 * Screen order. Index + 1 is the 1-based step number the wizard and the `?step=`
 * param use.
 */
export const WIZARD_SCREENS: readonly WizardScreen[] = [
  {
    key: 'subject_area',
    section: 'academic_input',
    railLabel: 'Subject area',
    eyebrow: 'The fun part first',
    question: 'What do you want to study?',
    subtitle:
      'Pick the one closest to your plan. You can change it whenever you like — nothing here is permanent.',
    prefixes: [
      'academic_input.intended_clusters',
      'academic_input.secondary_clusters',
      'academic_input.career_aspiration'
    ]
  },
  {
    key: 'school',
    section: 'academic_input',
    railLabel: 'School',
    eyebrow: 'Where you are now',
    question: 'Where are you studying?',
    subtitle: 'Your qualification decides how we read your grades, so this one matters.',
    prefixes: [
      'academic_input.programme_type',
      'academic_input.school_name',
      'academic_input.school_country',
      'academic_input.school_city',
      'academic_input.school_type',
      'academic_input.language_of_instruction',
      'academic_input.graduation_year',
      'academic_input.desired_start_date'
    ]
  },
  {
    key: 'academic_details',
    section: 'academic_details',
    railLabel: 'Subjects & grades',
    eyebrow: 'The numbers',
    question: 'Your subjects and predicted grades',
    subtitle:
      'Predictions are fine — we score you on what you expect, and you can update them any time.',
    prefixes: [
      'academic_input.subject_list',
      'academic_input.a_level_predicted_grades',
      'academic_input.ib_total_points',
      'academic_input.ib_core_points',
      'academic_input.ib_tok_grade',
      'academic_input.ib_ee_grade',
      'academic_input.ib_math_pathway',
      'academic_input.ee_subject',
      'academic_input.ee_title',
      'academic_input.ee_summary',
      // The Extended Project is A-level coursework, so it belongs with the grades
      // rather than with the extracurriculars. Both columns live under
      // `lifestyle_preference` for schema reasons — the state slice and the screen
      // that renders it do not have to agree, and here they do not.
      'lifestyle_preference.epq_subject',
      'lifestyle_preference.epq_title'
    ]
  },
  {
    key: 'tests',
    section: 'academic_details',
    railLabel: 'Tests',
    eyebrow: 'Tests',
    question: 'English and admissions tests',
    subtitle: 'Even "not yet" is useful — it tells us which deadlines to put in front of you.',
    prefixes: [
      'academic_input.english_required',
      'academic_input.english_test_type',
      'academic_input.english_status',
      'academic_input.english_score_overall',
      'academic_input.admissions_tests',
      /**
       * SAT and ACT. These are the THIRD instance of the routing bug this table
       * exists to end, and the only one still live before this change.
       *
       * They render with the tests, but the old ladder had no branch for them, so
       * they fell through to the catch-all and `stepForFieldKey` answered "the
       * activities step". The schema caps SAT at 1600, `max=` is never enforced
       * (every Next is `type="button"` and the submit happens from Review with the
       * screen unmounted), so a student who typed 1650 was bounced to a screen that
       * does not contain the field. The comment beside those inputs describes the
       * `data-field` being added so `focusFirstError` had something to scroll to —
       * but the routing was never corrected, so it scrolled on the wrong screen.
       *
       * They remain OPTIONAL and still persist to `student_lifestyle_preference`.
       */
      'lifestyle_preference.sat_score',
      'lifestyle_preference.act_score'
    ]
  },
  {
    key: 'personal_information',
    section: 'personal_information',
    railLabel: 'About you',
    eyebrow: 'The paperwork',
    question: 'Now the boring bit',
    subtitle:
      'Last essential section. Your nationality and where you live decide your fee status, which changes the whole shortlist.',
    prefixes: ['personal_information.']
  },
  {
    key: 'activities_ambitions',
    section: 'activities_ambitions',
    railLabel: 'Activities',
    eyebrow: 'Optional · sharpens your ranking',
    question: 'What do you do outside class?',
    subtitle: 'Every field here is optional. It moves your ranking, it never gates it.',
    prefixes: [
      'activities_list',
      'lifestyle_preference.leadership_roles',
      'lifestyle_preference.commitment_level',
      'lifestyle_preference.key_activities',
      'lifestyle_preference.intl_experience',
      'lifestyle_preference.work_experience',
      'lifestyle_preference.work_experience_summary',
      'lifestyle_preference.ambition_statement'
      // EPQ is claimed by the GRADES screen, which is where it renders. The old
      // ladder tested `academic_input.epq_` — a branch that could never match, since
      // both columns live under `lifestyle_preference`.
    ]
  },
  {
    key: 'lifestyle_preferences',
    section: 'lifestyle_preferences',
    railLabel: 'Life at university',
    eyebrow: 'Optional · sharpens your ranking',
    question: 'What should university feel like?',
    subtitle: 'This is how we tell two equally good courses apart.',
    prefixes: [
      'lifestyle_preference.teaching_style',
      'lifestyle_preference.desired_location_type',
      'lifestyle_preference.campus_size',
      'lifestyle_preference.extracurricular_interests',
      'lifestyle_preference.other_extracurriculars'
    ]
  },
  {
    key: REVIEW_SCREEN_KEY,
    section: null,
    railLabel: 'Review & send',
    eyebrow: 'Last look',
    question: 'Does this all look right?',
    subtitle: 'Change anything from here, then send it and we will run your matches.',
    prefixes: []
  }
] as const;

/** 1-based, matching the wizard's `currentStep`. */
export const TOTAL_SCREENS = WIZARD_SCREENS.length;

/**
 * Derived by LOOKUP rather than as an alias of `TOTAL_SCREENS`.
 *
 * The two are the same number today because Review is last, and writing it as
 * `= TOTAL_SCREENS` said "the last screen" when the thing meant is "the review
 * screen". If a screen is ever added after Review — a confirmation, say — the alias
 * would silently start pointing at it.
 */
export const REVIEW_SCREEN_INDEX = WIZARD_SCREENS.findIndex((s) => s.key === REVIEW_SCREEN_KEY) + 1;

const tierForSection = (section: StepKey | null): ScreenTier => {
  if (!section) return 'review';
  const step = PROFILE_STEPS.find((s) => s.key === section);
  return step?.tier === 'booster' ? 'booster' : 'essential';
};

/** Tier is DERIVED from the section's tier in `steps.ts`, never restated here. */
export const screenTier = (screen: WizardScreen): ScreenTier => tierForSection(screen.section);

export const ESSENTIAL_SCREENS = WIZARD_SCREENS.filter((s) => screenTier(s) === 'essential');
export const BOOSTER_SCREENS = WIZARD_SCREENS.filter((s) => screenTier(s) === 'booster');

/** 1-based index of the first booster screen — the "skip from here" boundary. */
export const FIRST_BOOSTER_SCREEN_INDEX =
  WIZARD_SCREENS.findIndex((s) => screenTier(s) === 'booster') + 1;

export const screenKeyForIndex = (index: number): string =>
  WIZARD_SCREENS[Math.min(TOTAL_SCREENS, Math.max(1, index)) - 1].key;

export const indexForScreenKey = (key: string): number => {
  const i = WIZARD_SCREENS.findIndex((s) => s.key === key);
  return i >= 0 ? i + 1 : 1;
};

export const screenAt = (index: number): WizardScreen =>
  WIZARD_SCREENS[Math.min(TOTAL_SCREENS, Math.max(1, index)) - 1];

/**
 * Which screen a screen shares its section with. Used by the rail to tick a
 * SECTION complete only when every screen in it is done — otherwise "School" would
 * go green the moment the subject area was picked, because they share
 * `academic_input`.
 */
export const screensForSection = (section: StepKey): readonly WizardScreen[] =>
  WIZARD_SCREENS.filter((s) => s.section === section);

/**
 * The screen that owns a payload path, 1-based. Longest declared prefix wins, so
 * ordering within `prefixes` is irrelevant and adding a more specific path cannot
 * be shadowed by a broader one declared earlier.
 *
 * `fallbackIndex` is the activities screen, matching the old ladder's catch-all.
 * It is a safety net, NOT a routing strategy: `wizard-screens.test.ts` asserts
 * every schema-reachable key is claimed explicitly, so a key reaching the fallback
 * means someone added a field and did not claim it.
 */
export const screenIndexForFieldKey = (key: string): number => {
  let bestIndex = -1;
  let bestLength = -1;
  WIZARD_SCREENS.forEach((screen, i) => {
    screen.prefixes.forEach((prefix) => {
      if (key.startsWith(prefix) && prefix.length > bestLength) {
        bestLength = prefix.length;
        bestIndex = i + 1;
      }
    });
  });
  if (bestIndex > 0) return bestIndex;
  return indexForScreenKey('activities_ambitions');
};
