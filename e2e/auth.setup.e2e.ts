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
  await expect(page.getByRole('heading', { name: "Let's set you up" })).toBeVisible();

  await context.storageState({ path: STORAGE_STATE });
});
