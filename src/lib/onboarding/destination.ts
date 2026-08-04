/**
 * Where the onboarding gate sends people, and the one rule that keeps it from
 * looping.
 *
 * WHAT THE GATE NOW IS
 * --------------------
 * An ALLOWLIST of one route. `middleware.ts` redirects a signed-in user with
 * incomplete profile essentials to `/welcome?from=<path>` only when they are
 * reaching for `/matches`.
 *
 * It used to run on every protected route except a handful of exemptions, which
 * meant a new student could not open the dashboard, search the catalogue, browse
 * scholarships or look at the toolbox until they had finished a five-screen form —
 * none of which needs a profile to work, and all of which already have empty
 * states. That was the single most aggressive thing in the product.
 *
 * `/matches` is the one page that genuinely cannot function: it ranks 119,000
 * programmes against grades and subjects, and with neither there is nothing to
 * rank. Everything else is now reachable immediately, and the ask for a profile
 * comes from the getting-started card and from Ascendi rather than from a redirect.
 *
 * WHY AN ALLOWLIST AND NOT A SHORTER DENYLIST
 * -------------------------------------------
 * The old shape was "gate everything, minus exemptions", and its failure mode was
 * an infinite redirect: forward a user to a path that is still gated, the gate
 * fails again, and the browser dies with ERR_TOO_MANY_REDIRECTS. That shipped as a
 * live bug when the redirect target moved from `/profile/wizard` to `/welcome` —
 * the old target happened to be exempt and terminated by luck; the new one
 * forwards, so it did not. Counsellors and admins hit it hardest: the gate reads
 * STUDENT profile tables and never looks at `profiles.role`, so an account with no
 * student profile could never satisfy it, and one click on "Student" at
 * `/role-select` was enough to brick `/dashboard` permanently.
 *
 * An allowlist cannot express that bug. Adding a route to the gate is now an
 * explicit act, and every possible redirect destination — the wizard, a portal
 * home, wherever the user was going — is outside the list by default rather than
 * by remembering to add an exemption. The counsellor/admin lockout disappears on
 * its own, because `/matches` is student-only anyway.
 *
 * `resolveWelcomeDestination` below is still the only place the forwarding
 * decision is made, and it imports the same list rather than restating it.
 *
 * Kept dependency-free on purpose — `middleware.ts` runs on the edge runtime.
 */

/**
 * The only prefixes `middleware.ts` runs the profile-completeness check on.
 *
 * Adding to this list makes a route unreachable for users with an incomplete
 * profile, so the bar is high: the page must be genuinely non-functional without
 * profile data, not merely better with it. "Better with it" is what the
 * getting-started card and Ascendi's prompts are for.
 *
 * - `/matches` — ranks the catalogue against the student's grades and subjects.
 *   With neither, the page has nothing to compute and nothing to show.
 */
export const ONBOARDING_GATED_PREFIXES = ['/matches'] as const;

/**
 * A prefix matches on a path SEGMENT boundary, so `/matches` never accidentally
 * claims a future `/matches-archive`. The old `startsWith` denylist had the same
 * latent bug in reverse (a new `/profiler` route would have been silently exempt).
 */
export const isOnboardingGated = (pathname: string): boolean =>
  ONBOARDING_GATED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

/** Where a non-student portal user belongs. Never gated, so it always terminates. */
export const COUNSELLOR_HOME = '/counsellor';

/** The wizard — the work the gate is asking for. Never gated, so it terminates. */
export const WIZARD = '/profile/wizard';

/** A student's default landing page once the gate passes. */
export const STUDENT_HOME = '/dashboard';

/**
 * Where "browse first" goes — the welcome screen's second action.
 *
 * Under the allowlist this path is ungated by default rather than by exemption,
 * so the old failure mode (offer a way out of the gate that leads back into it)
 * can no longer be reached by editing one list and not the other. It is still
 * declared HERE and imported by the welcome screen rather than written inline,
 * because the one thing that WOULD resurrect that bug is someone adding
 * `/university-search` to `ONBOARDING_GATED_PREFIXES` above — and the two being
 * in the same file is what makes that visible. `destination.test.ts` pins it:
 * this path must not satisfy `isOnboardingGated`.
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
