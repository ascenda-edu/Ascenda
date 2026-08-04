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
 *   Errors belonging to OTHER steps survive. `handleFinalSubmit` routes a payload
 *   rejection back to its own step, and the live-clear pass runs
 *   `validateStep(currentStep, …)`, which knows nothing about those keys. It is
 *   gated on `stepForFieldKey` for exactly that reason; without the gate a
 *   cross-step error would be deleted and the student bounced to a step showing
 *   no reason why.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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
