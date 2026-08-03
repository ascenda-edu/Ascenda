/**
 * The redirect-loop invariant.
 *
 * `middleware.ts` sends every gate-failing user to `/welcome?from=…`, and
 * `/welcome` forwards them onward. If it ever forwards to a path the gate still
 * checks while the gate still fails, the two bounce off each other until the
 * browser gives up with ERR_TOO_MANY_REDIRECTS — an inescapable lockout, not a
 * cosmetic bug.
 *
 * That shipped live: the redirect target moved from `/profile/wizard` (exempt
 * from the gate, so it terminated by luck) to `/welcome` (which forwards).
 * Counsellors and admins hit it immediately, because the gate reads STUDENT
 * profile tables and never looks at `profiles.role` — so an account with no
 * student profile can never satisfy it, and `/role-select` offers every account a
 * one-click "Student" card straight to `/dashboard`.
 *
 * Section 1 pins the invariant in the abstract; section 2 replays the exact
 * journeys that looped.
 */

import {
  ONBOARDING_EXEMPT_PREFIXES,
  isOnboardingExempt,
  resolveWelcomeDestination,
  COUNSELLOR_HOME,
  WIZARD,
  STUDENT_HOME,
  safeReturnPath
} from '@/lib/onboarding/destination';

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. The invariant: a destination is either exempt, or the gate now passes.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('the loop invariant', () => {
  const ROLES = ['student', 'counsellor', 'admin', 'parent', null, undefined];
  // Non-exempt protected paths, i.e. every path middleware WILL re-check.
  const GATED = ['/dashboard', '/matches', '/applications', '/admin', '/assistant', '/toolbox', '/inbox'];

  it.each(ROLES)('never forwards a gate-failing %s to a path the gate re-checks', (role) => {
    for (const from of GATED) {
      const destination = resolveWelcomeDestination({
        role,
        essentialsComplete: false,
        returnTo: from
      });

      // The whole invariant, in one assertion: if the gate would fail again, the
      // destination MUST be exempt from it.
      expect(isOnboardingExempt(destination)).toBe(true);
    }
  });

  it('the destinations it can return are all exempt', () => {
    // Guards against someone adding a branch that returns a plausible-looking
    // but gated path (`/dashboard` for a counsellor was exactly that mistake).
    for (const destination of [COUNSELLOR_HOME, WIZARD]) {
      expect(isOnboardingExempt(destination)).toBe(true);
    }
    // STUDENT_HOME is deliberately NOT exempt — it is only ever returned once the
    // gate passes, so middleware letting it through is the terminating condition.
    expect(isOnboardingExempt(STUDENT_HOME)).toBe(false);
  });

  it('exempts the wizard and the welcome screen themselves', () => {
    // `/profile` covers the wizard; `/welcome` stops the gate firing on its own
    // landing screen. Losing either is an immediate loop.
    expect(ONBOARDING_EXEMPT_PREFIXES).toContain('/profile');
    expect(ONBOARDING_EXEMPT_PREFIXES).toContain('/welcome');
    expect(isOnboardingExempt('/profile/wizard')).toBe(true);
    expect(isOnboardingExempt('/welcome')).toBe(true);
  });

  it('matches on prefix, so nested routes inherit the exemption', () => {
    expect(isOnboardingExempt('/counsellor/students/abc')).toBe(true);
    expect(isOnboardingExempt('/parent/deadlines')).toBe(true);
    // ...but a path that merely CONTAINS an exempt segment is not exempt.
    expect(isOnboardingExempt('/dashboard/profile')).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. The journeys that actually looped.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('the counsellor and admin lockout', () => {
  it.each(['counsellor', 'admin'])('sends a %s to their own portal, ignoring ?from=', (role) => {
    // The bug: `returnTo ?? '/counsellor'` honoured `from`, so /dashboard →
    // /welcome → /dashboard → /welcome → …
    expect(resolveWelcomeDestination({ role, essentialsComplete: false, returnTo: '/dashboard' })).toBe(
      COUNSELLOR_HOME
    );
  });

  it('ignores ?from= for a non-student even when it claims the essentials are done', () => {
    // Defensive: a non-student has no student profile, so `essentialsComplete`
    // should never be true for them — but if a caller ever passes it, honouring
    // `from` would resurrect the loop. Role wins.
    expect(
      resolveWelcomeDestination({ role: 'counsellor', essentialsComplete: true, returnTo: '/dashboard' })
    ).toBe(COUNSELLOR_HOME);
  });

  it.each([null, undefined, 'parent', 'something-new'])(
    'treats role %s as non-student rather than assuming student',
    (role) => {
      // Fail safe on an unrecognised role: the student branch is the one that can
      // forward to a gated path, so anything not positively a student must not
      // take it.
      expect(resolveWelcomeDestination({ role, essentialsComplete: false, returnTo: '/dashboard' })).toBe(
        COUNSELLOR_HOME
      );
    }
  );
});

describe('the student flow', () => {
  it('sends an incomplete student to the wizard, not to where they were headed', () => {
    // Forwarding them to `from` would re-trigger the gate — the same loop.
    expect(
      resolveWelcomeDestination({ role: 'student', essentialsComplete: false, returnTo: '/matches' })
    ).toBe(WIZARD);
  });

  it('returns a now-complete student to the page they were reaching for', () => {
    // This is the one case where a gated path is safe: the gate passes, so
    // middleware lets it through and the journey ends there.
    expect(
      resolveWelcomeDestination({ role: 'student', essentialsComplete: true, returnTo: '/matches' })
    ).toBe('/matches');
  });

  it('falls back to the dashboard when there is nothing to return to', () => {
    expect(resolveWelcomeDestination({ role: 'student', essentialsComplete: true, returnTo: null })).toBe(
      STUDENT_HOME
    );
  });

  it('preserves a query string on the way back', () => {
    // `from` carries the search string now, so a deep link keeps its tab.
    expect(
      resolveWelcomeDestination({
        role: 'student',
        essentialsComplete: true,
        returnTo: '/course/123?tab=fees'
      })
    ).toBe('/course/123?tab=fees');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   3. `?from=` is an open-redirect surface

   It arrives in a URL an attacker can send a victim, and it ends up in a
   `redirect()`. The original implementation checked `startsWith('/')`,
   `startsWith('//')` and `startsWith('/\\')` — and was bypassable:

     ?from=/%09/evil.com   ->  decoded to "/\t/evil.com" in searchParams
                           ->  single leading slash, so every check passed
                           ->  browsers STRIP tab/LF/CR before resolving a URL
                           ->  "//evil.com"  ->  https://evil.com

   The literal control character never has to survive transport, because Next
   percent-decodes searchParams for you. Each payload below is a real bypass of
   at least one prefix-only check.
   ═══════════════════════════════════════════════════════════════════════════ */

describe('safeReturnPath', () => {
  const OFF_SITE = [
    ['absolute URL', 'https://evil.com'],
    ['protocol-relative', '//evil.com'],
    ['backslash host', '/\\evil.com'],
    ['backslash after slash', '/\\/evil.com'],
    ['tab-smuggled host', '/\t/evil.com'],
    ['newline-smuggled host', '/\n/evil.com'],
    ['CR-smuggled host', '/\r/evil.com'],
    ['scheme', 'javascript:alert(1)'],
    ['bare backslashes', '\\\\evil.com']
  ] as const;

  it.each(OFF_SITE)('rejects %s', (_label, payload) => {
    expect(safeReturnPath(payload)).toBeNull();
  });

  it('resolves every rejected payload off-origin, proving each one mattered', () => {
    const ORIGIN = 'https://ascendaedu.com';
    for (const [label, payload] of OFF_SITE) {
      // Skip the ones that aren't valid URL input at all — those cannot leak.
      let resolved: string;
      try {
        resolved = new URL(payload, ORIGIN).origin;
      } catch {
        continue;
      }
      if (resolved === ORIGIN) continue;
      // If it resolves off-origin, safeReturnPath MUST have rejected it.
      expect({ label, verdict: safeReturnPath(payload) }).toEqual({ label, verdict: null });
    }
  });

  it('keeps same-origin paths, including the query', () => {
    expect(safeReturnPath('/dashboard')).toBe('/dashboard');
    expect(safeReturnPath('/course/123?tab=fees')).toBe('/course/123?tab=fees');
  });

  it('drops a fragment rather than forwarding it', () => {
    expect(safeReturnPath('/course/123#section')).toBe('/course/123');
  });

  it('refuses to bounce back into the flow itself', () => {
    expect(safeReturnPath('/welcome')).toBeNull();
    expect(safeReturnPath('/welcome?from=/dashboard')).toBeNull();
  });

  it('takes the first value when the param repeats, and handles absence', () => {
    expect(safeReturnPath(['/dashboard', '/admin'])).toBe('/dashboard');
    expect(safeReturnPath(undefined)).toBeNull();
    expect(safeReturnPath('')).toBeNull();
  });
});
