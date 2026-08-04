'use server';

import { createServerActionSupabaseClient } from '@/lib/supabase/server';
import {
  clearOnboardingState,
  markOnboarding,
  markTour,
  ONBOARDING_KEYS,
  type OnboardingKey
} from '@/lib/onboarding/state';
import { isTourId, type TourId } from '@/lib/onboarding/tours';

/**
 * Server actions for the onboarding breadcrumbs.
 *
 * Every export of a `'use server'` module is a public POST endpoint, so each one
 * authenticates for itself and writes ONLY to the caller's own row. There is
 * deliberately no `profileId` parameter anywhere in this file: the id always
 * comes from the verified session, never from the request body. An action that
 * accepted a target id would let any signed-in user stamp anyone else's
 * onboarding state.
 */

const ensureUser = async () => {
  const supabase = await createServerActionSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return { supabase, userId: user.id };
};

/**
 * Stamp one breadcrumb for the current user.
 *
 * The key is validated against the closed union rather than passed through:
 * this is a public endpoint and `key` reaches an object-key position, so an
 * unvalidated value would let a caller write arbitrary keys into the jsonb
 * column. Nothing authorises off that column, so the ceiling is junk data — but
 * junk data in a schemaless column is exactly what `parseOnboardingState` was
 * written to stop, and stopping it at the write is cheaper.
 *
 * The allowlist is `ONBOARDING_KEYS` itself, never a copy of it. A second literal
 * list here silently rejects every write of any key added to `state.ts` later —
 * and the failure is soft, so nothing would surface it.
 */
export const markOnboardingStep = async (key: OnboardingKey) => {
  if (!(ONBOARDING_KEYS as readonly string[]).includes(key)) {
    return { success: false as const, error: 'Unknown onboarding step.' };
  }

  try {
    const { supabase, userId } = await ensureUser();
    // `new Date().toISOString()` on the SERVER, not the client. A client-supplied
    // timestamp is unverifiable and this value is displayed back to the user.
    await markOnboarding(supabase, userId, key, new Date().toISOString());
    // No `revalidatePath` here, deliberately. `/dashboard` is `force-dynamic`,
    // so there is no cached render to bust, and every caller of this action
    // already updates its own UI optimistically (the card hides itself, the
    // tour closes, the welcome screen navigates). Calling it would pull
    // `next/cache` into this module for no behavioural gain — and `next/cache`
    // is what made this module unloadable in the jsdom test environment that
    // renders the intake wizard.
    return { success: true as const };
  } catch (error) {
    console.error('[onboarding] markOnboardingStep failed', error);
    // Soft-fail. Every caller is a UI breadcrumb — a dismissed card, a finished
    // tour. Throwing here would surface an error boundary over a screen the user
    // just successfully finished, which is strictly worse than the card
    // reappearing on their next visit.
    return { success: false as const, error: 'Could not save your progress.' };
  }
};

/**
 * Record that this user has been walked through one section.
 *
 * Validated against `isTourId` for exactly the reason `markOnboardingStep`
 * validates its key: this is a public POST endpoint and `tour` reaches an
 * object-key position inside a jsonb column. The allowlist is the route table's
 * own id list, never a copy — a second literal here would silently reject every
 * tour added later, and the failure is soft, so nothing would surface it.
 */
export const markTourComplete = async (tour: TourId) => {
  if (!isTourId(tour)) {
    return { success: false as const, error: 'Unknown tour.' };
  }

  try {
    const { supabase, userId } = await ensureUser();
    await markTour(supabase, userId, tour, new Date().toISOString());
    return { success: true as const };
  } catch (error) {
    console.error('[onboarding] markTourComplete failed', error);
    // Soft-fail, same reasoning as above: the tour has already closed on screen.
    // The worst case is Ascendi offering that one section again next visit.
    return { success: false as const, error: 'Could not save your progress.' };
  }
};

/**
 * Reset every breadcrumb for the calling user — the development chip's "start
 * over" button.
 *
 * THE PRODUCTION GUARD IS THIS FUNCTION, NOT THE HIDDEN BUTTON.
 * `coach-panel.tsx` renders the button only when its scope is `development`, and
 * that is a cosmetic detail: every export of a `'use server'` module is a POST
 * endpoint that exists in the production bundle whether or not anything renders a
 * button for it. So the refusal lives here, at the top, before authentication — a
 * destructive action that only a hidden control can reach is still a reachable
 * destructive action.
 *
 * Note the panel itself DOES render in production now, for admins. This guard was
 * deliberately not relaxed to match: replaying a tour never needed it, because
 * `coach.start()` is ephemeral client state that ignores breadcrumbs. Clearing
 * breadcrumbs only matters for re-testing the automatic offer, which is a
 * development concern. Hence the button is absent for an admin rather than present
 * and failing.
 *
 * The blast radius even without the guard would be one user's own onboarding
 * flags (`ensureUser` takes the id from the verified session, never a parameter,
 * so no caller can target anyone else). Guarded anyway: "the damage is small" is
 * not a reason to ship a live reset endpoint.
 */
export const resetOnboardingForTesting = async () => {
  if (process.env.NODE_ENV === 'production') {
    return { success: false as const, error: 'Not available.' };
  }

  try {
    const { supabase, userId } = await ensureUser();
    await clearOnboardingState(supabase, userId);
    return { success: true as const };
  } catch (error) {
    console.error('[onboarding] resetOnboardingForTesting failed', error);
    return { success: false as const, error: 'Could not reset onboarding.' };
  }
};
