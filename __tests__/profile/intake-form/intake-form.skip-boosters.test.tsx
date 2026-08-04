/**
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │  "Skip for now" — the booster-deferral path                               │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * WHY THIS FILE EXISTS
 * The 2026-08-03 re-tiering (`src/lib/profile/steps.ts`) split the wizard's five
 * steps into three ESSENTIAL ones that gate app entry and two BOOSTERS that can
 * be deferred, and added a "Skip for now" button to submit from a booster step.
 * It arrived with no rendered coverage at all: `intake-form.characterization.test.tsx`
 * mocks `markOnboardingStep` and never asserts it, and no test in the repo ever
 * clicks the button. `__tests__/onboarding/tiering.test.ts` guards the *data*
 * half — that `persist-intake` upserts the lifestyle row unconditionally — but
 * it never renders the form, so it cannot see the wizard half at all.
 *
 * That gap matters more than most, because the two halves fail independently:
 * if the skip path ever stops building a FULL payload, a skipping student clears
 * the essential gate and lands on an empty matches page, and every existing test
 * stays green. This file is the wizard-side guard.
 *
 * WHAT IS BEING PINNED (from StudentIntakeForm.tsx `canSkipBoosters`)
 *   1. Offered only from the first booster step onward. On an essential step,
 *      submitting fails validation and throws you backwards — a button that
 *      looks like an exit and behaves like an error is worse than no button.
 *   2. Offered only when steps 1-3 already validate, because those are what
 *      `runMatching` needs. A skip that produced an empty matches page would
 *      defeat its own purpose.
 *   3. It submits through the SAME `handleFinalSubmit` as the Review step, so a
 *      deferred profile and a completed one cannot diverge in what they persist.
 *   4. The `skipped_boosters_at` breadcrumb is fire-and-forget: it must never
 *      delay or block the save the student actually asked for.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { StudentProfilePayload } from '@/lib/profile/intake-types';
import { FIRST_BOOSTER_STEP_INDEX, PROFILE_STEPS } from '@/lib/profile/steps';

// ── Seams (same set, and same reasons, as the characterization suite) ─────────

jest.mock('@/components/theme/theme-toggle', () => ({
  ThemeToggle: () => null
}));

type SaveResult = { success: boolean; message?: string };
const saveStudentIntake = jest.fn(
  async (_payload: unknown): Promise<SaveResult> => ({ success: true })
);
jest.mock('@/app/profile/actions', () => ({
  saveStudentIntake: (payload: unknown) => saveStudentIntake(payload)
}));

const markOnboardingStep = jest.fn(async (_key: string) => ({ success: true as const }));
jest.mock('@/lib/onboarding/actions', () => ({
  markOnboardingStep: (key: string) => markOnboardingStep(key)
}));

jest.mock('next/navigation', () => {
  const React = require('react') as typeof import('react');
  let path = '/profile/wizard';
  let query = '';
  const subs = new Set<() => void>();
  let cache: { key: string; params: URLSearchParams } | null = null;
  const getParams = () => {
    if (!cache || cache.key !== query) cache = { key: query, params: new URLSearchParams(query) };
    return cache.params;
  };
  const getPath = () => path;
  const subscribe = (fn: () => void) => {
    subs.add(fn);
    return () => { subs.delete(fn); };
  };
  const apply = (url: string) => {
    const [nextPath, nextQuery = ''] = url.split('?');
    path = nextPath;
    query = nextQuery;
    window.history.replaceState(null, '', url);
    subs.forEach((fn) => fn());
  };
  const push = jest.fn(apply);
  const replace = jest.fn(apply);
  return {
    useRouter: () => ({
      push, replace,
      back: jest.fn(), forward: jest.fn(), refresh: jest.fn(), prefetch: jest.fn()
    }),
    usePathname: () => React.useSyncExternalStore(subscribe, getPath, getPath),
    useSearchParams: () => React.useSyncExternalStore(subscribe, getParams, getParams),
    __nav: {
      reset: () => {
        path = '/profile/wizard';
        query = '';
        window.history.replaceState(null, '', path);
        push.mockClear();
        replace.mockClear();
      }
    }
  };
});

const nav = (jest.requireMock('next/navigation') as { __nav: { reset: () => void } }).__nav;

// Radix Select needs these four; jsdom ships none.
Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
Element.prototype.setPointerCapture = Element.prototype.setPointerCapture ?? (() => undefined);
Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? (() => undefined);
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => undefined);
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

import { StudentIntakeForm } from '@/app/profile/_components/StudentIntakeForm';

// ── Fixture ──────────────────────────────────────────────────────────────────

/**
 * An A-level student with all three ESSENTIAL steps satisfied and both boosters
 * empty — precisely the state a "Skip for now" is meant to submit from. The
 * lifestyle fields are all null/empty here on purpose: that is what makes the
 * `writeStudentIntake` coupling load-bearing, and `tiering.test.ts` §3 is what
 * guards the other end of it.
 */
const SKIPPABLE: StudentProfilePayload = {
  personal_information: {
    first_name: 'Nadia',
    last_name: 'Haddad',
    email: 'nadia@school.example',
    phone: null,
    nationality: 'Jordan',
    age: 18,
    gender: null,
    resident_country: 'United Kingdom',
    current_location_city: null,
    time_zone: 'Europe/London'
  },
  academic_input: {
    programme_type: 'A_LEVEL',
    school_name: 'Manchester Grammar',
    school_country: 'United Kingdom',
    school_city: null,
    school_type: null,
    language_of_instruction: null,
    graduation_year: 2027,
    desired_start_date: null,
    intended_clusters: ['engineering'],
    secondary_clusters: [],
    career_aspiration: null,
    subject_list: [
      { subject_name: 'Mathematics', level: 'A_LEVEL', grade_value: 'A*' },
      { subject_name: 'Physics', level: 'A_LEVEL', grade_value: 'A' },
      { subject_name: 'Chemistry', level: 'A_LEVEL', grade_value: 'A' }
    ],
    ib_total_points: null,
    ib_core_points: null,
    ib_tok_grade: null,
    ib_ee_grade: null,
    ib_math_pathway: null,
    ee_subject: null,
    ee_title: null,
    ee_summary: null,
    a_level_predicted_grades: { Mathematics: 'A*', Physics: 'A', Chemistry: 'A' },
    english_required: false,
    english_test_type: 'WAIVER',
    english_status: 'met',
    english_score_overall: null,
    admissions_tests: []
  },
  lifestyle_preference: {
    teaching_style: null,
    desired_location_type: null,
    campus_size: null,
    extracurricular_interests: [],
    other_extracurriculars: null,
    leadership_roles: [],
    commitment_level: null,
    key_activities: [],
    sat_score: null,
    act_score: null,
    intl_experience: [],
    work_experience: false,
    work_experience_summary: null,
    ambition_statement: null,
    epq_subject: null,
    epq_title: null
  },
  activities_list: []
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const setup = () => userEvent.setup();
const renderForm = (props: Parameters<typeof StudentIntakeForm>[0] = {}) =>
  render(<StudentIntakeForm {...props} />);

const SIDEBAR: Record<number, RegExp> = {
  1: /Personal info/, 2: /Your studies/, 3: /Grades & tests/,
  4: /Activities/, 5: /Lifestyle/, 6: /Review/
};
const STEP_TITLE: Record<number, string> = {
  1: 'Who are you?', 2: 'Your studies', 3: 'Grades & tests',
  4: 'Activities & ambitions', 5: 'Life at university', 6: 'Review & confirm'
};
const STEP_BODY: Record<number, string> = {
  1: 'Add more than one if applicable.', 2: 'Which qualification are you taking?',
  3: 'Subjects & predicted grades', 4: 'Leadership roles',
  5: 'Teaching style preference', 6: 'Personal information'
};

const skipButton = () => screen.queryByRole('button', { name: 'Skip for now' });

/**
 * Hydrate on step 1, then walk to `step` via the sidebar — the same route
 * `hydrateThenGoTo` takes in the characterization suite, and for the same
 * reason: steps 2-5 hold Radix Selects, and rendering a payload straight onto
 * one of them is the F-A shape. Forward sidebar jumps only validate the step
 * being LEFT, which this fixture satisfies.
 */
const hydrateThenGoTo = async (
  user: ReturnType<typeof setup>,
  payload: StudentProfilePayload,
  step: 2 | 3 | 4 | 5 | 6
) => {
  const view = renderForm({ initialPayload: payload, initialStep: 1 });
  await user.click(screen.getByRole('button', { name: SIDEBAR[step] }));
  await screen.findByRole('heading', { name: STEP_TITLE[step] });
  await screen.findByText(STEP_BODY[step]);
  // Returned so a test that renders the form TWICE can unmount the first tree.
  // Two live copies make every `getByRole` ambiguous.
  return view;
};

beforeEach(() => {
  window.localStorage.clear();
  nav.reset();
  saveStudentIntake.mockClear();
  saveStudentIntake.mockResolvedValue({ success: true });
  markOnboardingStep.mockClear();
  markOnboardingStep.mockResolvedValue({ success: true as const });
});

afterEach(async () => {
  window.dispatchEvent(new Event('popstate'));
  await new Promise((resolve) => setTimeout(resolve, 70));
});

// ═════════════════════════════════════════════════════════════════════════════
// WHERE THE BUTTON IS OFFERED
// ═════════════════════════════════════════════════════════════════════════════

describe('Skip for now — where it is offered', () => {
  it('the tier boundary is derived, not hardcoded at 4', () => {
    // If this ever fails, the step numbers below are lying and the rest of this
    // file is testing the wrong boundary. `steps.ts` is the source of truth.
    expect(FIRST_BOOSTER_STEP_INDEX).toBe(4);
    expect(PROFILE_STEPS).toHaveLength(5);
  });

  it('is absent on step 1, even with everything essential already filled in', () => {
    renderForm({ initialPayload: clone(SKIPPABLE), initialStep: 1 });
    expect(skipButton()).not.toBeInTheDocument();
  });

  it('is absent on step 2 — submitting there would fail validation and bounce backwards', async () => {
    const user = setup();
    await hydrateThenGoTo(user, clone(SKIPPABLE), 2);
    expect(skipButton()).not.toBeInTheDocument();
  });

  it('is absent on step 3, the last essential step', async () => {
    const user = setup();
    await hydrateThenGoTo(user, clone(SKIPPABLE), 3);
    expect(skipButton()).not.toBeInTheDocument();
  });

  it('appears on step 4, the first booster step', async () => {
    const user = setup();
    await hydrateThenGoTo(user, clone(SKIPPABLE), 4);
    expect(skipButton()).toBeInTheDocument();
  });

  it('appears on step 5, the second booster step', async () => {
    const user = setup();
    await hydrateThenGoTo(user, clone(SKIPPABLE), 5);
    expect(skipButton()).toBeInTheDocument();
  });

  it('is absent on Review, which has its own submit button', async () => {
    const user = setup();
    await hydrateThenGoTo(user, clone(SKIPPABLE), 6);
    expect(skipButton()).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit & see matches' })).toBeInTheDocument();
  });

  it('is absent on a booster step when the ESSENTIAL steps do not validate', () => {
    // An empty form rendered straight onto step 4. The student is standing on a
    // booster step, but steps 1-3 are empty — so a skip would write a profile
    // `runMatching` cannot rank, and the offer is withheld.
    renderForm({ initialStep: 4 });
    expect(skipButton()).not.toBeInTheDocument();
  });

  it('withholds the offer when only ONE essential step is short', async () => {
    const user = setup();
    const payload = clone(SKIPPABLE);
    payload.academic_input.school_name = ''; // step 2 now fails
    await hydrateThenGoTo(user, payload, 4);
    expect(skipButton()).not.toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// WHAT IT DOES
// ═════════════════════════════════════════════════════════════════════════════

describe('Skip for now — what it does', () => {
  it('saves, and records the skipped_boosters_at breadcrumb', async () => {
    const user = setup();
    await hydrateThenGoTo(user, clone(SKIPPABLE), 4);
    await user.click(skipButton()!);

    await waitFor(() => expect(saveStudentIntake).toHaveBeenCalledTimes(1));
    expect(markOnboardingStep).toHaveBeenCalledWith('skipped_boosters_at');
  });

  it('submits the SAME payload the Review step would have submitted', async () => {
    // The two paths share `handleFinalSubmit` deliberately: a deferred profile
    // and a completed one must not diverge in what they persist. This is the
    // assertion that catches them drifting apart.
    const user = setup();
    const first = await hydrateThenGoTo(user, clone(SKIPPABLE), 4);
    await user.click(skipButton()!);
    await waitFor(() => expect(saveStudentIntake).toHaveBeenCalledTimes(1));
    const viaSkip = saveStudentIntake.mock.calls[0][0] as StudentProfilePayload;

    first.unmount();
    window.localStorage.clear(); // the first tree left a draft; it must not hydrate the second
    saveStudentIntake.mockClear();
    const second = setup();
    await hydrateThenGoTo(second, clone(SKIPPABLE), 6);
    await second.click(screen.getByRole('button', { name: 'Submit & see matches' }));
    await waitFor(() => expect(saveStudentIntake).toHaveBeenCalledTimes(1));
    const viaReview = saveStudentIntake.mock.calls[0][0] as StudentProfilePayload;

    expect(viaSkip).toEqual(viaReview);
  }, 30000);

  it('still carries a lifestyle_preference object when both boosters are empty', async () => {
    // `runMatching` needs the lifestyle ROW to exist even though it needs none
    // of its FIELDS, and `writeStudentIntake` upserts it from whatever this
    // payload holds. If the skip path ever stopped emitting this key, skippers
    // would clear the gate and see zero matches — with tiering.test.ts still
    // green, because it never renders the form.
    const user = setup();
    await hydrateThenGoTo(user, clone(SKIPPABLE), 4);
    await user.click(skipButton()!);

    await waitFor(() => expect(saveStudentIntake).toHaveBeenCalledTimes(1));
    const sent = saveStudentIntake.mock.calls[0][0] as StudentProfilePayload;
    expect(sent.lifestyle_preference).toBeDefined();
    expect(sent.lifestyle_preference.teaching_style).toBeNull();
    expect(sent.lifestyle_preference.leadership_roles).toEqual([]);
  });

  it('saves even when the breadcrumb REJECTS — it is fire-and-forget', async () => {
    // The breadcrumb only sharpens a dashboard nudge. Losing it must never cost
    // the student the save they actually asked for.
    const user = setup();
    markOnboardingStep.mockRejectedValue(new Error('offline'));
    await hydrateThenGoTo(user, clone(SKIPPABLE), 4);
    await user.click(skipButton()!);

    await waitFor(() => expect(saveStudentIntake).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Profile saved! Your matches are ready.')).toBeInTheDocument();
  });

  it('reports success on the booster step itself, without a detour through Review', async () => {
    const user = setup();
    await hydrateThenGoTo(user, clone(SKIPPABLE), 4);
    await user.click(skipButton()!);

    expect(await screen.findByText('Profile saved! Your matches are ready.')).toBeInTheDocument();
    // Still on step 4 — the skip is an exit, not a jump to Review.
    expect(screen.getByRole('heading', { name: 'Activities & ambitions' })).toBeInTheDocument();
  });

  it('a failed save surfaces an alert and does not claim the profile was saved', async () => {
    const user = setup();
    saveStudentIntake.mockResolvedValue({ success: false, message: 'Some answers could not be saved.' });
    await hydrateThenGoTo(user, clone(SKIPPABLE), 4);
    await user.click(skipButton()!);

    expect(await screen.findByRole('alert')).toHaveTextContent('Some answers could not be saved.');
    expect(screen.queryByText('Profile saved! Your matches are ready.')).not.toBeInTheDocument();
  });
});
