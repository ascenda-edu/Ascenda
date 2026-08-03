import { expect, test } from '@playwright/test';

/**
 * The only spec here that needs NO credentials — a canary for the harness
 * itself. `npm run test:e2e` on a clean checkout should show these two passing
 * and everything else skipped; if they fail, the problem is Playwright, the dev
 * server or the browser download, not the wizard.
 *
 * It also pins the constraint that shapes the whole suite: `/profile/wizard` is
 * behind middleware, which is why `profile-wizard.e2e.ts` needs a real account
 * and why there is no test-only auth bypass to make it cheaper.
 */
test.describe('harness', () => {
  // Runs in the `chromium` project, which loads the signed-in storageState.
  // These two must behave as an ANONYMOUS visitor, so drop it.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('the login form is reachable and its fields are labelled', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('middleware bounces an anonymous /profile/wizard to /login', async ({ page }) => {
    await page.goto('/profile/wizard');
    await expect(page).toHaveURL(/\/login/);
  });
});
