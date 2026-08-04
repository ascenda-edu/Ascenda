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
import { isTourId, type TourId } from '@/lib/onboarding/tours';

export const ONBOARDING_KEYS = [
  'welcomed_at',
  /**
   * LEGACY. Written by the original dashboard-only tour, before tours were
   * per-section. Still parsed, never written again: `parseOnboardingState` folds
   * it into `tours.dashboard` so the ~everyone who already finished the old tour
   * is not invited to it a second time. Delete this key only once no live row
   * carries it, and expect to read it for a long while — nothing back-fills it.
   */
  'tour_completed_at',
  'checklist_dismissed_at',
  'skipped_boosters_at',
  /**
   * The user has told Ascendi to stop offering tours. Set after a SECOND decline,
   * not the first — one "no thanks" is about this page, two is about the feature.
   */
  'coach_opted_out_at',
  /**
   * The "ask me anything" sign-off has played once. It is a one-time
   * introduction to the assistant, so it must not replay after every section
   * tour — that is the difference between a flourish and a nag.
   */
  'ascendi_intro_seen_at'
] as const;

export type OnboardingKey = (typeof ONBOARDING_KEYS)[number];

/**
 * Breadcrumbs, plus per-tour completion.
 *
 * `tours` is a nested map rather than a flat `tour_dashboard_at` key per section
 * because the set of tours changes with the routes — a flat key per tour would
 * mean editing `ONBOARDING_KEYS`, the action allowlist and this type every time
 * a section gains one, and forgetting any of the three fails silently.
 */
export type OnboardingState = Partial<Record<OnboardingKey, string>> & {
  tours?: Partial<Record<TourId, string>>;
};

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

  // `tours` gets the same treatment one level down: an unrecognised tour id is
  // dropped rather than kept. Ids come from the route table, so a stale one is a
  // tour that no longer exists — preserving it would let a removed section keep
  // a completion stamp that nothing can ever read or clear.
  const rawTours = source.tours;
  if (rawTours && typeof rawTours === 'object' && !Array.isArray(rawTours)) {
    const tours: Partial<Record<TourId, string>> = {};
    for (const [id, when] of Object.entries(rawTours as Record<string, unknown>)) {
      if (isTourId(id) && typeof when === 'string' && when.trim().length > 0) tours[id] = when;
    }
    if (Object.keys(tours).length > 0) parsed.tours = tours;
  }

  // Legacy fold, and it must come AFTER the block above so a real `tours.dashboard`
  // stamp always wins over the old flat key. Before tours were per-section there
  // was one `tour_completed_at`, and it meant the dashboard tour specifically —
  // that was the only tour there was. Without this, every existing user gets
  // re-invited to the one tour they have already sat through.
  if (parsed.tour_completed_at && !parsed.tours?.dashboard) {
    parsed.tours = { ...parsed.tours, dashboard: parsed.tour_completed_at };
  }

  return parsed;
};

export const hasSeen = (state: OnboardingState, key: OnboardingKey): boolean => Boolean(state[key]);

/** Has this user already been walked through this section? */
export const hasSeenTour = (state: OnboardingState, tour: TourId): boolean => Boolean(state.tours?.[tour]);

/**
 * Should Ascendi offer to show this section, unprompted?
 *
 * Three independent nos, and each one is a different kind of no: they have done
 * this tour, they have switched offers off entirely, or there is no tour for
 * where they are. Collapsing these into one boolean at the call site is how a
 * later change accidentally re-enables one of them.
 */
export const shouldOfferTour = (state: OnboardingState, tour: TourId | null): boolean => {
  if (tour === null) return false;
  if (hasSeen(state, 'coach_opted_out_at')) return false;
  return !hasSeenTour(state, tour);
};

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

  // Spread of `current`, so the nested `tours` map survives this write. Note that
  // `current` has already had the legacy `tour_completed_at` folded into
  // `tours.dashboard` by the parser, so any write also persists the fold. That is
  // deliberate rather than tidied away: the folded row is what a stale client
  // reading only `tour_completed_at` still needs, and the fold is idempotent.
  const next: OnboardingState = { ...current, [key]: when };

  const { error } = await (client as any).from('profiles').update({ onboarding: next }).eq('id', profileId);

  if (error) {
    if (isMissingColumn(error)) markUnavailable(error);
    else console.warn('[onboarding] failed to write state', error.message);
    return current;
  }

  return next;
};

/**
 * Stamp one section's tour as walked.
 *
 * Same read-modify-write, same accepted race as `markOnboarding` — and the race
 * is marginally more reachable here, because two tours CAN be finished close
 * together in two tabs, where two different flat breadcrumbs realistically
 * cannot. The cost is unchanged and still bounded: one lost stamp means Ascendi
 * offers that one section once more. Nothing downstream reads this for
 * correctness, and nothing authorises off it.
 */
export const markTour = async (
  client: Client,
  profileId: string,
  tour: TourId,
  when: string
): Promise<OnboardingState> => {
  if (!onboardingColumnAvailable) return EMPTY_ONBOARDING;

  const current = await readOnboardingState(client, profileId);
  if (current.tours?.[tour]) return current;

  const next: OnboardingState = { ...current, tours: { ...current.tours, [tour]: when } };

  const { error } = await (client as any).from('profiles').update({ onboarding: next }).eq('id', profileId);

  if (error) {
    if (isMissingColumn(error)) markUnavailable(error);
    else console.warn('[onboarding] failed to write tour state', error.message);
    return current;
  }

  return next;
};

/**
 * Wipe every breadcrumb, so the next load behaves like a brand-new account.
 *
 * This exists ONLY for the development coach chip. It is reachable through a
 * server action that refuses to run outside development — see the guard in
 * `actions.ts`, which is the real control. Hiding the button is not: a
 * `'use server'` export is a live POST endpoint whether or not any UI renders it.
 */
export const clearOnboardingState = async (client: Client, profileId: string): Promise<void> => {
  if (!onboardingColumnAvailable) return;

  const { error } = await (client as any).from('profiles').update({ onboarding: {} }).eq('id', profileId);

  if (error) {
    if (isMissingColumn(error)) markUnavailable(error);
    else console.warn('[onboarding] failed to clear state', error.message);
  }
};
