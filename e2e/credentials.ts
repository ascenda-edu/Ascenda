/**
 * The one place that decides whether the browser suite can run at all.
 *
 * Kept out of `*.e2e.ts` on purpose: this file is imported by the specs, not
 * collected as one (see the naming note in playwright.config.ts).
 */

export const E2E_SKIP_REASON =
  'E2E_EMAIL / E2E_PASSWORD are not set — see playwright.config.ts. ' +
  'The browser suite needs a real Supabase account because /profile/wizard is ' +
  'behind middleware, and weakening that auth to make a test pass is not an option.';

export const hasE2ECredentials = (): boolean =>
  Boolean(process.env.E2E_EMAIL && process.env.E2E_PASSWORD);
