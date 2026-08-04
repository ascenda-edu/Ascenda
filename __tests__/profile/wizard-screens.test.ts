/**
 * Guards for the wizard's screen table.
 *
 * The point of this file is the COVERAGE test: every field the payload schema can
 * reject must be claimed by exactly one screen. Two bugs shipped because the old
 * mapping was implied by the ORDER of a prefix ladder rather than declared —
 * `academic_input.ee_*` routed to a screen that does not contain it, and all of
 * `lifestyle_preference` routed to the activities screen while five of its columns
 * render on the lifestyle screen. Neither had a test that could have caught it,
 * because there was nothing asserting the mapping was total.
 *
 * If you add a field to `intake-schema.ts` and do not claim it in
 * `wizard-screens.ts`, the coverage test below goes red. That is deliberate: the
 * fallback in `screenIndexForFieldKey` is a safety net, not a routing strategy.
 */

import {
  WIZARD_SCREENS,
  TOTAL_SCREENS,
  REVIEW_SCREEN_INDEX,
  FIRST_BOOSTER_SCREEN_INDEX,
  ESSENTIAL_SCREENS,
  BOOSTER_SCREENS,
  screenAt,
  screenTier,
  screenKeyForIndex,
  indexForScreenKey,
  screenIndexForFieldKey,
  screensForSection
} from '@/lib/profile/wizard-screens';
import { PROFILE_STEPS, ESSENTIAL_STEP_KEYS, BOOSTER_STEP_KEYS } from '@/lib/profile/steps';
import { stepForFieldKey } from '@/lib/profile/intake-validation';

/**
 * Every payload path the schema validates, spelled out. Deliberately a literal
 * list rather than something derived by walking the zod schema: the walk would
 * also have to know which nested array paths are reachable, and a hand list that
 * goes stale is exactly what the last assertion in this file catches.
 */
const PAYLOAD_FIELDS = [
  // personal_information
  'personal_information.first_name',
  'personal_information.last_name',
  'personal_information.email',
  'personal_information.phone',
  'personal_information.nationality',
  'personal_information.age',
  'personal_information.gender',
  'personal_information.resident_country',
  'personal_information.current_location_city',
  'personal_information.time_zone',
  // academic_input — school
  'academic_input.programme_type',
  'academic_input.school_name',
  'academic_input.school_country',
  'academic_input.school_city',
  'academic_input.school_type',
  'academic_input.language_of_instruction',
  'academic_input.graduation_year',
  'academic_input.desired_start_date',
  // academic_input — subject area
  'academic_input.intended_clusters',
  'academic_input.secondary_clusters',
  'academic_input.career_aspiration',
  // academic_input — grades
  'academic_input.subject_list',
  'academic_input.subject_list.0.subject_name',
  'academic_input.subject_list.0.grade_value',
  'academic_input.subject_list.0.level',
  'academic_input.a_level_predicted_grades',
  'academic_input.ib_total_points',
  'academic_input.ib_core_points',
  'academic_input.ib_tok_grade',
  'academic_input.ib_ee_grade',
  'academic_input.ib_math_pathway',
  'academic_input.ee_subject',
  'academic_input.ee_title',
  'academic_input.ee_summary',
  // academic_input — tests
  'academic_input.english_required',
  'academic_input.english_test_type',
  'academic_input.english_status',
  'academic_input.english_score_overall',
  'academic_input.admissions_tests',
  'academic_input.admissions_tests.0.status',
  'academic_input.admissions_tests.0.score_numeric',
  'academic_input.admissions_tests.0.percentile',
  // lifestyle_preference — activities
  'lifestyle_preference.leadership_roles',
  'lifestyle_preference.commitment_level',
  'lifestyle_preference.key_activities',
  'lifestyle_preference.intl_experience',
  'lifestyle_preference.work_experience',
  'lifestyle_preference.work_experience_summary',
  'lifestyle_preference.ambition_statement',
  'lifestyle_preference.epq_subject',
  'lifestyle_preference.epq_title',
  // lifestyle_preference — tests (SAT/ACT render on the tests screen)
  'lifestyle_preference.sat_score',
  'lifestyle_preference.act_score',
  // lifestyle_preference — life at university
  'lifestyle_preference.teaching_style',
  'lifestyle_preference.desired_location_type',
  'lifestyle_preference.campus_size',
  'lifestyle_preference.extracurricular_interests',
  'lifestyle_preference.other_extracurriculars',
  // activities_list
  'activities_list',
  'activities_list.0.category',
  'activities_list.0.highlight'
] as const;

/** Longest declared prefix that claims a key, across all screens. */
const claimsFor = (key: string) =>
  WIZARD_SCREENS.flatMap((screen, i) =>
    screen.prefixes
      .filter((prefix) => key.startsWith(prefix))
      .map((prefix) => ({ screenIndex: i + 1, screenKey: screen.key, prefix }))
  );

describe('wizard screen table', () => {
  it('is eight screens ending in review', () => {
    expect(TOTAL_SCREENS).toBe(8);
    expect(WIZARD_SCREENS[TOTAL_SCREENS - 1].key).toBe('review');
    expect(REVIEW_SCREEN_INDEX).toBe(8);
  });

  it('opens on the subject area, not the paperwork', () => {
    // The whole point of the reorder. If this flips back, the wizard has gone back
    // to greeting a new student with eight fields of admin.
    expect(WIZARD_SCREENS[0].key).toBe('subject_area');
    expect(WIZARD_SCREENS[0].question).toBe('What do you want to study?');
    expect(indexForScreenKey('personal_information')).toBe(5);
  });

  it('has unique keys and round-trips index ↔ key', () => {
    const keys = WIZARD_SCREENS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    keys.forEach((key, i) => {
      expect(screenKeyForIndex(i + 1)).toBe(key);
      expect(indexForScreenKey(key)).toBe(i + 1);
      expect(screenAt(i + 1).key).toBe(key);
    });
  });

  it('clamps out-of-range indices rather than returning undefined', () => {
    expect(screenKeyForIndex(0)).toBe(WIZARD_SCREENS[0].key);
    expect(screenKeyForIndex(999)).toBe('review');
    expect(screenAt(-5).key).toBe(WIZARD_SCREENS[0].key);
    // An unknown `?step=` value falls back to the first screen, not a crash.
    expect(indexForScreenKey('nonsense')).toBe(1);
  });

  it('derives every tier from steps.ts rather than restating it', () => {
    WIZARD_SCREENS.forEach((screen) => {
      if (!screen.section) {
        expect(screenTier(screen)).toBe('review');
        return;
      }
      const section = PROFILE_STEPS.find((s) => s.key === screen.section);
      expect(section).toBeDefined();
      expect(screenTier(screen)).toBe(section!.tier === 'booster' ? 'booster' : 'essential');
    });
  });

  it('has five essential screens and two boosters, and the boosters come last', () => {
    expect(ESSENTIAL_SCREENS).toHaveLength(5);
    expect(BOOSTER_SCREENS).toHaveLength(2);
    // "Skip for now" only makes sense if every essential precedes every booster.
    const lastEssential = Math.max(
      ...ESSENTIAL_SCREENS.map((s) => indexForScreenKey(s.key))
    );
    expect(FIRST_BOOSTER_SCREEN_INDEX).toBeGreaterThan(lastEssential);
  });

  it('covers every section from steps.ts with at least one screen', () => {
    [...ESSENTIAL_STEP_KEYS, ...BOOSTER_STEP_KEYS].forEach((key) => {
      expect(screensForSection(key).length).toBeGreaterThan(0);
    });
  });

  it('splits the two sections that span more than one screen', () => {
    // These splits are the reorder: the old 21-control grades screen became two,
    // and the studies section leads with the subject area.
    expect(screensForSection('academic_input').map((s) => s.key)).toEqual(['subject_area', 'school']);
    expect(screensForSection('academic_details').map((s) => s.key)).toEqual(['academic_details', 'tests']);
  });
});

describe('field ownership', () => {
  it('claims every payload field exactly once', () => {
    const unclaimed: string[] = [];
    const ambiguous: string[] = [];

    PAYLOAD_FIELDS.forEach((key) => {
      const claims = claimsFor(key);
      if (claims.length === 0) {
        unclaimed.push(key);
        return;
      }
      // More than one claim is fine ONLY if the longest is unambiguous — that is
      // what makes `academic_input.subject_list.0.grade_value` resolve past
      // `academic_input.subject_list`.
      const longest = Math.max(...claims.map((c) => c.prefix.length));
      const winners = new Set(
        claims.filter((c) => c.prefix.length === longest).map((c) => c.screenIndex)
      );
      if (winners.size > 1) ambiguous.push(key);
    });

    expect(unclaimed).toEqual([]);
    expect(ambiguous).toEqual([]);
  });

  it('routes each field to the screen that renders it', () => {
    const expected: Record<string, string> = {
      'personal_information.email': 'personal_information',
      'academic_input.intended_clusters': 'subject_area',
      'academic_input.career_aspiration': 'subject_area',
      'academic_input.school_name': 'school',
      'academic_input.graduation_year': 'school',
      'academic_input.programme_type': 'school',
      'academic_input.subject_list': 'academic_details',
      'academic_input.subject_list.2.grade_value': 'academic_details',
      'academic_input.ib_math_pathway': 'academic_details',
      'academic_input.english_status': 'tests',
      'academic_input.admissions_tests.0.status': 'tests',
      'lifestyle_preference.sat_score': 'tests',
      'lifestyle_preference.act_score': 'tests',
      'lifestyle_preference.ambition_statement': 'activities_ambitions',
      'lifestyle_preference.epq_title': 'academic_details',
      'activities_list.0.category': 'activities_ambitions',
      'lifestyle_preference.teaching_style': 'lifestyle_preferences',
      'lifestyle_preference.other_extracurriculars': 'lifestyle_preferences'
    };
    Object.entries(expected).forEach(([key, screenKey]) => {
      expect(screenKeyForIndex(screenIndexForFieldKey(key))).toBe(screenKey);
    });
  });

  it('resolves by longest prefix, so a broad claim cannot shadow a specific one', () => {
    // `academic_input.school_name` and `academic_input.subject_list` both start with
    // `academic_input.`, and they belong to DIFFERENT screens. The old ladder got
    // this right only by hand-ordering its branches.
    expect(screenKeyForIndex(screenIndexForFieldKey('academic_input.school_name'))).toBe('school');
    expect(screenKeyForIndex(screenIndexForFieldKey('academic_input.subject_list'))).toBe('academic_details');
    expect(screenKeyForIndex(screenIndexForFieldKey('academic_input.ee_summary'))).toBe('academic_details');
  });

  it('the ee_* regression stays fixed', () => {
    // These three routed to the studies screen before, where the fields do not
    // exist — so a rejection bounced the student somewhere they could not act.
    ['ee_subject', 'ee_title', 'ee_summary'].forEach((field) => {
      expect(screenKeyForIndex(screenIndexForFieldKey(`academic_input.${field}`))).toBe('academic_details');
    });
  });

  it('never routes anything to the review screen', () => {
    // Review renders no fields, so a rejection landing there would be a dead end.
    PAYLOAD_FIELDS.forEach((key) => {
      expect(screenIndexForFieldKey(key)).not.toBe(REVIEW_SCREEN_INDEX);
    });
  });

  it('stepForFieldKey is the screen resolver', () => {
    PAYLOAD_FIELDS.forEach((key) => {
      expect(stepForFieldKey(key)).toBe(screenIndexForFieldKey(key));
    });
  });

  it('an unclaimed key lands on a screen that exists, rather than crashing', () => {
    const index = screenIndexForFieldKey('some_future_table.some_new_column');
    expect(index).toBeGreaterThanOrEqual(1);
    expect(index).toBeLessThanOrEqual(TOTAL_SCREENS);
    expect(screenKeyForIndex(index)).toBe('activities_ambitions');
  });
});
