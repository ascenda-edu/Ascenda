/**
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │  CHARACTERIZATION TESTS — StudentIntakeForm                               │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * These tests assert what `src/app/profile/_components/StudentIntakeForm.tsx`
 * DOES TODAY. They are not a specification and they are not a correctness
 * claim. Several of them deliberately pin behaviour that is arguably wrong
 * (see the F-XX notes below); where that is true it is called out inline.
 *
 * WHY THIS FILE EXISTS
 * The component is 2,553 lines: one ~1,900-line body with 26 useState, 14
 * useRef, 16 useEffect, five hand-rolled validators and all six wizard steps
 * inline. `docs/audit/04-react-components.md` rates decomposing it XL / high
 * risk and notes that every inline comment in it documents a past regression.
 * It had zero test coverage. This suite is the safety net that the
 * decomposition (react-hook-form + zod + ~12 files) is supposed to be run
 * against.
 *
 * HOW TO READ A FAILURE DURING THE DECOMPOSITION
 * A failure here means "you changed observable behaviour". It does NOT
 * necessarily mean "you broke it" — some of these behaviours are bugs the
 * decomposition is meant to fix. The correct response to a red test is to
 * decide, deliberately and in the PR description, whether the change was
 * intended; then update the test. The wrong response is to reach for the
 * assertion until it goes green.
 *
 * DETERMINISM
 * The component reads the clock in exactly two places and neither is asserted
 * by value:
 *   - `GRADUATION_YEARS` (StudentIntakeForm.tsx:180) is `new Date().getFullYear()`
 *     evaluated at MODULE SCOPE, so it cannot be frozen from a test without
 *     re-importing the module. Tests therefore assert the option *count* and
 *     select options *by position*, never by year.
 *   - The localStorage draft's `savedAt` is `Date.now()` (`:897`). Tests assert
 *     its type, never its value.
 * `Math.random()` is used for activity-row `localId`s (`:702`, `:800`); those
 * ids never reach the payload and are never asserted.
 *
 * TEST SEAMS (things replaced, and what that costs)
 *   - `@/app/profile/actions` — mocked. No server action, no Supabase, no DB.
 *   - `next/navigation` — replaced with a real in-memory URL store, so the
 *     genuine `useSearchParamState` hook runs and the `?step=` mirroring is
 *     exercised for real.
 *   - `@/components/theme/theme-toggle` — stubbed to null. It needs a
 *     ThemeProvider and is page chrome, not form behaviour.
 *   - framer-motion is NOT mocked; `AnimatePresence mode="wait"` really runs.
 *     The step heading and the step body are two SEPARATE `AnimatePresence`
 *     blocks, so the heading can land a frame before the fields — which is why
 *     step assertions use `findBy*` and why `hydrateThenGoTo` waits for both.
 *
 * BUGS FOUND WHILE WRITING THIS — ALL FIVE NOW FIXED
 * Each was first pinned here as-is. The tests below now assert the REPAIR, so a
 * regression re-breaks the build instead of quietly restoring the defect. The
 * descriptions are kept because they explain what the assertion is guarding.
 *   F-A  Hydrating a payload from the mount effect wiped every Radix `<Select>`
 *        already on screen. Reached real users via `profile/wizard/page.tsx:60`,
 *        which routinely renders a returning student straight onto step 2 or 3.
 *        FIXED in `src/components/ui/select.tsx` (swallows `onValueChange('')`).
 *        Pinned, with a control, in the last describe block.
 *   F-B  `focusFirstError` scheduled a `setTimeout` that nothing cancelled on
 *        unmount; it then called `.focus()` on whatever `[data-field]` it found
 *        in the live document — across a test boundary, the NEXT test's tree.
 *        FIXED: one timer at a time, cleared on unmount, and the search is
 *        scoped to the form's own (still-connected) content subtree. Pinned in
 *        the `focusFirstError` describe.
 *   F-C  `restoreSavedProfile` set "Restored last saved progress." and navigated
 *        to step 1, but the status block only existed inside the Review step's
 *        JSX — so the message could never be seen. FIXED: the status line was
 *        hoisted out of the Review section and now renders on every step.
 *   F-D  `FieldError` rendered INSIDE the `<label>`, so an errored field's
 *        accessible name became "First nameFirst name is required." FIXED: the
 *        message is a sibling of the label and is reached via `aria-describedby`
 *        (the `a11yError` helper). Pinned in "field errors are described…".
 *   F-E  The nationality and subject row remove buttons had no accessible name
 *        (the activity one does: `aria-label="Remove activity"`). FIXED: both
 *        now carry `aria-label="Remove {nationality,subject} N"`.
 *   F-04 (from the audit) the subject level `<Select>` offers only `A_LEVEL`
 *        to every non-IB student — STILL OPEN, pinned in "conditional rendering
 *        on step 3".
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { StudentProfilePayload } from '@/lib/profile/intake-types';

// ── Seams ────────────────────────────────────────────────────────────────────

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

/**
 * The wizard's "Skip for now" button records an onboarding breadcrumb. Mocked
 * for the same reason `@/app/profile/actions` is: it is a `'use server'` module
 * that reaches `@/lib/supabase/server`, and pulling the server runtime into this
 * jsdom suite is both slow and unnecessary — the behaviour under test is which
 * step the form lands on, not what it writes.
 */
const markOnboardingStep = jest.fn(async (_key: string) => ({ success: true as const }));
jest.mock('@/lib/onboarding/actions', () => ({
  markOnboardingStep: (key: string) => markOnboardingStep(key)
}));

/**
 * An in-memory URL, wired through `useSyncExternalStore` so a `router.push`
 * re-renders the tree with the new `useSearchParams()`. The real
 * `useSearchParamState` hook (which owns `?step=`) runs unmodified on top of
 * it, including its module-level batching and its `window.location.search`
 * seed — hence the `history.replaceState` call.
 */
jest.mock('next/navigation', () => {
  const React = require('react') as typeof import('react');
  let path = '/profile/wizard';
  let query = '';
  const subs = new Set<() => void>();
  // useSyncExternalStore requires a cached snapshot or it loops forever.
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
      push,
      replace,
      query: () => query,
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

const nav = (
  jest.requireMock('next/navigation') as {
    __nav: { push: jest.Mock; replace: jest.Mock; query: () => string; reset: () => void };
  }
).__nav;

// Radix Select (`@/components/ui/select`) needs these four; jsdom ships none.
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

const DRAFT_KEY = 'ascenda-intake-draft';

// ── Fixtures ─────────────────────────────────────────────────────────────────

/**
 * A ROUND-TRIP FIXED POINT for an IB student: `applyPayload(p)` then
 * `buildPayload()` returns exactly `p`. Getting there requires respecting every
 * normalisation `buildPayload` applies — `ib_total_points` equals the sum of
 * the subject grades, `key_activities` equals the distinct `activities_list`
 * categories, `intl_experience` is `['International competition']` because an
 * activity is National-or-above, `phone`/`language_of_instruction`/
 * `a_level_predicted_grades` are always null on the IB path, and
 * `activities_list` entries carry no `id` and `sort_order === index`.
 * The non-fixed-point cases are pinned separately in "payload normalisation".
 */
const IB_PAYLOAD: StudentProfilePayload = {
  personal_information: {
    first_name: 'Amara',
    last_name: 'Okonkwo',
    email: 'amara@school.example',
    phone: null,
    nationality: 'Nigeria, United Kingdom',
    age: 17,
    gender: 'female',
    resident_country: 'Thailand',
    current_location_city: 'Bangkok',
    time_zone: 'Asia/Bangkok'
  },
  academic_input: {
    programme_type: 'IB',
    school_name: 'Bangkok International School',
    school_country: 'Thailand',
    school_city: 'Bangkok',
    school_type: 'international_school',
    language_of_instruction: null,
    graduation_year: 2027,
    desired_start_date: '2027-09-01',
    intended_clusters: ['economics_quant'],
    secondary_clusters: ['maths', 'business_non_quant'],
    career_aspiration: 'Economist',
    subject_list: [
      { subject_name: 'Mathematics', level: 'HL', grade_value: 7 },
      { subject_name: 'Economics', level: 'HL', grade_value: 6 },
      { subject_name: 'Physics', level: 'HL', grade_value: 6 },
      { subject_name: 'English Literature', level: 'SL', grade_value: 6 },
      { subject_name: 'History', level: 'SL', grade_value: 5 },
      { subject_name: 'Modern Languages', level: 'SL', grade_value: 5 }
    ],
    ib_total_points: 35, // 7+6+6+6+5+5 — recomputed from the rows, never read back
    ib_core_points: 2,
    ib_tok_grade: 'A',
    ib_ee_grade: 'B',
    ib_math_pathway: 'AA_HL',
    ee_subject: 'Economics',
    ee_title: 'Microfinance and poverty',
    ee_summary: 'A short study of microfinance in West Africa.',
    a_level_predicted_grades: null,
    english_required: true,
    english_test_type: 'IELTS',
    english_status: 'booked',
    english_score_overall: 7.5,
    admissions_tests: [
      { test_type: 'TMUA', status: 'booked', score_numeric: null, percentile: null }
    ]
  },
  lifestyle_preference: {
    teaching_style: 'academic',
    // A legal `location_type` member. This fixture stands in for a row loaded
    // FROM the database, and the enum
    // ('london','major_city','smaller_city','suburban','no_preference') could
    // never have held the comma-joined 'capital_city,major_city' this used to
    // carry — the fixture encoded audit finding I-1 rather than reality.
    desired_location_type: 'major_city',
    campus_size: 'large',
    extracurricular_interests: ['Debate / public speaking', 'Volunteering'],
    other_extracurriculars: 'Chess club',
    leadership_roles: ['Class President'],
    commitment_level: 'deep',
    key_activities: ['Debate / Model UN', 'Community Service'],
    sat_score: 1480,
    act_score: null,
    intl_experience: ['International competition'],
    work_experience: true,
    work_experience_summary: 'Summer internship at a bank.',
    ambition_statement: 'I want to read economics and work in development finance.',
    epq_subject: null,
    epq_title: null
  },
  activities_list: [
    {
      category: 'Debate / Model UN',
      level: 'International',
      duration: '3–4 years',
      highlight: 'Best delegate, THIMUN',
      sort_order: 0
    },
    {
      category: 'Community Service',
      level: 'School',
      duration: '1–2 years',
      highlight: null,
      sort_order: 1
    }
  ]
};

/**
 * The A-Level fixed point. Materially different path: `a_level_predicted_grades`
 * is derived rather than null, every `ib_*`/`ee_*` field is forced null,
 * `epq_*` survives, `english_required: false` drives the WAIVER/met derivation
 * effect (`:958`), and `time_zone: null` proves the hydration effect overwrites
 * the browser-timezone seeding effect that runs before it.
 */
const A_LEVEL_PAYLOAD: StudentProfilePayload = {
  personal_information: {
    first_name: 'Tom',
    last_name: 'Whitfield',
    email: 'tom@school.example',
    phone: null,
    nationality: 'United Kingdom',
    age: null,
    gender: null,
    resident_country: 'United Kingdom',
    current_location_city: null,
    time_zone: null
  },
  academic_input: {
    programme_type: 'A_LEVEL',
    school_name: 'Northgate Grammar',
    school_country: 'United Kingdom',
    school_city: null,
    school_type: 'state_public',
    language_of_instruction: null,
    graduation_year: 2026,
    desired_start_date: null,
    intended_clusters: ['engineering'],
    secondary_clusters: [],
    career_aspiration: null,
    subject_list: [
      { subject_name: 'Mathematics', level: 'A_LEVEL', grade_value: 'A*' },
      { subject_name: 'Physics', level: 'A_LEVEL', grade_value: 'A' },
      { subject_name: 'Chemistry', level: 'A_LEVEL', grade_value: 'B' }
    ],
    ib_total_points: null,
    ib_core_points: null,
    ib_tok_grade: null,
    ib_ee_grade: null,
    ib_math_pathway: null,
    ee_subject: null,
    ee_title: null,
    ee_summary: null,
    a_level_predicted_grades: { Mathematics: 'A*', Physics: 'A', Chemistry: 'B' },
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
    key_activities: ['Coding / Hackathon'],
    sat_score: null,
    act_score: 32,
    intl_experience: ['Exchange programme'],
    work_experience: false,
    work_experience_summary: null,
    ambition_statement: null,
    epq_subject: 'Physics',
    epq_title: 'Tokamak confinement'
  },
  activities_list: []
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

// ── Harness helpers ──────────────────────────────────────────────────────────

const setup = () => userEvent.setup();

const renderForm = (props: Parameters<typeof StudentIntakeForm>[0] = {}) =>
  render(<StudentIntakeForm {...props} />);

const nextButton = () => screen.getByRole('button', { name: 'Next' });
const backButton = () => screen.getByRole('button', { name: 'Back' });
const submitButton = () => screen.getByRole('button', { name: /Submit & see matches|Profile saved|Saving/ });

/** Prefix-anchored label lookup. Errored fields no longer absorb their message
 *  into the label (F-D), but plenty of labels still carry a trailing
 *  "(optional)" or "(optional, max 350 chars)" suffix. */
const labelled = (label: string) =>
  screen.getByLabelText(new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));

/**
 * Chip lookups are by LABEL ONLY — no emoji.
 *
 * Changed 2026-08-04. Chips take their emoji as a separate `emoji` prop which is
 * `aria-hidden`, so it is not part of the accessible name: a screen reader says
 * "Engineering", not "gear Engineering". The location group was the exception —
 * it baked the emoji into its `label` string, so those names really did contain
 * one — and it now passes `emoji` like every other group. If a lookup here ever
 * needs an emoji again, that is the bug, not this helper.
 */
const chip = (name: string) => screen.getByRole('button', { name });
const chips = (name: string) => screen.getAllByRole('button', { name });

/**
 * Rail lookups are SCOPED to the rail's own list.
 *
 * The Review step's per-section Edit buttons carry an sr-only section name, so
 * their accessible names are "Edit Personal info", "Edit Grades & tests", … —
 * deliberately, so a screen-reader user knows which section an Edit belongs to.
 * On step 6 that makes `getByRole('button', { name: /Personal info/ })` match TWO
 * elements: the rail's step button and the Review section's Edit.
 *
 * That is the whole reason. An earlier version of this comment also blamed the
 * mobile step meter rendering alongside the rail in jsdom, and that was wrong —
 * the meter's track is `aria-hidden` spans and contributes no buttons at all, and
 * the sheet's second rail is unmounted while the Dialog is closed. `rail()` uses
 * `getByRole` rather than `getAllByRole` precisely so that if a second rail ever
 * DID mount, every scoped lookup would throw rather than silently pick one.
 */
const rail = () => screen.getByRole('list', { name: 'Setup steps' });
const railButton = (name: RegExp | string) => within(rail()).getByRole('button', { name });

const nationalityBox = () =>
  document.querySelector('[data-field="personal_information.nationality"]') as HTMLElement;
const subjectBox = () =>
  document.querySelector('[data-field="academic_input.subject_list"]') as HTMLElement;

/** Type into a combobox and close its listbox, so the options don't pollute
 *  subsequent `getAllByRole('button')` scans. */
const typeCombobox = async (
  user: ReturnType<typeof setup>,
  element: HTMLElement,
  text: string
) => {
  await user.type(element, text);
  await user.keyboard('{Escape}');
};

/** Open a Radix Select by its aria-label and return its options. */
const openSelect = async (user: ReturnType<typeof setup>, name: string) => {
  const trigger = screen.getByRole('combobox', { name });
  await user.click(trigger);
  const listbox = await screen.findByRole('listbox');
  return { trigger, listbox, options: within(listbox).getAllByRole('option') };
};

const chooseFromSelect = async (
  user: ReturnType<typeof setup>,
  name: string,
  optionName: string | RegExp
) => {
  const { listbox } = await openSelect(user, name);
  await user.click(within(listbox).getByRole('option', { name: optionName }));
  await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
};

/**
 * ── SCREENS, BY NAME ────────────────────────────────────────────────────────
 * The wizard walks eight SCREENS over the same five DB sections
 * (`src/lib/profile/wizard-screens.ts`). The 2026-08 reorder moved the paperwork
 * from first to fifth, led with the subject area, and split the old 21-control
 * grades screen into subjects and tests.
 *
 * These constants exist so the tests below say what they mean. Referring to screens
 * by number was survivable while the order was fixed; it is not survivable across a
 * reorder, and a numeric literal gives no clue whether `3` meant "grades" or "the
 * third thing".
 */
const SCREEN = {
  subject: 1,
  school: 2,
  grades: 3,
  tests: 4,
  about: 5,
  activities: 6,
  life: 7,
  review: 8
} as const;

/** The minimum that gets the ABOUT screen past `validateStep1`. */
const fillAboutScreen = async (user: ReturnType<typeof setup>) => {
  await user.type(labelled('First name'), 'Alex');
  await user.type(labelled('Last name'), 'Smith');
  // The email arrives pre-filled from the signed-in account, so this CLEARS it
  // first — typing into a populated field would otherwise append.
  await user.clear(labelled('Email'));
  await user.type(labelled('Email'), 'alex@school.example');
  await typeCombobox(user, screen.getByPlaceholderText('Search nationality…'), 'Nigeria');
  await typeCombobox(user, labelled('Country of residence'), 'Thailand');
};

/** The minimum that gets the SUBJECT AREA screen past its validator. */
const fillSubjectScreen = async (user: ReturnType<typeof setup>) => {
  await user.click(screen.getByRole('radio', { name: /Economics \(quant\)/ }));
};

/** Rail labels. Loose matching, because the row also carries sr-only tier text. */
const SIDEBAR: Record<number, RegExp> = {
  [SCREEN.subject]: /Subject area/,
  [SCREEN.school]: /^School/,
  [SCREEN.grades]: /Subjects & grades/,
  [SCREEN.tests]: /^Tests/,
  [SCREEN.about]: /About you/,
  [SCREEN.activities]: /Activities/,
  [SCREEN.life]: /Life at university/,
  [SCREEN.review]: /Review & send/
};
const STEP_TITLE: Record<number, string> = {
  [SCREEN.subject]: 'What do you want to study?',
  [SCREEN.school]: 'Where are you studying?',
  [SCREEN.grades]: 'Your subjects and predicted grades',
  [SCREEN.tests]: 'English and admissions tests',
  [SCREEN.about]: 'Now the boring bit',
  [SCREEN.activities]: 'What do you do outside class?',
  [SCREEN.life]: 'What should university feel like?',
  [SCREEN.review]: 'Does this all look right?'
};
/** Wait for something in the BODY, not only the heading — they can land a frame apart. */
const STEP_BODY: Record<number, string> = {
  [SCREEN.subject]: 'Portfolio usually matters more than grades',
  [SCREEN.school]: 'Which qualification are you taking?',
  [SCREEN.grades]: 'Subjects & predicted grades',
  [SCREEN.tests]: 'English proficiency',
  [SCREEN.about]: 'Add more than one if applicable.',
  [SCREEN.activities]: 'Leadership roles',
  [SCREEN.life]: 'Teaching style preference'
};

/**
 * Hydrate on the SUBJECT AREA screen and then WALK to `step`.
 *
 * Rendering `initialPayload` straight onto a screen carrying a Radix `<Select>`
 * destroys those values — see the `F-A` block at the bottom of this file. The
 * subject-area screen is now the first screen and contains no `<Select>` at all
 * (its ten options are a radiogroup), so hydration there is safe, and a forward
 * rail jump only validates the screen being LEFT. This is also the path a real
 * user takes.
 */
const hydrateThenGoTo = async (
  user: ReturnType<typeof setup>,
  payload: StudentProfilePayload,
  step: 2 | 3 | 4 | 5 | 6 | 7 | 8
) => {
  renderForm({ initialPayload: payload, initialStep: SCREEN.about });
  await user.click(railButton(SIDEBAR[step]));
  await screen.findByRole('heading', { name: STEP_TITLE[step] });
  // Review has no fixture-independent body string — the summary omits empty rows —
  // so wait for its per-section Edit buttons instead.
  if (step === SCREEN.review) await screen.findAllByRole('button', { name: /^Edit/ });
  else await screen.findByText(STEP_BODY[step]);
};

beforeEach(() => {
  window.localStorage.clear();
  nav.reset();
  saveStudentIntake.mockClear();
  saveStudentIntake.mockResolvedValue({ success: true });
});

afterEach(async () => {
  // `use-search-param-state` keeps module-level `intent`/`batch` values and
  // clears both on popstate. Without this, one test's pending intent seeds the
  // next test's first URL write.
  window.dispatchEvent(new Event('popstate'));

  // `focusFirstError` schedules a deferred focus hop. It is now cancelled on
  // unmount and scoped to the form's own subtree (F-B), so it can no longer
  // reach across a test boundary — the dedicated test in the `focusFirstError`
  // describe is what guards that. This wait just lets any in-flight timer
  // (draft debounce, Radix transitions) settle before the next test starts.
  await new Promise((resolve) => setTimeout(resolve, 70));
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. STEP NAVIGATION
// ═════════════════════════════════════════════════════════════════════════════

describe('step navigation', () => {
  /**
   * ── The 2026-08 reorder ─────────────────────────────────────────────────────
   * The wizard opens on the SUBJECT AREA and asks for the paperwork fifth. Before,
   * a new student's first screen was first name / last name / email / nationality /
   * country / city / age / gender — eight fields of admin, three of which the app
   * already knew, ahead of the one question they came to answer.
   *
   * These tests pin the order itself, because the order is the feature.
   */
  it('opens on the subject area, with Back disabled and no ?step= in the URL', () => {
    renderForm();
    expect(screen.getByRole('heading', { name: 'What do you want to study?' })).toBeInTheDocument();
    expect(backButton()).toBeDisabled();
    // Screen 1 is the default value, and the hook strips params equal to the default.
    expect(nav.query()).toBe('');
  });

  it('asks nothing about the student personally until the fifth screen', () => {
    // The regression guard for the reorder: if the paperwork returns to the front,
    // this is what notices.
    renderForm();
    expect(screen.queryByLabelText(/^First name/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Email/)).not.toBeInTheDocument();
  });

  it('blocks Next on an unanswered subject area', async () => {
    const user = setup();
    renderForm();
    await user.click(nextButton());

    expect(await screen.findByText('Select at least one subject area.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What do you want to study?' })).toBeInTheDocument();
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('advances on a valid subject area and PUSHES the screen key onto the URL', async () => {
    const user = setup();
    renderForm();
    await fillSubjectScreen(user);
    await user.click(nextButton());

    expect(await screen.findByRole('heading', { name: 'Where are you studying?' })).toBeInTheDocument();
    expect(nav.query()).toBe('step=school');
    // `push: true`, not replace — the wizard is meant to be walkable with Back.
    expect(nav.push).toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('blocks Next on the ABOUT screen and reports every missing field', async () => {
    const user = setup();
    renderForm({ initialStep: SCREEN.about });
    await user.click(nextButton());

    expect(await screen.findByText('First name is required.')).toBeInTheDocument();
    expect(screen.getByText('Last name is required.')).toBeInTheDocument();
    expect(screen.getByText('Add at least one nationality.')).toBeInTheDocument();
    expect(screen.getByText('Country of residence is required.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Now the boring bit' })).toBeInTheDocument();
  });

  it('does not ask for an email it already has', async () => {
    // Seeded from the signed-in account, so it is neither blank nor an error.
    const user = setup();
    renderForm({ initialStep: SCREEN.about, accountEmail: 'alex@school.example' });
    expect(labelled('Email')).toHaveValue('alex@school.example');
    await user.click(nextButton());
    expect(await screen.findByText('First name is required.')).toBeInTheDocument();
    expect(screen.queryByText('Email is required.')).not.toBeInTheDocument();
  });

  /**
   * The old grades screen carried ~21 controls in ten cards. It is now two screens,
   * and the split is what these two tests pin: each screen validates ONLY its own
   * fields, so a student on the subjects screen is never told about an English test
   * they have not been asked about yet.
   */
  it('gates the SCHOOL screen on programme type, school, country and graduation year', async () => {
    const user = setup();
    renderForm({ initialStep: SCREEN.school });
    await user.click(nextButton());

    expect(await screen.findByText('Select IB or A-levels.')).toBeInTheDocument();
    expect(screen.getByText('School name is required.')).toBeInTheDocument();
    expect(screen.getByText('School country is required.')).toBeInTheDocument();
    expect(screen.getByText('Graduation year is required.')).toBeInTheDocument();
    // The cluster lives on the screen BEFORE this one, so it is not reported here.
    expect(screen.queryByText('Select at least one subject area.')).not.toBeInTheDocument();
  });

  it('gates the TESTS screen on the English question, and not on subjects', async () => {
    const user = setup();
    renderForm({ initialStep: SCREEN.tests });
    await user.click(nextButton());

    expect(await screen.findByText('Select an option.')).toBeInTheDocument();
    // Subjects belong to the previous screen.
    expect(screen.queryByText('IB requires exactly 6 subjects.')).not.toBeInTheDocument();
  });

  it('goes Back without validating anything', async () => {
    const user = setup();
    renderForm({ initialStep: SCREEN.school });
    await user.click(backButton());

    expect(await screen.findByRole('heading', { name: 'What do you want to study?' })).toBeInTheDocument();
    expect(screen.queryByText('Select IB or A-levels.')).not.toBeInTheDocument();
  });

  it('does NOT gate the two booster screens — both validators are no-op stubs', async () => {
    const user = setup();
    renderForm({ initialStep: SCREEN.activities });

    await user.click(nextButton());
    expect(await screen.findByRole('heading', { name: 'What should university feel like?' })).toBeInTheDocument();

    await user.click(nextButton());
    expect(await screen.findByRole('heading', { name: 'Does this all look right?' })).toBeInTheDocument();
    expect(nav.query()).toBe('step=review');
  });

  it('rail: jumping BACKWARDS skips validation', async () => {
    const user = setup();
    renderForm({ initialStep: SCREEN.grades });
    await user.click(railButton(SIDEBAR[SCREEN.subject]));

    expect(await screen.findByRole('heading', { name: 'What do you want to study?' })).toBeInTheDocument();
    expect(screen.queryByText('Select at least one subject area.')).not.toBeInTheDocument();
  });

  it("rail: jumping FORWARDS runs the current screen's validation and is refused", async () => {
    const user = setup();
    renderForm();
    await user.click(railButton(SIDEBAR[SCREEN.life]));

    expect(await screen.findByText('Select at least one subject area.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What do you want to study?' })).toBeInTheDocument();
  });

  it('rail: clicking the screen you are already on is a no-op', async () => {
    const user = setup();
    renderForm();
    await user.click(railButton(SIDEBAR[SCREEN.subject]));

    expect(screen.getByRole('heading', { name: 'What do you want to study?' })).toBeInTheDocument();
    expect(screen.queryByText('Select at least one subject area.')).not.toBeInTheDocument();
  });

  /**
   * CHANGED 2026-08-04 — the percentage measures DATA, not POSITION.
   *
   * It used to be `(currentStep - 1) / (TOTAL_STEPS - 1)`, so a returning student
   * with a complete profile opened on the first screen and was told 0%, and an empty
   * form on Review was told 100%. Neither number was about their data.
   *
   * CHANGED AGAIN by the reorder: the denominator is the five essential SCREENS
   * rather than the three essential SECTIONS, so it moves in 20% steps instead of
   * 33% ones. The 100% CONDITION is identical either way — all five screens done is
   * exactly all three sections done — which is why this is a granularity change and
   * not a meaning change. Boosters stay counted separately ("0/2 extras") so
   * deferring them never reads as a debt.
   */
  it.each([
    [SCREEN.subject],
    [SCREEN.grades],
    [SCREEN.review]
  ])('an EMPTY form reads 0%% on screen %i, whatever screen that is', (step) => {
    renderForm({ initialStep: step });
    expect(screen.getByRole('img', { name: 'Essentials 0% complete' })).toBeInTheDocument();
  });

  it.each([
    [SCREEN.subject],
    [SCREEN.tests],
    [SCREEN.review]
  ])('a COMPLETE profile reads 100%% on screen %i, including the first', (step) => {
    // The case the old bar got backwards: hydrated, complete, standing on screen 1.
    renderForm({ initialPayload: clone(IB_PAYLOAD), initialStep: step });
    expect(screen.getByRole('img', { name: 'Essentials 100% complete' })).toBeInTheDocument();
  });

  it.each([
    // The INTERMEDIATE values are what actually pin the arithmetic. With only 0% and
    // 100% asserted, an audit mutation-proved that replacing the whole division with
    // `essentialsDone === total ? 100 : 0` passed every test. Five essential screens,
    // so each one is 20%.
    ['school_name', '80%'],
    ['subjects and name', '60%']
  ])('a partially complete profile reads a real fraction (%s missing → %s)', (blank, pct) => {
    const payload = clone(IB_PAYLOAD);
    if (blank === 'school_name') {
      // Breaks the SCHOOL screen only: four of five essentials still satisfied.
      payload.academic_input.school_name = '';
    } else {
      // Breaks TWO screens, and which two is the point. Clearing the subject list
      // alone would still read 80%, because the English questions moved to their own
      // screen and are still answered — that separation is exactly what the split
      // bought, and asserting 60% here without also breaking a second screen would
      // have quietly pinned the wrong denominator.
      payload.academic_input.subject_list = [];
      payload.personal_information.first_name = '';
    }
    renderForm({ initialPayload: payload, initialStep: SCREEN.about });
    expect(screen.getByRole('img', { name: `Essentials ${pct} complete` })).toBeInTheDocument();
  });

  it('reaching 100% flips the copy from a promise to a confirmation', () => {
    renderForm({ initialPayload: clone(IB_PAYLOAD), initialStep: SCREEN.subject });
    expect(screen.getByText('Matches unlocked')).toBeInTheDocument();
    expect(screen.queryByText(/left before your matches unlock/)).not.toBeInTheDocument();
  });

  // CHANGED 2026-08-04. This asserted 'Matches unlock at 100%', a static line that
  // restated the percentage in the ring beside it. The rail now names the number of
  // essential screens still outstanding — the copy that used to live in the page's
  // PageHero, which was deleted along with the rest of the wizard's chrome stack.
  // Five, not three: `subject_area` and `school` both map to `academic_input`, so the
  // count is over SCREENS and the wording is "steps" to match.
  it('an empty form names how much is left, not just how far along you are', () => {
    renderForm();
    expect(screen.getByText('5 steps left before your matches unlock')).toBeInTheDocument();
  });

  it('the remaining-steps count falls as essentials land, and singularises at one', () => {
    // Pins the plural branch and the derivation together: with only the About-you
    // screen outstanding the line must read "1 step", not "1 steps".
    const payload = clone(IB_PAYLOAD);
    payload.personal_information.first_name = '';
    payload.personal_information.last_name = '';
    renderForm({ initialPayload: payload, initialStep: SCREEN.subject });
    expect(screen.getByText('1 step left before your matches unlock')).toBeInTheDocument();
  });

  it('counts the boosters separately, so skipping them is not a deficit', () => {
    // An empty form: the essentials ring sits at 0% and the boosters report 0/2 —
    // two independent readings, which is the point. Under a single all-screens
    // percentage a student who deliberately deferred the extras was parked below
    // 100% forever, so "Skip for now" read as abandoning part of their profile.
    // That is the friction the 2026-08-03 re-tiering removed.
    renderForm();
    expect(screen.getByRole('img', { name: 'Essentials 0% complete' })).toBeInTheDocument();
    expect(screen.getByText('0/2 extras')).toBeInTheDocument();
  });

  it('a profile with both boosters answered reports 2/2 extras', () => {
    renderForm({ initialPayload: clone(IB_PAYLOAD), initialStep: SCREEN.subject });
    expect(screen.getByText('2/2 extras')).toBeInTheDocument();
  });

  it('extracurricular_interests counts toward the LIFE screen, where its chips render', () => {
    // CHANGED 2026-08-04. This previously asserted the opposite — that ticking an
    // interest chip completed the activities step — because `completion.ts`
    // attributed the field to `activities_ambitions`. An audit measured the
    // consequence: ticking one chip flipped the rail's "Activities" row to complete,
    // for a screen the student had never opened.
    //
    // The field lives on the shared `student_lifestyle_preference` row, which is why
    // the attribution was ambiguous — but the CHIP GROUP renders on the life screen,
    // so that is the screen it can evidence.
    const payload = clone(IB_PAYLOAD);
    payload.lifestyle_preference.leadership_roles = [];
    payload.lifestyle_preference.commitment_level = null;
    payload.lifestyle_preference.key_activities = [];
    payload.lifestyle_preference.teaching_style = null;
    payload.lifestyle_preference.desired_location_type = null;
    payload.lifestyle_preference.campus_size = null;
    payload.lifestyle_preference.extracurricular_interests = ['Volunteering'];
    renderForm({ initialPayload: payload, initialStep: SCREEN.about });

    expect(railButton(SIDEBAR[SCREEN.life])).toHaveAccessibleName(/\(complete\)/);
    expect(railButton(SIDEBAR[SCREEN.activities])).not.toHaveAccessibleName(/\(complete\)/);
  });

  it('shows Submit instead of Next only on the Review step', () => {
    renderForm({ initialStep: SCREEN.review });
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    expect(submitButton()).toBeInTheDocument();
  });

  it('a step index past the end resolves to Review, not to step 1', () => {
    // `stepKeyForIndex(99)` returns REVIEW_STEP_KEY for any index >= TOTAL_STEPS.
    renderForm({ initialStep: 99 });
    expect(screen.getByRole('heading', { name: 'Does this all look right?' })).toBeInTheDocument();
  });

  /**
   * CHANGED 2026-08-04 — the rail shows a DOT, not an ordinal.
   *
   * The numerals went because the completion ring directly above them already
   * owns the numbers, and two sets competed. Position is still conveyed: the
   * rail is an <ol>, so assistive tech reports "n of 6" from the structure, and
   * the current step carries `aria-current="step"`.
   *
   * What did NOT change, and must not: completion and tier are still in the
   * ACCESSIBLE NAME, not only in colour or in the visual "Optional extras"
   * divider. A student listening to the rail needs both signals at the step.
   */
  it('a complete step announces itself as complete', () => {
    renderForm({ initialPayload: clone(IB_PAYLOAD), initialStep: SCREEN.review });
    // The rail labels are the SCREEN labels now, and there are five essentials
    // rather than three. All five asserted: coverage given up for no reason is
    // still coverage given up.
    expect(railButton(SIDEBAR[SCREEN.subject])).toHaveAccessibleName('Subject area (complete)');
    expect(railButton(SIDEBAR[SCREEN.school])).toHaveAccessibleName('School (complete)');
    expect(railButton(SIDEBAR[SCREEN.grades])).toHaveAccessibleName('Subjects & grades (complete)');
    expect(railButton(SIDEBAR[SCREEN.tests])).toHaveAccessibleName('Tests (complete)');
    expect(railButton(SIDEBAR[SCREEN.about])).toHaveAccessibleName('About you (complete)');
  });

  it('an incomplete step announces only its title — no ordinal', () => {
    renderForm({ initialStep: SCREEN.review });
    expect(railButton(SIDEBAR[SCREEN.about])).toHaveAccessibleName('About you');
    expect(railButton(SIDEBAR[SCREEN.school])).toHaveAccessibleName('School');
  });

  it('marks booster steps optional and essential steps not', () => {
    renderForm({ initialStep: SCREEN.review });
    // "(optional)" is in the accessible name, not just the visual divider: a
    // screen-reader user choosing whether to keep going needs the same "you can
    // stop here" signal a sighted user gets from the grouping.
    expect(railButton(SIDEBAR[SCREEN.activities])).toHaveAccessibleName(/\(optional\)$/);
    expect(railButton(SIDEBAR[SCREEN.life])).toHaveAccessibleName(/\(optional\)$/);
    // The three that gate entry must NOT be labelled optional — that is the
    // whole distinction the tiering rests on.
    expect(railButton(SIDEBAR[SCREEN.about])).not.toHaveAccessibleName(/optional/);
    expect(railButton(SIDEBAR[SCREEN.school])).not.toHaveAccessibleName(/optional/);
    expect(railButton(SIDEBAR[SCREEN.grades])).not.toHaveAccessibleName(/optional/);
  });

  it('marks the screen you are on with aria-current, not with a numeral', () => {
    renderForm({ initialPayload: clone(IB_PAYLOAD), initialStep: SCREEN.subject });
    expect(railButton(SIDEBAR[SCREEN.subject])).toHaveAttribute('aria-current', 'step');
    expect(railButton(SIDEBAR[SCREEN.school])).not.toHaveAttribute('aria-current');
  });

  it('presents the rail as an ordered list, so position is conveyed structurally', () => {
    renderForm({ initialStep: SCREEN.subject });
    const railList = rail();
    // Eight screens now, not six: the subject area leads, and the old grades screen
    // is two. Sections are still five — see `wizard-screens.ts`.
    expect(within(railList).getAllByRole('listitem')).toHaveLength(8);
  });

  it('every rail step carries the padding that meets the 44px tap floor', () => {
    // A PROXY, and worth being honest about: jsdom does no layout, so it cannot
    // measure a rendered height. `py-3` + the 20px text-sm line box is 44px, so
    // asserting the class is the closest jsdom gets to asserting the tap target.
    // The real check is the manual/Playwright pass on a 375px viewport.
    renderForm({ initialStep: SCREEN.subject });
    const railList = rail();
    for (const item of within(railList).getAllByRole('button')) {
      expect(item.className).toContain('py-3');
    }
  });

  it('Review\'s "Edit" links jump straight to their screen without validating', async () => {
    const user = setup();
    renderForm({ initialStep: SCREEN.review });
    const editButtons = screen.getAllByRole('button', { name: /^Edit/ });
    // The first card is the SUBJECT AREA now, because the review reads in screen
    // order and the subject area is screen one.
    await user.click(editButtons[0]);
    expect(await screen.findByRole('heading', { name: 'What do you want to study?' })).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. THE FIVE HAND-ROLLED VALIDATORS
// ═════════════════════════════════════════════════════════════════════════════

describe('validateStep1', () => {
  const fillExcept = async (user: ReturnType<typeof setup>, omit: string) => {
    if (omit !== 'first') await user.type(labelled('First name'), 'Alex');
    if (omit !== 'last') await user.type(labelled('Last name'), 'Smith');
    if (omit !== 'email') await user.type(labelled('Email'), 'alex@school.example');
    if (omit !== 'nationality') {
      await typeCombobox(user, screen.getByPlaceholderText('Search nationality…'), 'Nigeria');
    }
    if (omit !== 'country') await typeCombobox(user, labelled('Country of residence'), 'Thailand');
  };

  it('treats whitespace-only names as missing', async () => {
    const user = setup();
    renderForm({ initialStep: SCREEN.about });
    await fillExcept(user, 'first');
    await user.type(labelled('First name'), '   ');
    await user.click(nextButton());
    expect(await screen.findByText('First name is required.')).toBeInTheDocument();
  });

  it('treats a whitespace-only nationality row as no nationality', async () => {
    const user = setup();
    renderForm({ initialStep: SCREEN.about });
    await fillExcept(user, 'nationality');
    await typeCombobox(user, screen.getByPlaceholderText('Search nationality…'), '   ');
    await user.click(nextButton());
    expect(await screen.findByText('Add at least one nationality.')).toBeInTheDocument();
  });

  it.each([
    ['alex', 'Enter a valid email.'],
    ['alex@school', 'Enter a valid email.'],
    ['@school.example', 'Enter a valid email.'],
    ['alex@.example', 'Enter a valid email.'],
    ['alex school@x.example', 'Enter a valid email.'],
    ['alex@school example.com', 'Enter a valid email.']
  ])('rejects %p', async (value, message) => {
    const user = setup();
    renderForm({ initialStep: SCREEN.about });
    await fillExcept(user, 'email');
    await user.type(labelled('Email'), value);
    await user.click(nextButton());
    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it.each([
    ['a@b.co'],
    ['alex.smith+tag@sub.school.example'],
    // The regex is `^[^@\s]+@[^@\s]+\.[^@\s]+$` — it accepts plenty that a real
    // parser would not. Both of these are ACCEPTED today.
    ['alex@school..example'],
    ['a@-.-']
  ])('accepts %p', async (value) => {
    const user = setup();
    renderForm({ initialStep: SCREEN.about });
    await fillExcept(user, 'email');
    await user.type(labelled('Email'), value);
    await user.click(nextButton());
    expect(await screen.findByRole('heading', { name: STEP_TITLE[SCREEN.activities] })).toBeInTheDocument();
  });

  it('trims the email before testing it, so a padded address is valid', async () => {
    const user = setup();
    renderForm({ initialStep: SCREEN.about });
    await fillExcept(user, 'email');
    await user.type(labelled('Email'), '  alex@school.example  ');
    await user.click(nextButton());
    expect(await screen.findByRole('heading', { name: STEP_TITLE[SCREEN.activities] })).toBeInTheDocument();
  });
});

describe('validateStep2 — split across the SUBJECT AREA and SCHOOL screens', () => {
  /**
   * `validateStep2` still owns one rule set for the whole `academic_input` section.
   * What changed is that its messages are now PARTITIONED across two screens: the
   * cluster belongs to the subject area, everything else to the school. So each
   * screen reports only what it asks for, and neither can block on a field the
   * student has not been shown. See `intake-validation.ts`.
   */
  const fillSchool = async (user: ReturnType<typeof setup>, omit?: string) => {
    if (omit !== 'programme') await user.click(screen.getByRole('radio', { name: /IB Diploma/ }));
    if (omit !== 'school') await user.type(labelled('School name'), 'Northgate');
    if (omit !== 'country') await typeCombobox(user, labelled('School country'), 'Thailand');
    if (omit !== 'year') {
      // Never asserted by value: GRADUATION_YEARS derives from the real clock.
      const { listbox } = await openSelect(user, 'Graduation year');
      const options = within(listbox).getAllByRole('option');
      await user.click(options[1]);
      await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    }
  };

  it.each([
    ['programme', 'Select IB or A-levels.'],
    ['school', 'School name is required.'],
    ['country', 'School country is required.'],
    ['year', 'Graduation year is required.']
  ])('omitting %s reports %p on the SCHOOL screen', async (omit, message) => {
    const user = setup();
    renderForm({ initialStep: SCREEN.school });
    await fillSchool(user, omit);
    await user.click(nextButton());
    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it('omitting the cluster reports on the SUBJECT AREA screen, not the school one', async () => {
    const user = setup();
    renderForm({ initialStep: SCREEN.subject });
    await user.click(nextButton());
    expect(await screen.findByText('Select at least one subject area.')).toBeInTheDocument();
  });

  it('the school screen never reports the cluster, which it does not ask for', async () => {
    const user = setup();
    renderForm({ initialStep: SCREEN.school });
    await fillSchool(user);
    await user.click(nextButton());
    // Passes straight through: the cluster is the previous screen's business.
    expect(await screen.findByRole('heading', { name: STEP_TITLE[SCREEN.grades] })).toBeInTheDocument();
  });

  it('offers exactly eight graduation years plus a "Not specified" sentinel', async () => {
    const user = setup();
    renderForm({ initialStep: SCREEN.school });
    const { options } = await openSelect(user, 'Graduation year');
    // current-2 … current+5. Asserting the COUNT, never the years themselves.
    expect(options).toHaveLength(9);
    expect(options[0]).toHaveTextContent('Not specified');
  });

  it('the primary cluster is a RADIOGROUP: one press swaps, and it cannot be cleared', async () => {
    /**
     * CHANGED TWICE, and both changes were bug fixes.
     *
     * First (2026-08-04): every unchosen option used to be `disabled` at the cap of
     * one, so changing your mind cost a deselect-then-select round trip and nine
     * options sat outside the tab order at an unreadable 2.5:1.
     *
     * Second (the reorder): the group became a real `role="radiogroup"`, which
     * `chip.tsx` had already conceded was the correct semantic for a single-choice
     * group. That announces "2 of 10" and makes arrow keys move the selection. It
     * also means re-activating the chosen option must NOT clear it: ARIA radios have
     * no unchecked state you can reach that way, and the subject area is required —
     * so the old toggle-off behaviour let a keyboard user arrow onto their own answer
     * and silently empty a mandatory field.
     */
    const user = setup();
    renderForm({ initialStep: SCREEN.subject });
    const radio = (name: RegExp) => screen.getByRole('radio', { name });

    await user.click(radio(/^Law/));
    expect(radio(/^Law/)).toHaveAttribute('aria-checked', 'true');
    // The alternatives stay reachable — that is the whole point of dropping `disabled`.
    expect(radio(/^Humanities/)).toBeEnabled();

    // One click swaps, no deselect step.
    await user.click(radio(/^Humanities/));
    expect(radio(/^Humanities/)).toHaveAttribute('aria-checked', 'true');
    expect(radio(/^Law/)).toHaveAttribute('aria-checked', 'false');

    // And pressing the chosen one again LEAVES IT CHOSEN.
    await user.click(radio(/^Humanities/));
    expect(radio(/^Humanities/)).toHaveAttribute('aria-checked', 'true');
  });

  it('exposes exactly one tab stop for the ten-option group', async () => {
    // Roving tabindex. Without it the arrow keys work but Tab walks all ten, so
    // reaching the Next button costs eleven presses.
    renderForm({ initialStep: SCREEN.subject });
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(10);
    expect(radios.filter((r) => r.tabIndex === 0)).toHaveLength(1);
  });

  it('secondary interests appear only after a primary choice, and cap at two', async () => {
    // Asking what else interests you before you have said what does is asking the
    // same question twice, so the group is revealed rather than always present.
    const user = setup();
    renderForm({ initialStep: SCREEN.subject });
    expect(screen.queryByText('Anything else pulling at you?')).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /Engineering/ }));
    expect(await screen.findByText('Anything else pulling at you?')).toBeInTheDocument();

    // The primary is filtered OUT of the secondary list — offering it back would let
    // a student pick the same field twice.
    expect(screen.queryByRole('button', { name: /^Engineering/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Mathematics/ }));
    await user.click(screen.getByRole('button', { name: /^Computer science/ }));
    expect(screen.getByRole('button', { name: /^Law/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Mathematics/ })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('validateSubjects', () => {
  it('IB: five filled rows is "exactly 6 subjects"', async () => {
    const user = setup();
    const payload = clone(IB_PAYLOAD);
    payload.academic_input.subject_list[5].subject_name = '';
    await hydrateThenGoTo(user, payload, SCREEN.grades);
    await user.click(nextButton());
    expect(await screen.findByText('IB requires exactly 6 subjects.')).toBeInTheDocument();
  });

  it('IB: four HL rows is "3 Higher Level subjects"', async () => {
    const user = setup();
    const payload = clone(IB_PAYLOAD);
    payload.academic_input.subject_list[3].level = 'HL';
    await hydrateThenGoTo(user, payload, SCREEN.grades);
    await user.click(nextButton());
    expect(await screen.findByText('IB requires 3 Higher Level subjects.')).toBeInTheDocument();
  });

  it.each([
    ['0', '1–7 only.'],
    ['8', '1–7 only.'],
    ['-1', '1–7 only.']
  ])('IB: grade %p is out of range', async (grade, message) => {
    const user = setup();
    const payload = clone(IB_PAYLOAD);
    payload.academic_input.subject_list[0].grade_value = Number(grade);
    await hydrateThenGoTo(user, payload, SCREEN.grades);
    await user.click(nextButton());
    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it.each([[1], [7]])('IB: grade %i is inside the boundary', async (grade) => {
    const user = setup();
    const payload = clone(IB_PAYLOAD);
    payload.academic_input.subject_list[0].grade_value = grade;
    await hydrateThenGoTo(user, payload, SCREEN.grades);
    await user.click(nextButton());
    expect(await screen.findByRole('heading', { name: STEP_TITLE[SCREEN.tests] })).toBeInTheDocument();
  });

  it('IB: a blank grade reports "Grade is required." and not the range message', async () => {
    const user = setup();
    const payload = clone(IB_PAYLOAD);
    payload.academic_input.subject_list[0].grade_value = null;
    await hydrateThenGoTo(user, payload, SCREEN.grades);
    await user.click(nextButton());
    expect(await screen.findByText('Grade is required.')).toBeInTheDocument();
    expect(screen.queryByText('1–7 only.')).not.toBeInTheDocument();
  });

  it('A-level: two filled rows is "at least 3 subjects"', async () => {
    const user = setup();
    const payload = clone(A_LEVEL_PAYLOAD);
    payload.academic_input.subject_list[2].subject_name = '';
    await hydrateThenGoTo(user, payload, SCREEN.grades);
    await user.click(nextButton());
    expect(await screen.findByText('A-levels require at least 3 subjects.')).toBeInTheDocument();
  });

  it('A-level: four filled rows is accepted (the cap, not over it)', async () => {
    const user = setup();
    const payload = clone(A_LEVEL_PAYLOAD);
    payload.academic_input.subject_list.push({
      subject_name: 'Further Mathematics', level: 'A_LEVEL', grade_value: 'A'
    });
    await hydrateThenGoTo(user, payload, SCREEN.grades);
    await user.click(nextButton());
    expect(await screen.findByRole('heading', { name: STEP_TITLE[SCREEN.tests] })).toBeInTheDocument();
  });

  it('every empty subject row reports its own "Subject is required."', async () => {
    const user = setup();
    const payload = clone(IB_PAYLOAD);
    payload.academic_input.subject_list[2].subject_name = '';
    payload.academic_input.subject_list[4].subject_name = '';
    await hydrateThenGoTo(user, payload, SCREEN.grades);
    await user.click(nextButton());
    expect(await screen.findAllByText('Subject is required.')).toHaveLength(2);
  });
});

describe('validateStep3', () => {
  it('IB: maths pathway is required', async () => {
    const user = setup();
    const payload = clone(IB_PAYLOAD);
    payload.academic_input.ib_math_pathway = null;
    await hydrateThenGoTo(user, payload, SCREEN.grades);
    await user.click(nextButton());
    expect(await screen.findByText('Maths pathway required.')).toBeInTheDocument();
  });

  it.each([[4], [-1]])('IB: core points %i is outside 0–3', async (value) => {
    const user = setup();
    const payload = clone(IB_PAYLOAD);
    payload.academic_input.ib_core_points = value;
    await hydrateThenGoTo(user, payload, SCREEN.grades);
    await user.click(nextButton());
    expect(await screen.findByText('0–3 only.')).toBeInTheDocument();
  });

  it.each([[0], [3]])('IB: core points %i is inside 0–3', async (value) => {
    const user = setup();
    const payload = clone(IB_PAYLOAD);
    payload.academic_input.ib_core_points = value;
    await hydrateThenGoTo(user, payload, SCREEN.grades);
    await user.click(nextButton());
    expect(await screen.findByRole('heading', { name: STEP_TITLE[SCREEN.tests] })).toBeInTheDocument();
  });

  it('IB: an EE summary over 350 characters is rejected', async () => {
    const user = setup();
    const payload = clone(IB_PAYLOAD);
    // Only reachable by hydration — the textarea carries maxLength={350}.
    payload.academic_input.ee_summary = 'x'.repeat(351);
    await hydrateThenGoTo(user, payload, SCREEN.grades);
    await user.click(nextButton());
    expect(await screen.findByText('Under 350 characters.')).toBeInTheDocument();
  });

  it('IB: exactly 350 characters is accepted', async () => {
    const user = setup();
    const payload = clone(IB_PAYLOAD);
    payload.academic_input.ee_summary = 'x'.repeat(350);
    await hydrateThenGoTo(user, payload, SCREEN.grades);
    await user.click(nextButton());
    expect(await screen.findByRole('heading', { name: STEP_TITLE[SCREEN.tests] })).toBeInTheDocument();
  });

  it('A-level: the IB-only checks are skipped entirely', async () => {
    const user = setup();
    await hydrateThenGoTo(user, clone(A_LEVEL_PAYLOAD), SCREEN.grades);
    await user.click(nextButton());
    expect(await screen.findByRole('heading', { name: STEP_TITLE[SCREEN.tests] })).toBeInTheDocument();
  });

  /**
   * The English and admissions-test rules are still `validateStep3`'s, but they are
   * reported on the TESTS screen — that partition is the whole point of the split, so
   * these cases navigate there rather than to the subjects screen.
   */
  it('english_required must be answered', async () => {
    const user = setup();
    const payload = clone(IB_PAYLOAD);
    payload.academic_input.english_required = null;
    await hydrateThenGoTo(user, payload, SCREEN.tests);
    await user.click(nextButton());
    // null hydrates to 'not_sure', which IS an answer — so this passes. The
    // "Select an option." branch is unreachable from a hydrated payload and
    // only fires on a form that has never touched the control.
    expect(await screen.findByRole('heading', { name: STEP_TITLE[SCREEN.about] })).toBeInTheDocument();
  });

  it('"Select an option." fires on an untouched english_required', async () => {
    const user = setup();
    renderForm({ initialStep: SCREEN.tests });
    await user.click(nextButton());
    expect(await screen.findByText('Select an option.')).toBeInTheDocument();
  });

  it('the SUBJECTS screen never reports the English question', async () => {
    // The other half of the partition, and the reason it matters: a student entering
    // grades used to be blocked by a question two cards further down that they had
    // not reached yet.
    const user = setup();
    // Hydrated, so the subject rows exist and can be made individually invalid — a
    // blank form has no programme type and therefore no rows at all.
    const payload = clone(IB_PAYLOAD);
    payload.academic_input.subject_list[0].subject_name = '';
    await hydrateThenGoTo(user, payload, SCREEN.grades);
    await user.click(nextButton());
    expect(await screen.findByText('Subject is required.')).toBeInTheDocument();
    expect(screen.queryByText('Select an option.')).not.toBeInTheDocument();
  });

  it('answering "No" skips the test-type and status checks', async () => {
    const user = setup();
    await hydrateThenGoTo(user, clone(A_LEVEL_PAYLOAD), SCREEN.tests);
    expect(chip('No')).toHaveAttribute('aria-pressed', 'true');
    await user.click(nextButton());
    expect(await screen.findByRole('heading', { name: STEP_TITLE[SCREEN.about] })).toBeInTheDocument();
  });

  it('an admissions test with no status reports "Select a status."', async () => {
    const user = setup();
    const payload = clone(IB_PAYLOAD);
    payload.academic_input.admissions_tests[0].status = '' as never;
    await hydrateThenGoTo(user, payload, SCREEN.tests);
    await user.click(nextButton());
    expect(await screen.findByText('Select a status.')).toBeInTheDocument();
  });
});

describe('focusFirstError', () => {
  it('focuses the first errored input on step 1', async () => {
    const user = setup();
    renderForm({ initialStep: SCREEN.about });
    await user.click(nextButton());
    await waitFor(() => expect(document.activeElement).toBe(labelled('First name')));
  });

  it('prefers the most SPECIFIC errored node — the bad row, not its container', async () => {
    // `academic_input.subject_list` (the wrapper) and
    // `academic_input.subject_list.3.subject_name` (the row) both match; the
    // wrapper encloses the row, so the row must win. Getting this backwards is
    // the regression the comment at :1306-1310 documents.
    const user = setup();
    const payload = clone(IB_PAYLOAD);
    payload.academic_input.subject_list[3].subject_name = '';
    await hydrateThenGoTo(user, payload, SCREEN.grades);
    await user.click(nextButton());

    const inputs = screen.getAllByPlaceholderText('Subject name');
    await waitFor(() => expect(document.activeElement).toBe(inputs[3]));
  });

  it('a pending focus hop dies with the component (F-B)', async () => {
    // Submitting a blank form from Review bounces to step 1 and schedules the
    // hop on a deferred timer, which is a wide enough window to unmount inside
    // deterministically. The timer used to survive that unmount and then
    // `.focus()` the first `[data-field]` it could find anywhere in the live
    // document — i.e. whatever tree had replaced this one.
    const user = setup();
    const first = renderForm({ initialStep: SCREEN.review });
    await user.click(submitButton());
    // The bounce now targets the SUBJECT screen — the earliest screen with an error —
    // so the pending hop is aimed at a `[data-field]` there, not at a name field.
    first.unmount();

    // Reset BOTH sources that outlive the first tree and would otherwise choose the
    // second tree's opening screen for it:
    //
    //   - the draft, because `applyDraft` restores its recorded step in preference to
    //     `initialStep`;
    //   - the in-memory router, because `useSearchParamState` reads the existing
    //     `?step=` before falling back to the default. The first tree's bounce pushed
    //     `?step=subject_area`, and a `?step=` in the URL wins.
    //
    // Neither mattered while the bounce target and this test's screen were both step
    // one. They are different screens now, so the leak became visible.
    window.localStorage.clear();
    nav.reset();

    renderForm({ initialStep: SCREEN.about });
    const email = labelled('Email');
    email.focus();
    await new Promise((resolve) => setTimeout(resolve, 700));
    // Previously: focus was stolen to the second tree's First name input.
    expect(document.activeElement).toBe(email);
  }, 15000);

  /**
   * THE SUBMIT-BOUNCE PATH — the half of `focusFirstError` nothing asserted.
   *
   * A submit bounce CHANGES STEP FIRST and then focuses, so the target node has to
   * exist by the time the deferred hop runs. `handleFinalSubmit` used to pass 600ms
   * for that, because `AnimatePresence mode="wait"` would not mount the incoming
   * step until the outgoing one finished its 0.25s exit. Both are gone: the step
   * body is a keyed `motion.div` with no exit, so both call sites use the 50ms
   * default.
   *
   * These two tests are what make that constant safe to change. If the field is
   * ever reported as wrong without being focused, the delay is the first suspect —
   * and note the caveat: a step change is also a URL write through
   * `useSearchParamState` → `router.push`, and these suites replace the router with
   * an in-memory store. jsdom cannot show how long a real soft navigation takes.
   */
  it('lands on the offending field after a submit bounce', async () => {
    const user = setup();
    const payload = clone(IB_PAYLOAD);
    payload.personal_information.email = 'not-an-email';
    renderForm({ initialPayload: payload, initialStep: SCREEN.review });
    await user.click(submitButton());

    // Bounces 6 → 1, then focuses. Generous timeout: this is the slow path.
    await waitFor(
      () => expect(document.activeElement).toBe(labelled('Email')),
      { timeout: 4000 }
    );
  }, 15000);

  it('lands on a step-3 field when the bounce skips past steps 1 and 2', async () => {
    // `handleFinalSubmit` picks the EARLIEST failing step, so this also pins
    // that a step-3-only failure does not stop at step 1.
    const user = setup();
    const payload = clone(IB_PAYLOAD);
    payload.academic_input.subject_list[2].subject_name = '';
    renderForm({ initialPayload: payload, initialStep: SCREEN.review });
    await user.click(submitButton());

    await screen.findByRole('heading', { name: STEP_TITLE[SCREEN.grades] });
    const inputs = await screen.findAllByPlaceholderText('Subject name');
    await waitFor(() => expect(document.activeElement).toBe(inputs[2]), { timeout: 4000 });
  }, 15000);
});

// ═════════════════════════════════════════════════════════════════════════════
// 2b. FIELD ERROR ↔ FIELD ASSOCIATION (F-D)
// ═════════════════════════════════════════════════════════════════════════════

describe('field errors are described, not named (F-D)', () => {
  it('an errored input keeps its own accessible name', async () => {
    const user = setup();
    renderForm({ initialStep: SCREEN.about });
    await user.click(nextButton());
    await screen.findByText('First name is required.');
    // Was "First nameFirst name is required." — the message was rendered inside
    // the <label>, so every screen reader re-read it on each keystroke.
    expect(labelled('First name')).toHaveAccessibleName('First name');
    expect(labelled('Email')).toHaveAccessibleName('Email');
  });

  it('the message is reachable from the input via aria-describedby', async () => {
    const user = setup();
    renderForm({ initialStep: SCREEN.about });
    await user.click(nextButton());
    await screen.findByText('First name is required.');
    const input = labelled('First name');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('First name is required.');
  });

  it('holds for a combobox that renders its own error too', async () => {
    const user = setup();
    renderForm({ initialStep: SCREEN.about });
    await user.click(nextButton());
    await screen.findByText('Country of residence is required.');
    const input = labelled('Country of residence');
    expect(input).toHaveAccessibleName('Country of residence');
    expect(input).toHaveAccessibleDescription('Country of residence is required.');
  });

  it('holds on the SCHOOL screen too', async () => {
    const user = setup();
    renderForm({ initialStep: SCREEN.school });
    await user.click(nextButton());
    await screen.findByText('School name is required.');
    expect(labelled('School name')).toHaveAccessibleName('School name');
    expect(labelled('School country')).toHaveAccessibleName('School country');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2c. THE `CLEAR` SENTINEL — un-setting an optional Select
// ═════════════════════════════════════════════════════════════════════════════

/**
 * `CLEAR = '__clear'` exists because these fields are OPTIONAL and their native
 * predecessors had a selectable `<option value="">` — so a value could be set
 * and then TAKEN BACK. A placeholder is not a substitute: it shows only while
 * the field is empty and can never be re-chosen.
 *
 * Only the sentinel's PRESENCE in the option list was asserted before (in the
 * step-2 and step-3 option-count tests). Nothing clicked it, so nothing proved
 * the un-set actually works end to end — and the obvious "cleanup" of replacing
 * it with `<SelectItem value="">` produces an item that mounts fine and does
 * NOTHING when clicked, silently, because `src/components/ui/select.tsx`
 * swallows `onValueChange('')` app-wide. That failure is invisible without
 * these tests.
 */
describe('the CLEAR sentinel un-sets an optional Select', () => {
  it('School type: a hydrated value can be taken back to the placeholder', async () => {
    const user = setup();
    await hydrateThenGoTo(user, clone(IB_PAYLOAD), SCREEN.school);
    const trigger = screen.getByRole('combobox', { name: 'School type' });
    expect(trigger).toHaveTextContent('International school');

    await chooseFromSelect(user, 'School type', 'Not specified');
    expect(trigger).toHaveTextContent('Select…');
  });

  it('School type: the cleared field reaches the payload as null, not "__clear"', async () => {
    const user = setup();
    await hydrateThenGoTo(user, clone(IB_PAYLOAD), SCREEN.school);
    await chooseFromSelect(user, 'School type', 'Not specified');

    await user.click(railButton(SIDEBAR[SCREEN.review]));
    await user.click(await screen.findByRole('button', { name: 'Submit & see matches' }));

    await waitFor(() => expect(saveStudentIntake).toHaveBeenCalledTimes(1));
    const sent = saveStudentIntake.mock.calls[0][0] as StudentProfilePayload;
    expect(sent.academic_input.school_type).toBeNull();
  }, 20000);

  it('Graduation year: clearing a REQUIRED field surfaces its validation error', async () => {
    // Graduation year offers the sentinel too, but it is required — so clearing
    // it must be permitted by the Select and then caught by the validator,
    // rather than being silently impossible.
    const user = setup();
    await hydrateThenGoTo(user, clone(IB_PAYLOAD), SCREEN.school);
    expect(screen.getByRole('combobox', { name: 'Graduation year' })).toHaveTextContent('2027');

    await chooseFromSelect(user, 'Graduation year', 'Not specified');
    expect(screen.getByRole('combobox', { name: 'Graduation year' })).toHaveTextContent('Select…');

    await user.click(nextButton());
    expect(await screen.findByText('Graduation year is required.')).toBeInTheDocument();
  }, 20000);
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. buildPayload / applyPayload ROUND TRIP  — the highest-value tests here
// ═════════════════════════════════════════════════════════════════════════════

describe('payload round trip', () => {
  const submitHydrated = async (payload: StudentProfilePayload) => {
    const user = setup();
    renderForm({ initialPayload: payload, initialStep: SCREEN.review });
    await user.click(submitButton());
    await waitFor(() => expect(saveStudentIntake).toHaveBeenCalledTimes(1));
    return saveStudentIntake.mock.calls[0][0] as StudentProfilePayload;
  };

  it('IB: hydrate → rebuild is the identity', async () => {
    const sent = await submitHydrated(clone(IB_PAYLOAD));
    expect(sent).toEqual(IB_PAYLOAD);
  });

  it('A-level: hydrate → rebuild is the identity', async () => {
    const sent = await submitHydrated(clone(A_LEVEL_PAYLOAD));
    expect(sent).toEqual(A_LEVEL_PAYLOAD);
  });

  it('IB: rebuilding twice is stable (no drift on a second submit)', async () => {
    const user = setup();
    renderForm({ initialPayload: clone(IB_PAYLOAD), initialStep: SCREEN.review });
    saveStudentIntake.mockResolvedValue({ success: false, message: 'nope' });
    await user.click(submitButton());
    await waitFor(() => expect(saveStudentIntake).toHaveBeenCalledTimes(1));
    await user.click(submitButton());
    await waitFor(() => expect(saveStudentIntake).toHaveBeenCalledTimes(2));
    expect(saveStudentIntake.mock.calls[1][0]).toEqual(saveStudentIntake.mock.calls[0][0]);
  });

  it('hydration overwrites the browser-timezone seeding effect', async () => {
    // Two mount effects write `personalInfo`: the Intl timezone probe (:709)
    // and hydration (:847), in that declaration order. The payload must win —
    // `A_LEVEL_PAYLOAD.time_zone` is null and stays null.
    const sent = await submitHydrated(clone(A_LEVEL_PAYLOAD));
    expect(sent.personal_information.time_zone).toBeNull();
  });

  it('with NO payload, the mount effect seeds the browser timezone into state', async () => {
    // `time_zone` has no visible control, so read it out of the draft the
    // persistence effect writes. Environment-derived, not clock-derived.
    const user = setup();
    renderForm({ initialStep: SCREEN.about });
    await user.type(labelled('First name'), 'Alex');
    await waitFor(() => expect(window.localStorage.getItem(DRAFT_KEY)).not.toBeNull(), {
      timeout: 3000
    });
    const draft = JSON.parse(window.localStorage.getItem(DRAFT_KEY) as string) as {
      personalInfo: { time_zone: string };
    };
    expect(draft.personalInfo.time_zone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(draft.personalInfo.time_zone).toBeTruthy();
  });
});

describe('payload normalisation', () => {
  /** Deliberately NOT a fixed point — every field here is rewritten by buildPayload. */
  const messy = (): StudentProfilePayload => {
    const p = clone(IB_PAYLOAD);
    p.personal_information.nationality = '  Nigeria ,United Kingdom , ,';
    p.personal_information.current_location_city = '   ';
    p.academic_input.ib_total_points = 45; // stale — must be recomputed to 35
    p.academic_input.school_city = '  ';
    p.academic_input.career_aspiration = '   ';
    p.academic_input.english_test_type = 'WAIVER'; // + english_required true
    p.lifestyle_preference.desired_location_type = 'london'; // legacy key, and a legal enum member
    p.lifestyle_preference.key_activities = ['stale', 'values'];
    p.lifestyle_preference.intl_experience = [];
    p.lifestyle_preference.epq_subject = 'Physics'; // IB → forced null
    p.lifestyle_preference.epq_title = 'Something';
    p.activities_list = [
      { id: 'act-1', category: 'Debate / Model UN', level: 'International', duration: '3–4 years', highlight: '  Best delegate, THIMUN  ', sort_order: 9 },
      { id: 'act-2', category: '', level: 'School', duration: '1–2 years', highlight: 'dropped', sort_order: 4 },
      { id: 'act-3', category: 'Community Service', level: 'School', duration: '1–2 years', highlight: '   ', sort_order: 7 }
    ];
    return p;
  };

  let sent: StudentProfilePayload;

  beforeEach(async () => {
    const user = setup();
    renderForm({ initialPayload: messy(), initialStep: SCREEN.review });
    await user.click(submitButton());
    await waitFor(() => expect(saveStudentIntake).toHaveBeenCalledTimes(1));
    sent = saveStudentIntake.mock.calls[0][0] as StudentProfilePayload;
  });

  it('re-joins nationalities with ", " and drops blanks', () => {
    expect(sent.personal_information.nationality).toBe('Nigeria, United Kingdom');
  });

  it('maps whitespace-only optional strings to null', () => {
    expect(sent.personal_information.current_location_city).toBeNull();
    expect(sent.academic_input.school_city).toBeNull();
    expect(sent.academic_input.career_aspiration).toBeNull();
  });

  it('recomputes ib_total_points from the subject grades, ignoring the stored value', () => {
    expect(sent.academic_input.ib_total_points).toBe(35);
  });

  it('shows legacy "london" as the "capital_city" chip and stores it back as "london"', () => {
    // CHANGED DELIBERATELY (audit I-1), not re-baselined. This asserted
    // 'capital_city,major_city' — a value `location_type` cannot hold, so the
    // save it describes failed on PG16 with
    //   ERROR: invalid input value for enum location_type
    // after three tables had already committed.
    //
    // `capital_city` is a DISPLAY rename of `london`. `fromPayload` always knew
    // that; `toPayload` did not, so the rename was one-way. It now round-trips:
    // stored 'london' → chip 'capital_city' → stored 'london'.
    expect(sent.lifestyle_preference.desired_location_type).toBe('london');
  });

  it('derives key_activities from the distinct activity categories', () => {
    expect(sent.lifestyle_preference.key_activities).toEqual([
      'Debate / Model UN',
      'Community Service'
    ]);
  });

  it('derives intl_experience from any National-or-International activity', () => {
    expect(sent.lifestyle_preference.intl_experience).toEqual(['International competition']);
  });

  it('drops activity rows with no category and renumbers sort_order by index', () => {
    expect(sent.activities_list).toEqual([
      { category: 'Debate / Model UN', level: 'International', duration: '3–4 years', highlight: 'Best delegate, THIMUN', sort_order: 0 },
      { category: 'Community Service', level: 'School', duration: '1–2 years', highlight: null, sort_order: 1 }
    ]);
  });

  it('nulls the EPQ fields on the IB path', () => {
    expect(sent.lifestyle_preference.epq_subject).toBeNull();
    expect(sent.lifestyle_preference.epq_title).toBeNull();
  });

  it('a WAIVER under english_required=true is rewritten to NONE and drops the score', () => {
    // The derivation effect at :958 flips WAIVER → NONE whenever English is
    // required-or-unsure; `showEnglishScore` then goes false, nulling the score.
    expect(sent.academic_input.english_test_type).toBe('NONE');
    expect(sent.academic_input.english_score_overall).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. CONDITIONAL RENDERING — IB vs A-Level vs ACT
// ═════════════════════════════════════════════════════════════════════════════

describe('conditional rendering on step 3', () => {
  it('IB shows the maths pathway, core points, TOK/EE and EE summary', () => {
    renderForm({ initialPayload: clone(IB_PAYLOAD), initialStep: SCREEN.grades });
    expect(screen.getByText('Maths pathway')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'TOK grade' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'EE grade' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Core points/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^EE summary/)).toBeInTheDocument();
    expect(screen.queryByText('Extended Project (EPQ)')).not.toBeInTheDocument();
  });

  it('IB grades are numeric inputs and show the derived /42 total', () => {
    renderForm({ initialPayload: clone(IB_PAYLOAD), initialStep: SCREEN.grades });
    expect(screen.getAllByPlaceholderText('1–7')).toHaveLength(6);
    expect(screen.getByText('Predicted from subjects:')).toBeInTheDocument();
    expect(screen.getByText('35/42')).toBeInTheDocument();
    expect(screen.getByText(/\+ 2 core =/)).toBeInTheDocument();
  });

  it('A-level hides every IB control and shows the EPQ section', () => {
    renderForm({ initialPayload: clone(A_LEVEL_PAYLOAD), initialStep: SCREEN.grades });
    expect(screen.queryByText('Maths pathway')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'TOK grade' })).not.toBeInTheDocument();
    expect(screen.queryByText('Predicted from subjects:')).not.toBeInTheDocument();
    expect(screen.getByText('Extended Project (EPQ)')).toBeInTheDocument();
  });

  it('A-level grades are Selects, and the level Select is disabled', () => {
    renderForm({ initialPayload: clone(A_LEVEL_PAYLOAD), initialStep: SCREEN.grades });
    expect(screen.queryByPlaceholderText('1–7')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Grade for subject 1' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Level for subject 1' })).toBeDisabled();
  });

  it('A-level grade options are the seven A-level grades plus the clear sentinel', async () => {
    const user = setup();
    renderForm({ initialPayload: clone(A_LEVEL_PAYLOAD), initialStep: SCREEN.grades });
    const { options } = await openSelect(user, 'Grade for subject 1');
    expect(options.map((o) => o.textContent)).toEqual([
      'Not specified', 'A*', 'A', 'B', 'C', 'D', 'E', 'U'
    ]);
  });

  it('IB level options are HL and SL', async () => {
    const user = setup();
    renderForm({ initialPayload: clone(IB_PAYLOAD), initialStep: SCREEN.grades });
    const { options } = await openSelect(user, 'Level for subject 1');
    expect(options.map((o) => o.textContent)).toEqual(['HL', 'SL']);
  });

  it('F-04: an ACT student\'s level Select offers ONLY "A-level"', async () => {
    // KNOWN LIVE BUG (audit F-04). The level `<Select>` branches on
    // `programmeType === 'IB'` and gives every non-IB student a single
    // `A_LEVEL` option — including ACT, whose trigger is NOT disabled (the
    // disable is `=== 'A_LEVEL'`), so the control is interactive but useless.
    // Pinned as-is; fixing it must break this test.
    const user = setup();
    const payload = clone(A_LEVEL_PAYLOAD);
    payload.academic_input.programme_type = 'ACT';
    renderForm({ initialPayload: payload, initialStep: SCREEN.grades });

    const trigger = screen.getByRole('combobox', { name: 'Level for subject 1' });
    expect(trigger).toBeEnabled();
    const { options } = await openSelect(user, 'Level for subject 1');
    expect(options.map((o) => o.textContent)).toEqual(['A-level']);
  });

  it('ACT also gets the EPQ section (the branch is A_LEVEL || ACT)', () => {
    const payload = clone(A_LEVEL_PAYLOAD);
    payload.academic_input.programme_type = 'ACT';
    renderForm({ initialPayload: payload, initialStep: SCREEN.grades });
    expect(screen.getByText('Extended Project (EPQ)')).toBeInTheDocument();
  });

  it('SAT/ACT scores are shown on the TESTS screen for every programme type', () => {
    // They moved off the subjects screen: they are admissions tests, and a rejected
    // SAT now routes to the screen that actually contains the input.
    renderForm({ initialPayload: clone(IB_PAYLOAD), initialStep: SCREEN.tests });
    expect(screen.getByText('SAT / ACT scores')).toBeInTheDocument();
  });
});

describe('English proficiency branch', () => {
  it('answering "No" hides the whole test block', () => {
    renderForm({ initialPayload: clone(A_LEVEL_PAYLOAD), initialStep: SCREEN.tests });
    expect(screen.queryByRole('combobox', { name: 'Test type' })).not.toBeInTheDocument();
  });

  it('switching No → Yes reveals the block and resets WAIVER to NONE', async () => {
    const user = setup();
    await hydrateThenGoTo(user, clone(A_LEVEL_PAYLOAD), SCREEN.tests);
    await user.click(chip('Yes'));
    const testType = await screen.findByRole('combobox', { name: 'Test type' });
    // F-A again, in miniature: the Select MOUNTS holding 'WAIVER' and the
    // derivation effect (:958) rewrites it to 'NONE' in the same flush, so
    // Radix's bubble input hands back '' and the trigger shows its placeholder
    // rather than "None yet". Pinned as-is.
    // The component's own effect resets WAIVER -> 'NONE' on this transition
    // (StudentIntakeForm.tsx:962-964), and 'NONE' renders as "None yet".
    //
    // This assertion used to expect the placeholder "Select…", i.e. an EMPTY
    // value. That was not the component's doing: remounting the Select fired
    // Radix's spurious `onValueChange('')` (see the note in ui/select.tsx), which
    // overwrote the correct 'NONE' a beat later. The test had pinned the artefact
    // on top of the real behaviour. With that event now swallowed, the explicit
    // reset is what survives — which is what this step always meant to do.
    expect(testType).toHaveTextContent('None yet');
    expect(screen.queryByLabelText(/^Overall score/)).not.toBeInTheDocument();
  });

  it.each([['IELTS'], ['TOEFL'], ['Duolingo']])(
    'choosing %s reveals the overall-score field',
    async (label) => {
      const user = setup();
      await hydrateThenGoTo(user, clone(A_LEVEL_PAYLOAD), SCREEN.tests);
      await user.click(chip('Yes'));
      await screen.findByRole('combobox', { name: 'Test type' });
      await chooseFromSelect(user, 'Test type', label);
      expect(await screen.findByLabelText(/^Overall score/)).toBeInTheDocument();
    }
  );

  it('IELTS is already showing the score field for a hydrated IB student', async () => {
    const user = setup();
    await hydrateThenGoTo(user, clone(IB_PAYLOAD), SCREEN.tests);
    expect(screen.getByRole('combobox', { name: 'Test type' })).toHaveTextContent('IELTS');
    expect(screen.getByLabelText(/^Overall score/)).toHaveValue(7.5);
  });
});

describe('admissions tests section', () => {
  it('is hidden for a cluster that implies no tests and no stored rows', async () => {
    const user = setup();
    const payload = clone(IB_PAYLOAD);
    payload.academic_input.intended_clusters = ['humanities'];
    payload.academic_input.admissions_tests = [];
    await hydrateThenGoTo(user, payload, SCREEN.tests);
    expect(screen.queryByText('Admissions tests')).not.toBeInTheDocument();
  });

  it.each([
    ['law', 'LNAT'],
    ['medicine_dentistry', 'UCAT']
  ])('auto-suggests a test for the %s cluster: %s', async (cluster, test) => {
    const user = setup();
    const payload = clone(IB_PAYLOAD);
    payload.academic_input.intended_clusters = [cluster as never];
    payload.academic_input.admissions_tests = [];
    await hydrateThenGoTo(user, payload, SCREEN.tests);

    expect(await screen.findByRole('button', { name: test })).toHaveAttribute('aria-pressed', 'true');
    // The chip AND the detail card both render the test name.
    expect(screen.getAllByText(test).length).toBeGreaterThan(1);
  });

  it('a suggested test can be REMOVED and does not come back', async () => {
    // Regression pinned by the 14-line comment at :967-977: an earlier version
    // depended on `admissionsTests`, so deselecting LNAT re-ran the effect,
    // which put LNAT straight back.
    const user = setup();
    const payload = clone(IB_PAYLOAD);
    payload.academic_input.intended_clusters = ['law'];
    payload.academic_input.admissions_tests = [];
    await hydrateThenGoTo(user, payload, SCREEN.tests);

    const lnatChip = await screen.findByRole('button', { name: 'LNAT' });
    expect(lnatChip).toHaveAttribute('aria-pressed', 'true');
    await user.click(lnatChip);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'LNAT' })).toHaveAttribute('aria-pressed', 'false')
    );
    // Give the effect every chance to re-fire.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByRole('button', { name: 'LNAT' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('picking "None" replaces every selected test with a single NONE row', async () => {
    const user = setup();
    const payload = clone(IB_PAYLOAD);
    payload.academic_input.intended_clusters = ['law'];
    await hydrateThenGoTo(user, payload, SCREEN.tests);

    await screen.findByRole('button', { name: 'LNAT' });
    await user.click(screen.getByRole('button', { name: 'None' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'LNAT' })).toHaveAttribute('aria-pressed', 'false')
    );
    expect(screen.getByRole('button', { name: 'None' })).toHaveAttribute('aria-pressed', 'true');
    // NONE rows render no detail card, and buildPayload filters them out.
    expect(screen.queryByText('Percentile')).not.toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. DYNAMIC ROWS
// ═════════════════════════════════════════════════════════════════════════════

describe('nationality rows', () => {
  it('removing the MIDDLE of three rows leaves the other two intact', async () => {
    // These rows use `key={i}` (:1617) and are removed by index (:1057). React
    // reconciles the survivors onto DIFFERENT component instances, so each
    // CountryCombobox inherits the previous row's internal `query` state. It
    // looks right today only because of the `useEffect(() => setQuery(value),
    // [value])` prop-sync at :394 — which is itself an antipattern kept alive
    // by the index keys. Delete either half and this test goes red.
    const user = setup();
    renderForm({ initialStep: SCREEN.about });
    await user.click(screen.getByRole('button', { name: '+ Add another' }));
    await user.click(screen.getByRole('button', { name: '+ Add another' }));

    const rows = () => screen.getAllByPlaceholderText('Search nationality…');
    expect(rows()).toHaveLength(3);
    await typeCombobox(user, rows()[0], 'Alpha');
    await typeCombobox(user, rows()[1], 'Bravo');
    await typeCombobox(user, rows()[2], 'Charlie');

    const removeButtons = within(nationalityBox()).getAllByRole('button');
    await user.click(removeButtons[1]);

    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(rows()[0]).toHaveValue('Alpha');
    expect(rows()[1]).toHaveValue('Charlie');
  });

  it('the remove control names the row it removes (F-E)', async () => {
    // The activity rows always had `aria-label="Remove activity"`; the
    // nationality and subject rows had nothing, so their icon-only delete
    // buttons announced as bare "button" — indistinguishable from each other.
    const user = setup();
    renderForm({ initialStep: SCREEN.about });
    await user.click(screen.getByRole('button', { name: '+ Add another' }));
    const removes = within(nationalityBox()).getAllByRole('button');
    expect(removes[0]).toHaveAccessibleName('Remove nationality 1');
    expect(removes[1]).toHaveAccessibleName('Remove nationality 2');
    // …and each is therefore reachable by name.
    expect(screen.getByRole('button', { name: 'Remove nationality 2' })).toBe(removes[1]);
  });

  it('the remove control is hidden while only one row exists', async () => {
    const user = setup();
    renderForm({ initialStep: SCREEN.about });
    expect(within(nationalityBox()).queryAllByRole('button')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: '+ Add another' }));
    expect(within(nationalityBox()).getAllByRole('button')).toHaveLength(2);
  });

  it('every row past the first is removable, including the last', async () => {
    const user = setup();
    renderForm({ initialStep: SCREEN.about });
    await user.click(screen.getByRole('button', { name: '+ Add another' }));
    await user.click(within(nationalityBox()).getAllByRole('button')[0]);
    await waitFor(() =>
      expect(screen.getAllByPlaceholderText('Search nationality…')).toHaveLength(1)
    );
    // Removing index 0 is allowed — there is no "keep at least one" guard.
    expect(within(nationalityBox()).queryAllByRole('button')).toHaveLength(0);
  });
});

describe('subject rows', () => {
  it('picking IB on a blank form seeds six rows: three HL then three SL', async () => {
    const user = setup();
    renderForm({ initialStep: SCREEN.school });
    await user.click(screen.getByRole('radio', { name: /IB Diploma/ }));
    await user.type(labelled('School name'), 'Northgate');
    await typeCombobox(user, labelled('School country'), 'Thailand');
    const { listbox } = await openSelect(user, 'Graduation year');
    await user.click(within(listbox).getAllByRole('option')[1]);
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    await user.click(nextButton());

    await screen.findByRole('heading', { name: STEP_TITLE[SCREEN.grades] });
    expect(await screen.findAllByPlaceholderText('Subject name')).toHaveLength(6);
    expect([1, 2, 3, 4, 5, 6].map((n) =>
      screen.getByRole('combobox', { name: `Level for subject ${n}` }).textContent
    )).toEqual(['HL', 'HL', 'HL', 'SL', 'SL', 'SL']);
  }, 20000);

  it('IB hydration gives six rows and disables Add', () => {
    renderForm({ initialPayload: clone(IB_PAYLOAD), initialStep: SCREEN.grades });
    expect(screen.getAllByPlaceholderText('Subject name')).toHaveLength(6);
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });

  it('A-level hydration gives three rows, Add enabled up to four', async () => {
    const user = setup();
    renderForm({ initialPayload: clone(A_LEVEL_PAYLOAD), initialStep: SCREEN.grades });
    expect(screen.getAllByPlaceholderText('Subject name')).toHaveLength(3);

    const add = screen.getByRole('button', { name: 'Add' });
    expect(add).toBeEnabled();
    await user.click(add);
    expect(screen.getAllByPlaceholderText('Subject name')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });

  it('an IB row added back after a removal defaults to SL, not HL', async () => {
    // `buildNextSubject` (:202) counts existing HLs; with three already present
    // the next blank row must be SL. `buildEmptySubject` alone always says HL,
    // which made a hydrated IB profile fail its own 3-HL check on arrival.
    const user = setup();
    await hydrateThenGoTo(user, clone(IB_PAYLOAD), SCREEN.grades);

    const removeButtons = within(subjectBox()).getAllByRole('button');
    await user.click(removeButtons[removeButtons.length - 1]);
    await waitFor(() => expect(screen.getAllByPlaceholderText('Subject name')).toHaveLength(5));

    await user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(screen.getAllByPlaceholderText('Subject name')).toHaveLength(6));
    expect(screen.getByRole('combobox', { name: 'Level for subject 6' })).toHaveTextContent('SL');
  });

  it('removing a MIDDLE subject row keeps the survivors\' names and grades', async () => {
    const user = setup();
    renderForm({ initialPayload: clone(IB_PAYLOAD), initialStep: SCREEN.grades });

    const removeButtons = within(subjectBox()).getAllByRole('button');
    await user.click(removeButtons[1]); // "Economics"

    await waitFor(() => expect(screen.getAllByPlaceholderText('Subject name')).toHaveLength(5));
    expect(screen.getAllByPlaceholderText('Subject name').map((el) => (el as HTMLInputElement).value))
      .toEqual(['Mathematics', 'Physics', 'English Literature', 'History', 'Modern Languages']);
    expect(screen.getAllByPlaceholderText('1–7').map((el) => (el as HTMLInputElement).value))
      .toEqual(['7', '6', '6', '5', '5']);
  });

  it('changing programme type resets the subject rows', async () => {
    const user = setup();
    await hydrateThenGoTo(user, clone(A_LEVEL_PAYLOAD), SCREEN.school);
    expect(screen.getByRole('radio', { name: /A-levels/ })).toHaveAttribute('aria-checked', 'true');

    await user.click(screen.getByRole('radio', { name: /IB Diploma/ }));
    await user.click(screen.getByRole('button', { name: SIDEBAR[3] }));

    await screen.findByRole('heading', { name: STEP_TITLE[SCREEN.grades] });
    await screen.findByText('Subjects & predicted grades');
    const names = screen.getAllByPlaceholderText('Subject name');
    expect(names).toHaveLength(6);
    expect(names.every((el) => (el as HTMLInputElement).value === '')).toBe(true);
  });

  it('each remove control names its row (F-E)', () => {
    renderForm({ initialPayload: clone(IB_PAYLOAD), initialStep: SCREEN.grades });
    const removeButtons = within(subjectBox()).getAllByRole('button');
    expect(removeButtons.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Remove subject 1', 'Remove subject 2', 'Remove subject 3',
      'Remove subject 4', 'Remove subject 5', 'Remove subject 6'
    ]);
  });

  it('hydration does NOT reset the subject rows (skipProgrammeResetRef)', () => {
    renderForm({ initialPayload: clone(A_LEVEL_PAYLOAD), initialStep: SCREEN.grades });
    expect(screen.getAllByPlaceholderText('Subject name').map((el) => (el as HTMLInputElement).value))
      .toEqual(['Mathematics', 'Physics', 'Chemistry']);
  });
});

describe('activity rows', () => {
  it('starts empty with an explanatory line', () => {
    renderForm({ initialStep: SCREEN.activities });
    expect(screen.getByText(/No activities added yet/)).toBeInTheDocument();
  });

  it('removing the middle of three rows keeps the other two (stable localId keys)', async () => {
    const user = setup();
    renderForm({ initialStep: SCREEN.activities });
    const add = screen.getByRole('button', { name: 'Add activity' });
    await user.click(add);
    await user.click(screen.getByRole('button', { name: 'Add activity' }));
    await user.click(screen.getByRole('button', { name: 'Add activity' }));

    const highlights = () => screen.getAllByPlaceholderText(/Best delegate award/);
    expect(highlights()).toHaveLength(3);
    await user.type(highlights()[0], 'one');
    await user.type(highlights()[1], 'two');
    await user.type(highlights()[2], 'three');

    await user.click(screen.getAllByRole('button', { name: 'Remove activity' })[1]);

    await waitFor(() => expect(highlights()).toHaveLength(2));
    expect(highlights()[0]).toHaveValue('one');
    expect(highlights()[1]).toHaveValue('three');
  });

  it('the highlight placeholder is driven by the chosen category', async () => {
    const user = setup();
    renderForm({ initialStep: SCREEN.activities });
    await user.click(screen.getByRole('button', { name: 'Add activity' }));
    await user.click(screen.getByRole('button', { name: 'Sport' }));
    expect(screen.getByPlaceholderText(/FOBISIA Games champion/)).toBeInTheDocument();
    expect(screen.getByText('Key achievement or highlight')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Academic Competition' }));
    expect(screen.getByPlaceholderText(/Bangkok Economics Essay Competition/)).toBeInTheDocument();
    expect(screen.getByText('Result / award')).toBeInTheDocument();
  });

  it('hides "Add activity" once ten rows exist', async () => {
    const user = setup();
    const payload = clone(IB_PAYLOAD);
    payload.activities_list = Array.from({ length: 10 }, (_, i) => ({
      category: 'Sport', level: 'School' as const, duration: '< 1 year' as const,
      highlight: null, sort_order: i
    }));
    renderForm({ initialPayload: payload, initialStep: SCREEN.activities });
    expect(screen.queryByRole('button', { name: 'Add activity' })).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Remove activity' })[0]);
    expect(await screen.findByRole('button', { name: 'Add activity' })).toBeInTheDocument();
  });

  it('leadership "None" is exclusive with the other roles', async () => {
    const user = setup();
    renderForm({ initialStep: SCREEN.activities });
    await user.click(chip('Prefect'));
    await user.click(chip('Team Captain'));
    expect(chip('Prefect')).toHaveAttribute('aria-pressed', 'true');

    await user.click(chip('None'));
    expect(chip('None')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('Prefect')).toHaveAttribute('aria-pressed', 'false');
    expect(chip('Team Captain')).toHaveAttribute('aria-pressed', 'false');
  });

  it('work-experience "Yes" reveals the description box', async () => {
    const user = setup();
    renderForm({ initialStep: SCREEN.activities });
    expect(screen.queryByLabelText(/^Brief description/)).not.toBeInTheDocument();
    await user.click(chip('Yes'));
    expect(await screen.findByLabelText(/^Brief description/)).toBeInTheDocument();
  });
});

describe('lifestyle chips', () => {
  it('"No preference" is exclusive within the location group', async () => {
    const user = setup();
    renderForm({ initialStep: SCREEN.life });
    await user.click(chip('Capital city'));
    await user.click(chip('Major city'));
    expect(chip('Capital city')).toHaveAttribute('aria-pressed', 'true');

    // "No preference" appears three times on this step (teaching style, location,
    // campus size); the location one is the second.
    await user.click(chips('No preference')[1]);
    expect(chip('Capital city')).toHaveAttribute('aria-pressed', 'false');
    expect(chip('Major city')).toHaveAttribute('aria-pressed', 'false');
    expect(chips('No preference')[1]).toHaveAttribute('aria-pressed', 'true');
  });

  it('location is multi-select and does not cap', async () => {
    const user = setup();
    renderForm({ initialStep: SCREEN.life });
    await user.click(chip('Capital city'));
    await user.click(chip('Major city'));
    await user.click(chip('Smaller city'));
    await user.click(chip('Suburban / campus'));
    expect(chip('Suburban / campus')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('Capital city')).toHaveAttribute('aria-pressed', 'true');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. DRAFT PERSISTENCE
// ═════════════════════════════════════════════════════════════════════════════

const readDraft = () => {
  const raw = window.localStorage.getItem(DRAFT_KEY);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
};

describe('localStorage draft', () => {
  it('is NOT written by hydration alone', async () => {
    renderForm({ initialPayload: clone(IB_PAYLOAD), initialStep: SCREEN.about });
    // The debounce is 500ms; wait comfortably past it. `skipNextDraftSaveRef`
    // must swallow the hydration-induced change.
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(readDraft()).toBeNull();
  });

  it('is written ~500ms after a real edit', async () => {
    const user = setup();
    renderForm({ initialStep: SCREEN.about });
    await user.type(labelled('First name'), 'Alex');

    await waitFor(() => expect(readDraft()).not.toBeNull(), { timeout: 3000 });
    const draft = readDraft() as { version: number; savedAt: number; personalInfo: { first_name: string } };
    expect(draft.version).toBe(1);
    expect(typeof draft.savedAt).toBe('number'); // Date.now() — value never asserted
    expect(draft.personalInfo.first_name).toBe('Alex');
  });

  it('records the current step, so step changes alone persist a draft', async () => {
    const user = setup();
    renderForm({ initialStep: SCREEN.about });
    await fillAboutScreen(user);
    await user.click(nextButton());
    await screen.findByRole('heading', { name: STEP_TITLE[SCREEN.activities] });

    await waitFor(
      () => expect((readDraft() as { currentStep: number } | null)?.currentStep).toBe(SCREEN.activities),
      { timeout: 3000 }
    );
  });

  it('survives a remount: values, step and the restore notice all come back', async () => {
    const user = setup();
    const first = renderForm({ initialStep: SCREEN.about });
    await fillAboutScreen(user);
    await user.click(nextButton());
    await screen.findByRole('heading', { name: STEP_TITLE[SCREEN.activities] });
    await waitFor(
      () => expect((readDraft() as { currentStep: number } | null)?.currentStep).toBe(SCREEN.activities),
      { timeout: 3000 }
    );
    first.unmount();

    // Reset the URL so the restored step can only have come from the draft.
    nav.reset();
    renderForm({ initialStep: SCREEN.about });

    expect(await screen.findByText('Restored your in-progress draft.')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: STEP_TITLE[SCREEN.activities] })).toBeInTheDocument();
    await user.click(railButton(SIDEBAR[SCREEN.about]));
    expect(await screen.findByRole('heading', { name: STEP_TITLE[SCREEN.about] })).toBeInTheDocument();
    await waitFor(() => expect(labelled('First name')).toHaveValue('Alex'));
  }, 20000);

  it('a draft BEATS the server payload', async () => {
    const user = setup();
    const first = renderForm({ initialStep: SCREEN.about });
    await user.type(labelled('First name'), 'Drafty');
    await waitFor(() => expect(readDraft()).not.toBeNull(), { timeout: 3000 });
    first.unmount();
    nav.reset();

    renderForm({ initialPayload: clone(IB_PAYLOAD), initialStep: SCREEN.about });
    expect(await screen.findByText('Restored your in-progress draft.')).toBeInTheDocument();
    expect(labelled('First name')).toHaveValue('Drafty');
  }, 20000);

  it('"Discard draft" clears storage and falls back to the server payload', async () => {
    const user = setup();
    const first = renderForm({ initialStep: SCREEN.about });
    await user.type(labelled('First name'), 'Drafty');
    await waitFor(() => expect(readDraft()).not.toBeNull(), { timeout: 3000 });
    first.unmount();
    nav.reset();

    renderForm({ initialPayload: clone(IB_PAYLOAD), initialStep: SCREEN.about });
    await screen.findByText('Restored your in-progress draft.');
    await user.click(screen.getByRole('button', { name: 'Discard draft' }));

    await waitFor(() => expect(labelled('First name')).toHaveValue('Amara'));
    expect(readDraft()).toBeNull();
    expect(screen.queryByText('Restored your in-progress draft.')).not.toBeInTheDocument();
  }, 20000);

  it('"Discard draft" with NO server payload resets to a blank form', async () => {
    const user = setup();
    const first = renderForm({ initialStep: SCREEN.about });
    await user.type(labelled('First name'), 'Drafty');
    await waitFor(() => expect(readDraft()).not.toBeNull(), { timeout: 3000 });
    first.unmount();
    nav.reset();

    renderForm({ initialStep: SCREEN.about });
    await screen.findByText('Restored your in-progress draft.');
    await user.click(screen.getByRole('button', { name: 'Discard draft' }));

    // Discarding with no server payload resets to a blank form AND returns to the
    // first screen, which is the subject area.
    //
    // The blankness is asserted THERE rather than on the paperwork, and that is not a
    // convenience: with the form genuinely empty, a forward rail jump is refused by
    // the subject-area validator — which is correct behaviour, and proof in itself
    // that the reset really happened. So check the subject area has nothing selected
    // and that the draft is gone.
    await screen.findByRole('heading', { name: STEP_TITLE[SCREEN.subject] });
    expect(readDraft()).toBeNull();
    expect(
      screen.getAllByRole('radio').every((r) => r.getAttribute('aria-checked') === 'false')
    ).toBe(true);
  }, 20000);

  it('the notice can be dismissed without discarding the draft', async () => {
    const user = setup();
    const first = renderForm({ initialStep: SCREEN.about });
    await user.type(labelled('First name'), 'Drafty');
    await waitFor(() => expect(readDraft()).not.toBeNull(), { timeout: 3000 });
    first.unmount();
    nav.reset();

    renderForm({ initialStep: SCREEN.about });
    await screen.findByText('Restored your in-progress draft.');
    await user.click(screen.getByRole('button', { name: 'Dismiss notice' }));

    expect(screen.queryByText('Restored your in-progress draft.')).not.toBeInTheDocument();
    expect(labelled('First name')).toHaveValue('Drafty');
    expect(readDraft()).not.toBeNull();
  }, 20000);

  it('a structurally invalid draft is dropped from storage and ignored', () => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ version: 2, currentStep: 3 }));
    renderForm({ initialPayload: clone(IB_PAYLOAD), initialStep: SCREEN.about });

    expect(screen.queryByText('Restored your in-progress draft.')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(labelled('First name')).toHaveValue('Amara');
  });

  it('an UNPARSEABLE draft is ignored but LEFT in storage', () => {
    // `JSON.parse` throws before the `removeItem` on the next line can run, so
    // the corrupt value survives. Pinning the asymmetry, not endorsing it.
    window.localStorage.setItem(DRAFT_KEY, '{not json');
    renderForm({ initialPayload: clone(IB_PAYLOAD), initialStep: SCREEN.about });

    expect(screen.queryByText('Restored your in-progress draft.')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(DRAFT_KEY)).toBe('{not json');
    expect(labelled('First name')).toHaveValue('Amara');
  });

  it('"Restore last save" wipes the draft and re-applies the server payload at the first screen', async () => {
    const user = setup();
    const first = renderForm({ initialPayload: clone(IB_PAYLOAD), initialStep: SCREEN.about });
    await waitFor(() => expect(labelled('First name')).toHaveValue('Amara'));
    await user.clear(labelled('First name'));
    await user.type(labelled('First name'), 'Edited');
    await waitFor(() => expect(readDraft()).not.toBeNull(), { timeout: 3000 });
    first.unmount();
    nav.reset();

    renderForm({ initialPayload: clone(IB_PAYLOAD), initialStep: SCREEN.grades });
    await screen.findByText('Restored your in-progress draft.');
    await user.click(screen.getByRole('button', { name: 'Restore last save' }));

    // Back to screen ONE, which is the subject area now — the paperwork is fifth.
    expect(await screen.findByRole('heading', { name: STEP_TITLE[SCREEN.subject] })).toBeInTheDocument();
    expect(readDraft()).toBeNull();
    // F-C. `restoreSavedProfile` sets a "Restored last saved progress." status
    // AND sends the user to step 1. The status block used to exist only inside
    // the Review step's JSX, so the message was unreachable — the one visible
    // acknowledgement of an action that silently discards the user's draft. The
    // block now renders outside the per-step AnimatePresence.
    expect(await screen.findByText('Restored last saved progress.')).toBeInTheDocument();
    // `getAllByRole`, not `getByRole`: the form now carries several live regions —
    // the unlocks ledger's announcement node and Ascendi's aside are both
    // `role="status"`. Asserting that SOME status carries the message is the claim
    // this test is actually making; `getByRole` was only ever unique by accident.
    expect(
      screen.getAllByRole('status').some((node) =>
        node.textContent?.includes('Restored last saved progress.')
      )
    ).toBe(true);
  }, 25000);

  it('the restore confirmation follows the user to whatever step they land on (F-C)', async () => {
    const user = setup();
    renderForm({ initialPayload: clone(IB_PAYLOAD), initialStep: SCREEN.grades });
    await user.click(screen.getByRole('button', { name: 'Restore last save' }));
    // Lands on the FIRST screen, which is the subject area …
    expect(await screen.findByRole('heading', { name: STEP_TITLE[SCREEN.subject] })).toBeInTheDocument();
    expect(await screen.findByText('Restored last saved progress.')).toBeInTheDocument();
    // … and the message is still there after moving on, because the status line
    // is no longer owned by one step's JSX.
    await user.click(nextButton());
    await screen.findByRole('heading', { name: STEP_TITLE[SCREEN.school] });
    expect(screen.getByText('Restored last saved progress.')).toBeInTheDocument();
  }, 15000);

  it('"Restore last save" is absent when there is no server payload', () => {
    renderForm({ initialStep: SCREEN.about });
    expect(screen.queryByRole('button', { name: 'Restore last save' })).not.toBeInTheDocument();
  });

  it('a successful submit clears the draft', async () => {
    const user = setup();
    renderForm({ initialPayload: clone(IB_PAYLOAD), initialStep: SCREEN.review });
    // Make an edit so a draft exists at all.
    await user.click(screen.getByRole('button', { name: 'Edit About you' }));
    await screen.findByRole('heading', { name: STEP_TITLE[SCREEN.about] });
    await screen.findByText('Add more than one if applicable.');
    await user.type(labelled('First name'), '!');
    await waitFor(() => expect(readDraft()).not.toBeNull(), { timeout: 3000 });

    await user.click(railButton(SIDEBAR[SCREEN.review]));
    await user.click(await screen.findByRole('button', { name: 'Submit & see matches' }));

    await waitFor(() => expect(readDraft()).toBeNull(), { timeout: 3000 });
  }, 25000);
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. SUBMISSION
// ═════════════════════════════════════════════════════════════════════════════

describe('submission', () => {
  it('sends what the form currently shows, not what was hydrated', async () => {
    const user = setup();
    renderForm({ initialPayload: clone(IB_PAYLOAD), initialStep: SCREEN.about });
    await waitFor(() => expect(labelled('First name')).toHaveValue('Amara'));
    await user.clear(labelled('First name'));
    await user.type(labelled('First name'), 'Zoe');

    await user.click(railButton(SIDEBAR[SCREEN.review]));
    await user.click(await screen.findByRole('button', { name: 'Submit & see matches' }));

    await waitFor(() => expect(saveStudentIntake).toHaveBeenCalledTimes(1));
    const sent = saveStudentIntake.mock.calls[0][0] as StudentProfilePayload;
    expect(sent.personal_information.first_name).toBe('Zoe');
  }, 20000);

  it('reports success and swaps the CTA for the matches link', async () => {
    const user = setup();
    renderForm({ initialPayload: clone(IB_PAYLOAD), initialStep: SCREEN.review });
    await user.click(submitButton());

    expect(await screen.findByText('Profile saved — your matches are ready')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Get me to my matches/ })).toHaveAttribute('href', '/matches');
    expect(screen.getByRole('button', { name: 'Profile saved ✓' })).toBeDisabled();
  });

  it('surfaces a { success: false } message as an alert and stays submittable', async () => {
    const user = setup();
    saveStudentIntake.mockResolvedValue({ success: false, message: 'Some answers could not be saved.' });
    renderForm({ initialPayload: clone(IB_PAYLOAD), initialStep: SCREEN.review });
    await user.click(submitButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Some answers could not be saved.');
    // `findBy`, not `getBy`. The save runs inside `startTransition`, so the submit
    // button reads 'Saving…' for as long as `isPending` is true — and the error
    // alert can paint before the transition has finished settling. Asserting the
    // label synchronously off the back of the alert is therefore a race that a fast
    // machine wins and a loaded CI runner loses: it went red on the TZ=UTC leg
    // alone, having passed locally and on the other leg of the same matrix.
    expect(await screen.findByRole('button', { name: 'Submit & see matches' })).toBeEnabled();
    expect(screen.queryByRole('link', { name: /Get me to my matches/ })).not.toBeInTheDocument();
  });

  it('a { success: false } with no message falls back to "Save failed."', async () => {
    const user = setup();
    saveStudentIntake.mockResolvedValue({ success: false });
    renderForm({ initialPayload: clone(IB_PAYLOAD), initialStep: SCREEN.review });
    await user.click(submitButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Save failed.');
  });

  it('a thrown error surfaces its message', async () => {
    const user = setup();
    saveStudentIntake.mockRejectedValue(new Error('network down'));
    renderForm({ initialPayload: clone(IB_PAYLOAD), initialStep: SCREEN.review });
    await user.click(submitButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('network down');
  });

  it('validates steps 1–3 before calling the action and bounces to the earliest bad step', async () => {
    const user = setup();
    const payload = clone(IB_PAYLOAD);
    payload.personal_information.email = 'not-an-email';
    renderForm({ initialPayload: payload, initialStep: SCREEN.review });
    await user.click(submitButton());

    // The step heading and the step body are two separate <AnimatePresence>
    // blocks, so the heading can land a frame before the fields do.
    expect(await screen.findByRole('heading', { name: STEP_TITLE[SCREEN.about] })).toBeInTheDocument();
    expect(await screen.findByText('Enter a valid email.')).toBeInTheDocument();
    expect(saveStudentIntake).not.toHaveBeenCalled();
  });

  it('bounces to step 3 when only the grades are wrong', async () => {
    const user = setup();
    const payload = clone(IB_PAYLOAD);
    payload.academic_input.ib_math_pathway = null;
    renderForm({ initialPayload: payload, initialStep: SCREEN.review });
    await user.click(submitButton());

    expect(await screen.findByRole('heading', { name: STEP_TITLE[SCREEN.grades] })).toBeInTheDocument();
    expect(saveStudentIntake).not.toHaveBeenCalled();
  });

  it('the Review summary reflects the live form, not the hydrated totals', () => {
    const payload = clone(IB_PAYLOAD);
    payload.academic_input.ib_total_points = 45; // stale
    renderForm({ initialPayload: payload, initialStep: SCREEN.review });
    expect(screen.getByText(/35\/42/)).toBeInTheDocument();
    expect(screen.queryByText(/45\/42/)).not.toBeInTheDocument();
  });

  it('the Review summary lists the filled subjects and omits a blank row', () => {
    // Changed 2026-08-04: the summary used to read "Subjects: 5". A count cannot
    // help anyone catch the mistake a review screen exists to catch, so it now
    // names them — and a row with no subject name is still excluded.
    //
    // The first version of this test was VACUOUS, and an audit mutation-proved it:
    // it blanked subject_list[5] — `Modern Languages`, the LAST row — then asserted
    // that "Modern Languages" was absent, i.e. asserted that a string the test
    // itself had deleted was missing. With `toHaveTextContent` being a SUBSTRING
    // match and the regex anchored only at the start, removing the exclusion
    // filter from the component entirely still passed.
    //
    // Two fixes: blank a MIDDLE row, so the omission has to be detected in the
    // middle of the list rather than at the end where a trailing empty is
    // invisible; and assert the <dd> with a fully anchored regex, so an extra
    // entry anywhere cannot hide in a substring.
    const payload = clone(IB_PAYLOAD);
    payload.academic_input.subject_list[2].subject_name = ''; // Physics, 3rd of 6
    renderForm({ initialPayload: payload, initialStep: SCREEN.review });

    const value = screen.getByText(
      /^Mathematics, Economics, English Literature, History, Modern Languages$/
    );
    expect(value).toBeInTheDocument();
    expect(value.tagName).toBe('DD');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. F-A — HYDRATING ONTO A STEP THAT ALREADY RENDERS A <Select> WIPES IT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * FOUND WHILE WRITING THIS SUITE. Reported, not fixed.
 *
 * `applyPayload` runs from a mount `useEffect` (`:847`). Any Radix `<Select>`
 * that is already on screen at that moment has its value silently reset to `''`.
 *
 * Mechanism — `@radix-ui/react-select`'s `SelectBubbleInput` (dist/index.mjs
 * :1084-1135). Inside a `<form>` (and this whole wizard is one form) Radix
 * renders a hidden native `<select>` whose options come from a Set that each
 * `SelectItem` populates via its OWN effect, and wires
 * `onChange={(e) => onValueChange(e.target.value)}`. Its effect then does:
 *
 *     if (prevValue !== selectValue) { setValue.call(select, selectValue);
 *                                      select.dispatchEvent(new Event('change')) }
 *
 * On the first effect flush the option Set is still empty, so assigning the
 * hydrated value to a native `<select>` with no matching `<option>` yields `''`
 * — and the dispatched change hands that `''` straight back to the app as a
 * real user edit. Outside a `<form>` no bubble input is rendered and the same
 * component hydrates correctly, which is what isolates the cause.
 *
 * REACH: `src/app/profile/wizard/page.tsx:60` computes `initialStep` from the
 * student's completion state, so a returning student is routinely rendered
 * straight onto step 2 or 3 WITH a payload. That silently drops their saved
 * graduation year, school type, subject levels, A-level grades, TOK/EE grades
 * and English test type — and the wizard then refuses to advance, reporting
 * fields as missing that the student already filled.
 *
 * FIXED. `src/components/ui/select.tsx` now swallows `onValueChange('')` at the
 * wrapper, for every Select in the app. It is NOT "safe by construction" — an
 * earlier version of this paragraph claimed Radix forbids an empty-string
 * `SelectItem` value, and that claim is false for the installed
 * `@radix-ui/react-select@2.3.7` (a reviewer disproved it; see that file's
 * header). The real justification is narrower: every Select in the app uses a
 * SENTINEL for its empty option, never `value=""`, so no legitimate clear
 * routes through `onValueChange` and every `''` is this artefact. That was
 * verified across call sites, not derived from a library guarantee — so adding
 * a `<SelectItem value="">` anywhere silently breaks that option, and this
 * paragraph stops being true.
 *
 * These tests were written to pin the BUG. They now assert the REPAIR, so a
 * regression re-breaks the build rather than silently restoring data loss.
 */
describe('F-A: hydrating directly onto a step keeps its Select values', () => {
  it('step 3: the Level selects that existed before hydration survive', async () => {
    renderForm({ initialPayload: clone(IB_PAYLOAD), initialStep: SCREEN.grades });
    // Rows 1-3 were mounted pre-hydration (as A_LEVEL rows). They used to be
    // wiped to ''; they now take the hydrated IB values.
    expect(screen.getByRole('combobox', { name: 'Level for subject 1' })).toHaveTextContent('HL');
    expect(screen.getByRole('combobox', { name: 'Level for subject 2' })).toHaveTextContent('HL');
    expect(screen.getByRole('combobox', { name: 'Level for subject 3' })).toHaveTextContent('HL');
    // Rows 4-6 did not exist before hydration and always mounted correct.
    expect(screen.getByRole('combobox', { name: 'Level for subject 4' })).toHaveTextContent('SL');
  });

  it('the TESTS screen: the English test type survives too', () => {
    renderForm({ initialPayload: clone(IB_PAYLOAD), initialStep: SCREEN.tests });
    expect(screen.getByRole('combobox', { name: 'Test type' })).toHaveTextContent('IELTS');
    // The score field is revealed because a real test type is selected.
    expect(screen.getByLabelText(/^Overall score/)).toBeInTheDocument();
  });

  it('step 3: the form accepts a payload that is actually complete', async () => {
    const user = setup();
    renderForm({ initialPayload: clone(IB_PAYLOAD), initialStep: SCREEN.grades });
    await user.click(nextButton());
    // Previously: "IB requires 3 Higher Level subjects." and "Select a test
    // type." — reported against fields the student had already filled.
    expect(screen.queryByText('IB requires 3 Higher Level subjects.')).not.toBeInTheDocument();
    expect(screen.queryByText('Select a test type.')).not.toBeInTheDocument();
  });

  it('step 2: a returning student keeps their graduation year and school type', () => {
    renderForm({ initialPayload: clone(IB_PAYLOAD), initialStep: SCREEN.school });
    expect(screen.getByRole('combobox', { name: 'Graduation year' })).not.toHaveTextContent('Select…');
    expect(screen.getByRole('combobox', { name: 'School type' })).not.toHaveTextContent('Select…');
  });

  it('CONTROL: reaching a step by NAVIGATION keeps every Select value', async () => {
    // Two screens now, so two visits: the subject levels and TOK live with the
    // grades, the English test type with the tests.
    const user = setup();
    await hydrateThenGoTo(user, clone(IB_PAYLOAD), SCREEN.grades);
    expect(screen.getByRole('combobox', { name: 'Level for subject 1' })).toHaveTextContent('HL');
    expect(screen.getByRole('combobox', { name: 'TOK grade' })).toHaveTextContent('A');

    await user.click(nextButton());
    await screen.findByRole('heading', { name: STEP_TITLE[SCREEN.tests] });
    expect(screen.getByRole('combobox', { name: 'Test type' })).toHaveTextContent('IELTS');
  });

  it('CONTROL: non-Select fields on the same step hydrate correctly', () => {
    renderForm({ initialPayload: clone(IB_PAYLOAD), initialStep: SCREEN.grades });
    expect(screen.getAllByPlaceholderText('Subject name')[0]).toHaveValue('Mathematics');
    expect(screen.getAllByPlaceholderText('1–7')[0]).toHaveValue(7);
  });
});
