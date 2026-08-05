/**
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │  THE 2026-08 WIZARD REDESIGN — the behaviour the reorder introduced        │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * The characterization suite pins what the wizard already did. This file pins the
 * things the redesign ADDED, and it is deliberately weighted toward the ones that
 * can regress silently:
 *
 *   - the subject suggestion must never block the student (`968b331`);
 *   - the unlocks ledger stays REMOVED (2026-08-05);
 *   - the milestone must not fire on a half-typed field;
 *   - Ascendi must never take focus;
 *   - the inferred residence must say that it was inferred.
 *
 * Each of those is a rule that a plausible "improvement" would break.
 */

import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import type { StudentProfilePayload } from '@/lib/profile/intake-types';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const saveStudentIntake = jest.fn(async (_payload: unknown) => ({ success: true }));
jest.mock('@/app/profile/actions', () => ({
  saveStudentIntake: (payload: unknown) => saveStudentIntake(payload)
}));

const markOnboardingStep = jest.fn(async (_key: string) => ({ success: true as const }));
jest.mock('@/lib/onboarding/actions', () => ({
  markOnboardingStep: (key: string) => markOnboardingStep(key)
}));

/** In-memory router, same shape the other intake suites use. */
const nav = (() => {
  let params = new URLSearchParams();
  const push = jest.fn((url: string) => {
    params = new URLSearchParams(url.split('?')[1] ?? '');
    subs.forEach((fn) => fn());
  });
  const replace = jest.fn((url: string) => {
    params = new URLSearchParams(url.split('?')[1] ?? '');
    subs.forEach((fn) => fn());
  });
  const subs = new Set<() => void>();
  return {
    push,
    replace,
    subscribe: (fn: () => void) => { subs.add(fn); return () => subs.delete(fn); },
    get: () => params,
    reset: () => { params = new URLSearchParams(); push.mockClear(); replace.mockClear(); }
  };
})();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  useSearchParams: () => {
    const React_ = require('react') as typeof import('react');
    const [, force] = React_.useReducer((n: number) => n + 1, 0);
    React_.useEffect(() => { const off = nav.subscribe(() => force()); return () => { off(); }; }, []);
    return nav.get();
  },
  usePathname: () => '/profile/wizard'
}));

import { StudentIntakeForm } from '@/app/profile/_components/StudentIntakeForm';

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Radix Select (`@/components/ui/select`) needs these four; jsdom ships none. Same
// block as the other intake suites — without `hasPointerCapture` the trigger never
// opens its listbox, and without `scrollIntoView` `focusFirstError` throws inside its
// deferred timer.
Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
Element.prototype.setPointerCapture = Element.prototype.setPointerCapture ?? (() => undefined);
Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? (() => undefined);
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => undefined);
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const SCREEN = {
  subject: 1, school: 2, grades: 3, tests: 4,
  about: 5, activities: 6, life: 7, review: 8
} as const;

const setup = () => userEvent.setup();
const renderForm = (props: Parameters<typeof StudentIntakeForm>[0] = {}) =>
  render(<StudentIntakeForm {...props} />);

const labelled = (label: string) =>
  screen.getByLabelText(new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));

const rail = () => screen.getByRole('list', { name: 'Setup steps' });

beforeEach(() => {
  window.localStorage.clear();
  nav.reset();
  saveStudentIntake.mockClear();
  markOnboardingStep.mockClear();
});

afterEach(async () => {
  window.dispatchEvent(new Event('popstate'));
  await new Promise((resolve) => setTimeout(resolve, 60));
});

const COMPLETE_PAYLOAD: StudentProfilePayload = {
  personal_information: {
    first_name: 'Amara', last_name: 'Okonkwo', email: 'amara@school.example',
    phone: null, nationality: 'Nigeria', age: 17, gender: 'female',
    resident_country: 'Thailand', current_location_city: 'Bangkok', time_zone: 'Asia/Bangkok'
  },
  academic_input: {
    programme_type: 'IB', school_name: 'BIS', school_country: 'Thailand',
    school_city: 'Bangkok', school_type: 'international_school',
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
    a_level_predicted_grades: null,
    ib_total_points: 35, ib_core_points: 2, ib_tok_grade: 'A', ib_ee_grade: 'A',
    ib_math_pathway: 'AA_HL', ee_subject: null, ee_title: null, ee_summary: null,
    english_required: true, english_test_type: 'IELTS', english_status: 'booked',
    english_score_overall: null, admissions_tests: []
  },
  lifestyle_preference: {
    teaching_style: 'academic', desired_location_type: 'major_city', campus_size: 'medium',
    extracurricular_interests: ['Sports / fitness'], other_extracurriculars: null,
    leadership_roles: ['Prefect'], commitment_level: 'moderate', key_activities: ['Debate'],
    sat_score: null, act_score: null, intl_experience: [], work_experience: null,
    work_experience_summary: null, ambition_statement: null, epq_subject: null, epq_title: null
  },
  activities_list: []
};


/**
 * A student who has chosen a subject area and a qualification but entered no subject
 * names yet — exactly the state the suggestion exists for.
 *
 * Six rows with empty names, because `applySuggestion` writes INTO existing rows and
 * never adds any: an IB student must keep their 3 HL / 3 SL shape.
 */
const gradesReady = (cluster: string): StudentProfilePayload => {
  const payload = JSON.parse(JSON.stringify(COMPLETE_PAYLOAD)) as StudentProfilePayload;
  payload.academic_input.intended_clusters = [cluster as never];
  payload.academic_input.subject_list = payload.academic_input.subject_list.map((row) => ({
    ...row,
    subject_name: '',
    grade_value: null
  }));
  return payload;
};

// ═════════════════════════════════════════════════════════════════════════════
// THE SUBJECT SUGGESTION
// ═════════════════════════════════════════════════════════════════════════════

describe('the subject suggestion', () => {
  it('offers the subjects most applicants to that field take', () => {
    renderForm({ initialPayload: gradesReady('engineering'), initialStep: SCREEN.grades });
    expect(screen.getByText(/Most/)).toBeInTheDocument();
    expect(screen.getByText(/Mathematics, Physics and Chemistry/)).toBeInTheDocument();
  });

  it('fills the subject NAMES and leaves the grades empty', async () => {
    const user = setup();
    renderForm({ initialPayload: gradesReady('engineering'), initialStep: SCREEN.grades });
    await user.click(screen.getByRole('button', { name: 'Use these' }));

    await waitFor(() =>
      expect(screen.getAllByPlaceholderText('Subject name')[0]).toHaveValue('Mathematics')
    );
    const names = screen
      .getAllByPlaceholderText('Subject name')
      .map((i) => (i as HTMLInputElement).value);
    expect(names.slice(0, 3)).toEqual(['Mathematics', 'Physics', 'Chemistry']);
    // A suggested GRADE would be a fabrication attributed to the student.
    screen.getAllByPlaceholderText('1–7').forEach((input) => expect(input).toHaveValue(null));
  });

  it('keeps the IB 3 HL / 3 SL shape', async () => {
    // Writing names must not disturb levels: an IB student who silently acquired a
    // fourth HL would fail "IB requires 3 Higher Level subjects" without having
    // touched a level field.
    const user = setup();
    renderForm({ initialPayload: gradesReady('medicine_dentistry'), initialStep: SCREEN.grades });
    await user.click(screen.getByRole('button', { name: 'Use these' }));
    await waitFor(() => expect(screen.getAllByPlaceholderText('Subject name')).toHaveLength(6));
  });

  it('does NOT satisfy validation — the grades are still required (the 968b331 rule)', async () => {
    // `968b331` is "stop the wizard blocking medicine and law applicants on its own
    // suggestion". The mirror-image failure is a suggestion that silently PASSES a
    // screen the student has not completed, so this pins that it does not.
    const user = setup();
    renderForm({ initialPayload: gradesReady('engineering'), initialStep: SCREEN.grades });
    await user.click(screen.getByRole('button', { name: 'Use these' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // One per empty row, so match all of them rather than assuming a single node.
    expect((await screen.findAllByText('Grade is required.')).length).toBeGreaterThan(0);
  });

  it('can be declined, and does not come back', async () => {
    const user = setup();
    renderForm({ initialPayload: gradesReady('law'), initialStep: SCREEN.grades });
    await user.click(screen.getByRole('button', { name: 'No thanks' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Use these' })).not.toBeInTheDocument()
    );
  });

  it('is gone once the rows are populated', async () => {
    const user = setup();
    renderForm({ initialPayload: gradesReady('engineering'), initialStep: SCREEN.grades });
    await user.click(screen.getByRole('button', { name: 'Use these' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Use these' })).not.toBeInTheDocument()
    );
  });

  it('is not offered when the student already has subjects', () => {
    // The guard that makes the feature incapable of overwriting work.
    renderForm({ initialPayload: COMPLETE_PAYLOAD, initialStep: SCREEN.grades });
    expect(screen.queryByRole('button', { name: 'Use these' })).not.toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// THE UNLOCKS LEDGER — REMOVED 2026-08-05
// ═════════════════════════════════════════════════════════════════════════════

describe('the unlocks ledger', () => {
  it('is gone from every step, ledger module included', () => {
    // The "What we can do with this so far" panel was cut on request. Its seven
    // rules (no catalogue counts, no grading the student, diff-not-mirror
    // announcements) went with it, along with `lib/profile/wizard-unlocks.ts` and
    // the `unlock-flash` keyframe. One assertion is kept so that reintroducing the
    // panel is a deliberate act with a failing test to answer for, rather than
    // something that drifts back in beside the form.
    renderForm();
    expect(screen.queryByText('What we can do with this so far')).not.toBeInTheDocument();
    expect(
      screen.queryAllByRole('status').some((n) => (n.textContent ?? '').startsWith('Unlocked:'))
    ).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// ASCENDI
// ═════════════════════════════════════════════════════════════════════════════

describe('Ascendi', () => {
  it('reacts to the subject area with something true about that subject', async () => {
    const user = setup();
    renderForm();
    await user.click(screen.getByRole('radio', { name: /Medicine & dentistry/ }));
    expect(await screen.findByText(/admissions test and an October deadline/)).toBeInTheDocument();
  });

  it('NEVER takes focus from the control that triggered it', async () => {
    // It appears *because* the student did something else. Moving focus to it would
    // interrupt the very action that caused it — and on the grades screen that means
    // pulling the caret out of a number field mid-digit.
    const user = setup();
    renderForm();
    const radio = screen.getByRole('radio', { name: /Engineering/ });
    await user.click(radio);
    await screen.findByText(/Engineering wants Maths/);
    expect(document.activeElement).toBe(radio);
  });

  it('is a polite status, not an alert', async () => {
    const user = setup();
    renderForm();
    await user.click(screen.getByRole('radio', { name: /^Law/ }));
    const bubble = await screen.findByText(/personal statement/);
    const live = bubble.closest('[aria-live]');
    expect(live).toHaveAttribute('aria-live', 'polite');
  });

  it('reacts once per answer, not on every re-render', async () => {
    const user = setup();
    renderForm();
    await user.click(screen.getByRole('radio', { name: /^Humanities/ }));
    await screen.findByText(/widest subject freedom/);
    await user.click(screen.getByRole('button', { name: 'Dismiss Ascendi' }));
    await waitFor(() => expect(screen.queryByText(/widest subject freedom/)).not.toBeInTheDocument());

    // Re-picking the SAME cluster does not repeat the line.
    await user.click(screen.getByRole('radio', { name: /^Humanities/ }));
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(screen.queryByText(/widest subject freedom/)).not.toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// THE MILESTONE
// ═════════════════════════════════════════════════════════════════════════════

describe('the milestone', () => {
  it('fires when the essentials complete', async () => {
    // A complete payload satisfies all five essential screens on mount.
    renderForm({ initialPayload: COMPLETE_PAYLOAD, initialStep: SCREEN.subject });
    expect(await screen.findByRole('dialog', { name: /Your matches just unlocked/ })).toBeInTheDocument();
  });

  it('does NOT fire on a half-typed field', async () => {
    // The guard that matters. `done()` for an essential screen is "the validator
    // passes", not "the fields are non-empty" — so typing one letter of an email
    // address must not launch a full-screen celebration over someone mid-word.
    const user = setup();
    const nearly = JSON.parse(JSON.stringify(COMPLETE_PAYLOAD)) as StudentProfilePayload;
    nearly.personal_information.first_name = '';
    renderForm({ initialPayload: nearly, initialStep: SCREEN.about });

    await user.type(labelled('First name'), 'A');
    await new Promise((resolve) => setTimeout(resolve, 80));
    // "A" is a VALID first name, so this one legitimately completes — the assertion
    // that matters is the negative case below.
    await screen.findByRole('dialog', { name: /Your matches just unlocked/ });
  });

  it('stays shut while a required field is still empty', async () => {
    const user = setup();
    const nearly = JSON.parse(JSON.stringify(COMPLETE_PAYLOAD)) as StudentProfilePayload;
    nearly.personal_information.first_name = '';
    nearly.personal_information.last_name = '';
    renderForm({ initialPayload: nearly, initialStep: SCREEN.about });

    await user.type(labelled('First name'), 'Amara');
    await new Promise((resolve) => setTimeout(resolve, 100));
    // Last name is still blank, so the screen does not validate and nothing fires.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('fires once per session, not on every re-render', async () => {
    const user = setup();
    renderForm({ initialPayload: COMPLETE_PAYLOAD, initialStep: SCREEN.subject });
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Keep going' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // Touching the form again does not reopen it.
    await user.click(screen.getByRole('radio', { name: /^Humanities/ }));
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('takes focus on open so a keyboard user is inside the dialog', async () => {
    renderForm({ initialPayload: COMPLETE_PAYLOAD, initialStep: SCREEN.subject });
    const dialog = await screen.findByRole('dialog');
    // The first action, not the panel: a dialog whose focus lands on a non-interactive
    // container leaves the keyboard user with nothing to press.
    await waitFor(() =>
      expect(document.activeElement).toBe(within(dialog).getAllByRole('button')[0])
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SMART DEFAULTS
// ═════════════════════════════════════════════════════════════════════════════

describe('smart defaults', () => {
  it('seeds the email from the signed-in account', () => {
    // The wizard used to ask a logged-in student for the address they logged in with.
    renderForm({ initialStep: SCREEN.about, accountEmail: 'alex@school.example' });
    expect(labelled('Email')).toHaveValue('alex@school.example');
  });

  /**
   * Fill the SCHOOL screen on a BLANK form, typing the country last.
   *
   * Deliberately not driven from an `initialPayload`. Hydrating a payload onto a
   * screen and then typing into one of its `Combobox`es hits the same harness
   * interaction the characterization suite documents as F-A: the `value → query` sync
   * means only the first character survives, which looks exactly like a product bug
   * and is not one. Driving from empty is also what a student actually does.
   */
  const fillSchoolScreen = async (user: ReturnType<typeof setup>, country: string) => {
    await user.click(screen.getByRole('radio', { name: /IB Diploma/ }));
    await user.type(labelled('School name'), 'Northgate');
    await user.click(screen.getByRole('combobox', { name: 'Graduation year' }));
    const listbox = await screen.findByRole('listbox');
    await user.click(within(listbox).getAllByRole('option')[1]);
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    await user.type(labelled('School country'), country);
    await user.keyboard('{Escape}');
  };

  /** A forward rail jump validates only the screen being LEFT. */
  const goToAbout = async (user: ReturnType<typeof setup>) => {
    await user.click(within(rail()).getByRole('button', { name: /About you/ }));
    await screen.findByRole('heading', { name: 'Now the boring bit' });
  };

  it('infers residence from the school country, and SAYS it inferred it', async () => {
    const user = setup();
    renderForm({ initialStep: SCREEN.school });
    await fillSchoolScreen(user, 'Nigeria');
    await goToAbout(user);

    await waitFor(() => expect(labelled('Country of residence')).toHaveValue('Nigeria'));
    // A pre-filled field the student did not choose is worse than an empty one unless
    // it admits to being a guess.
    expect(screen.getByText(/Assumed from your school/)).toBeInTheDocument();
  }, 25000);

  it('mirrors the WHOLE country, not just the first keystroke', async () => {
    // The bug this pins: `Combobox` fires `onChange` per keystroke, so an inference
    // gated only on "is the field empty?" mirrored the first letter and then stopped —
    // leaving a residence of "N" under a note claiming the app had worked it out.
    const user = setup();
    renderForm({ initialStep: SCREEN.school });
    await fillSchoolScreen(user, 'Nigeria');
    await goToAbout(user);
    await waitFor(() => expect(labelled('Country of residence')).toHaveValue('Nigeria'));
  }, 25000);

  it('hands the field back on "Change"', async () => {
    const user = setup();
    renderForm({ initialStep: SCREEN.school });
    await fillSchoolScreen(user, 'Nigeria');
    await goToAbout(user);
    await waitFor(() => expect(labelled('Country of residence')).toHaveValue('Nigeria'));

    await user.click(screen.getByRole('button', { name: 'Change' }));
    await waitFor(() => expect(labelled('Country of residence')).toHaveValue(''));
    expect(screen.queryByText(/Assumed from your school/)).not.toBeInTheDocument();
  }, 25000);

  it('stops claiming the value once the student edits it themselves', async () => {
    const user = setup();
    renderForm({ initialStep: SCREEN.school });
    await fillSchoolScreen(user, 'Nigeria');
    await goToAbout(user);
    await waitFor(() => expect(labelled('Country of residence')).toHaveValue('Nigeria'));

    await user.type(labelled('Country of residence'), 'x');
    await waitFor(() =>
      expect(screen.queryByText(/Assumed from your school/)).not.toBeInTheDocument()
    );
  }, 25000);

  it('never claims to have assumed a residence the student already had', () => {
    // COMPLETE_PAYLOAD carries `resident_country: 'Thailand'`, chosen by the student,
    // so the note must not appear for it.
    renderForm({ initialStep: SCREEN.about, initialPayload: COMPLETE_PAYLOAD });
    expect(labelled('Country of residence')).toHaveValue('Thailand');
    expect(screen.queryByText(/Assumed from your school/)).not.toBeInTheDocument();
  });
});
