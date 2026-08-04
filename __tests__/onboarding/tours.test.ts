/**
 * The tour registry, and the one test that stops it rotting.
 *
 * A tour is a list of `data-tour` strings that must match attributes in component
 * files. Nothing connects the two but the string, and `product-tour.tsx`
 * deliberately DROPS any step whose anchor is missing — which is right at runtime
 * (a card that has not loaded should not be spotlighted) and catastrophic for
 * maintenance, because renaming an anchor in a component produces no error, no
 * warning and no test failure. It just silently shortens the tour, and if it was
 * the only anchor the tour reports itself as dismissed and is never offered again.
 *
 * So the anchor-existence suite below greps the source. It is the only test here
 * that pins something a type checker cannot: that every string in the registry
 * corresponds to a real attribute somewhere in `src/`.
 *
 * WHAT IT CANNOT SEE, STATED PLAINLY
 * ----------------------------------
 * It proves an anchor exists SOMEWHERE, not that it exists on the route the tour is
 * attached to. A `data-tour="match-list"` moved from the matches page to the
 * dashboard would still pass. Catching that needs a rendered page, which means an
 * e2e test per route; the greps here are the cheap 90%, and the exact-route
 * matching in `tours.ts` is what limits the damage of the remaining 10%.
 */

import { execFileSync } from 'node:child_process';
import { TOURS, TOUR_IDS, resolveTourForPath, isTourId, tourRoutes } from '@/lib/onboarding/tours';

/**
 * Every `data-tour="…"` value present in the source tree.
 *
 * `git grep` rather than a hand-rolled directory walk: it already honours
 * `.gitignore`, so it cannot accidentally match a stale copy in `.next/` or
 * `node_modules/` and report an anchor as present after it was deleted — which is
 * the exact false pass that would make this whole suite worthless.
 */
const anchorsInSource = (): Set<string> => {
  const output = execFileSync('git', ['grep', '-ho', 'data-tour="[^"]*"', '--', 'src'], {
    encoding: 'utf8'
  });

  return new Set(
    output
      .split('\n')
      .map((line) => line.match(/data-tour="([^"]*)"/)?.[1])
      .filter((value): value is string => Boolean(value))
  );
};

describe('every anchor in the registry exists in the source', () => {
  const present = anchorsInSource();

  // Sanity check on the grep itself. Without this, a change that broke the grep
  // (a moved directory, a switch to single quotes) would empty the set and every
  // assertion below would fail confusingly rather than pointing at the cause.
  it('finds anchors at all', () => {
    expect(present.size).toBeGreaterThan(10);
  });

  const steps = TOUR_IDS.flatMap((id) => TOURS[id].steps.map((step) => ({ id, anchor: step.anchor })));

  it.each(steps)('$id → data-tour="$anchor" is rendered somewhere in src/', ({ anchor }) => {
    expect(present.has(anchor)).toBe(true);
  });
});

describe('the registry itself', () => {
  it('has a tour for every declared id, and no orphans', () => {
    // Guards the two halves drifting: a `TOUR_IDS` entry with no `TOURS` object is a
    // crash the moment that route is visited, and a `TOURS` key not in `TOUR_IDS` is
    // dead weight nothing can ever resolve.
    expect(Object.keys(TOURS).sort()).toEqual([...TOUR_IDS].sort());
  });

  it.each(TOUR_IDS)('%s declares its own id, so lookups round-trip', (id) => {
    expect(TOURS[id].id).toBe(id);
  });

  it.each(TOUR_IDS)('%s has at least one step and a label', (id) => {
    expect(TOURS[id].steps.length).toBeGreaterThan(0);
    expect(TOURS[id].label.trim().length).toBeGreaterThan(0);
  });

  it('keeps tours short enough that people finish them', () => {
    // Not arbitrary pedantry: the whole point of this rework was to stop onboarding
    // being heavy. A fifteen-step spotlight is the thing it replaced.
    for (const id of TOUR_IDS) {
      expect(TOURS[id].steps.length).toBeLessThanOrEqual(5);
    }
  });

  it('never repeats an anchor within one tour', () => {
    // A duplicate anchor spotlights the same element twice with different copy,
    // which reads as the tour having lost its place.
    for (const id of TOUR_IDS) {
      const anchors = TOURS[id].steps.map((s) => s.anchor);
      expect(new Set(anchors).size).toBe(anchors.length);
    }
  });
});

describe('resolveTourForPath', () => {
  it.each(tourRoutes())('$route resolves to the $id tour', ({ id, route }) => {
    expect(resolveTourForPath(route)).toBe(id);
  });

  it('normalises a trailing slash', () => {
    expect(resolveTourForPath('/dashboard/')).toBe('dashboard');
  });

  /**
   * The regression this whole exact-match design exists for.
   *
   * Under prefix matching every path below resolved to its section's tour, whose
   * anchors are on a DIFFERENT page — so the tour opened, found nothing, closed
   * instantly, and recorded itself as settled. The user silently and permanently
   * lost a tour they never saw. Nothing errored, which is why it needs a test.
   */
  it.each([
    ['/applications/tasks', 'the applications board tour'],
    ['/applications/documents', 'the applications board tour'],
    ['/university-search/quests', 'the search tour'],
    ['/university-search/shortlist', 'the search tour'],
    ['/university-search', 'the search tour'],
    ['/counsellor/inbox', 'the counsellor overview tour'],
    ['/counsellor/students', 'the counsellor overview tour'],
    ['/parent/deadlines', 'the parent overview tour'],
    ['/profile/wizard', 'the profile tour'],
    ['/toolbox/chances', 'the toolbox tour']
  ])('%s does NOT inherit %s', (path) => {
    expect(resolveTourForPath(path)).toBeNull();
  });

  it.each(['/assistant', '/admin', '/welcome', '/role-select', '/appointment', '/course/123', '/'])(
    '%s has no tour',
    (path) => {
      expect(resolveTourForPath(path)).toBeNull();
    }
  );
});

describe('isTourId', () => {
  it.each(TOUR_IDS)('accepts %s', (id) => {
    expect(isTourId(id)).toBe(true);
  });

  /**
   * This is a security-adjacent test, not a formality. `isTourId` is the allowlist on
   * `markTourComplete`, a public POST endpoint whose argument reaches an object-key
   * position inside a jsonb column — so anything that slips through writes an
   * arbitrary key into `profiles.onboarding`.
   */
  it.each([
    ['__proto__', 'prototype pollution attempt'],
    ['constructor', 'prototype pollution attempt'],
    ['toString', 'inherited Object property'],
    ['', 'empty string'],
    ['DASHBOARD', 'wrong case'],
    ['dashboard ', 'trailing space']
  ])('rejects %s (%s)', (value) => {
    expect(isTourId(value)).toBe(false);
  });

  it.each([null, undefined, 42, {}, [], true])('rejects the non-string %p', (value) => {
    expect(isTourId(value)).toBe(false);
  });
});
