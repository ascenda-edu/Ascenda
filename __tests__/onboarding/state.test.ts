/**
 * `profiles.onboarding` is jsonb, so this parser is the only thing standing between
 * a schemaless column and the UI. Two areas matter enough to pin:
 *
 * 1. THE LEGACY FOLD. Before tours were per-section there was one flat
 *    `tour_completed_at`, and it meant the dashboard tour — the only tour that
 *    existed. Every live row that has it predates `tours`, and if the fold breaks,
 *    every one of those users is invited to a tour they already sat through. That is
 *    the whole failure: not a crash, just the product being annoying to exactly the
 *    people who already engaged with it.
 *
 * 2. WHAT COUNTS AS "SETTLED". `shouldOfferTour` is the single gate on whether
 *    Ascendi speaks unprompted. Three independent reasons to stay quiet, and each is
 *    a different kind of no — collapsing them is how one gets accidentally dropped.
 */

import {
  parseOnboardingState,
  hasSeen,
  hasSeenTour,
  shouldOfferTour,
  EMPTY_ONBOARDING,
  type OnboardingState
} from '@/lib/onboarding/state';

const WHEN = '2026-08-04T10:00:00.000Z';
const EARLIER = '2026-07-01T10:00:00.000Z';

describe('parseOnboardingState', () => {
  it.each([null, undefined, 42, 'string', [], [1, 2]])('treats %p as an empty state', (value) => {
    // Arrays especially: `typeof [] === 'object'`, so without the Array check an
    // array's numeric indices would be walked as if they were keys.
    expect(parseOnboardingState(value)).toEqual(EMPTY_ONBOARDING);
  });

  it('keeps recognised flat keys', () => {
    expect(parseOnboardingState({ welcomed_at: WHEN, coach_opted_out_at: WHEN })).toEqual({
      welcomed_at: WHEN,
      coach_opted_out_at: WHEN
    });
  });

  it('drops unknown keys rather than round-tripping them', () => {
    // Round-tripping would let a stale client resurrect a field a later version
    // deliberately removed, because every write is a read-modify-write of this object.
    const parsed = parseOnboardingState({ welcomed_at: WHEN, nonsense: WHEN, tours: { fictional: WHEN } });

    expect(parsed).toEqual({ welcomed_at: WHEN });
  });

  it.each([true, 1, null, '', '   '])('rejects the non-timestamp value %p', (value) => {
    // `true` was an earlier draft's shape and would read as "done" with no timestamp
    // to show. A wrong-typed value means the write was buggy, and re-showing a screen
    // is the safer response to that than trusting it.
    expect(parseOnboardingState({ welcomed_at: value })).toEqual(EMPTY_ONBOARDING);
  });

  it('parses the nested tours map', () => {
    const parsed = parseOnboardingState({ tours: { dashboard: WHEN, matches: EARLIER } });

    expect(parsed.tours).toEqual({ dashboard: WHEN, matches: EARLIER });
  });

  it.each([null, 'string', 42, ['dashboard']])('treats a tours value of %p as absent', (value) => {
    expect(parseOnboardingState({ tours: value }).tours).toBeUndefined();
  });

  it('omits tours entirely when nothing in it survives validation', () => {
    // An empty `tours: {}` and no `tours` key at all must behave identically, or
    // `hasSeenTour` grows a second falsy case to remember.
    expect(parseOnboardingState({ tours: { fictional: WHEN } }).tours).toBeUndefined();
  });

  describe('the legacy tour_completed_at fold', () => {
    it('reads the old flat key as the dashboard tour', () => {
      const parsed = parseOnboardingState({ tour_completed_at: WHEN });

      expect(hasSeenTour(parsed, 'dashboard')).toBe(true);
      // Still exposed flat as well: nothing back-fills these rows, so the raw key has
      // to keep parsing for as long as any of them exist.
      expect(parsed.tour_completed_at).toBe(WHEN);
    });

    it('does not fold it into any OTHER tour', () => {
      const parsed = parseOnboardingState({ tour_completed_at: WHEN });

      expect(hasSeenTour(parsed, 'matches')).toBe(false);
      expect(hasSeenTour(parsed, 'search')).toBe(false);
    });

    it('lets a real tours.dashboard stamp win over the legacy key', () => {
      // Ordering inside the parser: the nested map is read first, so the fold can only
      // ever fill a gap. If it ran last it would clobber the newer value with an older
      // one on every read.
      const parsed = parseOnboardingState({ tour_completed_at: EARLIER, tours: { dashboard: WHEN } });

      expect(parsed.tours?.dashboard).toBe(WHEN);
    });

    it('preserves other tours while folding', () => {
      const parsed = parseOnboardingState({ tour_completed_at: WHEN, tours: { matches: EARLIER } });

      expect(parsed.tours).toEqual({ matches: EARLIER, dashboard: WHEN });
    });

    it('is idempotent across a read-modify-write cycle', () => {
      // Every write spreads the parsed object back into the column, so a folded value
      // gets persisted. Parsing that result must not change it again.
      const once = parseOnboardingState({ tour_completed_at: WHEN });
      const twice = parseOnboardingState(once);

      expect(twice).toEqual(once);
    });
  });
});

describe('shouldOfferTour', () => {
  const fresh: OnboardingState = EMPTY_ONBOARDING;

  it('offers a tour to someone who has not settled it', () => {
    expect(shouldOfferTour(fresh, 'dashboard')).toBe(true);
  });

  it('stays silent on a route with no tour', () => {
    // `null` reaches here from `resolveTourForPath` on most of the app, so this is the
    // common path, not an edge case.
    expect(shouldOfferTour(fresh, null)).toBe(false);
  });

  it('stays silent once that tour is settled', () => {
    expect(shouldOfferTour({ tours: { dashboard: WHEN } }, 'dashboard')).toBe(false);
  });

  it('still offers a DIFFERENT section after one is settled', () => {
    // The point of per-section tours: finishing one must not silence the rest.
    expect(shouldOfferTour({ tours: { dashboard: WHEN } }, 'matches')).toBe(true);
  });

  it('stays silent everywhere once the user has opted out', () => {
    // Set after a second decline. Two "no thanks" is the user telling us the feature
    // is not for them, and this is the assertion that we stop asking.
    const opted: OnboardingState = { coach_opted_out_at: WHEN };

    expect(shouldOfferTour(opted, 'dashboard')).toBe(false);
    expect(shouldOfferTour(opted, 'matches')).toBe(false);
    expect(shouldOfferTour(opted, 'toolbox')).toBe(false);
  });

  it('honours the opt-out over an unsettled tour', () => {
    expect(shouldOfferTour({ coach_opted_out_at: WHEN, tours: {} }, 'search')).toBe(false);
  });

  it('respects a legacy dashboard-tour completion', () => {
    // The end-to-end version of the fold: a user who finished the old dashboard tour
    // must not be offered it again by the new coach.
    expect(shouldOfferTour(parseOnboardingState({ tour_completed_at: WHEN }), 'dashboard')).toBe(false);
  });
});

describe('hasSeen', () => {
  it('reads a missing key as not done', () => {
    // Absence means "not done" throughout, which is what lets this ship before the
    // migration is applied and makes pre-column rows behave like new users.
    expect(hasSeen(EMPTY_ONBOARDING, 'ascendi_intro_seen_at')).toBe(false);
  });

  it('reads a stamped key as done', () => {
    expect(hasSeen({ ascendi_intro_seen_at: WHEN }, 'ascendi_intro_seen_at')).toBe(true);
  });
});
