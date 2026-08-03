/**
 * Onboarding breadcrumbs — what this user has already been shown.
 *
 * Backed by `profiles.onboarding` (jsonb), added in
 * `supabase/migrations/20260803120000_onboarding_state.sql`.
 *
 * THREE THINGS TO KNOW BEFORE YOU EDIT THIS FILE
 * ----------------------------------------------
 * 1. **Absence means "not done".** Every key is optional and a missing key is
 *    read as false. That is what lets the app ship before the migration is
 *    applied, and what makes every row that predates the column behave like a
 *    brand-new user rather than erroring.
 *
 * 2. **This is never an authorisation input.** It decides whether a card is
 *    visible and whether a screen has been seen. `profiles.role` (via
 *    `getIdentity`) is the only thing that decides what a user may reach. A
 *    forged value here shows someone a tour they already dismissed; nothing
 *    more.
 *
 * 3. **It feature-detects the column, once per process.** `profiles.onboarding`
 *    does not exist until the migration is applied, and `database.ts` is
 *    generated so it does not know about the column either. Both are handled the
 *    same way the shortlist store handles its missing table: the first failed
 *    call flips a module flag and every later call short-circuits to the empty
 *    state instead of issuing doomed requests. Onboarding then degrades to
 *    "everyone is new", which is a cosmetic regression (the welcome screen and
 *    checklist reappear) and never a lockout — `/welcome` has a skip, and the
 *    middleware gate reads profile *completeness*, not this column.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';

export const ONBOARDING_KEYS = [
  'welcomed_at',
  'tour_completed_at',
  'checklist_dismissed_at',
  'skipped_boosters_at'
] as const;

export type OnboardingKey = (typeof ONBOARDING_KEYS)[number];

/** Every key optional; the value is an ISO timestamp of when it happened. */
export type OnboardingState = Partial<Record<OnboardingKey, string>>;

export const EMPTY_ONBOARDING: OnboardingState = Object.freeze({});

/**
 * Coerce whatever came back from jsonb into the shape above.
 *
 * jsonb is schemaless, so this is the only place that decides what a valid
 * value is. Unknown keys are dropped rather than preserved: a key we do not
 * recognise cannot be rendered, and round-tripping it would let a stale client
 * resurrect fields a later version deliberately removed.
 */
export const parseOnboardingState = (value: unknown): OnboardingState => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return EMPTY_ONBOARDING;

  const source = value as Record<string, unknown>;
  const parsed: OnboardingState = {};

  for (const key of ONBOARDING_KEYS) {
    const raw = source[key];
    // Only non-empty strings count. `true` was the shape an earlier draft used
    // and would silently read as "done" with no timestamp to show, so it is
    // rejected rather than coerced — a wrong-typed value means the write was
    // buggy and re-showing the screen is the safer answer.
    if (typeof raw === 'string' && raw.trim().length > 0) {
      parsed[key] = raw;
    }
  }

  return parsed;
};

export const hasSeen = (state: OnboardingState, key: OnboardingKey): boolean => Boolean(state[key]);

// ── Remote availability ──────────────────────────────────────────────────────

let onboardingColumnAvailable = true;

/**
 * PostgREST reports a missing column as 42703; a missing column referenced in
 * `select` also surfaces as PGRST204/PGRST116 depending on the path. Matching on
 * the message as well keeps this working across postgrest versions rather than
 * pinning to one error-code spelling.
 */
const isMissingColumn = (error: { code?: string | null; message?: string | null } | null): boolean => {
  if (!error) return false;
  if (error.code === '42703') return true;
  const message = error.message?.toLowerCase() ?? '';
  return message.includes('onboarding') && message.includes('does not exist');
};

const markUnavailable = (error: { message?: string | null } | null) => {
  if (!onboardingColumnAvailable) return;
  onboardingColumnAvailable = false;
  console.warn(
    '[onboarding] profiles.onboarding is unavailable; treating every user as new for this process.',
    error?.message ?? error
  );
};

/** Test seam — resets the module flag between cases. */
export const __resetOnboardingAvailability = () => {
  onboardingColumnAvailable = true;
};

type Client = SupabaseClient<Database>;

/**
 * Read one profile's breadcrumbs. Never throws, never returns null: a failure
 * to read is indistinguishable from a new user by design, because both should
 * result in the user being offered the onboarding rather than locked out of it.
 */
export const readOnboardingState = async (client: Client, profileId: string): Promise<OnboardingState> => {
  if (!onboardingColumnAvailable) return EMPTY_ONBOARDING;

  // Cast through `any` in this one wrapper: `database.ts` is generated and lags
  // the migration, so `onboarding` is not in the generated Row type. This is the
  // same containment the repo uses in lib/demo/help-request-client.ts — the cast
  // lives here, and every caller downstream is typed against OnboardingState.
  const { data, error } = await (client as any)
    .from('profiles')
    .select('onboarding')
    .eq('id', profileId)
    .maybeSingle();

  if (error) {
    if (isMissingColumn(error)) markUnavailable(error);
    else console.warn('[onboarding] failed to read state', error.message);
    return EMPTY_ONBOARDING;
  }

  return parseOnboardingState(data?.onboarding);
};

/**
 * Stamp one breadcrumb with the current time.
 *
 * Read-modify-write rather than a jsonb merge expression, because PostgREST
 * cannot express `onboarding || '{...}'` through the JS client without an RPC.
 * The race that costs is two concurrent writes of *different* keys, where the
 * later read can miss the earlier write and drop it. That is acceptable here
 * and nowhere else in the app: the loss re-shows one already-seen screen. It is
 * explicitly NOT a pattern to copy for anything with a correctness cost.
 */
export const markOnboarding = async (
  client: Client,
  profileId: string,
  key: OnboardingKey,
  when: string
): Promise<OnboardingState> => {
  if (!onboardingColumnAvailable) return EMPTY_ONBOARDING;

  const current = await readOnboardingState(client, profileId);
  if (current[key]) return current; // already stamped — don't churn the row

  const next: OnboardingState = { ...current, [key]: when };

  const { error } = await (client as any).from('profiles').update({ onboarding: next }).eq('id', profileId);

  if (error) {
    if (isMissingColumn(error)) markUnavailable(error);
    else console.warn('[onboarding] failed to write state', error.message);
    return current;
  }

  return next;
};
