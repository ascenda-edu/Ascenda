import { defineConfig, devices } from '@playwright/test';

/**
 * Browser-level verification. This exists for exactly one reason:
 * `docs/audit/13-remaining-work.md` blocks the StudentIntakeForm decomposition
 * on it. jsdom cannot vouch for `AnimatePresence` exit timing, `mode="wait"`
 * ordering, real focus movement or the `beforeunload` draft flush — and the
 * failure mode that motivated the gate (F-A: hydrated fields silently blanked,
 * wizard then refusing to advance) is a real-browser bug by construction.
 *
 * ── File naming: `*.e2e.ts`, NOT `*.spec.ts` ──────────────────────────────
 * Jest's default `testMatch` includes `**\/?(*.)+(spec|test).[jt]s?(x)`, so a
 * file named `foo.spec.ts` anywhere in the repo is picked up by `npm test` and
 * fails on the first `import { test } from '@playwright/test'`. Using a suffix
 * Jest does not claim keeps the two runners disjoint WITHOUT editing
 * jest.config.ts. If you add a file here, name it `*.e2e.ts`.
 *
 * ── Running it ────────────────────────────────────────────────────────────
 *   npx playwright install chromium     # once, ~180MB
 *   E2E_EMAIL=… E2E_PASSWORD=… npm run test:e2e
 *
 * `E2E_EMAIL` / `E2E_PASSWORD` must be a real Supabase account on the project
 * `NEXT_PUBLIC_SUPABASE_URL` points at. The suite SIGNS IN THROUGH THE REAL
 * LOGIN FORM (`e2e/auth.setup.e2e.ts`) and reuses the resulting cookies — no
 * bypass, no test-only branch in `src/middleware.ts` or any auth code. With the
 * variables unset the wizard spec skips with an explanatory message, which is
 * what CI does today (this repo has no secrets configured). `npm run test:e2e`
 * with no credentials at all still runs `harness-smoke.e2e.ts`, so a clean
 * checkout can prove the harness works before anyone hunts for an account.
 *
 * NOTE the suite WRITES: it completes the wizard and saves, so the account's
 * student_* rows are overwritten. Point it at a throwaway account, never at a
 * real student and preferably not at the production project.
 */

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';

/** Where `auth.setup.e2e.ts` parks the signed-in cookies. Gitignored. */
export const STORAGE_STATE = '.playwright/storage-state.json';

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.e2e\.ts$/,
  // The wizard is six steps of real form filling against a real database; the
  // default 30s is not enough for the happy path on a cold dev server.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off'
  },

  projects: [
    {
      // A setup PROJECT rather than `globalSetup`, so it runs after `webServer`
      // is up and shows in the report like any other test.
      name: 'setup',
      testMatch: /auth\.setup\.e2e\.ts$/,
      use: { ...devices['Desktop Chrome'] }
    },
    {
      // The credential-free half (audit L8, e2e ADMISSION CONDITION part 1).
      //
      // `harness-smoke.e2e.ts` used to sit in `chromium`, which `dependencies:
      // ['setup']` binds to a real login — so the one spec written to need NO
      // credentials could not run without them. In CI every step was gated on the
      // secrets probe, so the `e2e` job went green having executed NOTHING, and
      // `__tests__/middleware/middleware.test.ts` delegates the `matcher`
      // question to a check that never ran.
      //
      // No `dependencies`, and an explicitly empty storageState: these specs must
      // behave as an anonymous visitor, which is the whole point of the bounce
      // assertion. Run it alone with `npm run test:e2e:smoke`.
      name: 'smoke',
      testMatch: /harness-smoke\.e2e\.ts$/,
      use: { ...devices['Desktop Chrome'], storageState: { cookies: [], origins: [] } }
    },
    {
      name: 'chromium',
      testIgnore: /(auth\.setup|harness-smoke)\.e2e\.ts$/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE }
    }
  ],

  // Point E2E_BASE_URL at an already-running server (or a preview deployment)
  // to skip the local dev server entirely.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000
      }
});
