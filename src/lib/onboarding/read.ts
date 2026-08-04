import { cache } from 'react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readOnboardingState, type OnboardingState } from '@/lib/onboarding/state';

/**
 * The request-scoped read of `profiles.onboarding`.
 *
 * WHY THIS FILE EXISTS RATHER THAN CALLING `readOnboardingState` DIRECTLY
 * ---------------------------------------------------------------------
 * Two server components on the same page need this state: the page itself (the
 * dashboard reads it for the getting-started card) and `<AscendiCoachMount />`. Called
 * directly that is two round trips for one answer, on every render.
 *
 * `React.cache` cannot be applied to `readOnboardingState` itself, because that
 * function takes a Supabase client as its first argument and `createServerSupabaseClient`
 * is NOT memoised — so every caller passes a different object identity, every cache
 * key is unique, and the memoisation would silently do nothing while looking like it
 * worked. Keying on `profileId` alone, with the client created inside, is what makes
 * the dedupe real. Same reasoning as `getIdentity` in `lib/auth/identity.ts`.
 *
 * SERVER ONLY, AND THAT IS LOAD-BEARING
 * ------------------------------------
 * `state.ts` is imported by client components (`ascendi-coach.tsx` needs `hasSeen`
 * and `shouldOfferTour`), so it must never reach for the server Supabase factory. That
 * import lives here instead, in a module nothing on the client touches. Do not move it
 * into `state.ts` for tidiness — it would pull server-only code into the browser
 * bundle.
 */
export const getOnboardingState = cache(async (profileId: string): Promise<OnboardingState> => {
  const supabase = await createServerSupabaseClient();
  return readOnboardingState(supabase, profileId);
});
