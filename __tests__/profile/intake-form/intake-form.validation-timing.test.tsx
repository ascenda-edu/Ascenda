/**
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │  WHEN ERRORS APPEAR, AND WHEN THEY GO AWAY                                │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * New behaviour, so it lives in its own file rather than in
 * `intake-form.characterization.test.tsx` — that suite's stated job is "what this
 * DOES TODAY", and diluting it with aspirational assertions destroys the one
 * property that makes it useful during a refactor.
 *
 * THE THREE RULES UNDER TEST
 *   1. Never on change for a field with no error yet. Typing "a" into Email must
 *      not produce "Enter a valid email."
 *   2. On blur, for that one field, and only if it has content. Tabbing out of an
 *      empty required field is not an error worth reporting yet; typing something
 *      invalid and leaving is.
 *   3. Live-clear the moment the field is satisfied.
 *
 * WHAT MUST NOT CHANGE, and is re-asserted here as a guard
 *   `goNext` still surfaces EVERY error for the step at once, including empty
 *   required fields. Both additions move errors in one direction only — blur adds
 *   a single key, change removes keys — so the batch behaviour is untouched.
 *
 *   A payload rejection survives the live-clear pass. `handleFinalSubmit` routes a
 *   schema rejection to the offending field's own step, and the pass must not
 *   delete it on the way. The first version of that guard got this exactly
 *   backwards and an independent audit mutation-proved it — see the
 *   "a payload rejection survives" describe below, which is the test this header
 *   used to claim existed and did not.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { StudentProfilePayload } from '@/lib/profile/intake-types';

// ── Seams (same set, same reasons, as the characterization suite) ─────────────

jest.mock('@/components/theme/theme-toggle', () => ({ ThemeToggle: () => null }));

const saveStudentIntake = jest.fn(async (_payload: unknown) => ({ success: true }));
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
  const subscribe = (fn: () => void) => { subs.add(fn); return () => { subs.delete(fn); }; };
  const apply = (url: string) => {
    const [nextPath, nextQuery = ''] = url.split('?');
    path = nextPath; query = nextQuery;
    window.history.replaceState(null, '', url);
    subs.forEach((fn) => fn());
  };
  const push = jest.fn(apply);
  const replace = jest.fn(apply);
  return {
    useRouter: () => ({ push, replace, back: jest.fn(), forward: jest.fn(), refresh: jest.fn(), prefetch: jest.fn() }),
    usePathname: () => React.useSyncExternalStore(subscribe, getPath, getPath),
    useSearchParams: () => React.useSyncExternalStore(subscribe, getParams, getParams),
    __nav: {
      reset: () => {
        path = '/profile/wizard'; query = '';
        window.history.replaceState(null, '', path);
        push.mockClear(); replace.mockClear();
      }
    }
  };
});

const nav = (jest.requireMock('next/navigation') as { __nav: { reset: () => void } }).__nav;

Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
Element.prototype.setPointerCapture = Element.prototype.setPointerCapture ?? (() => undefined);
Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? (() => undefined);
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => undefined);
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= class {
  observe() {} unobserve() {} disconnect() {}
};

import { StudentIntakeForm } from '@/app/profile/_components/StudentIntakeForm';

/**
 * All three ESSENTIAL steps satisfied, so `handleFinalSubmit` gets past
 * `validateStep1/2/3` and actually reaches `validatePayload` — which is the only
 * way to exercise a schema rejection.
 */
const COMPLETE_IB: StudentProfilePayload = {
  personal_information: {
    first_name: 'Amara', last_name: 'Okonkwo', email: 'amara@school.example',
    phone: null, nationality: 'Nigeria', age: 17, gender: null,
    resident_country: 'Thailand', current_location_city: null, time_zone: 'Asia/Bangkok'
  },
  academic_input: {
    programme_type: 'IB', school_name: 'Bangkok International School',
    school_country: 'Thailand', school_city: null, school_type: null,
    language_of_instruction: null, graduation_year: 2027, desired_start_date: null,
    intended_clusters: ['economics_quant'], secondary_clusters: [], career_aspiration: null,
    subject_list: [
      { subject_name: 'Mathematics', level: 'HL', grade_value: 7 },
      { subject_name: 'Economics', level: 'HL', grade_value: 6 },
      { subject_name: 'Physics', level: 'HL', grade_value: 6 },
      { subject_name: 'English Literature', level: 'SL', grade_value: 6 },
      { subject_name: 'History', level: 'SL', grade_value: 5 },
      { subject_name: 'Modern Languages', level: 'SL', grade_value: 5 }
    ],
    ib_total_points: 35, ib_core_points: null, ib_tok_grade: null, ib_ee_grade: null,
    // Required by validateStep3 for IB — without it the submit bounces to step 3
    // and never reaches validatePayload, which is the whole point of the fixture.
    ib_math_pathway: 'AA_HL', ee_subject: null, ee_title: null, ee_summary: null,
    a_level_predicted_grades: null, english_required: false, english_test_type: 'WAIVER',
    english_status: 'met', english_score_overall: null, admissions_tests: []
  },
  lifestyle_preference: {
    teaching_style: null, desired_location_type: null, campus_size: null,
    extracurricular_interests: [], other_extracurriculars: null, leadership_roles: [],
    commitment_level: null, key_activities: [], sat_score: null, act_score: null,
    intl_experience: [], work_experience: false, work_experience_summary: null,
    ambition_statement: null, epq_subject: null, epq_title: null
  },
  activities_list: []
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const setup = () => userEvent.setup();
const renderForm = (props: Parameters<typeof StudentIntakeForm>[0] = {}) =>
  render(<StudentIntakeForm {...props} />);

const labelled = (label: string) =>
  screen.getByLabelText(new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));

const BAD_EMAIL = 'Enter a valid email.';
const NO_FIRST_NAME = 'First name is required.';

beforeEach(() => {
  window.localStorage.clear();
  nav.reset();
  saveStudentIntake.mockClear();
  saveStudentIntake.mockResolvedValue({ success: true });
});

afterEach(async () => {
  window.dispatchEvent(new Event('popstate'));
  await new Promise((resolve) => setTimeout(resolve, 70));
});

// ═════════════════════════════════════════════════════════════════════════════

describe('errors do not appear while you are still typing', () => {
  it('a partial email produces no error', async () => {
    const user = setup();
    renderForm();
    await user.type(labelled('Email'), 'a');
    expect(screen.queryByText(BAD_EMAIL)).not.toBeInTheDocument();
  });

  it('an email typed all the way to valid never shows an error', async () => {
    // The keystroke-validation failure mode: every intermediate value of a valid
    // email is itself invalid, so validating on change flashes an error the whole
    // way through.
    const user = setup();
    renderForm();
    await user.type(labelled('Email'), 'alex@school.example');
    expect(screen.queryByText(BAD_EMAIL)).not.toBeInTheDocument();
  });
});

describe('errors appear on blur, per field', () => {
  it('leaving an invalid email surfaces its error', async () => {
    const user = setup();
    renderForm();
    await user.type(labelled('Email'), 'not-an-email');
    await user.tab();
    expect(await screen.findByText(BAD_EMAIL)).toBeInTheDocument();
  });

  it('leaving an EMPTY required field surfaces nothing', async () => {
    // Tabbing through a form you have not filled in yet is not a mistake.
    const user = setup();
    renderForm();
    await user.click(labelled('First name'));
    await user.tab();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(screen.queryByText(NO_FIRST_NAME)).not.toBeInTheDocument();
  });

  it('surfaces only the field left, not the whole step', async () => {
    const user = setup();
    renderForm();
    await user.type(labelled('Email'), 'nope');
    await user.tab();
    expect(await screen.findByText(BAD_EMAIL)).toBeInTheDocument();
    // First name and Last name are equally empty and equally required.
    expect(screen.queryByText(NO_FIRST_NAME)).not.toBeInTheDocument();
    expect(screen.queryByText('Last name is required.')).not.toBeInTheDocument();
  });
});

describe('errors clear the moment they are fixed', () => {
  it('correcting an email drops its error without waiting for Next', async () => {
    const user = setup();
    renderForm();
    await user.type(labelled('Email'), 'not-an-email');
    await user.tab();
    expect(await screen.findByText(BAD_EMAIL)).toBeInTheDocument();

    await user.clear(labelled('Email'));
    await user.type(labelled('Email'), 'alex@school.example');
    await waitFor(() => expect(screen.queryByText(BAD_EMAIL)).not.toBeInTheDocument());
  });

  it('filling a required field surfaced by Next clears it as you type', async () => {
    const user = setup();
    renderForm();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText(NO_FIRST_NAME)).toBeInTheDocument();

    await user.type(labelled('First name'), 'Alex');
    await waitFor(() => expect(screen.queryByText(NO_FIRST_NAME)).not.toBeInTheDocument());
    // The others are still outstanding — only the fixed one went.
    expect(screen.getByText('Last name is required.')).toBeInTheDocument();
  });

  it('a cleared error does not come back on the next keystroke elsewhere', async () => {
    const user = setup();
    renderForm();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText(NO_FIRST_NAME)).toBeInTheDocument();

    await user.type(labelled('First name'), 'Alex');
    await waitFor(() => expect(screen.queryByText(NO_FIRST_NAME)).not.toBeInTheDocument());
    await user.type(labelled('Last name'), 'S');
    expect(screen.queryByText(NO_FIRST_NAME)).not.toBeInTheDocument();
  });
});

describe('a payload rejection survives the live-clear pass', () => {
  /**
   * THE TEST THIS FILE'S HEADER CLAIMED TO HAVE, AND DID NOT.
   *
   * An independent audit mutation-proved the gap: the first version of the
   * live-clear pass gated on `stepForFieldKey(key) !== currentStep`, which is
   * exactly backwards for the only case that occurs. `handleFinalSubmit` bounces to
   * the offending key's own step, so the key's step BECOMES `currentStep`; and
   * `validatePayload` only runs after `validateStep1/2/3` are clean, so the step
   * validator can never re-emit the key. Both clauses false → deleted.
   *
   * The lived bug: paste a 250-character first name (the input has no
   * `maxLength`), submit from Review, land on step 1 with NOTHING shown, submit
   * again, forever — audit finding A2 reintroduced by its own guard. 196 tests
   * passed throughout.
   */
  const LONG_NAME = 'A'.repeat(250); // the zod schema caps first_name at 200

  it('shows a schema rejection on the step it bounces to', async () => {
    const user = setup();
    const payload = clone(COMPLETE_IB);
    payload.personal_information.first_name = LONG_NAME;
    renderForm({ initialPayload: payload, initialStep: 6 });

    await user.click(screen.getByRole('button', { name: /Submit & see matches/ }));

    // Bounced to step 1 …
    await waitFor(
      () => expect(screen.getByRole('heading', { name: 'Who are you?' })).toBeInTheDocument(),
      { timeout: 4000 }
    );
    // … and the reason is actually on screen. This is the assertion that fails
    // when the live-clear pass is allowed to touch payload errors.
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
    expect(saveStudentIntake).not.toHaveBeenCalled();
  }, 20000);

  it('and the rejection persists — it is not wiped a tick later', async () => {
    // The failure mode was a DELETE on the navigation, so the error could appear
    // and vanish. Wait past the effect flush and assert it is still there.
    const user = setup();
    const payload = clone(COMPLETE_IB);
    payload.personal_information.first_name = LONG_NAME;
    renderForm({ initialPayload: payload, initialStep: 6 });

    await user.click(screen.getByRole('button', { name: /Submit & see matches/ }));
    await waitFor(
      () => expect(screen.getByRole('heading', { name: 'Who are you?' })).toBeInTheDocument(),
      { timeout: 4000 }
    );
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  }, 20000);

  it('fixing the offending field DOES clear it, once a step validator owns it', async () => {
    // The other half: provenance must not make payload errors permanent. Pressing
    // Next re-runs the step validator, which takes ownership of its own keys.
    const user = setup();
    const payload = clone(COMPLETE_IB);
    payload.personal_information.first_name = LONG_NAME;
    renderForm({ initialPayload: payload, initialStep: 6 });
    await user.click(screen.getByRole('button', { name: /Submit & see matches/ }));
    await waitFor(
      () => expect(screen.getByRole('heading', { name: 'Who are you?' })).toBeInTheDocument(),
      { timeout: 4000 }
    );

    await user.clear(labelled('First name'));
    await user.type(labelled('First name'), 'Alex');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // Step 1 now validates, so it advances rather than bouncing again.
    expect(await screen.findByRole('heading', { name: 'Your studies' })).toBeInTheDocument();
  }, 25000);
});

describe('Next still reports everything at once', () => {
  it('an empty step 1 surfaces all of its required fields', async () => {
    // The guard on rules 1-3: they must not have turned batch validation into
    // field-at-a-time validation.
    const user = setup();
    renderForm();
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText(NO_FIRST_NAME)).toBeInTheDocument();
    expect(screen.getByText('Last name is required.')).toBeInTheDocument();
    expect(screen.getByText('Email is required.')).toBeInTheDocument();
  });

  it('and still refuses to advance', async () => {
    const user = setup();
    renderForm();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText(NO_FIRST_NAME);
    expect(screen.getByRole('heading', { name: 'Who are you?' })).toBeInTheDocument();
  });
});
