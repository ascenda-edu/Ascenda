/**
 * Where the onboarding gate sends people, and the one rule that keeps it from
 * looping.
 *
 * THE LOOP THIS FILE EXISTS TO PREVENT
 * ------------------------------------
 * `middleware.ts` redirects any signed-in user whose profile essentials are
 * incomplete to `/welcome?from=<path>`. `/welcome` then forwards them onward.
 * If it forwards them to a path the gate still checks, and the gate still fails,
 * middleware sends them back to `/welcome` — forever. The browser gives up with
 * ERR_TOO_MANY_REDIRECTS and the user cannot reach the app at all.
 *
 * That is not hypothetical. It shipped as a live bug the moment the redirect
 * target moved from `/profile/wizard` to `/welcome`: `/profile` happens to be
 * exempt from the gate, so the old target terminated by luck. `/welcome`
 * forwards, so it did not.
 *
 * Counsellors and admins hit it first and hardest. The gate reads STUDENT
 * profile tables and never looks at `profiles.role`, so an account with no
 * student profile can never satisfy it — one click on "Student" at
 * `/role-select` (which every account is offered) was enough to brick
 * `/dashboard` permanently.
 *
 * THE RULE
 * --------
 * Only forward to a path the gate will actually let through. Two ways to be sure:
 *   1. the gate now passes for this user (`essentialsComplete`), or
 *   2. the path is exempt from the gate entirely.
 *
 * `resolveWelcomeDestination` below is the only place that decision is made, and
 * `ONBOARDING_EXEMPT_PREFIXES` is imported BY `middleware.ts` rather than copied
 * into it. A second copy of that list is precisely how this bug becomes possible
 * again: someone adds a redirect destination, forgets to exempt it, and nothing
 * fails until a real user is stuck.
 *
 * Kept dependency-free on purpose — `middleware.ts` runs on the edge runtime.
 */

/**
 * Path prefixes `middleware.ts` does NOT run the onboarding completeness check
 * on. Every redirect destination of that check must be in this list.
 *
 * - `/profile`     — the wizard, i.e. the work the gate is asking for.
 * - `/welcome`     — the gate's own landing screen.
 * - `/counsellor`  — a portal whose users have no student profile by definition.
 * - `/parent`      — likewise.
 * - `/role-select` — the post-login fork; gating it would strand every login.
 *
 * ── The browse surfaces, and why they are exempt ─────────────────────────────
 * - `/university-search` — the catalogue.
 * - `/course`            — a single programme's detail page.
 *
 * Tiering the wizard took the wall from five screens down to three. It did not
 * remove it: a brand-new student still could not see a single university until
 * they had entered personal details, school details AND six subject grades. That
 * is the exact complaint the tiering was meant to answer ("before they had seen a
 * single university"), and three screens of it is still all of it.
 *
 * These two are exempt because they are the surfaces that DON'T need a profile.
 * Both degrade rather than break: `use-search-results.ts` returns `{}` from
 * `loadMatchScores` when there is no session or the query fails, and leaves
 * unscored ids scoreless rather than failing the page — so a profile-less visitor
 * gets the catalogue with no fit scores, which is the honest rendering.
 *
 * `/matches`, `/dashboard`, `/applications` and the rest stay gated ON PURPOSE.
 * Those are the surfaces `runMatching` feeds, and it returns zero matches without
 * the essentials (see ./steps.ts) — so letting an incomplete student in shows them
 * an empty page and teaches them the product is broken. Being exempt here means
 * "works without a profile", not "nice to have early". Do not add a route to this
 * list to make a redirect stop happening; check first that the page is genuinely
 * useful with an empty profile, or you are trading a gate for a dead end.
 *
 * NOTE: these are PREFIXES, so `/university-search/shortlist` and
 * `/university-search/quests` come along. Both are fine — the shortlist is
 * localStorage-backed with feature detection, and an unassigned quest deck renders
 * its empty state. Shortlisting while browsing is deliberate: the entries survive
 * into the account once setup is done.
 */
export const ONBOARDING_EXEMPT_PREFIXES = [
  '/profile',
  '/welcome',
  '/counsellor',
  '/parent',
  '/role-select',
  '/university-search',
  '/course'
] as const;

export const isOnboardingExempt = (pathname: string): boolean =>
  ONBOARDING_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix));

/** Where a non-student portal user belongs. Exempt, so it always terminates. */
export const COUNSELLOR_HOME = '/counsellor';

/** The wizard. Exempt, so it always terminates. */
export const WIZARD = '/profile/wizard';

/** A student's default landing page once the gate passes. */
export const STUDENT_HOME = '/dashboard';

/**
 * Where "browse first" goes — the escape hatch from the setup wall.
 *
 * Declared HERE, beside the exemption list, precisely because it must be exempt.
 * A literal in the welcome screen would let someone change one without the other
 * and send a student straight back into the gate. `destination.test.ts` asserts
 * this path satisfies `isOnboardingExempt`.
 */
export const BROWSE_FIRST = '/university-search/search';

/**
 * The origin `?from=` is resolved against to prove it is a path and not a
 * destination. `.invalid` is reserved by RFC 2606 and can never be a real host,
 * so a payload that escapes the path will always change `origin` away from it.
 */
const PROBE_ORIGIN = 'https://sanitise.invalid';

/**
 * Sanitise the attacker-influenced `?from=` before it reaches a `redirect()`.
 *
 * Prefix checks alone are NOT sufficient here, and the gap is not theoretical.
 * URL parsers strip tab, newline and carriage return from a URL before resolving
 * it, so `/\t/evil.com` — which starts with a single slash and passes every
 * `startsWith` test — collapses to `//evil.com` and resolves off-site. It reaches
 * this function decoded, because `?from=/%09/evil.com` is percent-decoded into
 * `searchParams`, so the literal tab never has to survive transport.
 *
 * Two independent defences, deliberately not one:
 *   1. reject C0 controls and DEL outright, and
 *   2. resolve against a probe origin and require the origin to come back
 *      unchanged — which catches anything a future parser quirk sneaks past (1).
 *
 * Only the pathname and query are returned, so a fragment or embedded
 * credentials cannot ride along.
 */
export const safeReturnPath = (raw: string | string[] | undefined): string | null => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  // Tab, LF and CR are the live bypass; the rest of the C0 range and DEL are
  // rejected on the same principle rather than enumerated one at a time.
  if (/[\u0000-\u001F\u007F]/.test(value)) return null;
  if (!value.startsWith('/')) return null;
  if (value.startsWith('//')) return null;

  let url: URL;
  try {
    url = new URL(value, PROBE_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PROBE_ORIGIN) return null;
  // Never bounce back into the flow itself.
  if (url.pathname.startsWith('/welcome')) return null;
  return `${url.pathname}${url.search}`;
};

export interface WelcomeDestinationInput {
  /** `profiles.role`. Anything other than `student` has no student profile to complete. */
  role: string | null | undefined;
  /** Whether the gate would now pass — i.e. steps 1-3 are done. */
  essentialsComplete: boolean;
  /** Sanitised `?from=`, or null. Already known same-origin; see `safeReturnPath`. */
  returnTo: string | null;
}

/**
 * Resolve where `/welcome` should send this user.
 *
 * Every branch returns either an exempt path or — only when the gate now passes
 * — the path they were originally reaching for. There is no third case, and that
 * is the invariant `destination.test.ts` pins.
 */
export const resolveWelcomeDestination = ({
  role,
  essentialsComplete,
  returnTo
}: WelcomeDestinationInput): string => {
  // Counsellors and admins can never satisfy a student-profile gate, so `returnTo`
  // is deliberately ignored for them: honouring it is the loop. They lose the
  // deep link and land on their own portal, which is the correct home anyway —
  // a counsellor sent to `/dashboard` would be looking at an empty student hub.
  if (role !== 'student') return COUNSELLOR_HOME;

  // Still mid-setup: the wizard, never `returnTo`. Forwarding an incomplete
  // student to where they were headed would just re-trigger the gate.
  if (!essentialsComplete) return WIZARD;

  // The gate passes now, so any same-origin path is safe to honour — including a
  // non-exempt one, because middleware will let it through.
  return returnTo ?? STUDENT_HOME;
};
