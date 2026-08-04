/**
 * @jest-environment ./jest.environment-node.js
 */

/**
 * The guard that keeps `resetOnboardingForTesting` off production.
 *
 * `actions.ts` calls this guard "the real control" and contrasts it with merely
 * hiding the button — every export of a `'use server'` module is a live POST
 * endpoint whether or not any component renders a control for it, so a hidden
 * button is not a guard. That reasoning was documented at length and asserted
 * nowhere: deleting all three lines of the guard left the entire 2037-test suite
 * green, which an audit demonstrated.
 *
 * It matters more now than when it was written. The panel that reaches this
 * endpoint used to exist only on localhost; it now renders in production for
 * admins, so production is the first environment where a real user can be one
 * click from this action.
 *
 * The guard sits ABOVE authentication on purpose, and that is the sharp assertion
 * here: refusing before `ensureUser()` means an unauthenticated caller is turned
 * away too. So the test does not merely check the return value — it checks that
 * the Supabase client was never even constructed.
 */

const createServerActionSupabaseClient = jest.fn();
const clearOnboardingState = jest.fn(async () => undefined);

jest.mock('@/lib/supabase/server', () => ({
  createServerActionSupabaseClient: () => createServerActionSupabaseClient()
}));

jest.mock('@/lib/onboarding/state', () => ({
  ...jest.requireActual('@/lib/onboarding/state'),
  clearOnboardingState: (...args: unknown[]) => clearOnboardingState(...(args as []))
}));

import { resetOnboardingForTesting } from '@/lib/onboarding/actions';

const originalNodeEnv = process.env.NODE_ENV;

const setNodeEnv = (value: string) => {
  Object.defineProperty(process.env, 'NODE_ENV', { value, configurable: true, writable: true });
};

/** A client just complete enough for `ensureUser` to succeed. */
const signedInClient = () => ({
  auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) }
});

beforeEach(() => {
  jest.clearAllMocks();
  createServerActionSupabaseClient.mockResolvedValue(signedInClient());
});

afterEach(() => {
  setNodeEnv(originalNodeEnv ?? 'test');
});

describe('resetOnboardingForTesting', () => {
  it('refuses in production without touching the database or the session', async () => {
    setNodeEnv('production');

    await expect(resetOnboardingForTesting()).resolves.toEqual({
      success: false,
      error: 'Not available.'
    });

    // Before authentication, so an anonymous caller is refused on the same line.
    expect(createServerActionSupabaseClient).not.toHaveBeenCalled();
    expect(clearOnboardingState).not.toHaveBeenCalled();
  });

  it('clears the calling user’s breadcrumbs outside production', async () => {
    setNodeEnv('development');

    await expect(resetOnboardingForTesting()).resolves.toEqual({ success: true });

    // The id comes from the verified session and is never a parameter — the
    // property that keeps this action from being able to target anyone else.
    expect(clearOnboardingState).toHaveBeenCalledWith(expect.anything(), 'user-1');
  });

  it('reports failure rather than throwing when the write fails', async () => {
    setNodeEnv('development');
    clearOnboardingState.mockRejectedValueOnce(new Error('boom'));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(resetOnboardingForTesting()).resolves.toEqual({
      success: false,
      error: 'Could not reset onboarding.'
    });

    consoleError.mockRestore();
  });
});
