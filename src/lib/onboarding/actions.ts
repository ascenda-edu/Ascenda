'use server';

import { createServerActionSupabaseClient } from '@/lib/supabase/server';
import { markOnboarding, ONBOARDING_KEYS, type OnboardingKey } from '@/lib/onboarding/state';

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
