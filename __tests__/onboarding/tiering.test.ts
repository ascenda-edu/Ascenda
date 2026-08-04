/**
 * The onboarding gate's threshold, and the coupling that keeps a skipped
 * profile useful.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The re-tiering (2026-08-03) moved two of the five intake steps from
 * "mandatory" to "optional", so a student can now reach the app without them.
 * That is only correct because of a fact nothing else enforces: `runMatching`
 * needs a `student_lifestyle_preference` ROW, and the boosters are the steps
 * that would normally create it. `writeStudentIntake` happens to upsert that row
 * unconditionally, which is what makes skipping safe.
 *
 * "Happens to" is the problem. If that upsert ever becomes conditional on the
 * lifestyle fields being non-empty, students who skip will pass the gate and
 * land on an empty matches page — silently, with no test failing. Section 3 is
 * the guard.
 */

import {
  PROFILE_STEPS,
  ESSENTIAL_STEP_KEYS,
  BOOSTER_STEP_KEYS,
  FIRST_BOOSTER_STEP_INDEX,
  isBoosterStep
} from '@/lib/profile/steps';
import {
  buildStepCompletion,
  isProfileComplete,
  isProfileEssentialComplete,
  type ProfileRecordGroup
} from '@/lib/profile/completion';

/* ── fixtures ─────────────────────────────────────────────────────────────── */

const personal = {
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada@example.com',
  nationality: 'British',
  resident_country: 'United Kingdom'
};

const academicInput = {
  programme_type: 'IB',
  school_name: 'Demo School',
  school_country: 'United Kingdom',
  graduation_year: 2027,
  intended_clusters: ['computer_science'],
  english_required: true,
  english_status: 'met'
};

/** Steps 1-3 filled in, boosters untouched — the state a "Skip for now" leaves. */
const skippedBoosters = (): ProfileRecordGroup => ({
  personal,
  academicInput,
  subjectCount: 6,
  // The all-null row `writeStudentIntake` upserts regardless of steps 4-5.
  // Present, but with nothing in it — which is exactly the case the two
  // booster completion rules are asked about below.
  lifestyle: { extracurricular_interests: null }
});

/**
 * All five steps answered. Both booster steps need CONTENT of their own now,
 * and they write to the same table — so a fixture that sets only
 * `extracurricular_interests` satisfies step 4 and leaves step 5 outstanding.
 * That asymmetry is the point of the rule, so the fixture spells out both.
 */
const everythingDone = (): ProfileRecordGroup => ({
  personal,
  academicInput,
  subjectCount: 6,
  lifestyle: {
    // Step 4 (activities_ambitions). CHANGED 2026-08-04: this used to rely on
    // `extracurricular_interests` as its only step-4 evidence, because
    // `completion.ts` attributed that field here. It does not any more — the chip
    // group renders on the LIFESTYLE step, and attributing it to activities meant
    // ticking one interest chip marked a step the student never opened. Step 4 now
    // needs an actual activities answer, which is what this fixture should always
    // have supplied.
    commitment_level: 'deep',
    key_activities: ['Debate / Model UN'],
    // Step 5 (lifestyle_preferences) — the three enums plus the interests.
    extracurricular_interests: ['Sports/fitness'],
    teaching_style: 'mixed',
    desired_location_type: 'major_city',
    campus_size: 'large'
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. The tiers themselves.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('step tiers', () => {
  it('every step is exactly one tier', () => {
    expect([...ESSENTIAL_STEP_KEYS, ...BOOSTER_STEP_KEYS].sort()).toEqual(
      PROFILE_STEPS.map((step) => step.key).sort()
    );
    // No overlap — a step in both lists would gate AND be skippable.
    expect(ESSENTIAL_STEP_KEYS.filter((key) => (BOOSTER_STEP_KEYS as string[]).includes(key))).toEqual([]);
  });

  it('gates on exactly the three sections runMatching requires', () => {
    // Pinned as literals, NOT derived from the constant. Deriving would make
    // this test agree with any future re-tiering by construction, including one
    // that let `academic_details` become optional — which would let students
    // through with no subjects and therefore no possible match.
    //
    // src/lib/matching/service.ts:292-303 returns zero matches unless it finds
    // an academic_input row, >=1 student_subjects row, and a lifestyle row.
    expect(ESSENTIAL_STEP_KEYS).toEqual(['personal_information', 'academic_input', 'academic_details']);
    expect(BOOSTER_STEP_KEYS).toEqual(['activities_ambitions', 'lifestyle_preferences']);
  });

  it('the boosters are contiguous and last, so "skip from here" is meaningful', () => {
    // The wizard offers one skip from FIRST_BOOSTER_STEP_INDEX onward. If a
    // booster sat between two essentials, that single boundary would skip an
    // essential step too.
    const tiers = PROFILE_STEPS.map((step) => step.tier);
    expect(tiers.indexOf('booster')).toBe(tiers.lastIndexOf('essential') + 1);
    expect(FIRST_BOOSTER_STEP_INDEX).toBe(tiers.indexOf('booster') + 1);
  });

  it('isBoosterStep agrees with the tier field', () => {
    for (const step of PROFILE_STEPS) {
      expect(isBoosterStep(step.key)).toBe(step.tier === 'booster');
    }
    expect(isBoosterStep('not_a_step')).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. The two thresholds must differ, and differ in the right direction.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('the gate vs the celebration', () => {
  it('a student who skipped the boosters passes the gate', async () => {
    expect(isProfileEssentialComplete(skippedBoosters())).toBe(true);
  });

  it('...but is not reported as 100% complete', () => {
    // The distinction the whole change rests on. If these two ever returned the
    // same answer, either the gate is back to demanding all five steps or the
    // dashboard has started claiming a partial profile is finished.
    const records = skippedBoosters();
    const completion = buildStepCompletion(records);

    expect(isProfileComplete(records)).toBe(false);
    expect(completion.activities_ambitions).toBe(false);
    expect(completion.lifestyle_preferences).toBe(false);
  });

  it('a fully finished profile satisfies both', () => {
    expect(isProfileEssentialComplete(everythingDone())).toBe(true);
    expect(isProfileComplete(everythingDone())).toBe(true);
  });

  it.each([
    ['personal_information', { personal: null }],
    ['academic_input', { academicInput: null }],
    ['academic_details', { subjectCount: 0 }]
  ])('missing %s still blocks entry', (_label, override) => {
    const records = { ...everythingDone(), ...override } as ProfileRecordGroup;
    expect(isProfileEssentialComplete(records)).toBe(false);
  });

  it('the gate is strictly weaker than full completion, never stricter', () => {
    // A stricter gate would demand something the profile page never asks for,
    // stranding students who believe they are done.
    const records = skippedBoosters();
    expect(isProfileComplete(records)).toBe(false);
    expect(isProfileEssentialComplete(records)).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. The unenforced coupling — see the file header.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('skipping the boosters still leaves matching what it needs', () => {
  it('persist-intake upserts the lifestyle row unconditionally', () => {
    // Read as SOURCE TEXT rather than executed, because writing the row needs a
    // live Supabase client. What is being defended is a structural property:
    // that the upsert is not guarded by a check on the lifestyle fields.
    //
    // A source scan can go vacuous, so the match itself is asserted first.
    const source = require('node:fs').readFileSync(
      require('node:path').join(__dirname, '../../src/lib/profile/persist-intake.ts'),
      'utf8'
    ) as string;

    const lines = source.split('\n');
    const upsertIndex = lines.findIndex((candidate) =>
      candidate.includes("from('student_lifestyle_preference').upsert(")
    );
    expect(upsertIndex).toBeGreaterThan(-1);
    const line = lines[upsertIndex];

    // The upsert must be inside `writeStudentIntake` itself, not in some helper.
    // Without this the indent check below goes VACUOUS under the most likely
    // refactor: extracting the upsert into its own function leaves it at indent 2
    // again — inside a helper that `writeStudentIntake` is then free to call
    // conditionally, which is the exact failure this test exists to catch.
    const writeIndex = lines.findIndex((candidate) => candidate.includes('export const writeStudentIntake'));
    expect(writeIndex).toBeGreaterThan(-1);
    expect(upsertIndex).toBeGreaterThan(writeIndex);

    // Indentation as the structural signal. `writeStudentIntake` is a flat
    // sequence of awaited upserts at one level of nesting, so this statement
    // sits at the function body's base indent (2 spaces). Wrapping it in
    // `if (hasLifestyleAnswers) { … }` — the exact change that would strand
    // skippers on an empty matches page — indents it further, and fails here.
    //
    // Deliberately not a regex for `if`: the preceding line is
    // `if (academicError) throw …`, so scanning a window of text for the
    // keyword reports a conditional that has nothing to do with this upsert.
    const indent = line!.length - line!.trimStart().length;
    expect(indent).toBe(2);
  });

  it('the lifestyle row that skipping produces is enough for the gate', () => {
    // An all-null lifestyle row must satisfy the ESSENTIAL threshold — that is
    // the row `runMatching` looks for. It must NOT satisfy the booster steps,
    // or the wizard would report work as done that nobody did.
    const records = skippedBoosters();
    expect(records.lifestyle).not.toBeNull();
    expect(isProfileEssentialComplete(records)).toBe(true);
    expect(buildStepCompletion(records).lifestyle_preferences).toBe(false);
  });
});
