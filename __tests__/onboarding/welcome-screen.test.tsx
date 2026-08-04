/**
 * The welcome screen's two actions, and specifically the second one.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * "Browse universities first" was added on one branch and was missing from
 * another that had been cut from the same base a few commits earlier. Rebasing
 * the second onto the first produced NO conflict in this file — the newer branch
 * simply had never received the commit — so the button, its `BROWSE_FIRST`
 * import and the copy explaining it all vanished silently, and every one of the
 * 1,900 tests stayed green.
 *
 * Nothing rendered this component. That is the whole reason the loss was
 * invisible, so the fix is a test that renders it.
 *
 * The button is not decoration. It is the only thing on the first screen a new
 * student sees that lets them look at the product before handing over six
 * subject grades — the complaint the entire re-tiering was meant to answer. A
 * silent regression here reads as "nothing broke": no error, no failing test,
 * just the escape hatch gone and the setup wall back.
 */

import { render, screen } from '@testing-library/react';
import { WelcomeScreen } from '@/app/welcome/_components/welcome-screen';
import { BROWSE_FIRST, isOnboardingGated } from '@/lib/onboarding/destination';

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: (...args: unknown[]) => push(...args) })
}));

// The server action is a live POST endpoint in the real app; here it only needs to
// resolve so the transition it runs inside can settle.
const markOnboardingStep = jest.fn(async (..._args: unknown[]) => ({ success: true as const }));
jest.mock('@/lib/onboarding/actions', () => ({
  markOnboardingStep: (...args: unknown[]) => markOnboardingStep(...args)
}));

// framer-motion's layout effects and the blob banner's canvas work are irrelevant to
// what this file asserts, and both are noisy in jsdom.
jest.mock('@/components/animated-blob-banner', () => ({
  AnimatedBlobBanner: () => <div data-testid="blob" />
}));

const BROWSE = /browse universities first/i;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('the browse-first escape hatch', () => {
  it('is offered to a student', () => {
    render(<WelcomeScreen variant="student" firstName="Ada" returnTo="/dashboard" />);

    // A real, reachable second action — not a footnote and not disabled.
    expect(screen.getByRole('button', { name: BROWSE })).toBeEnabled();
  });

  it('is NOT offered to a counsellor', () => {
    // A counsellor has no student-profile wall to get around, and the catalogue is
    // not their surface — offering it here would send them somewhere useless.
    render(<WelcomeScreen variant="counsellor" firstName="Ada" returnTo="/counsellor" />);

    expect(screen.queryByRole('button', { name: BROWSE })).toBeNull();
  });

  it('leads somewhere the onboarding gate will not bounce', () => {
    // The button's whole purpose is to get around the gate. If its destination were
    // itself gated, clicking it would bounce to /welcome and — once `welcomed_at` is
    // stamped — forward straight back. Pinned here as well as in destination.test.ts
    // because this is the file that proves something actually points at the constant.
    render(<WelcomeScreen variant="student" firstName={null} returnTo="/dashboard" />);

    expect(screen.getByRole('button', { name: BROWSE })).toBeInTheDocument();
    expect(isOnboardingGated(BROWSE_FIRST)).toBe(false);
  });

  it('renders the primary setup action alongside it, not instead of it', () => {
    // Both actions, always. The failure this guards is a well-meaning edit that
    // replaces the pair with one "Get started" button and quietly removes the choice.
    render(<WelcomeScreen variant="student" firstName="Ada" returnTo="/dashboard" />);

    expect(screen.getByRole('button', { name: /set up my profile/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: BROWSE })).toBeInTheDocument();
  });

  it('tells the student that browsing is possible without setup', () => {
    render(<WelcomeScreen variant="student" firstName="Ada" returnTo="/dashboard" />);

    // An escape hatch nobody can find is not a path. The copy has to say that
    // ranking needs the steps and browsing does not — if it implies setup is
    // optional, or omits the distinction, the button stops making sense.
    expect(screen.getByText(/browsing does not/i)).toBeInTheDocument();
  });
});
