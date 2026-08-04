import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, test as setup } from '@playwright/test';
import { STORAGE_STATE } from '../playwright.config';
import { hasE2ECredentials, E2E_SKIP_REASON } from './credentials';

/**
 * Signs in ONCE and parks the cookies for every other spec.
 *
 * It drives the real `/login` form, so the session cookies are produced by the
 * application's own auth path (`supabase.auth.signInWithPassword` through
 * `@supabase/ssr`, which writes the `sb-<ref>-auth-token` cookies middleware
 * looks for). Nothing here knows the cookie format, and nothing in
 * `src/middleware.ts` or the auth code has a test-only branch — the alternative,
 * an `E2E_*` bypass in middleware, would mean shipping a way to skip auth.
 */
setup('authenticate', async ({ page, context }) => {
  // Playwright needs the storageState file to EXIST even when the run will
  // skip, or the dependent project fails to start. Write an empty one first.
  mkdirSync(dirname(STORAGE_STATE), { recursive: true });
  if (!existsSync(STORAGE_STATE)) {
    writeFileSync(STORAGE_STATE, JSON.stringify({ cookies: [], origins: [] }));
  }

  setup.skip(!hasE2ECredentials(), E2E_SKIP_REASON);

  await page.goto('/login');

  await page.getByLabel('Email').fill(process.env.E2E_EMAIL!);
  await page.getByLabel('Password').fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // The form redirects to /role-select, /dashboard or /profile/wizard depending
  // on the account's state — all we require is that we left the login page and
  // were not bounced back to it.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60_000 });

  // Prove the session is real by reaching a protected route: middleware
  // redirects an unauthenticated request to /login.
  await page.goto('/profile/wizard');
  await expect(page).toHaveURL(/\/profile\/wizard/);

  /**
   * The wizard's own nav, NOT the PageHero title.
   *
   * This used to assert the heading "Let's set you up", which was an unconditional
   * string when it was written and is now one of three: the hero says "Your
   * profile" once the profile is complete, "Welcome back" to anyone with a single
   * section filled, and the original only to an account that has never started.
   * The E2E account completes the wizard on every run of `profile-wizard.e2e.ts`,
   * so from the second run onwards it could never be the first of those — this
   * setup was one green run away from failing permanently, and the redesign that
   * added the conditional is what collected on it.
   *
   * A Next-or-Submit button is present on every screen, in every profile state,
   * and unlike the title it is evidence the authenticated FORM rendered rather
   * than just the page chrome around it. That is what this setup is actually
   * trying to establish before it banks the cookies.
   */
  await expect(page.getByRole('button', { name: /^(Next|Submit & see matches)$/ })).toBeVisible();

  await context.storageState({ path: STORAGE_STATE });
});
